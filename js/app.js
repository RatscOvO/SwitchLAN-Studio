(function(){
'use strict';
const initial=window.SL_DATA.initial;
const P=window.SL_POLICY;
const K=window.SL_KNOWLEDGE;
const state=structuredClone(initial);
// Core edition: the Windows system is the only source of editable objects.
state.page="shares";
state.permissionShare="";
state.permissionUser="";
state.connections=null;
state.connectionsError="";
state.lanView="map";
state.coreActivity=[];
state.gameTab='minecraft';
state.gameResults=null;
state.gameBusy=false;
state.gameError='';
state.gameNotice='';
state.gameManual=null;
state.gameStartHost=1;
state.gameEndHost=254;
state.gameCustomPort=0;
state.gameTargetIp='';
state.gameTargetPort=25565;
state.gameProtocol='java';
// Core 1.4.2: live network radar; readings are native measurements only.
state.radarTargets=[];
state.radarSelected='';
state.radarRunning=false;
state.radarInterval=2000;
state.radarWindowSec=120; // display span only; does not truncate native sample history
state.radarScales={};
state.radarRunId=null;
state.radarSamples={};
state.radarLast=null;
state.radarEvents=[];
state.radarError='';
state.radarPorts=null;
state.radarPortsError='';

const glassOptions=['off','subtle','full'];
state.glassMode=(()=>{try{
 const saved=localStorage.getItem('switchlan-glass-mode');
 // Once for existing installations: move prior default 'subtle' to visibly richer full.
 if(!localStorage.getItem('switchlan-glass-v2')){localStorage.setItem('switchlan-glass-v2','1');if(saved==='subtle')return 'full';}
 return glassOptions.includes(saved)?saved:'full';
 }catch(_){return 'full';}})();
state.desktopReportAvailable=false;
state.managedUsers=[];
state.managedShares=[];
state.liveMode=false;
// A desktop launch must never silently fall back to simulated Windows objects.
state.desktopConnection='connecting';
state.lanResults=null;
state.lanScanning=false;
state.lanProgress={done:0,total:254};
state.lanSelectedIp='';
state.lanStartHost=1;
state.lanEndHost=254;
state.lanSearch='';
state.lanFilter='all';
state.lanExpanded={};
state.lanLastFinished='';
state.lanDurationMs=null;
state.lanScanStartedAt=0;
state.lanSingleBusy='';
state.lanReadChecks={};
state.securityReport=null;
state.lastError="";
state.userScope="people";
state.shareScope="ordinary";
state.adminUserScope="people";
state.adminShareScope="ordinary";
state.focus={user:'',share:''};
state.filter={users:'',shares:''};
state.lastReceipt=null;
state.lastCleanupInfo='';
const root=document.getElementById('app'),dlg=document.getElementById('editorDialog'),toastEl=document.getElementById('toast');
let pending=null,toastTimer=null,query='',term='',desktopBusy=false,awaitedShareChange=null;
const NAV=[['shares','folder-open',"File Sharing"],['users','users',"User Accounts"],['permissions','shield-check',"Permission Analysis"],['connections','activity',"SMB Sessions"],['lan','wifi',"LAN Discovery"],['games','gamepad',"Multiplayer"],['radar','activity',"Network Radar"],['settings','settings',"Settings & Diagnostics"]];
const symbols={
'layout-dashboard':'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
'folder-open':'<path d="M6 14l2-3h13l-3 9H3l3-6Z"/><path d="M3 14V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v3"/>',
'users':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
'key-round':'<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
'monitor':'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
'shield-check':'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
'gamepad':'<path d="M6 12h4m-2-2v4m7-2h.01M18 10h.01"/><path d="M6.5 6h11a4 4 0 0 1 3.84 2.85l1.25 6a3 3 0 0 1-4.8 3l-2.03-1.65H8.24L6.2 17.85a3 3 0 0 1-4.78-3l1.24-6A4 4 0 0 1 6.5 6Z"/>',
'activity':'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
'book-open':'<path d="M12 7v14m0-14C9 5 6 4 2 4v16c4 0 7 1 10 3m0-16c3-2 6-3 10-3v16c-4 0-7 1-10 3"/>',
'chevron-right':'<path d="m9 18 6-6-6-6"/>','chevron-down':'<path d="m6 9 6 6 6-6"/>',
'plus':'<path d="M12 5v14M5 12h14"/>','x':'<path d="M18 6 6 18M6 6l12 12"/>',
'check':'<path d="m5 12 4 4L19 6"/>','info':'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>',
'alert':'<path d="M10.3 3.86 2.82 17a2 2 0 0 0 1.71 3h14.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
'power':'<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/>',
'wifi':'<path d="M2 8.82a15 15 0 0 1 20 0M5 12.86a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M12 20h.01"/>',
'search':'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
'copy':'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
'lock':'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
'unlock':'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0m0-4a4 4 0 0 0-8 0"/>',
'settings':'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.9l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.59V21h-4v-.01A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.59-1H3v-4h.01A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.9l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.01V3h4v.01A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.9-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.59 1H21v4h-.01A1.7 1.7 0 0 0 19.4 15Z"/>',
'arrow-right':'<path d="M5 12h14m-6-6 6 6-6 6"/>','external':'<path d="M13 5h6v6m0-6-9 9"/><path d="M19 13v6H5V5h6"/>',
'sun':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
'moon':'<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
'download':'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
'menu':'<path d="M4 6h16M4 12h16M4 18h16"/>',
'rotate':'<path d="M3 12a9 9 0 1 1 2.6 6.4M3 20v-5h5"/>',
'file':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6"/>',
'eye':'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
'circle-help':'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.01"/>',
};
function icon(name,size=18){return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]||symbols.info}</svg>`;}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function attr(v){return esc(v);}
function elButton(label,action,cls='btn ghost',extra=''){return `<button type="button" class="${cls}" data-action="${attr(action)}" ${extra}>${label}</button>`;}
function badge(t,type='neutral'){return `<span class="badge ${type}">${esc(t)}</span>`;}
function head(title,sub,action=''){return `<div class="pageheading core-pageheading"><div><div class="core-eyebrow"><span class="core-eyebrow-dot"></span> SWITCHLAN / WINDOWS WORKSPACE</div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;}
function real(){return state.mode==='snapshot' && state.snapshot;}
function ro(){return !!real();}
function live(){return !!(desktopAvailable()&&real()&&state.liveMode);}
function isManagedUser(name){return (state.managedUsers||[]).some(u=>String(u.name).toLowerCase()===String(name).toLowerCase());}
function isManagedShare(name){return (state.managedShares||[]).some(u=>String(u.name).toLowerCase()===String(name).toLowerCase());}
// Local users come from Get-LocalUser. The well-known RID, not a translated name,
// identifies built-in accounts on localized Windows installations.
function systemAccount(u){return /-(500|501|503|504)$/.test(String(u.sid||''));}
function editableLocalUser(u){return !!(u&&!systemAccount(u)&&u.isAdministrator===false&&String(state.snapshot?.activeUserSid||'')!==String(u.sid||'')&&/^S-1-5-21-/.test(String(u.sid||'')));}
function editableShare(s){return !!(s&&!s.special&&!String(s.name||'').endsWith('$')&&s.path);}
function editableShareAccess(s){return editableShare(s)&&s.permissionsReadable!==false&&Array.isArray(s.permissions);}
// Only a direct LOCAL account ACE is editable here. Group grants, Deny and NTFS
// are not converted to a false 'effective permission' claim.
function directLocalAce(share,user){
 const host=String(state.snapshot?.computerName||'').toLowerCase();
 const account=host+'\\'+String(user?.name||'').toLowerCase();
 const shorthand='.\\'+String(user?.name||'').toLowerCase();
 return (share?.permissions||[]).filter(a=>[account,shorthand,String(user?.sid||'').toLowerCase()].includes(String(a.account||'').toLowerCase()));
}
function currentDirectRight(share,user){
 const aces=directLocalAce(share,user);
 if(aces.some(a=>String(a.accessControlType).toLowerCase()==='deny'))return 'Deny';
 const allows=aces.filter(a=>String(a.accessControlType).toLowerCase()==='allow');
 return allows.length===0?'None':allows.length===1?String(allows[0].accessRight||'Unknown'):'Multiple';
}
function rightName(value){return ({None:"No direct allow entry",Read:"Read-only",Change:"Modify",Full:"Full control",Remove:"Remove direct allow entry",Deny:"Deny entry present",Multiple:"Multiple permission entries",Unknown:"Unknown"})[value]||value;}

function scopedUsers(users,scope){
  if(!real())return users;
  if(scope==='managed')return users.filter(u=>isManagedUser(u.name)&&live());
  if(scope==='people')return users.filter(u=>!systemAccount(u));
  return users;
}
function scopedShares(shares,scope){
  if(!real())return shares;
  if(scope==='managed')return shares.filter(s=>isManagedShare(s.name)&&live());
  if(scope==='ordinary')return shares.filter(s=>!s.special&&!String(s.name||'').endsWith('$'));
  return shares;
}
function scopePicker(id,value,opts){return `<label class="scope-picker">Show:<select id="${id}" aria-label="Filter list">${opts.map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`;}
function userPicker(id,value){return scopePicker(id,value,[['people',"Local accounts (excluding built-in)"],['managed',"Managed by SwitchLAN"],['all',"All accounts (including built-in)"]]);}
function sharePicker(id,value){return scopePicker(id,value,[['ordinary',"Standard shares"],['managed',"Managed by SwitchLAN"],['all',"All shares (including system)"]]);}
function scopeInfo(kind,selected,total){return `<div class="footnote">${icon('info',15)} Showing ${selected} / ${total} ${kind}. These items come from a snapshot of the true state of Windows; filtering only changes the display and does not delete or modify system objects.</div>`;}
function userOrigin(u){return isManagedUser(u.name)&&live()?"Managed by SwitchLAN":systemAccount(u)?"Windows built-in":"Existing Windows account";}
function toLocalTime(v){return v?String(v):"Unknown / Never signed in";}
function accountSummary(u){return `${esc(u.fullName||u.name||'')} ${u.description?`<small>${esc(u.description)}</small>`:''}`;}
function userDetails(index){
 const u=state.snapshot?.users?.[index];if(!u)return;
 const managed=isManagedUser(u.name)&&live();
 dlg.innerHTML=`<div class="dialog-head"><div class="mark">${icon('users',20)}</div><h2>Windows local account details</h2>${elButton(icon('x'),'dialog-close','iconbtn')}</div><div class="dialog-body"><div class="settings-list"><div><span>Username</span><strong>${esc(u.name)}</strong></div><div><span>Display name</span><strong>${esc(u.fullName||"Not set")}</strong></div><div><span>Account status</span>${badge(u.enabled===false?"Disabled":"Enabled",u.enabled===false?'neutral':'green')}</div><div><span>Type</span>${badge(managed?"Managed by SwitchLAN":userOrigin(u))}</div><div><span>Description</span><strong>${esc(u.description||"None")}</strong></div><div><span>Last sign-in</span><strong>${esc(toLocalTime(u.lastLogon))}</strong></div><div><span>SID</span><strong class="mono detail-value">${esc(u.sid||"Unknown")}</strong></div></div><div class="callout">${icon('shield-check',17)}Windows does not expose existing passwords. You can reset a standard local account’s password; the new password immediately replaces the old one. The backend checks the account SID and protected status again before making changes.</div></div><div class="dialog-actions">${live()&&editableLocalUser(u)?elButton("Reset password",'admin-reset-existing-user-password','btn tiny',`data-index="${index}"`):''}${live()&&editableLocalUser(u)?elButton("Delete account",'admin-delete-existing-user','btn tiny danger-text',`data-index="${index}"`):''}${elButton("Close",'dialog-close','btn primary')}</div>`;
 dlg.showModal();
}
function copyText(value){
 if(navigator.clipboard?.writeText){navigator.clipboard.writeText(value).then(()=>toast("Copied")).catch(()=>toast("Copy failed. Please copy the text manually."));return;}
 toast("Clipboard access is unavailable. Select and copy the text manually.");
}
function shareAccessHelp(name){
 const computer=String(state.snapshot?.computerName||"YOUR-PC");
 const unc=String.fromCharCode(92,92)+computer+String.fromCharCode(92)+name;
 const ip=String((state.snapshot?.interfaces||[]).flatMap(i=>i.ipv4||[]).find(v=>/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(v.ip||''))?.ip||'');
 const alt=ip?String.fromCharCode(92,92)+ip+String.fromCharCode(92)+name:null;
 dlg.dataset.unc=unc;
 dlg.innerHTML=`<div class="dialog-head"><div class="mark">${icon('monitor',20)}</div><h2>Access this share from another PC</h2>${elButton(icon('x'),'dialog-close','iconbtn')}</div><div class="dialog-body"><p class="muted">On the other Windows PC, enter this path in the File Explorer address bar:</p><div class="connect-path mono">${esc(unc)}</div>${alt?`<p class="muted small">You can also try LAN IPv4:<code>${esc(alt)}</code></p>`:''}<div class="callout">${icon('info',16)}Sign in as <strong>${esc(computer)}&#92;username</strong> using that account’s password. Both devices must be able to reach each other. Windows Firewall must allow inbound SMB (TCP 445) on your trusted network. SwitchLAN does not open firewall rules or public ports automatically.</div><div class="callout amber">${icon('alert',16)}These instructions do not confirm that the connection works. Do not expose port 445 to the internet.</div></div><div class="dialog-actions">${elButton("Copy shared address",'copy-share-address','btn primary')}${elButton("Close",'dialog-close','btn ghost')}</div>`;
 dlg.showModal();
}
// Snapshot data is untrusted; never blend it with the demo state.
function validateSnapshot(v){
  const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const str=(x,max=1024)=>typeof x==='string'&&x.length<=max;
  const arr=(x,max)=>Array.isArray(x)&&x.length<=max;
  if(!obj(v)||v.schemaVersion!==1||v.kind!=='switchlan-readonly-snapshot')throw new Error("SwitchLAN snapshot is not supported");
  if(!arr(v.shares,2000)||!arr(v.users,5000))throw new Error("shares/users is not a valid array");
  for(const key of ['interfaces','sessions','firewallProfiles','warnings']){
    if(v[key]!==undefined&&!arr(v[key],5000))throw new Error(key+" Should be an array");
  }
  if(v.computerName!==undefined&&!str(v.computerName,255))throw new Error("computerName format error");
  if(v.capturedAt!==undefined&&!str(v.capturedAt,128))throw new Error("capturedAt format error");
  if(v.activeUserSid!==undefined&&!str(v.activeUserSid,256))throw new Error("activeUserSid format error");
  if(v.summary!==undefined&&!obj(v.summary))throw new Error("summary format error");
  for(let index=0;index<v.users.length;index++){
    const u=v.users[index];
    if(!obj(u))throw new Error(`users[${index}] is not an account object`);
    if(!str(u.name,256)||!u.name.trim())throw new Error(`users[${index}].name format error`);
    if(!str(u.sid??'',256)||!str(u.fullName??'',512)||!str(u.description??'',4096)||!str(u.lastLogon??'',128))throw new Error(`users[${index}] Account text field format is wrong`);
    if(u.enabled!==undefined&&typeof u.enabled!=='boolean')throw new Error(`users[${index}].enabled format error`);
    if(u.isAdministrator!==undefined&&u.isAdministrator!==null&&typeof u.isAdministrator!=='boolean')throw new Error(`users[${index}].isAdministrator format error`);
    // Legacy PowerShell 5.1 exporters could unwrap 0/1 group items into
    // null or a single string. Normalize these display-only fields, while
    // never inferring administrator privileges from group names or emptiness.
    if(u.groups==null){u.groups=[];u.groupsReadable=false;}
    else if(typeof u.groups==='string'){u.groups=[u.groups];u.groupsReadable=true;}
    else if(Array.isArray(u.groups)){u.groupsReadable=true;}
    if(!arr(u.groups,128)||!u.groups.every(g=>str(g,256)))throw new Error(`users[${index}].groups format error`);
  }
  for(const s of v.shares){
    if(!obj(s)||!str(s.name,256)||!str(s.path??'',4096)||!str(s.description??'',4096)||(s.special!==undefined&&typeof s.special!=='boolean')||
       (s.permissionsReadable!==undefined&&typeof s.permissionsReadable!=='boolean')||
       (s.permissions!==undefined&&!arr(s.permissions,2000))||(s.ntfsReadable!==undefined&&typeof s.ntfsReadable!=='boolean')||(s.ntfs!==undefined&&s.ntfs!==null&&!obj(s.ntfs)))throw new Error("There are invalid shares in shares");
    if(s.ntfs){
      const n=s.ntfs;
      if(!str(n.owner??'',512)||(n.inheritanceProtected!==undefined&&typeof n.inheritanceProtected!=='boolean')||
         (n.truncated!==undefined&&typeof n.truncated!=='boolean')||!arr(n.access??[],40))throw new Error("NTFS overview format error");
      for(const a of n.access||[]){
        if(!obj(a)||!str(a.identity??'',512)||!str(a.rights??'',256)||!str(a.type??'',64)||
          (a.inherited!==undefined&&typeof a.inherited!=='boolean'))throw new Error("NTFS permission entry format is incorrect");
      }
    }
    for(const p of s.permissions||[]){
      if(!obj(p)||!str(p.account??'',256)||!str(p.accessRight??'',128)||!str(p.accessControlType??'',128))throw new Error("The format of the sharing permission item is incorrect");
    }
  }
  for(const i of v.interfaces||[]){
    if(!obj(i)||!str(i.name??'',255)||!arr(i.ipv4??[],64)||!str(i.profile??'',128)||!str(i.speed??'',128))throw new Error("There is an invalid network adapter in interfaces");
    for(const ip of i.ipv4||[]){
      if(!obj(ip)||!str(ip.ip,64)||(ip.prefix!==undefined&&(!Number.isInteger(ip.prefix)||ip.prefix<0||ip.prefix>32)))throw new Error("IPv4 field format error");
    }
  }
  for(const s of v.sessions||[]){
    if(!obj(s)||!['client','name','ip','account','username','sessionId','connected'].every(k=>s[k]===undefined||str(s[k],512)))throw new Error("There are invalid sessions in sessions");
  }
  for(const f of v.firewallProfiles||[]){
    if(!obj(f)||!str(f.name??'',128)||(f.enabled!==undefined&&typeof f.enabled!=='boolean'))throw new Error("firewallProfiles format error");
  }
  if(!(v.warnings||[]).every(w=>str(w,2000)))throw new Error("warnings format error");
  return v;
}
function sessionUncertain(){return !!(real()&&(!Array.isArray(state.snapshot.sessions)||state.snapshot.warnings?.some(w=>/SMB.*(?:session|会话)|(?:session|会话).*SMB/i.test(w))));}
function desktopAvailable(){return !!(window.chrome&&window.chrome.webview&&typeof window.chrome.webview.postMessage==='function');}
function desktopDisconnected(){return desktopAvailable()&&!live()&&!real();}
function desktopPost(type,payload={}){if(!desktopAvailable())return false;if(desktopBusy){toast("The last local operation is still in progress");return false;}desktopBusy=true;try{window.chrome.webview.postMessage(Object.assign({type},payload));return true;}catch(err){desktopBusy=false;toast("Unable to call native backend:"+String(err.message||err).slice(0,60));return false;}}
function applySnapshot(value,targetPage='shares'){const previous={snapshot:state.snapshot,mode:state.mode,page:state.page};try{state.snapshot=value;state.mode='snapshot';state.page=targetPage;render();toast((live()?"Windows current state loaded":"Read-only snapshot loaded"));}catch(renderError){state.snapshot=previous.snapshot;state.mode=previous.mode;state.page=previous.page;render();throw renderError;}}
function showPasswordDialog(password){dlg.dataset.password=password;dlg.innerHTML=`<div class="dialog-head"><div class="mark">${icon('key-round',20)}</div><h2>Account password (created or reset)</h2>${elButton(icon('x'),'dialog-close','iconbtn')}</div><div class="dialog-body"><div class="callout amber">${icon('alert',16)}Copy this password now and store it securely. It will not be shown again after you close this dialog.</div><p class="muted">New password generated by this operation:</p><div class="preview-list"><div>${icon('check',15)}<code>${esc(password)}</code></div></div></div><div class="dialog-actions">${elButton(icon('copy',16)+" Copy password",'admin-copy-password','btn primary')}${elButton("Saved — continue to share setup",'create-share-next','btn ghost')}${elButton("Close",'dialog-close','btn ghost')}</div>`;dlg.showModal();}
function initDesktopBridge(){
 if(!desktopAvailable())return;
 window.chrome.webview.addEventListener('message',event=>{
  const msg=event.data||{};
  if(msg.type==='diagnostic-result'){
   desktopBusy=false;
   if(msg.ok){state.desktopReportAvailable=true;render();toast("Diagnosis completed:"+(Number(msg.checks)||0)+" Inspections");}
   else{state.lastError=String(msg.message||"Diagnosis not completed");render();toast(state.lastError);}
   return;
  }
  if(msg.type==='snapshot-result'){
   desktopBusy=false;
   if(msg.ok){
    try{const fresh=validateSnapshot(msg.snapshot);state.managedUsers=msg.managed?.users||[];state.managedShares=msg.managed?.shares||[];state.liveMode=true;state.desktopConnection='ready';state.lastError='';state.connections=null;applySnapshot(fresh,real()?state.page:'shares');}
    catch(err){state.liveMode=false;state.desktopConnection='failed';state.lastError="The local snapshot format is abnormal:"+String(err.message||err).slice(0,200);render();toast("Native state loading failed");}
   }else{state.desktopConnection='failed';state.lastError=String(msg.message||"Snapshot export not completed");render();toast(state.lastError);}
   return;
  }
  if(msg.type==='folder-picked'){
   desktopBusy=false;
   const input=document.getElementById('adminSharePath');
   if(input&&msg.path)input.value=msg.path;
   return;
  }
  if(msg.type==='admin-result'){
   desktopBusy=false;
   if(!msg.ok){recordCoreActivity("Operation incomplete",false);awaitedShareChange=null;state.shareFeedback=null;state.lastError=String(msg.message||"Management operation failed").slice(0,600);if(!live())state.desktopConnection='failed';render();toast("Operation failed, please check the error details on the page");return;}
   try{
    state.managedUsers=msg.managed?.users||[];
    state.managedShares=msg.managed?.shares||[];
    state.liveMode=true;
    state.desktopConnection='ready';
    state.lastError='';
    state.connections=null;
    recordCoreActivity(coreActionLabel(msg.operation),true);
    if(msg.operation==='admin-delete-existing-user'&&msg.data){
     state.lastCleanupInfo=msg.data.ntfsUnchanged===true
      ? "Account deleted. Files, the user profile folder and NTFS ACLs are unchanged. Permission entries for the old SID may remain and need a separate review."
      : "The account deletion operation has returned results; please check the Windows status and permission records.";
    }
    const change=awaitedShareChange;awaitedShareChange=null;
    if(msg.operation==='admin-update-share-description'){
     const sh=msg.snapshot?.shares?.find(s=>s.name===msg.data?.name);
     const verified=!!(sh&&sh.path===msg.data?.path&&sh.description===msg.data?.description);
     state.lastReceipt={kind:'share-description',name:msg.data?.name,verified,at:msg.snapshot?.capturedAt||''};
     if(!verified)state.lastError="Windows has reported that the write was successful, but the shared note failed secondary verification.";
    }
    const fresh=msg.snapshot?validateSnapshot(msg.snapshot):null;
    if(change){
     const afterShare=fresh?.shares?.find(s=>s.name===change.name&&s.path===change.path);
     const afterUser=fresh?.users?.find(u=>u.sid===change.sid);
     const actual=afterShare&&afterShare.permissionsReadable!==false&&Array.isArray(afterShare.permissions)&&afterUser?currentDirectRight(afterShare,afterUser):'Unknown';
     const wanted=change.right==='Remove'?'None':change.right;
     const verified=actual===wanted;
     state.shareFeedback={...change,actual,verified,capturedAt:fresh?.capturedAt||''};
     if(!verified)state.lastError="Windows has reported that the operation is complete, but the recollected share permissions did not match the target; please refresh and verify.";
     if(fresh)applySnapshot(fresh,'shares');else{state.page='shares';render();}
     const newIndex=fresh?.shares?.findIndex(s=>s.name===change.name);
     if(newIndex>=0)showInspectShare('real-'+newIndex,change.sid);
     toast(verified?"Authorization modified and Windows results reviewed":"Permission modification has not been verified twice, please check manually.");
    }else{
     if(fresh)applySnapshot(fresh,state.page);else{render();state.lastError="The system has reported that the operation is completed, but the Windows status cannot be refreshed. Please verify manually.";}
     const destructive=['admin-delete-existing-user','admin-unshare-existing','admin-delete-user','admin-delete-share'].includes(msg.operation);
     if(destructive&&msg.verified!==true){state.lastError=msg.verified===false?"Windows reports that the execution was successful, but the object still exists after refreshing; please check the backend logs and system status.":"Windows reports that the execution was successful, but it is temporarily unable to read and verify the results again. Please refresh and confirm in Windows.";render();}
     if(msg.password)showPasswordDialog(String(msg.password));
     else if(msg.data?.path&&msg.data?.name&&msg.operation==='admin-create-share')shareAccessHelp(String(msg.data.name));
     toast(destructive?(msg.verified===true?"Windows Reviewed: Target no longer exists":"Executed, but the result of the operation has not been verified."):String(msg.message||"Management operation complete"));
    }
   }catch(err){if(!real())state.desktopConnection='failed';state.lastError="Validation of data returned by Windows failed:"+String(err.message||err).slice(0,200);render();toast("Management results cannot be read.");}
   return;
  }
  if(msg.type==='connections-result'){
   desktopBusy=false;
   if(msg.ok&&msg.data&&msg.data.kind==='switchlan-local-smb-connections'&&
      Array.isArray(msg.data.sessions)&&Array.isArray(msg.data.files)&&
      typeof msg.data.sessionsReadable==='boolean'&&typeof msg.data.filesReadable==='boolean'&&
      msg.data.sessions.length<=200&&msg.data.files.length<=200){
    state.connections=msg.data;state.connectionsError='';
    toast(msg.data.sessionsReadable?"Windows current SMB session read":"No permission to confirm SMB session");
   }else{state.connections=null;state.connectionsError=String(msg.message||"Invalid Windows session data").slice(0,280);toast("SMB session refresh not successful");}
   render();return;
  }
  if(msg.type==='security-scan-result'){
   desktopBusy=false;
   if(msg.ok&&msg.report?.kind==='switchlan-security-scan'&&Array.isArray(msg.report.findings)&&Array.isArray(msg.report.unknown)){
    state.securityReport=msg.report;state.lastError='';state.page='security';render();toast("Read-only risk check completed");
   }else{state.securityReport=null;state.lastError=String(msg.message||"Security scan returns format error");state.page='security';render();toast("Security scan not completed");}
   return;
  }
  if(msg.type==='radar-state'){
   if(Number.isInteger(msg.runId))state.radarRunId=msg.runId;
   state.radarRunning=msg.running===true;
   if(msg.error)state.radarError=String(msg.error).slice(0,240);
   if(state.page==='radar')render();
   return;
  }
  if(msg.type==='radar-sample'){
   if(!state.radarRunning||msg.runId!==state.radarRunId||!msg.sample||!Array.isArray(msg.sample.probes))return;
   const item=msg.sample;
   const activeIds=new Set(state.radarTargets.map(t=>t.id));
   for(const probe of item.probes.slice(0,8)){
    if(!activeIds.has(probe.id))continue;
    const prev=state.radarSamples[probe.id]||[];
    const previous=prev[prev.length-1];
    const next={time:item.capturedAt,icmp:probe.icmp,icmpMs:probe.icmpMs,tcp:probe.tcp,tcpMs:probe.tcpMs};
    if(previous){
     const prevMs=previous.icmp==='ok'&&Number.isFinite(previous.icmpMs)?previous.icmpMs:null;
     const nextMs=next.icmp==='ok'&&Number.isFinite(next.icmpMs)?next.icmpMs:null;
     // A probe spike is evidence of RTT change, not proof of Wi-Fi or game server failure.
     if(prevMs!==null&&nextMs!==null&&nextMs>=Math.max(100,prevMs*2.5)&&nextMs-prevMs>=50){
      const recent=state.radarEvents.find(e=>e.id===probe.id&&e.kind==='spike'&&Date.parse(item.capturedAt)-Date.parse(e.time)<15000);
      if(!recent)state.radarEvents.unshift({time:item.capturedAt,id:probe.id,kind:'spike',message:"ICMP RTT spikes "+nextMs.toFixed(1)+" ms (last time "+prevMs.toFixed(1)+' ms）'});
     }
     const oldState=(previous.icmp==='ok'||previous.tcp==='ok')?'reachable':'unconfirmed';
     const newState=(next.icmp==='ok'||next.tcp==='ok')?'reachable':'unconfirmed';
     if(oldState!==newState)state.radarEvents.unshift({time:item.capturedAt,id:probe.id,message:newState==='reachable'?"Network response re-received":"No response received (does not mean the device is offline)"});
     state.radarEvents=state.radarEvents.slice(0,50);
    }
    state.radarSamples[probe.id]=[...prev,next].slice(-720); // last ~12 min at 1 s; window selection never destroys history
    // Keep target-list status current without resetting in-progress form fields.
    for(const row of root.querySelectorAll('.radar-target-row')){
     if(row.dataset.id!==probe.id)continue;
     const target=state.radarTargets.find(t=>t.id===probe.id);
     const chip=row.querySelector('.badge');
     if(target&&chip)chip.outerHTML=radarStatus(target,state.radarSamples[probe.id]);
     const spark=row.querySelector('.radar-mini-slot');
     if(spark)spark.innerHTML=radarSparkline(state.radarSamples[probe.id]);
    }
   }
   state.radarLast=item;
   if(state.page==='radar'){
    const panel=root.querySelector('#radarLiveView');
    if(panel)radarPatchLiveView(panel);
   }
   return;
  }
  if(msg.type==='radar-listeners-result'){
   desktopBusy=false;
   if(msg.ok&&msg.data?.kind==='switchlan-local-tcp-listeners'&&
       typeof msg.data.readable==='boolean'&&Array.isArray(msg.data.listeners)&&msg.data.listeners.length<=250){
    state.radarPorts=msg.data;state.radarPortsError='';
   }else{state.radarPorts=null;state.radarPortsError=String(msg.message||"The local monitoring data format is incorrect.").slice(0,240);}
   if(state.page==='radar')render();
   return;
  }
  if(msg.type==='game-result'){
   desktopBusy=false;state.gameBusy=false;
   if(msg.ok&&msg.mode==='scan'&&msg.result&&Array.isArray(msg.result.games)){
    const games=msg.result.games;
    state.gameResults={...msg.result,games:games.slice(0,600)};
    state.gameError='';state.gameNotice=`Scanned ${Number(msg.result.scannedHosts)||0} addresses; found ${games.length} candidate multiplayer endpoints.`;
    toast("Game discovery completed:"+games.length+" results");
   }else if(msg.ok&&msg.mode==='check'&&msg.result){
    state.gameManual=msg.result;state.gameError='';
    state.gameNotice=String(msg.result.note||"Detection completed");toast(state.gameNotice);
   }else if(msg.cancelled){state.gameNotice="Scan canceled and last results retained.";toast(state.gameNotice);}
   else{state.gameError=String(msg.message||"Game discovery failed").slice(0,240);toast("Game discovery failed");}
   render();return;
  }
  if(msg.type==='lan-scan-progress'){
   state.lanProgress={done:Number(msg.done)||0,total:Number(msg.total)||254};
   if(state.page==='lan'){
    const progress=root.querySelector('.lan-progress-bar');if(progress)progress.style.width=Math.min(100,100*state.lanProgress.done/Math.max(1,state.lanProgress.total))+'%';
    const text=root.querySelector('.lan-run-area small');if(text)text.textContent=`Detected ${state.lanProgress.done}/${state.lanProgress.total}`;
   }
   return;
  }
  if(msg.type==='lan-scan-result'){
   desktopBusy=false;state.lanScanning=false;
   if(msg.ok&&msg.result&&Array.isArray(msg.result.devices)){
    state.lanResults=msg.result;state.lanReadChecks={};state.lanExpanded={};state.lastError='';
    state.lanLastFinished=new Date().toISOString();state.lanDurationMs=Date.now()-state.lanScanStartedAt;
    toast("LAN detection completed:"+msg.result.devices.length+" responding devices");
   }else if(msg.cancelled){toast("Scan canceled, last result retained");}
   else{state.lastError=String(msg.message||"Scan failed");toast("Scan failed:"+state.lastError.slice(0,75));}
   render();return;
  }
  if(msg.type==='lan-rescan-one-result'){
   desktopBusy=false;state.lanSingleBusy='';
   if(msg.ok&&msg.result&&state.lanResults){
    const devices=state.lanResults.devices||[];const i=devices.findIndex(d=>d.ip===msg.result.ip);
    if(i>=0)devices[i]=msg.result;else devices.push(msg.result);
    for(const key of Object.keys(state.lanReadChecks)){if(key.startsWith(msg.result.ip+'|'))delete state.lanReadChecks[key];}
    state.lanExpanded[msg.result.ip]=true;toast("Device detection updated");
   }else{state.lastError=String(msg.message||"Single unit retest failed");toast(state.lastError);}
   render();return;
  }
  if(msg.type==='lan-open-share-result'){
   if(!msg.ok)toast("File Explorer could not start:"+String(msg.message||"System error").slice(0,80));
   else toast("The connection has been handed over to Windows Explorer; whether it can be opened depends on the remote credentials and permissions.");
   return;
  }
  if(msg.type==='lan-share-check-result'){
   desktopBusy=false;
   if(msg.ok&&msg.result){
    const r=msg.result;
    const outcome=r.readable===true?'readable':r.outcome==='denied'?'denied':'unknown';
    state.lanReadChecks[r.ip+'|'+r.share]={status:String(r.status||''),readable:outcome==='readable',outcome,errorCode:r.errorCode??null,checkedAt:r.checkedAt||new Date().toISOString()};
    state.lanExpanded[r.ip]=true;
    toast(outcome==='readable'?"The current account can list this folder":outcome==='denied'?"Windows refuses to list directory":"Folder read access could not be confirmed");
   }
   else{state.lastError=String(msg.message||"Read test failed");toast("Read test failed");}
   render();return;
  }
  if(msg.type==='desktop-error'){recordCoreActivity("Backend communication error",false);desktopBusy=false;state.lastError=String(msg.message||"Local operation failed").slice(0,600);if(!live())state.desktopConnection='failed';render();toast("The local operation failed, please see the error message on the page for details.");}
 });
}
function coreActionLabel(operation){
 return ({'admin-create-user':"Create account",'admin-update-existing-user':"Edit account details",'admin-set-existing-user-enabled':"Change account status",'admin-set-existing-user-password':"Set new password",'admin-reset-existing-user-password':"Reset password",'admin-delete-existing-user':"Delete standard account",'admin-create-share':"Create file share",'admin-modify-share-access':"Modify SMB authorization",'admin-unshare-existing':"Stop file sharing",'admin-update-share-description':"Edit share description",'admin-refresh':"Refresh Windows state"})[operation]||"Windows management operations";
}
function recordCoreActivity(label,ok){
 state.coreActivity.unshift({label,ok,at:new Date().toLocaleTimeString("en-US",{hour:'2-digit',minute:'2-digit',second:'2-digit'})});
 state.coreActivity=state.coreActivity.slice(0,15);
}
function notice(){
 if(desktopDisconnected())return `<div class="modebar ${state.desktopConnection==='failed'?'demo':'real'}">${icon('activity',17)}<span><strong>${state.desktopConnection==='failed'?"Windows connection failed":"Reading real Windows status"}</strong> · When the connection fails, the impersonated user is not displayed and writing to the system is not allowed.</span></div>`;
 return `${state.lastCleanupInfo?`<div class="callout">${icon('info',17)} ${esc(state.lastCleanupInfo)}</div>`:''}${state.lastError?`<div class="callout danger">${icon('alert',16)}<span><strong>Latest error:</strong>${esc(state.lastError)}</span> ${elButton("Copy error",'copy-last-error','btn tiny')}</div>`:''}<div class="modebar ${real()?'real':'demo'}">${icon(real()?'shield-check':'info',16)}<span>${real()?`<strong>${live()?"Windows native management":"Import snapshot · Read only"}</strong> · ${esc(state.snapshot.capturedAt||"Unknown collection time")} · Accounts and shares come from the actual state of Windows.`:"<strong>Windows not connected</strong> · Please start the desktop program, the web version will not forge accounts or share."}</span></div>`;
}

function modal(kind,html,actionLabel="Next"){pending={kind};dlg.innerHTML=`<form id="dialogForm" method="dialog"><div class="dialog-head"><div class="mark">${icon('settings',20)}</div><h2>${kind}</h2>${elButton(icon('x'),'dialog-close','iconbtn')}</div><div class="dialog-body">${html}</div><div class="dialog-actions"><button type="button" class="btn ghost" data-action="dialog-close">Cancel</button><button type="submit" class="btn primary">${esc(actionLabel)} ${icon('arrow-right',16)}</button></div></form>`;dlg.showModal();}
function preview(title,lines,commit,danger=false){pending={kind:'preview',commit};dlg.innerHTML=`<div class="dialog-head"><div class="mark">${icon(danger?'alert':'shield-check',20)}</div><h2>${esc(title)}</h2>${elButton(icon('x'),'dialog-close','iconbtn')}</div><div class="dialog-body"><p class="muted">Please confirm the scope of this operation. Here is a preview of the simulation execution without changing Windows yet.</p><div class="preview-list">${lines.map(l=>`<div>${icon('check',15)}<span>${esc(l)}</span></div>`).join('')}</div>${danger?`<div class="callout danger">${icon('alert',18)}This is a sensitive operation. In the future, real backends will require additional verification of permissions, sessions, and rollback conditions.</div>`:''}</div><div class="dialog-actions">${elButton("Back",'dialog-close','btn ghost')}${elButton("Confirm simulation execution",'apply-preview',`btn ${danger?'danger-btn':'primary'}`)}</div>`;dlg.showModal();}
function closeDialog(){dlg.close();pending=null;delete dlg.dataset.password;}
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),2800);}
function log(event,detail){state.logs.unshift({id:'l'+Date.now(),time:new Date().toLocaleTimeString("en-US",{hour:'2-digit',minute:'2-digit'}),event,detail,status:'demo'});}
function getUser(sid){return state.users.find(u=>u.sid===sid);}
function permission(p){return P.permissionSummary(p.smb,p.ntfs);}
function statCards(){
 const snap=real();
 const d=snap?.summary||null;
 const stats=snap?[
  [icon('folder-open',20),"Standard shares",(snap.shares||[]).filter(x=>!x.special&&!String(x.name||'').endsWith('$')).length,`Where SwitchLAN is hosted ${state.managedShares.length} System shared independent hidden`],
  [icon('users',20),"Standard local accounts",(snap.users||[]).filter(x=>!systemAccount(x)).length,`Where SwitchLAN is hosted ${state.managedUsers.length} `],
  [icon('shield-check',20),"Firewall",d?.firewallEnabled===true?"Enabled":d?.firewallEnabled===false?"Some profiles disabled":"Unverified","Current detection results of the system"],
  [icon('activity',20),"SMB session",sessionUncertain()?"Unavailable":d?.sessionCount??snap.sessions?.length??'—',"Not obtained when permission is insufficient."]
 ]:[
  [icon('folder-open',20),"Shared folders",state.shares.filter(s=>s.managed).length,"Managed objects · Example"],
  [icon('users',20),"Share account",state.users.filter(u=>u.managed).length,"Simulate local account"],
  [icon('monitor',20),"Whitelist devices",state.peers.filter(p=>p.enabled).length,"Enabled sources"],
  [icon('activity',20),"Active Sessions",state.sessions.length,"Sessions are for demonstration only"]
 ];
 return `<div class="stat-grid">${stats.map(([ic,n,v,h])=>`<div class="statcard"><div class="stat-top">${ic}<span>${n}</span></div><strong>${esc(v)}</strong><small>${h}</small></div>`).join('')}</div>`;
}
function availableLanInterfaces(){
 if(!real())return [];
 return (state.snapshot.interfaces||[]).flatMap(n=>(n.ipv4||[])
   .filter(v=>/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(v.ip||'') && (!n.status||/^(up|connected|已连接)$/i.test(n.status)))
   .map(v=>({ip:v.ip,prefix:v.prefix,name:n.name||"Unnamed network adapter",speed:n.speed||'',
     virtual:!!n.isVirtual,profile:n.profile||'',index:n.interfaceIndex})));
}
function selectedLanInterface(){
 const available=availableLanInterfaces();
 return available.find(n=>n.ip===state.lanSelectedIp)||available.find(n=>/以太网|ethernet|wi-?fi|wlan|无线/i.test(n.name)&&!n.virtual)||available[0]||null;
}
function lanSubnet(ip){const v=String(ip||'').split('.');return v.length===4?v.slice(0,3).join('.')+'.0/24':'—';}
function sameLanAsScan(){return state.lanResults&&state.lanResults.localIp===selectedLanInterface()?.ip;}
function lanScanAllowed(){return live()&&!desktopBusy&&!state.lanScanning&&!!selectedLanInterface();}
function localLanIPv4(){
 if(!real())return null;
 const all=(state.snapshot.interfaces||[]).flatMap(iface=>(iface.ipv4||[]).map(a=>({ip:a.ip,prefix:a.prefix,name:iface.name||'',profile:iface.profile||''})));
 const privateAddr=a=>/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(a.ip||'');
 const active=all.filter(privateAddr);
 const score=a=>(/ethernet|以太网|wi-?fi|wlan|无线/i.test(a.name)?6:0)-(/vmware|virtual|hyper-v|vbox|loopback|vethernet|vpn|tap|wsl/i.test(a.name)?10:0);
 return active.sort((a,b)=>score(b)-score(a))[0]||null;
}
function lanHero(){
 if(!real())return '';
 const ni=localLanIPv4();if(!ni)return `<div class="lan-mini-hero unavailable">${icon('wifi',20)} <strong>Unable to obtain LAN private IPv4</strong><span>Please check the current network adapter</span></div>`;
 return `<div class="lan-mini-hero liquid-banner"><div class="lan-mini-orb">${icon('wifi',22)}</div><div class="lan-mini-label"><small>Local area network address · ${esc(ni.name)}</small><strong class="mono">${esc(ni.ip)}<em> /${esc(ni.prefix??'?')}</em></strong></div><div class="lan-mini-actions">${elButton(icon('copy',15)+" Copy IP",'copy-local-ip','btn tiny liquid-button')} ${elButton(icon('search',15)+" Discover devices",'go-lan','btn tiny liquid-button')}</div></div>`;
}
function networkPanel(){const ni=real()?.interfaces?.find(x=>x.ipv4&&x.ipv4.length)||null, i=real()?(ni?{name:ni.name,ip:ni.ipv4[0]?.ip,prefix:ni.ipv4[0]?.prefix,category:ni.profile||"Unknown",speed:ni.speed||'—',gateway:"View according to the actual routing table"}:{name:"Network adapter not obtained",ip:"Unavailable",prefix:'—',category:"Unavailable",speed:'—',gateway:"Unavailable"}):state.interface;return `<section class="panel"><div class="panel-title"><h2>${icon('wifi',18)} Current network</h2>${badge(real()?(live()?"Local state":"Read-only"):"Prefer Ethernet",'blue')}</div><div class="networkhero"><div class="network-icon">${icon('monitor',28)}</div><div><strong>${esc(i.name||"Network adapter not found")}</strong><div class="muted small">${esc(i.speed||"Unknown speed")} · ${esc(i.category||"Unknown profile")}</div></div></div><div class="detail-grid"><div><small>IPv4 address</small><strong class="mono">${esc(i.ip||"Unavailable")}</strong></div><div><small>Prefix length</small><strong class="mono">/${esc(i.prefix??'—')}</strong></div><div><small>Default gateway</small><strong>${esc(i.gateway||'—')}</strong></div><div><small>Mode</small><strong>${real()?"Windows snapshots":"Simulated LAN"}</strong></div></div></section>`;}
function dashboard(){let d=real()?.summary;return `${head("Control overview","Network, file sharing and security status, all on one screen.")}${statCards()}<div class="twocol"><div>${networkPanel()}<section class="panel"><div class="panel-title"><h2>${icon('power',18)} Shared access control</h2>${badge(real()?"Read-only":state.managedEnabled?"Simulation on":"Simulation off",state.managedEnabled&&!real()?'green':'neutral')}</div><div class="control-strip"><div class="control-status ${state.managedEnabled&&!real()?'active':''}">${icon('shield-check',25)}</div><div><strong>${real()?"Shared firewall control is still not connected (please check Windows Firewall manually)":state.managedEnabled?"Demo: Managed rules turned on":"Demo: Managed rules turned off"}</strong><p>${real()?"Please manage accounts and sharing on their respective pages; firewall modification has not yet been accessed.":"This tool only simulates the rules and does not modify the Windows built-in firewall or existing sessions."}</p></div></div><div class="inline-actions">${elButton(icon('power',16)+' '+(state.managedEnabled?"Simulating closed access":"Simulating open access"),'toggle-rule','btn primary',ro()?'disabled':'')}${elButton("View security checks",'go-security','btn ghost')}</div></section></div><div><section class="panel"><div class="panel-title"><h2>${icon('shield-check',18)} Security notice</h2>${badge("Needs attention",'amber')}</div><div class="alerts">${real()?
 `<div class="alert amber">${icon('alert',17)}Snapshots are information at the time of collection and cannot prove that the current external device is absolutely inaccessible.</div><div class="alert muted">${icon('info',17)}The current read-only phase does not calculate the final effective permissions for complex ACLs.</div>`:
 `<div class="alert amber">${icon('alert',17)}Possible system-level broad allow rule detected (impersonation).</div><div class="alert muted">${icon('info',17)}IP whitelisting only limits sources and cannot replace shared account authentication.</div><div class="alert muted">${icon('info',17)}Enabling a new rule will not overwrite other existing broad rules.</div>`}</div>${elButton("Enter Security Center "+icon('arrow-right',15),'go-security','btn link')}</section><section class="panel"><div class="panel-title"><h2>${icon('book-open',18)} Learn a concept today</h2></div><div class="tip-card"><span class="eyebrow">Share permissions × NTFS</span><h3>Why do both doors have to be opened?</h3><p>When the share layer allows modification and NTFS is read-only, access through this share is still subject to read-only constraints; groups and inheritance must also be considered.</p>${elButton("Open encyclopedia "+icon('arrow-right',14),'go-knowledge','btn link')}</div></section></div></div>`;}
// Stage 3.5: selectable objects keep the action context visible. Writes still use
// the same reviewed Windows bridge and require an elevated, explicit confirmation.
function detailLine(label,value){return `<div class="inspector-field"><span>${esc(label)}</span><strong>${esc(value??'—')}</strong></div>`;}
function inspectorHeader(iconName,title,subtitle){return `<div class="inspector-heading"><div class="inspector-mark">${icon(iconName,23)}</div><div><span class="eyebrow">Object Workspace · Windows Current State</span><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div></div>`;}
function selectionIndex(items,kind){const chosen=state.focus[kind];const n=items.findIndex(o=>(kind==='user'?o.sid:o.name)===chosen);return n>=0?n:0;}
function userInspector(u,index){
 if(!u)return "<div class=\"empty inspector-empty\">Select the account on the left to view the information and available operations.</div>";
 const writable=live()&&editableLocalUser(u),managed=live()&&isManagedUser(u.name);
 const groups=Array.isArray(u.groups)?u.groups:[];
 const reason=systemAccount(u)?"Windows built-in accounts are protected":u.isAdministrator===true?"Administrator group account is protected":String(state.snapshot?.activeUserSid||'')===String(u.sid||'')?"The current login account is protected":!live()?"Offline snapshot cannot be written":"This account does not currently support direct editing.";
 return `${inspectorHeader('users',u.name,"Local Windows Account")}
 <div class="inspector-tabs">${badge(u.enabled===false?"Disabled":"Enabled",u.enabled===false?'neutral':'green')}${badge(userOrigin(u),managed?'blue':'neutral')}</div>
 <section class="core-primary-actions" aria-label="Main account operations"><div>${icon('settings',18)}<strong>Account actions</strong><small>All buttons are only for the account selected above</small></div><div class="core-action-toolbar">${writable?`${elButton(icon('settings',15)+" Edit details",'admin-edit-user','btn primary',`data-index="${index}"`)}${elButton(icon('key-round',15)+" Set new password",'admin-reset-existing-user-password','btn ghost',`data-index="${index}"`)}${elButton(u.enabled===false?"Enable account":"Disable account",'admin-set-existing-user-enabled','btn ghost',`data-index="${index}" data-enabled="${u.enabled===false?'true':'false'}"`)}`:badge(reason,'neutral')}</div></section>
 <section class="inspector-section compact account-facts"><h3>Account details</h3><div class="account-facts-grid"><div><small>Display name</small><strong>${esc(u.fullName||"Not set")}</strong></div><div><small>Last sign-in</small><strong>${esc(toLocalTime(u.lastLogon))}</strong></div><div class="account-facts-note"><small>Description</small><strong>${esc(u.description||"Not set")}</strong></div></div></section>
 <details class="core-fold" open><summary>${icon('users',16)} Group membership <span>${groups.length} items</span></summary><div class="core-fold-body">${groups.length?`<div class="chips">${groups.map(g=>badge(g)).join('')}</div>`:"<p class=\"muted small\">The group information was not obtained; it cannot be determined that there is no group membership.</p>"}</div></details>
 <details class="core-fold"><summary>${icon('info',16)} Identity & restrictions</summary><div class="core-fold-body">${detailLine('SID',u.sid||"Unknown")}<p class="muted small">Windows does not allow viewing of existing clear text passwords. Changing the password will replace the old password and may affect existing SMB credentials.</p></div></details>
 <details class="core-fold core-danger-fold"><summary>${icon('alert',16)} Dangerous actions · Delete account</summary><div class="core-fold-body"><p class="muted small">Deleting the account identity is not recoverable; other files or permissions may retain the SID. Please confirm first that it is not a commonly used account.</p>${writable?elButton("Delete selected account",'admin-delete-existing-user','btn danger-btn',`data-index="${index}"`):badge(reason)}</div></details>`;
}
function shareInspector(sh,index){
 if(!sh)return "<div class=\"empty inspector-empty\">Select the share on the left to view the actual Windows permissions.</div>";
 const ordinary=editableShare(sh),writable=live()&&ordinary,canAccess=writable&&editableShareAccess(sh);
 const managed=live()&&isManagedShare(sh.name);
 const unc=String.fromCharCode(92,92)+(state.snapshot?.computerName||"This unit")+String.fromCharCode(92)+sh.name;
 const localIp=selectedLanInterface()?.ip||'';
 const ipUnc=localIp?String.fromCharCode(92,92)+localIp+String.fromCharCode(92)+sh.name:'';
 const ntfs=sh.ntfs||null,aces=Array.isArray(sh.permissions)?sh.permissions:[];
 const sourceUnreadable=sh.permissionsReadable===false;
 const aceRows=sourceUnreadable?"<p class=\"muted small\">Windows failed to read SMB authorization. Overriding permissions in an unknown state is prohibited.</p>":aces.map(a=>{
  const owner=(state.snapshot?.users||[]).find(u=>editableLocalUser(u)&&directLocalAce({permissions:[a]},u).length);
  return `<div class="inspector-access"><div><strong>${esc(a.account||"Unknown principal")}</strong><small>${esc(a.accessControlType||"Unknown")} · Windows SMB Sharing Layer</small></div><div class="core-access-actions">${badge(rightName(a.accessRight||'Unknown'),a.accessControlType==='Deny'?'amber':'blue')}${canAccess&&owner?elButton("Modify",'admin-edit-share-access','btn tiny',`data-index="${index}" data-sid="${attr(owner.sid)}"`):''}</div></div>`;
 }).join('')||"<p class=\"muted small\">No direct SMB authorization is returned, so it cannot be concluded that no one has access.</p>";
 const ntfsRows=sh.ntfsReadable===false?"<p class=\"muted small\">NTFS ACL read failed.</p>":ntfs?(ntfs.access||[]).map(a=>`<div class="inspector-access"><div><strong>${esc(a.identity||"Unknown principal")}</strong><small>${esc(a.inherited?"Inherited":"Explicit")} · ${esc(a.type||'')}</small></div><span class="tiny-text">${esc(a.rights||"Unknown")}</span></div>`).join()||"<p class=\"muted small\">Failure to list the rules does not mean that there is no authorization.</p>":"<p class=\"muted small\">No NTFS file system ACL data.</p>";
 const everyone=aces.some(a=>String(a.account||'').toLowerCase()==='everyone');
 return `${inspectorHeader('folder-open',sh.name,sh.path||"Windows SMB sharing")}
 <div class="inspector-tabs">${badge(sh.special?"System share":managed?"Managed by SwitchLAN":"Existing Windows share",managed?'blue':'neutral')}${badge("SMB share exists",'green')}</div>
 <div class="core-object-summary"><span class="eyebrow">Network share address</span><strong class="mono">${esc(unc)}</strong><div class="core-action-toolbar">${elButton(icon('copy',14)+" Copy hostname path",'copy-unc','btn tiny ghost',`data-value="${attr(unc)}"`)}${ipUnc?elButton(icon('copy',14)+" Copy IPv4 path",'copy-unc','btn tiny ghost',`data-value="${attr(ipUnc)}" title="The current network adapter is IPv4; the other party still needs to communicate with the local network."`):''}${elButton(icon('copy',14)+" Copy connection instructions",'share-copy-guide','btn tiny ghost',`data-index="${index}"`)}${writable?elButton("Edit description",'edit-share-description','btn tiny ghost',`data-index="${index}"`):''}</div></div>
 <section class="core-primary-actions" aria-label="Share actions"><div>${icon('key-round',18)}<strong>Share permissions</strong><small>Select account and edit SMB direct permissions</small></div><div class="core-action-toolbar">${canAccess?elButton(icon('key-round',15)+" Edit permissions",'admin-edit-share-access','btn primary',`data-index="${index}"`):badge(writable?"Permissions unavailable":"Read-only share")}</div></section>
 <div class="core-action-toolbar" style="margin:0 0 12px">${elButton(icon('shield-check',15)+" Open permission analysis",'open-permission-analysis','btn ghost',`data-share="${attr(sh.name)}"`)}</div><div class="core-permission-explain"><span>${icon('shield-check',18)}</span><div><strong>Two permission layers</strong><p>Here are the Windows advanced SMB share permissions. Explorer "Shared to Specific Users" may show another view; file access is also restricted by NTFS, group and deny rules.</p></div></div>
 <section class="inspector-section compact"><div class="core-section-title"><h3>Advanced SMB share permissions</h3>${badge(aces.length+" entries",'blue')}</div>${everyone?`<div class="core-inline-note">${icon('info',15)} Windows returns SMB authorization for Everyone; this is a true record of the sharing layer and does not mean that anyone can read and write the file.</div>`:''}${aceRows}</section>
 <details class="core-fold" open><summary>${icon('folder-open',16)} NTFS file permissions <span>${ntfs?.access?.length??"Unknown"} entries</span></summary><div class="core-fold-body">${detailLine("Folder owner",ntfs?.owner||"Unavailable")}${detailLine("Inherited",ntfs?ntfs.inheritanceProtected?"Disabled":"Inheritance enabled":"Unknown")}${ntfsRows}${ntfs?.truncated?"<p class=\"muted small\">Partial ACLs are not shown and final permissions should not be inferred from them.</p>":''}<p class="muted small">This version of NTFS rules is for verification only and will not automatically reset when SMB is modified.</p></div></details>
 <details class="core-fold"><summary>${icon('info',16)} Share details</summary><div class="core-fold-body">${detailLine("Local folder",sh.path||"System virtual path")}${detailLine("Description",sh.description||"Not set")}${detailLine("Access assessment","Effective access has not been calculated")}</div></details>
 <details class="core-fold core-danger-fold"><summary>${icon('alert',16)} Dangerous operation · Stop sharing</summary><div class="core-fold-body"><p class="muted small">Only remove the network share entry and keep the disk file; the client that is transmitting may be disconnected.</p>${writable?elButton("Stop sharing (keep files)",'admin-unshare-existing','btn danger-btn',`data-index="${index}"`):badge("System share or read-only mode")}</div></details>`;
}
function objectWorkbench(kind,items,selected,filter){
 const isUser=kind==='user',label=isUser?"Account":"Share";
 const searchKey=isUser?'users':'shares';
 const filtered=items.filter(o=>String(isUser?(o.name+' '+(o.fullName||'')+' '+(o.description||'')):(o.name+' '+(o.path||'')+' '+(o.description||''))).toLowerCase().includes(filter.toLowerCase()));
 const chosen=filtered.find(o=>(isUser?o.sid:o.name)===state.focus[kind])||filtered[0];
 const index=chosen?selected.indexOf(chosen):-1;
 return `<div class="workbench core-game-workbench"><section class="wb-list"><div class="wb-list-top"><div class="core-list-label"><span class="core-list-led"></span><strong>${isUser?'Local accounts':'Windows shares'}</strong></div>${badge(filtered.length+(filtered.length===1?' item':' items'),'blue')}</div><div class="wb-search">${icon('search',17)}<input id="${searchKey}WorkFilter" placeholder="Search name or description" value="${attr(filter)}" aria-label="Search ${label.toLowerCase()}" /></div><div class="wb-list-scroll">${filtered.map((o,i)=>{const key=isUser?o.sid:o.name;const active=chosen===o;return `<button type="button" class="wb-entry game-card ${active?'active':''}" style="--card-index:${Math.min(i,12)}" data-action="focus-${kind}" data-key="${attr(key)}" aria-pressed="${active}"><span class="wb-entry-icon">${isUser?icon('users',18):icon('folder-open',18)}</span><span class="wb-entry-copy" title="${attr(o.name)}"><strong>${esc(o.name)}</strong><small>${esc(isUser?(o.fullName||o.description||"Local account"):(o.path||"Virtual system share"))}</small></span>${isUser?`<span class="account-status-dot ${o.enabled===false?'disabled':'enabled'}" title="${o.enabled===false?"Disabled":"Enabled"}" aria-label="${o.enabled===false?"Disabled":"Enabled"}"></span>`:o.special?badge("System"):icon('chevron-right',16)}</button>`;}).join('')||`<div class="empty">No matching ${label.toLowerCase()}s. Adjust your search or filters.</div>`}</div></section><section class="wb-inspector game-inspector" aria-label="${label} details">${chosen?(isUser?userInspector(chosen,index):shareInspector(chosen,index)):`<div class="empty">No ${label.toLowerCase()} selected</div>`}</section></div>`;
}
function coreActionCard(iconName,title,description,action,kind='default',disabled=false){
 return `<button type="button" class="core-action-card game-card ${kind==='primary'?'primary':''}" data-action="${action}" ${disabled?'disabled':''}>
 <span class="core-action-symbol">${icon(iconName,22)}</span><span class="core-action-copy"><strong>${title}</strong><small>${description}</small></span>${icon('arrow-right',19)}</button>`;
}
function coreActionDeck(kind){
 if(!live())return '';
 return `<section class="core-action-deck" aria-label="Quick actions">
 <div class="core-deck-title"><span class="core-deck-spark">✦</span><strong>Quick actions</strong><small>Directly perform real Windows management operations</small></div>
 <div class="core-deck-grid">${kind==='share'?
  `${coreActionCard('plus',"New share","Select folders and authorized accounts",'admin-new-share','primary')}${coreActionCard('users',"User accounts","View or maintain Windows local users",'go-users')}${coreActionCard('wifi',"Scan for devices","LAN device discovered with SMB share",'go-lan')}`:
  `${coreActionCard('plus',"Create account","Establish an independent identity for sharing",'admin-new-user','primary')}${coreActionCard('folder-open',"Shared folders","Continue configuring SMB access",'go-shares')}${coreActionCard('wifi',"Scan for devices","LAN device discovered with SMB share",'go-lan')}`
 }</div></section>`;
}
function sharesPage(){
 const snap=real(),all=snap?.shares||[],items=scopedShares(all,state.shareScope);
 return `<div class="core-management-page">${head("File Sharing",snap?"Manage local Windows shares, connection paths and share permissions.":"Please connect to the Windows desktop program.",elButton(icon('plus',16)+" Create share",'admin-new-share','btn primary',!live()?'disabled':''))}${snap?`<div class="wb-toolbar">${sharePicker('shareScope',state.shareScope)}<span class="muted small">System shares are hidden by default, but you can still select "All Shares" to check.</span></div>${objectWorkbench('share',items,all,state.filter.shares)}`:`<section class="panel"><div class="table-wrap"><table><tbody>${all.map(s=>`<tr><td>${esc(s.name)} · ${esc(s.path)}</td><td>${elButton("View simulation details",'inspect-share-'+(s.id||s.name),'btn tiny')}</td></tr>`).join('')}</tbody></table></div></section>`}</div>`;
}
function usersPage(){
 const snap=real(),all=snap?.users||[],items=scopedUsers(all,state.userScope);
 return `<div class="core-management-page">${head("Local users",snap?"Manage local account information, passwords and activation status.":"Please connect to the Windows desktop program.",elButton(icon('plus',16)+" Create account",'admin-new-user','btn primary',!live()?'disabled':''))}${snap?`<div class="wb-toolbar">${userPicker('userScope',state.userScope)}<span class="muted small">Built-in accounts are hidden by default; operations of administrators/current users are still protected by the backend.</span></div>${objectWorkbench('user',items,all,state.filter.users)}`:`<section class="panel"><div class="table-wrap"><table><tbody>${all.map(u=>`<tr><td>${esc(u.name)}</td><td>${badge(u.enabled?"Enable":"Disable")}</td></tr>`).join('')}</tbody></table></div></section>`}</div>`;
}
function permissionsPage(){if(real()){
 const shares=(state.snapshot?.shares||[]).filter(s=>!s.special&&!String(s.name||'').endsWith('$'));
 return `${head("Authority Center","View and modify your computer's current authorization for normal SMB shares, not just the shares created by SwitchLAN.")}<div class="callout">${icon('info',16)}The following table is <strong>Direct permissions for SMB share layer</strong>; NTFS ACLs, groups, deny rules, and inheritance determine the actual effective permissions. Please verify actual access after modification.</div><section class="panel"><div class="table-wrap"><table><thead><tr><th>Share</th><th>Direct permissions</th><th>Actions</th></tr></thead><tbody>${shares.map((s,i)=>`<tr><td><strong>${esc(s.name)}</strong><small class="path">${esc(s.path||'')}</small></td><td>${(s.permissions||[]).map(p=>`<div>${esc(p.account)} · ${badge(p.accessRight||"Unknown",'blue')} · ${esc(p.accessControlType||"Unknown")}</div>`).join('')||"No visible permission entries"}</td><td>${elButton("Open share workspace",'focus-share-from-permissions','btn tiny',`data-key="${attr(s.name)}"`)}</td></tr>`).join('')||"<tr><td colspan=\"3\">No common sharing yet.</td></tr>"}</tbody></table></div></section>`;
}
const users=state.users.filter(u=>u.managed),shares=state.shares.filter(s=>s.managed);return `${head("Authority Center","Account × Shared authorization matrix; click on the cell to edit the SMB and NTFS permissions.")}<section class="panel"><div class="table-wrap"><table class="matrix"><thead><tr><th>Share/Account</th>${users.map(u=>`<th>${esc(u.name)}</th>`).join('')}</tr></thead><tbody>${shares.map(s=>`<tr><td><div class="share-name">${icon('folder-open',16)} <strong>${esc(s.name)}</strong></div></td>${users.map(u=>{const p=s.permissions.find(x=>x.sid===u.sid);return `<td><button class="matrix-button" data-action="permission-${s.id}-${u.sid}">${badge(p?P.roleText[p.smb]:"No permission entry",p?.smb==='change'?'blue':p?.smb==='read'?'green':'neutral')}<small>SMB</small><span class="sep">/</span>${badge(p?P.roleText[p.ntfs]:"No permission entry",p?.ntfs==='change'?'blue':p?.ntfs==='read'?'green':'neutral')}<small>NTFS</small></button></td>`}).join('')}</tr>`).join('')}</tbody></table></div></section><div class="callout">${icon('info',17)}The matrix shows simulated direct authorization and does not represent the actual effective permissions after taking into account group membership, inheritance, Deny and other entries.</div>`;}

function peersPage(){if(real())return `${head("LAN Discovery","Actively scan the private IPv4 /24 subnet where the current physical network adapter is located. Only detect TCP 445 and do not scan external networks.",live()?elButton(icon('search',16)+" Scan for nearby SMB devices",'lan-scan','btn primary'):'')}<div class="callout">${icon('info',16)}This is a manually triggered lightweight scan. 445 Connectivity ≠ successful login, and more ≠ the right to open shared files; when the remote end refuses enumeration, it will be displayed truthfully. There will be no automatic access to files or password attempts.</div>${state.lanResults?`<section class="panel"><div class="panel-title"><h2>Scan results · ${esc(state.lanResults.subnet||'')}</h2>${badge((state.lanResults.devices||[]).length+" Taiwan 445 can be connected",'blue')}</div><p class="muted">${esc(state.lanResults.message||'')}</p><div class="table-wrap"><table><thead><tr><th>Device IP</th><th>Status</th><th>Common shares enumerated</th></tr></thead><tbody>${(state.lanResults.devices||[]).map(d=>`<tr><td class="mono">${esc(d.ip)}</td><td>${esc(d.status)}</td><td>${(d.shares||[]).length?d.shares.map(sh=>`<div class="mono">${esc(String.fromCharCode(92,92)+d.ip+String.fromCharCode(92)+sh)}</div>`).join(''):badge("Unknown or not listed")}</td></tr>`).join('')||"<tr><td colspan=\"3\">No other device detected for TCP 445 connection.</td></tr>"}</tbody></table></div></section>`:"<div class=\"empty\">Scan has not been initiated yet. Click the button above to view SMB services within the same LAN.</div>"}`;return `${head("Trusted devices","Allow one or more IPv4 addresses/segments to access the hosted SMB service.",elButton(icon('plus',16)+" Add device",'new-peer','btn primary',ro()?'disabled':''))}<div class="twocol"><section class="panel"><div class="panel-title"><h2>${icon('monitor',18)} IP Whitelist</h2>${badge(`${state.peers.filter(p=>p.enabled).length} enabled`,'blue')}</div><div class="peer-list">${state.peers.map(p=>`<div class="peer"><div class="peer-icon">${icon('monitor',19)}</div><div class="peer-details"><strong>${esc(p.name)}</strong><small class="mono">${esc(p.ip)}</small></div>${badge(p.enabled?"Allow":"Disable",p.enabled?'green':'neutral')}${elButton(p.enabled?"Pause":"Enable",'toggle-peer-'+p.id,'btn tiny',ro()?'disabled':'')}${elButton(icon('x',15),'delete-peer-'+p.id,'iconbtn',ro()?'disabled':'')}</div>`).join('')}</div></section><section class="panel"><div class="panel-title"><h2>${icon('shield-check',18)} Allowlist policy</h2></div><label class="fieldlabel" for="peerMode">Access scope</label><select id="peerMode" ${ro()?'disabled':''}><option value="allowlist" ${state.peerMode==='allowlist'?'selected':''}>Specify IP whitelist (recommended)</option><option value="subnet" ${state.peerMode==='subnet'?'selected':''}>Allow entire subnet (high risk)</option></select><p class="muted">IP is the connection source, not the account identity. Even if you join the whitelist, you still need to pass Windows SMB credential verification and permission checks.</p><div class="callout amber">${icon('alert',17)}The real version must scan the existing broad permission rules before modifying the firewall, otherwise the whitelist cannot guarantee to exclude other devices.</div></section></div>`;}
function securityPage(){
 const snap=real(), report=state.securityReport, profiles=snap?.firewallProfiles||[];
 const high=(report?.findings||[]).filter(x=>x.severity==='high').length;
 const medium=(report?.findings||[]).filter(x=>x.severity==='medium').length;
 const unknown=(report?.unknown||[]).length;
 const cards=report?`<div class="stat-grid"><div class="statcard"><div class="stat-top">${icon('alert',18)}<span>High risk clues</span></div><strong>${high}</strong><small>Priority is required for manual confirmation</small></div><div class="statcard"><div class="stat-top">${icon('shield-check',18)}<span>Medium Risk Clues</span></div><strong>${medium}</strong><small>It is recommended to check the configuration</small></div><div class="statcard"><div class="stat-top">${icon('info',18)}<span>Failed to verify</span></div><strong>${unknown}</strong><small>Undetected does not mean safe</small></div><div class="statcard"><div class="stat-top">${icon('activity',18)}<span>Inspection team performed</span></div><strong>${esc(report.checks??'—')}</strong><small>${esc(report.capturedAt||"Unknown time")}</small></div></div>`:'';
 const findings=(report?.findings||[]).map(x=>`<div class="alert ${x.severity==='high'?'red':x.severity==='medium'?'amber':'muted'}"><div><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p><small>Suggestions:${esc(x.advice)}</small></div></div>`).join('');
 const unverified=(report?.unknown||[]).map(x=>`<div class="alert muted">${icon('info',16)} ${esc(x)}</div>`).join('');
 return `${head("Security checks","Read real Windows native SMB, account and firewall configurations to provide auditable risk clues.",live()?elButton(icon('search',16)+" Run risk checks",'security-scan','btn primary'):'')}
 <div class="callout">${icon('shield-check',17)}The scan is read-only and does not change firewalls, users, or shares. It is a limited-scope configuration check, not an antivirus or vulnerability scan, and it does not prove the final effective NTFS permissions of an account.</div>
 ${cards}
 <div class="twocol"><section class="panel"><div class="panel-title"><h2>${icon('shield-check',18)} Current firewall profiles</h2>${badge(snap?"From the Windows snapshot":"Demo mode",'blue')}</div>
 ${snap?`<div class="settings-list">${profiles.map(p=>`<div><span>${esc(p.name)}</span>${badge(p.enabled?"Enabled":"Close",p.enabled?'green':'amber')}</div>`).join('')||"<div>Firewall configuration not retrieved; see snapshot warning.</div>"}</div>`:"<p class=\"muted\">Show real results after starting a scan in Windows desktop program.</p>"}
 <p class="muted small">Specific rules may be affected by network configuration, programs, and group policies. Do not open TCP 445 to the public network.</p></section>
 <section class="panel"><div class="panel-title"><h2>${icon('search',18)} Risk check results</h2>${report?badge("Checked",'green'):badge("Not scanned yet",'neutral')}</div>
 ${report?`${findings||"<div class=\"callout\">No clear high/medium risk clues were found within the scope of this inspection, but this does not mean that the entire machine is safe.</div>"}${unverified?`<h3>Unverified checks</h3>${unverified}`:''}<p class="muted small">${esc(report.scope||"Collected native configuration only.")}</p>`:`<div class="empty">Risk scan results have not been obtained.${live()?"Click \"Start Risk Scan\" to check the current computer.":"Browser demo and imported snapshot cannot trigger real-time inspection."}</div>`}
 </section></div>`;
}

function sessionsPage(){const s=real()?(Array.isArray(state.snapshot.sessions)?state.snapshot.sessions:[]):state.sessions;const logs=real()?[]:state.logs;return `${head("Connections & activity","Check who has connected to the share and what settings have changed.")}<section class="panel"><div class="panel-title"><h2>${icon('activity',18)} SMB session</h2>${badge(sessionUncertain()?"Unavailable":`${s.length} `,'blue')}</div><div class="table-wrap"><table><thead><tr><th>Client</th><th>Account</th><th>Connection details</th><th></th></tr></thead><tbody>${s.map(x=>`<tr><td><strong>${esc(x.name||x.client||x.ip||"Unknown client")}</strong><div class="mono tiny-text">${esc(x.ip||'')}</div></td><td>${esc(x.account||x.username||"Unknown")}</td><td>${esc(x.connected||x.sessionId||'—')}</td><td>${real()?badge("Read-only"):elButton("Analog disconnection",'drop-session-'+x.id,'btn tiny')}</td></tr>`).join('')||`<tr><td colspan="4">${sessionUncertain()?"The session data has not been obtained (maybe insufficient permissions), and it cannot be judged that there is currently no connection.":"No sessions to display"}</td></tr>`}</tbody></table></div></section><section class="panel"><div class="panel-title"><h2>${icon('file',18)} Configuration activity</h2></div><div class="timeline">${logs.map(l=>`<div class="log-row"><div class="logdot"></div><div><strong>${esc(l.event)}</strong><p>${esc(l.detail)}</p></div><time>${esc(l.time)}</time></div>`).join('')||"<div class=\"empty\">Read-only snapshots do not contain historical configuration logs</div>"}</div></section>`;}
function knowledgePage(){const list=K.filter(x=>(x.term+x.desc+x.example+x.tag).toLowerCase().includes(state.knowledgeSearch.toLowerCase()));return `${head("Networking glossary","Professional but not difficult to understand. Each entry is an explanation and a real example.")}<div class="searchbox">${icon('search',19)}<input id="knowledgeSearch" placeholder="Search SMB, NTFS, ARP, routing tables…" value="${attr(state.knowledgeSearch)}" autocomplete="off"/><span>${list.length} entries</span></div><div class="glossary-grid">${list.map(x=>`<article class="glossary-card"><span class="eyebrow">${esc(x.tag)}</span><h3>${esc(x.term)}</h3><p>${esc(x.desc)}</p><div class="glossary-example"><strong>For example</strong> ${esc(x.example)}</div></article>`).join('')||"<p>No related terms found.</p>"}</div>`;}
function adminPage(){return `${head("Management tools","Unified entrance: For actual accounts and sharing, please directly select the objects to modify on their respective pages.")}
 <div class="hub-grid"><button type="button" class="hub-card" data-page="users">${icon('users',24)}<strong>Account management</strong><small>Data, status, passwords and secure deletion</small>${icon('arrow-right',17)}</button><button type="button" class="hub-card" data-page="shares">${icon('folder-open',24)}<strong>Share management</strong><small>Network address, authorization, remarks, stop sharing</small>${icon('arrow-right',17)}</button><button type="button" class="hub-card" data-page="security">${icon('shield-check',24)}<strong>Security checks</strong><small>Proactively scan for Windows configuration risks</small>${icon('arrow-right',17)}</button><button type="button" class="hub-card" data-page="peers">${icon('monitor',24)}<strong>LAN Discovery</strong><small>Scan for reachable SMB devices</small>${icon('arrow-right',17)}</button></div>
 <section class="panel"><div class="panel-title"><h2>${icon('settings',18)} Local diagnostics</h2></div><p class="muted">Check read permissions and operating environment. Management operations require Windows UAC, and the backend re-verifies object identity and protected attributes.</p><div class="inline-actions">${desktopAvailable()?elButton("Rereading Windows",'admin-refresh','btn primary'):badge("Browser read-only demo")}${desktopAvailable()?elButton("Run startup checks",'desktop-diagnostic','btn ghost'):''}</div></section>`;}
function desktopConnectionPage(){
 const fail=state.desktopConnection==='failed';
 return `<div class="pageheading"><div><h1>${fail?"Windows native connection failed":"Loading Windows status"}</h1><p>This is a desktop manager that does not display fake users or shares on failed connections.</p></div></div><section class="panel" style="max-width:850px"><div class="panel-title"><h2>${icon(fail?'alert':'activity',20)} ${fail?"Connection diagnostics":"Reading"}</h2>${badge(fail?"Management actions disabled":"Windows backend connecting",fail?'amber':'blue')}</div>${fail?`<div class="callout danger"><strong>Error returned by Windows:</strong> ${esc(state.lastError||"The backend has not returned a valid Windows status.")}</div>`:"<div class=\"callout\">Getting local user, SMB share, network, and security information from Windows. The action button is only enabled after the status has been read successfully.</div>"}<p class="muted">Please make sure you are running <code>Start-SwitchLAN.cmd</code>instead of double-clicking <code>index.html</code>. If it fails repeatedly, you can run a read-only check script <code>Check-SwitchLAN.cmd</code>, and view <code>%TEMP%\SwitchLAN.Desktop.log</code>。</p><div class="inline-actions">${elButton(icon('rotate',16)+" Reconnect Windows",'admin-refresh','btn primary',desktopBusy?'disabled':'')}${elButton("Run local diagnostics",'desktop-diagnostic','btn ghost',desktopBusy?'disabled':'')}${state.lastError?elButton("Copy error details",'copy-last-error','btn ghost'):''}</div></section>`;
}
function coreBrowserGuide(){
 return `${head("Please open via desktop program","This page does not display fictional Windows users and shares, nor does it support administrative operations.")}
 <section class="panel core-empty-panel"><div class="core-empty-icon">${icon('monitor',28)}</div><h2>Not connected to Windows yet</h2><p class="muted">Please double-click on your Windows computer <code>Start-SwitchLAN.cmd</code>, and then read the real local account and SMB share from the desktop window.</p><p class="muted">You can also import a desensitized read-only snapshot in "Settings and Diagnostics" for inspection, but the system cannot be modified through the browser.</p>${elButton("Open Settings & Diagnostics",'go-settings','btn primary')}</section>`;
}
function lanDeviceCard(device){
 const expanded=!!state.lanExpanded[device.ip];
 const title=device.hostname||device.ip;
 const haveSmb=!!device.port445;
 const shareNames=Array.isArray(device.shares)?device.shares:[];
 const pingLabel=device.ping?('Ping '+(Number.isFinite(Number(device.pingMs))?Number(device.pingMs)+'ms':"Responding")):"Ping no response";
 const uncs=shareNames.map(name=>({name,path:'\\\\'+device.ip+'\\'+name}));
 return `<article class="lan-device-card game-card ${expanded?'expanded':''}" aria-label="Device ${attr(device.ip)}">
   <div class="lan-device-top"><div class="lan-device-icon ${haveSmb?'smb-on':''}">${icon(haveSmb?'monitor':'wifi',20)}</div>
   <div class="lan-device-info"><strong class="mono">${esc(device.ip)}</strong><small>${esc(device.hostname||"Hostname unresolved")}</small></div>
   <div class="lan-device-tags">${badge(pingLabel,device.ping?'green':'neutral')}${badge(haveSmb?"TCP 445 connectable":"445 Not ready",haveSmb?'blue':'neutral')}</div>
   <div class="lan-device-actions">${elButton(icon('activity',15)+" Add to radar",'lan-to-radar','btn tiny ghost',`data-ip="${attr(device.ip)}" data-name="${attr(title)}"`)}${elButton(icon('gamepad',15)+" Find games",'lan-to-games','btn tiny ghost',`data-ip="${attr(device.ip)}"`)}${elButton(icon('rotate',16),'lan-rescan-one','iconbtn',`data-ip="${attr(device.ip)}" title="Retest this device" ${desktopBusy?'disabled':''}`)}
   ${elButton(icon('copy',15),'copy-ip','iconbtn',`data-value="${attr(device.ip)}" title="Copy IP"`)}
   ${elButton((haveSmb&&shareNames.length?`View Share (${shareNames.length})`:"Diagnostic details")+' '+icon(expanded?'chevron-down':'chevron-right',15),'lan-toggle-device','btn ghost',`data-ip="${attr(device.ip)}" aria-expanded="${expanded}"`)}</div></div>
   ${expanded?`<div class="lan-device-details">${haveSmb&&uncs.length?`<div class="lan-share-heading">${icon('info',14)} The share name published by Windows (not the folder that has been authorized to you). Please test reading first before deciding whether to connect.</div>${uncs.map(u=>{
    const key=device.ip+'|'+u.name,check=state.lanReadChecks[key];
    const checked=!!check,allowed=check?.readable===true,denied=check?.outcome==='denied';
    const permissionLabel=!checked?"Read access unknown":allowed?"Current account can list the folder":denied?"Windows refuses to list directory":"Read access unverified";
    const evidenceTime=checked&&check.checkedAt&&!Number.isNaN(Date.parse(check.checkedAt))?new Date(check.checkedAt).toLocaleTimeString("en-US",{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';
    return `<div class="lan-share-row"><span>${icon('folder-open',17)}<span><strong>${esc(u.name)}</strong><small class="mono">${esc(u.path)}</small>
    <span class="lan-access-state ${checked?(allowed?'lan-access-ok':denied?'lan-access-denied':'lan-access-unknown'):'lan-access-unknown'}">${icon(!checked||(!allowed&&!denied)?'circle-help':allowed?'check':'alert',13)} ${permissionLabel}</span>
    ${check?`<small class="lan-verified ${allowed?'':denied?'read-failed':'read-unknown'}">${esc(check.status)}${check.errorCode!=null?" · Windows error codes "+esc(check.errorCode):''}${evidenceTime?" · This verification "+esc(evidenceTime):''}</small>`:''}</span></span>
    <div class="lan-share-actions">${elButton(checked?"Retest":"Test read access",'lan-share-check','btn tiny',`data-ip="${attr(device.ip)}" data-share="${attr(u.name)}" ${desktopBusy?'disabled':''}`)}
    ${elButton(allowed?"Open in File Explorer":"Try opening",'lan-open-share','btn tiny ghost',`data-ip="${attr(device.ip)}" data-share="${attr(u.name)}" title="Call Windows Explorer to try to connect; you may be prompted for credentials, but access success is not guaranteed."`)}
    ${elButton(icon('copy',15),'copy-unc','iconbtn',`data-value="${attr(u.path)}" title="Copy share path"`)}</div></div>`;}).join('')}`:
   `<div class="lan-diagnostic">${icon('info',18)}<div><strong>${haveSmb?"TCP 445 Reachable, but normal share not listed":"Device response does not equal opening of file sharing"}</strong><p>${esc(device.status||"Share name not listed. There may be no share, or the remote end does not allow enumeration.")}</p><p class="muted small">You can click "Retest Individually" to recheck, or contact the device owner to confirm SMB, network configuration, and authorization.</p></div></div>`}
   </div>`:''}</article>`;
}
function lanPage(){
 const selected=selectedLanInterface();
 const d=state.lanResults;
 const stale=!!d&&!sameLanAsScan();
 const devices=!stale&&Array.isArray(d?.devices)?d.devices:[];
 const smbDevices=devices.filter(x=>x.port445);
 const readableDevices=devices.filter(x=>(x.shares||[]).some(name=>state.lanReadChecks[x.ip+'|'+name]?.readable===true));
 const readableIps=new Set(readableDevices.map(x=>x.ip));
 const filtered=devices.filter(x=>(state.lanFilter!=='smb'||x.port445)&&(state.lanFilter!=='readable'||readableIps.has(x.ip))&&
  (x.ip+' '+(x.hostname||'')+' '+(x.shares||[]).join(' ')).toLowerCase().includes(state.lanSearch.toLowerCase()));
 const scanning=state.lanScanning;
 const elapsed=state.lanLastFinished?new Date(state.lanLastFinished).toLocaleString("en-US"):"Not scanned yet";
 return `<div class="lan-workbench">
   <div class="lan-workbench-heading"><h1>LAN Discovery</h1><details class="lan-help"><summary aria-label="Scan scope">${icon('circle-help',17)} Scan scope</summary><div class="lan-help-card"><b>Only use in LANs that you have permission to manage</b><p>ICMP Ping + TCP 445; SMB share name enumeration depends on system authorization. No password attempts or changes to remote files will be made.</p><p>TCP 445 is initiated from the selected local IP, and Ping still follows the Windows routing table; it may be missed when Ping is disabled on the device.</p><p>Test read only attempts to enumerate the directory; actual write and delete permissions will not be inferred.</p></div></details></div>
   <div class="lan-console"><label class="lan-interface-control"><span>Scan network/network adapter</span><select id="lanInterface" ${scanning?'disabled':''} aria-label="Select network adapter">${availableLanInterfaces().map(n=>`<option value="${attr(n.ip)}" ${n.ip===selected?.ip?'selected':''}>${esc(n.name)} · ${esc(n.ip)}/${esc(n.prefix)} ${n.virtual?"(Virtual/VPN)":"(Physics)"}</option>`).join('')||"<option>No active private IPv4 network adapters</option>"}</select><small>${selected?`${esc(selected.speed||"Unknown speed")} · ${selected.virtual?"Virtual network adapter/VPN":"Physical adapter"}`:"Please connect to the network and refresh the machine status"}</small></label>
   <div class="lan-compact-stat" role="button" tabindex="0" data-action="lan-filter-all" title="All responding devices"><small>Responding devices</small><strong>${devices.length}</strong></div>
   <div class="lan-compact-stat ${smbDevices.length?'available':''}" role="button" tabindex="0" data-action="lan-filter-smb" title="Only display TCP 445 connectable devices"><small>SMB device</small><strong>${smbDevices.length}</strong></div>
   <div class="lan-run-area">${scanning?elButton(icon('x',16)+" Stop scan",'lan-cancel','btn lan-scan-stop'):
     elButton(icon('search',17)+' '+(d?"Scan again":"Start scan"),'lan-scan','btn primary lan-scan-main',lanScanAllowed()?'':'disabled')}
   <small title="${esc(elapsed)}">${scanning?`Detected ${state.lanProgress.done}/${state.lanProgress.total}`:d&&!stale?`Last time ${esc(elapsed)}`:stale?"The network adapter has been switched and has not been scanned yet.":"Not scanned yet"}</small></div></div>
   <div class="lan-secondary-controls"><div><span class="mono">${esc(selected?.ip||"IP not obtained")}</span>${selected?elButton(icon('copy',14),'copy-local-ip','iconbtn',`title="Copy scan source IP"`):''}<span class="lan-muted-prefix">${esc(lanSubnet(selected?.ip))}</span></div>
   <details class="lan-range-settings"><summary>${icon('settings',15)} Limit range</summary><div class="lan-range-fields"><span>Host range</span><input id="lanStartHost" type="number" min="1" max="254" value="${state.lanStartHost}" ${scanning?'disabled':''}/><span>to</span><input id="lanEndHost" type="number" min="1" max="254" value="${state.lanEndHost}" ${scanning?'disabled':''}/><small>Limit the last segment of the current subnet, 1–254</small></div></details></div>
   ${scanning?`<div class="lan-progress" role="status"><div class="lan-progress-bar" style="width:${Math.min(100,Math.round(state.lanProgress.done/state.lanProgress.total*100))}%"></div></div>`:''}
   ${stale?"<div class=\"lan-inline-note\">Scanning network adapter has been switched. The old result belongs to another subnet. Click \"Start Scan\" to obtain the device on the current subnet.</div>":''}
   <div class="lan-results-heading"><div class="lan-filters"><button type="button" class="lan-filter ${state.lanFilter==='all'?'active':''}" data-action="lan-filter-all">All (${devices.length})</button><button type="button" class="lan-filter ${state.lanFilter==='smb'?'active':''}" data-action="lan-filter-smb">TCP 445 (${smbDevices.length})</button><button type="button" class="lan-filter ${state.lanFilter==='readable'?'active':''}" data-action="lan-filter-readable">Verified readable (${readableDevices.length})</button></div><input id="lanSearch" type="search" placeholder="Search IP, hostname or share" value="${attr(state.lanSearch)}" aria-label="Search devices"/></div>
   <div class="lan-view-switch" role="group" aria-label="Scan result layout">${elButton(icon('monitor',15)+" Device map",'lan-view-map',`btn tiny ${state.lanView==='map'?'is-selected':''}`,`aria-pressed="${state.lanView==='map'}"`)}${elButton(icon('file',15)+" Device list",'lan-view-list',`btn tiny ${state.lanView==='list'?'is-selected':''}`,`aria-pressed="${state.lanView==='list'}"`)}</div>
   ${state.lanView==='map'?lanMap(selected,filtered,stale):''}
   <div class="lan-result-list" ${state.lanView==='map'?'id="lan-list-details"':''}>${filtered.length?filtered.map(lanDeviceCard).join(''):
     `<div class="lan-empty">${icon('search',29)}<strong>${!d||stale?"There is no scan result of the current network adapter yet.":devices.length?"No matching devices":"No responding devices found"}</strong><span>${!d||stale?"Select the network adapter and click Start Scan.":"You can adjust the filter conditions, or check the other party's device and firewall settings."}</span>${!scanning&&lanScanAllowed()?elButton(icon('search',16)+" Start scan",'lan-scan-empty','btn primary'):''}</div>`}</div>
   ${!live()?"<div class=\"lan-inline-note\">Please run the Windows desktop version to connect to the machine and scan.</div>":''}
   </div>`;
}
// Core 1.4: evidence-based analyzer. A name match is only a clue, never a token/EffectiveAccess calculation.
function permissionIdentityMatches(identity,name,computer){
 const raw=String(identity||'').trim().toLowerCase(),n=String(name||'').trim().toLowerCase(),pc=String(computer||'').trim().toLowerCase();
 return !!raw&&!!n&&(raw===n||raw===pc+'\\'+n||raw==='.\\'+n);
}
function analysisRuleList(entries,kind,subject,computer){
 if(entries===null)return `<div class="analysis-uncertain">${icon('alert',15)} ${kind} permissions could not be read. Access cannot be determined from missing data.</div>`;
 const rows=entries.map(a=>{
  const identity=kind==='SMB'?a.account:a.identity;
  const exact=permissionIdentityMatches(identity,subject.name,computer)||(!!subject.sid&&String(identity||'').toLowerCase()===String(subject.sid).toLowerCase());
  const group=(subject.groups||[]).some(g=>permissionIdentityMatches(identity,g,computer)||permissionIdentityMatches(identity,g,'BUILTIN'));
  const universal=/^(everyone|everyone\s*\(.*\)|s-1-1-0|authenticated users|nt authority\\authenticated users)$/i.test(String(identity||'').trim());
  return `<div class="analysis-rule ${exact?'analysis-exact':group||universal?'analysis-candidate':''}"><div><strong>${esc(identity||"Unknown principal")}</strong><small>${exact?"Name/SID matches selected account":group?"Name matches local group read":universal?"Broad identity group, need to be judged according to authentication context":"Other authorized entities"} · ${kind==='SMB'?"Shared layer":a.inherited?"NTFS inheritance rules":"NTFS explicit rules"}</small></div><div class="analysis-rule-right">${badge(a.accessControlType||a.type||"Unknown",/deny/i.test(a.accessControlType||a.type||'')?'amber':'neutral')}<span>${esc(a.accessRight||a.rights||"Unknown")}</span></div></div>`;
 }).join('');
 return rows||"<div class=\"analysis-uncertain\">Windows did not return displayable authorization items; this does not mean that there is no authorization.</div>";
}
// Diagnostic clue only: absence of a visible name/group match is NOT an AccessCheck result.
function analysisMissingVisibleNtfsIdentity(entries,subject,computer){
 if(!Array.isArray(entries)||!subject)return false;
 const ids=[subject.name,subject.sid,...(Array.isArray(subject.groups)?subject.groups:[])];
 const broad=/^(everyone|s-1-1-0|authenticated users|nt authority\\authenticated users)$/i;
 return !entries.some(a=>{
  const raw=String(a.identity||'').trim();
  return broad.test(raw)||ids.some(id=>permissionIdentityMatches(raw,id,computer)||permissionIdentityMatches(raw,id,'BUILTIN')||raw.toLowerCase()===String(id||'').toLowerCase());
 });
}
function permissionsAnalysisPage(){
 const snap=real();
 const shares=(snap?.shares||[]).filter(s=>!s.special&&!String(s.name||'').endsWith('$'));
 const users=snap?.users||[];
 const share=shares.find(s=>s.name===state.permissionShare)||shares[0];
 const user=users.find(u=>u.sid===state.permissionUser)||users.find(u=>!systemAccount(u))||users[0];
 if(!snap)return `${head("Permission Analysis","Need to read Windows share, NTFS and account information first.")}<div class="panel">Please connect to the Windows desktop program first, or import a read-only snapshot.</div>`;
 const smb=share?.permissionsReadable===false?null:(share?.permissions||[]),ntfs=share?.ntfsReadable===true&&share.ntfs?share.ntfs.access:null;
 const ntfsPartial=!!share?.ntfs?.truncated;
 const groupStatusIncomplete=(snap.warnings||[]).some(w=>/group|组成员|本地组|所属组/i.test(w));
 const accountKnown=!!(user&&user.groupsReadable!==false&&!groupStatusIncomplete);
 const ntfsClue=!!(share&&user&&accountKnown&&ntfs!==null&&!ntfsPartial&&analysisMissingVisibleNtfsIdentity(ntfs,user,snap.computerName));
 return `<div class="core-management-page">${head("Permission Analysis","Review accounts, SMB share permissions and NTFS entries together. This view does not calculate effective access.")}
 <section class="panel analysis-picker"><div class="analysis-pick-grid"><label>Select a Windows share<select id="analysisShare">${shares.map(s=>`<option value="${attr(s.name)}" ${s===share?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>Select local account<select id="analysisUser">${users.map(u=>`<option value="${attr(u.sid)}" ${u===user?'selected':''}>${esc(u.name)}${systemAccount(u)?" (built-in)":''}</option>`).join('')}</select></label></div>
 ${share&&user?`<div class="analysis-context"><div><small>Analyzing</small><strong>${icon('users',16)} ${esc(user.name)} ${icon('arrow-right',15)} ${icon('folder-open',16)} ${esc(share.name)}</strong><span class="mono">${esc(share.path||"Path unknown")}</span></div>${badge("Permission evidence · Not an effective access calculation",'blue')}</div>`:''}
 </section>
 ${!share||!user?"<section class=\"panel\">There is not enough share or account information to analyze.</section>":`
 <div class="analysis-summary"><div class="panel"><small>SMB direct authorization</small><strong>${smb===null?"Read failed":smb.length+" entries"}</strong><span>From Get-SmbShareAccess</span></div><div class="panel"><small>NTFS ACL</small><strong>${ntfs===null?"Read failed":ntfsPartial?"First "+ntfs.length+" entries":ntfs.length+" entries"}</strong><span>${ntfsPartial?"ACL truncated and cannot be considered complete":"From Get-Acl, collect up to 40 items"}</span></div><div class="panel"><small>Local group member clues</small><strong>${accountKnown?user.groups.length+" ":"Unknown"}</strong><span>Does not contain full nested/domain group token</span></div></div>
 ${ntfsClue?`<div class="analysis-clue">${icon('info',18)}<div><strong>NTFS troubleshooting clue: No visible ACEs found that directly match the current account and known groups</strong><p>This does not mean that Windows has denied access. Actual access is also affected by domain groups, nested groups, identity tokens, special principals, and inheritance rules; please perform access verification with the target identity.</p></div></div>`:''}
 <div class="analysis-columns"><section class="panel"><div class="panel-title"><h2>${icon('shield-check',17)} SMB Sharing Layer</h2>${badge(smb===null?"Unknown":"Windows data",'blue')}</div>${analysisRuleList(smb,'SMB',user,snap.computerName)}</section>
 <section class="panel"><div class="panel-title"><h2>${icon('folder-open',17)} NTFS file system</h2>${badge(ntfs===null?"Incomplete":"Windows data",'blue')}</div>${share.ntfs?`<div class="analysis-owner">Owner:${esc(share.ntfs.owner||"Unknown")} · ${share.ntfs.inheritanceProtected?"Inheritance prohibited":"Inheritance enabled"}</div>`:''}${ntfsPartial?"<div class=\"analysis-uncertain\">The rules have been truncated; only the captured portion is shown below and cannot be taken as a complete NTFS authorization list.</div>":''}${analysisRuleList(ntfs,'NTFS',user,snap.computerName)}</section></div>
 <section class="panel analysis-explanation"><h3>${icon('circle-help',18)} Why not just give "readable/writable"?</h3><p>The rules highlighted above are rules with the same name as the selected account name, SID, or known local group and are only used as troubleshooting clues. Windows access checks also rely on current login token, group nesting, domain identity, Allow/Deny order, NTFS inheritance, share layer restrictions, etc. Name matching does not equate to final permission; this is especially inconclusive when the NTFS list is truncated or the read fails.</p><p><b>Suggestions:</b>Verify the two-tier ACL before performing a real access test using the target account from another authorized Windows computer. Don't mistake "can enumerate share names" with "can read files."</p><div class="core-action-toolbar">${elButton("Enter sharing details",'analysis-go-share','btn primary',`data-share="${attr(share.name)}"`)}${live()?elButton(icon('rotate',15)+" Refresh Windows data",'admin-refresh','btn ghost'):''}</div></section>`}</div>`;
}
function connectionsPage(){
 const data=state.connections,ready=!!data&&data.sessionsReadable===true,canFiles=!!data&&data.filesReadable===true;
 const sessions=ready?data.sessions:[],files=canFiles?data.files:[];
 return `<div class="core-management-page">${head("SMB Sessions","View inbound SMB sessions and open files. This read-only view does not disconnect clients.",live()?elButton(icon('rotate',16)+" Refresh now",'connections-refresh','btn primary',desktopBusy?'disabled':''):badge("Please connect to Windows",'neutral'))}
 <div class="callout">${icon('info',16)} Shown here is<strong>Others access the local SMB service</strong>, it is not the local machine accessing the outbound connection shared by others. Data is only collected when you actively refresh, and no background monitoring is performed. Reading the session may require administrator privileges.</div>
 ${state.connectionsError?`<div class="callout amber">${icon('alert',16)} ${esc(state.connectionsError)}</div>`:''}
 ${!data?`<section class="panel"><div class="connections-empty">${icon('activity',28)}<strong>No real-time session list has been obtained yet</strong><p>Click "Refresh now" to read the local Get-SmbSession / Get-SmbOpenFile.</p>${live()?elButton("Read SMB sessions",'connections-refresh','btn primary',desktopBusy?'disabled':''):''}</div></section>`:
 `<div class="analysis-summary"><div class="panel"><small>SMB session</small><strong>${ready?String(sessions.length):"Unknown"}</strong><span>${ready?"Current snapshot":"Read permission not granted"}</span></div><div class="panel"><small>Open file</small><strong>${canFiles?String(files.length):"Unknown"}</strong><span>${canFiles?"Current snapshot":"Read permission not granted"}</span></div><div class="panel"><small>Collection time</small><strong class="connections-time">${esc(data.capturedAt||"Unknown")}</strong><span>Manual snapshot, no automatic update</span></div></div>
 ${(data.warnings||[]).map(w=>`<p class="analysis-uncertain">${icon('alert',14)} ${esc(w)}</p>`).join('')}
 ${(data.sessionsTruncated||data.filesTruncated)?"<div class=\"callout amber\">There are more than 200 results and the list only shows the first 200; the above number is not a complete total.</div>":''}
 <section class="panel"><div class="panel-title"><h2>${icon('monitor',18)} Inbound SMB sessions</h2>${badge(ready?"Read":"Status unknown",ready?'green':'amber')}</div>
 ${ready?(sessions.length?`<div class="connection-list">${sessions.map(s=>`<article class="connection-row"><span class="connection-avatar">${icon('monitor',18)}</span><div><strong>${esc(s.client||"Unknown client")}</strong><small>${esc(s.username||"Unknown identity")} · Dialect ${esc(s.dialect||"Unknown")} · Session ID ${esc(s.sessionId||"Unknown")}</small></div><div class="connection-metrics"><b>${Number(s.numOpens)||0}</b><small>Reported open items</small></div></article>`).join('')}</div>`:"<div class=\"connections-empty\"><strong>Windows reported no active SMB sessions at this time</strong><p>This does not mean that there was no connection in the past, nor does it prove that there are no other network accesses going on.</p></div>"):"<div class=\"analysis-uncertain\">SMB sessions could not be read. Unknown does not mean zero sessions.</div>"}</section>
 <section class="panel"><div class="panel-title"><h2>${icon('file',18)} Files opened by remote clients</h2>${badge(canFiles?"Read":"Status unknown",canFiles?'green':'amber')}</div>
 ${canFiles?(files.length?`<div class="connection-list">${files.map(f=>`<article class="connection-row"><span class="connection-avatar">${icon('file',17)}</span><div><strong>${esc(f.shareRelativePath||f.path||"Path unknown")}</strong><small>${esc(f.client||"Unknown client")} · ${esc(f.username||"Unknown identity")}</small><small>Local path: ${esc(f.path||"Unknown")} · Session ${esc(f.sessionId||"Unknown")}</small></div></article>`).join('')}</div>`:"<div class=\"connections-empty\">There are currently no SMB open files logged.</div>"):"<div class=\"analysis-uncertain\">Unable to read list of remote open files.</div>"}</section>`}</div>`;
}
function lanMap(selected,devices,stale){
 if(!state.lanResults||stale)return '';
 const max=devices.slice(0,64);
 return `<section class="panel lan-map-panel" aria-label="Schematic diagram of this LAN scanning equipment"><div class="panel-title"><h2>${icon('monitor',18)} Device map · Discovery results</h2>${badge("Not a physical topology map",'neutral')}</div>
 <div class="lan-map-layout"><div class="lan-map-origin"><div class="lan-map-symbol">${icon('monitor',23)}</div><strong>Current computer</strong><small class="mono">${esc(selected?.ip||state.lanResults.localIp||"Unknown")}</small><span>${esc(selected?.name||"Scan source network adapter")}</span></div><div class="lan-map-link" aria-hidden="true"></div><div class="lan-map-targets">${max.map(d=>{
  const open=(d.shares||[]).some(name=>state.lanReadChecks[d.ip+'|'+name]?.readable===true);
  return `<button type="button" class="lan-map-node ${d.port445?'lan-map-smb':''} ${open?'lan-map-readable':''}" data-action="lan-map-focus" data-ip="${attr(d.ip)}" title="Click to view device details" aria-label="View device ${attr(d.ip)}"><span class="lan-map-symbol">${icon('monitor',19)}</span><strong class="mono">${esc(d.ip)}</strong><small>${esc(d.hostname||"Hostname not resolved")}</small><span>${open?"Listable directories":d.port445?"445 connectable":"Ping response"}</span></button>`;
 }).join('')||"<div class=\"lan-map-none\">No responding device found during this scan.</div>"}</div></div>
 <p class="muted small">The connection only represents the observation relationship between the scanning source and the address detected this time.<b>No</b>Switch topology, physical connections, or device mutual trust.${devices.length>64?"The map displays up to 64 units, please use the list to view them all.":''}</p></section>`;
}
function settingsPage(){
 const snap=real(),history=state.coreActivity||[],warnings=snap?.warnings||[];
 return `<div class="core-management-page">${head("Settings & Diagnostics","Theme preferences and Windows connection checks.",desktopAvailable()?elButton(icon('rotate',16)+" Reload local state",'admin-refresh','btn primary',desktopBusy?'disabled':''):'')}
 <div class="core-settings-grid core-settings-focused"><section class="panel"><div class="panel-title"><h2>${icon('settings',18)} Appearance and experience</h2></div>
 <div class="core-setting-row"><div><strong>Theme</strong><small>Adjust SwitchLAN interface only</small></div>${elButton(state.theme==='light'?"Switch to dark color":"Switch to light colors",'theme','btn ghost')}</div>
 <div class="core-setting-row"><div><strong>Liquid Glass effects</strong><small>Choose Full on faster PCs, or Off to reduce graphics load.</small></div><div class="core-glass-choice" role="group" aria-label="Glass effect">${[['off',"Close"],['subtle',"Lightness"],['full',"Full"]].map(([mode,title])=>elButton(title,'glass-mode',`btn tiny ${state.glassMode===mode?'is-selected':''}`,`data-mode="${mode}" aria-pressed="${state.glassMode===mode}"`)).join('')}</div></div></section>
 <section class="panel"><div class="panel-title"><h2>${icon('monitor',18)} Windows connection status</h2>${badge(live()?"Connected":snap?"Read-only snapshot":"Disconnected",live()?'green':'amber')}</div>
 ${detailLine("Status collection",snap?.capturedAt||"Unavailable")}${detailLine("Local account",snap?String((snap.users||[]).filter(u=>!systemAccount(u)).length):'—')}${detailLine("Standard shares",snap?String((snap.shares||[]).filter(s=>editableShare(s)).length):'—')}
 <div class="core-action-toolbar">${desktopAvailable()?elButton("Running environment self-test",'desktop-diagnostic','btn ghost',desktopBusy?'disabled':''):''}${desktopAvailable()&&state.desktopReportAvailable?elButton("Open diagnostic report",'desktop-open-report','btn ghost'):''}</div></section></div>
 <details class="core-settings-advanced"><summary>${icon('settings',17)} Advanced tools and diagnostic information <span>Expand</span></summary><div class="core-settings-advanced-body"><section class="panel"><h3>State snapshot</h3><p class="muted small">Include account name, SID and share path; please do not disclose the original file.</p><div class="core-action-toolbar">${desktopAvailable()?elButton("Export local snapshot",'desktop-export','btn ghost'):''}${elButton("Import read-only snapshot",'import-snapshot','btn ghost')}</div></section>
 <section class="panel"><h3>Active network adapter</h3><div class="diagnostic-nics">${availableLanInterfaces().map(n=>`<div><div><strong>${esc(n.name)}</strong><small>${n.virtual?"Virtual / VPN":"Physical adapter"} · ${esc(n.speed)}</small></div><code>${esc(n.ip)}/${esc(n.prefix)}</code></div>`).join('')||"<p>No private IPv4 network adapter available.</p>"}</div></section>
 <section class="panel"><h3>Current session activity</h3><p class="muted small">Activity is held in memory for this session only. This is not the Windows audit log.</p><div class="core-activity">${history.map(h=>`<div class="core-activity-row"><span>${icon(h.ok?'check':'alert',16)} ${esc(h.label)}</span><span>${badge(h.ok?"Backend returned":"Failure",h.ok?'green':'amber')} <time>${esc(h.at)}</time></span></div>`).join('')||"<p class=\"muted\">No management operation has been performed yet.</p>"}</div></section>
 ${warnings.length?`<section class="panel"><h3>Status read warning</h3>${warnings.slice(0,12).map(w=>`<p class="muted small">${icon('info',14)} ${esc(w)}</p>`).join('')}</section>`:''}</div></details></div>`;
}

// Game discovery never uses fake Windows devices. Protocol verification is distinct
// from successful TCP connection. Scan history is memory-only in this release.
function validGameAddress(value){
 const match=String(value).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/);
 if(!match)return false;
 const [a,b,c,d,port]=match.slice(1).map(Number);
 return [a,b,c,d].every(n=>n>=0&&n<=255)&&port>=1&&port<=65535&&
  (a===10||a===172&&b>=16&&b<=31||a===192&&b===168);
}
function gameCard(item){
 const verified=item.verification==='verified',broadcast=item.verification==='advertised';
 const label=verified?"Game protocol verified":broadcast?"LAN advertisement received":"TCP connection only";
 const badgeType=verified?'green':broadcast?'blue':'neutral';
 const addr=String(item.ip||'')+':'+String(item.port||'');
 return `<article class="game-server-card">
  <div class="game-server-top"><div class="game-server-mark">${icon(item.game==='Minecraft'?'gamepad':'monitor',22)}</div>
   <div class="game-server-identity"><strong>${esc(item.title|| (verified?"Game server discovered":item.game==='Minecraft'?"Minecraft candidate endpoints":item.game==='Terraria'?"Terraria common ports (to be confirmed)":"Custom TCP endpoint"))}</strong><small>${esc(item.game||"Game")} · ${esc(item.edition||'')} · ${esc(item.discovery||'')}</small></div>${badge(label,badgeType)}</div>
  ${item.version||item.online!==null&&item.online!==undefined?`<div class="game-server-stats">${item.version?`<div><span>Game version</span><strong>${esc(item.version)}</strong></div>`:''}${item.online!==null&&item.online!==undefined?`<div><span>Players online</span><strong>${esc(item.online)} / ${esc(item.maxPlayers??'?')}</strong></div>`:''}</div>`:''}
  <div class="game-server-address"><code title="${attr(addr)}">${esc(addr)}</code>${elButton(icon('copy',16)+" Copy address",'game-copy','btn primary',`data-address="${attr(addr)}"`)}${elButton(icon('activity',16)+" Monitor",'radar-import-game','btn ghost',`data-ip="${attr(item.ip)}" data-port="${attr(item.port)}" data-name="${attr(item.game||"Game Server")}"`)}</div>
 </article>`;
}
// Only genuine native samples may populate this dashboard; no synthetic time series.
function radarFormatRate(value){
 if(!Number.isFinite(value))return '—';
 const u=['B/s','KB/s','MB/s','GB/s'];let n=value,i=0;
 while(n>=1024&&i<3){n/=1024;i++;}
 return `${n.toFixed(n>=100?0:n>=10?1:2)} ${u[i]}`;
}
function radarMetrics(history){
 const valid=history.filter(x=>x.icmp==='ok'&&Number.isFinite(x.icmpMs));
 const ms=valid.map(x=>x.icmpMs);
 const loss=history.length?100*history.filter(x=>x.icmp!=='ok').length/history.length:null;
 const average=ms.length?ms.reduce((a,b)=>a+b,0)/ms.length:null;
 // Jitter-like RTT variation only across adjacent successful probes; never span timeouts.
 const changes=history.slice(1).flatMap((x,i)=>{const prior=history[i];return radarSampleRtt(x)!==null&&radarSampleRtt(prior)!==null?[Math.abs(x.icmpMs-prior.icmpMs)]:[];});
 const jitter=changes.length?changes.reduce((a,b)=>a+b,0)/changes.length:null;
 return {average,loss,jitter};
}
// Core 1.4.3: stable, right-anchored, timestamp-driven chart. Chart nodes survive each radar tick.
const RADAR_STEPS=[12,20,50,100,250,500,1000,2000,5000];
const RADAR_W=600,RADAR_H=170,RADAR_L=15,RADAR_R=548,RADAR_T=16,RADAR_B=143;
let radarHoverPoints=[];
let radarChartIdentity='';
let radarLastPaintedTime=NaN;
function radarTimeMs(s){const n=Date.parse(String(s?.time||''));return Number.isFinite(n)?n:NaN;}
function radarCurrentTarget(){return state.radarTargets.find(t=>t.id===state.radarSelected)||state.radarTargets[0]||null;}
function radarVisible(history){
 const latest=history[history.length-1];const end=radarTimeMs(latest);
 if(!Number.isFinite(end))return [];
 const from=end-state.radarWindowSec*1000;
 return history.filter(s=>{const t=radarTimeMs(s);return Number.isFinite(t)&&t>=from&&t<=end;});
}
function radarSampleRtt(s){return s.icmp==='ok'&&Number.isFinite(s.icmpMs)&&s.icmpMs>=0?s.icmpMs:null;}
function radarScaleFor(targetId,points){
 const peak=Math.max(0,...points.map(p=>radarSampleRtt(p)||0));
 let scale=state.radarScales[targetId];
 const target=RADAR_STEPS.find(v=>v>=peak*1.16)||Math.ceil(peak*1.16/1000)*1000||12;
 const sampleTime=radarTimeMs(points.at(-1));
 if(!scale){scale={max:target,hold:0,last:sampleTime};state.radarScales[targetId]=scale;}
 else if(target>scale.max){scale.max=target;scale.hold=0;}
 else if(target<scale.max&&sampleTime!==scale.last){
   const nextLower=RADAR_STEPS.filter(v=>v<scale.max).at(-1)||12;
   if(peak<=nextLower*.7)scale.hold++;else scale.hold=0;
   if(scale.hold>=5){scale.max=Math.max(target,nextLower);scale.hold=0;}
 }else if(target>=scale.max)scale.hold=0;
 scale.last=sampleTime;
 return scale.max;
}
function radarSparkline(history){
 const hist=history.slice(-28);const valid=hist.map(radarSampleRtt);
 if(!valid.some(v=>v!==null))return "<span class=\"radar-mini-empty\" aria-label=\"No valid RTT yet\">—</span>";
 const top=Math.max(12,...valid.filter(v=>v!==null))*1.2;
 const coords=valid.map((v,i)=>v===null?null:[2+i*66/Math.max(1,hist.length-1),16-v/top*13]);
 const chunks=[];let run=[];
 for(const p of [...coords,null]){if(p)run.push(p);else if(run.length){chunks.push(run);run=[];}}
 const paths=chunks.map(parts=>`<path d="${parts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ')}"/>`).join('');
 const losses=coords.map((p,i)=>p===null?`<line x1="${(2+i*66/Math.max(1,hist.length-1)).toFixed(1)}" y1="14" x2="${(2+i*66/Math.max(1,hist.length-1)).toFixed(1)}" y2="18" class="mini-loss"/>`:'').join('');
 return `<svg class="radar-spark" viewBox="0 0 70 20" preserveAspectRatio="none" role="img" aria-label="Recently ${hist.length} Mini-RTT curve for monitoring times">${paths}${losses}</svg>`;
}
function radarCurve(){
 return `<div class="radar-chart-wrap" id="radarChartWrap">
   <div class="radar-chart-toolbar"><div class="radar-legend"><span><i class="radar-key-live"></i> ICMP RTT</span><span><i class="radar-key-loss"></i> No reply / Not confirmed</span><small id="radarExtrema">Waiting for samples</small></div>
    <div class="radar-chart-actions"><button class="radar-optics-switch liquid-button" type="button" data-action="radar-glass" title="Toggle liquid refraction level (using global glass settings)" aria-label="Liquid glass effect:${state.glassMode==='full'?"Full":state.glassMode==='subtle'?"Lightness":"Close"}, click to switch"><span class="radar-optics-gem" aria-hidden="true"></span><span>Optics ${state.glassMode==='full'?"Full":state.glassMode==='subtle'?"Lightness":"Close"}</span></button>
    <div class="radar-window-tabs" role="group" aria-label="Display time range">${[60,120,300].map(s=>`<button type="button" class="radar-window-btn ${state.radarWindowSec===s?'active':''}" data-action="radar-window" data-seconds="${s}" aria-pressed="${state.radarWindowSec===s}">${s<60?s+"seconds":s/60+"minutes"}</button>`).join('')}</div></div></div>
   <div class="radar-chart-stage" id="radarChartStage" aria-label="ICMP measured delay curve, you can hover to view each detection">
    <!-- Optical layers sit BEHIND all numeric marks and chart paths. Never distort actual observations. -->
    <div class="radar-liquid-atmosphere" aria-hidden="true"></div>
    <div class="radar-liquid-refraction" aria-hidden="true"></div>
    <div class="radar-liquid-signal" id="radarGlassSignal" aria-hidden="true"></div>
    <svg class="radar-chart" id="radarChartSvg" viewBox="0 0 ${RADAR_W} ${RADAR_H}" preserveAspectRatio="none" role="img" aria-label="Real ICMP round-trip latency over the most recent period; failure to receive a response is represented by interrupts and vertical bands.">
     <defs><linearGradient id="radarLineGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4f6bed"/><stop offset="1" stop-color="#7863e7"/></linearGradient>
      <linearGradient id="radarAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f6bed" stop-opacity=".24"/><stop offset=".55" stop-color="#7863e7" stop-opacity=".085"/><stop offset="1" stop-color="#7863e7" stop-opacity="0"/></linearGradient>
      <pattern id="radarLossPattern" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#ef4444" fill-opacity=".065"/><line x1="0" y1="0" x2="0" y2="7" stroke="#ed786e" stroke-opacity=".24" stroke-width="1.5"/></pattern>
      <clipPath id="radarPlotClip"><rect x="${RADAR_L}" y="${RADAR_T}" width="${RADAR_R-RADAR_L}" height="${RADAR_B-RADAR_T}"/></clipPath></defs>
     <g class="radar-grid" id="radarGrid"></g>
     <g class="radar-time-grid" id="radarTimeGrid"></g>
     <g clip-path="url(#radarPlotClip)"><g id="radarChartTrack"><g id="radarLossZones"></g><g id="radarAreaPaths"></g><g id="radarLinePaths"></g><g id="radarMarkers"></g></g></g>
     <g id="radarPointer" visibility="hidden"><line id="radarHoverRule" x1="0" x2="0" y1="${RADAR_T}" y2="${RADAR_B}"/><circle id="radarHoverCircle" r="4" cx="0" cy="0"/></g>
    </svg>
    <div class="radar-liquid-rim" aria-hidden="true"></div>
    <div class="radar-live-dot" id="radarLiveDot" hidden><span class="radar-live-pulse"></span><span class="radar-live-core"></span></div>
    <div class="radar-chart-tooltip" id="radarTooltip" hidden><div class="radar-tt-time"></div><strong class="radar-tt-value"></strong><small class="radar-tt-tcp"></small></div>
    <div class="radar-chart-empty-state" id="radarChartEmpty"><span class="radar-empty-symbol">${icon('activity',23)}</span><strong>Waiting for live samples</strong><span>Add a target and select Start live monitoring to see measured round-trip times.</span></div>
   </div>
   <div class="radar-chart-caption"><span id="radarChartPeriod">No samples yet</span><span id="radarChartScale">Vertical axis —</span></div>
  </div>`;
}
function radarDrawChart(animate=false){
 if(state.page!=='radar')return;
 const svg=root.querySelector('#radarChartSvg');if(!svg)return;
 const target=radarCurrentTarget();const id=target?.id||'';
 const history=target?(state.radarSamples[id]||[]):[];
 const points=radarVisible(history);
 const identity=id+'|'+state.radarWindowSec;
 if(identity!==radarChartIdentity){radarChartIdentity=identity;radarLastPaintedTime=NaN;radarHoverPoints=[];}
 const plotW=RADAR_R-RADAR_L,plotH=RADAR_B-RADAR_T;
 const yMax=radarScaleFor(id||'_none',points);
 const end=radarTimeMs(history[history.length-1]);
 const toX=t=>RADAR_R-(end-t)/(state.radarWindowSec*1000)*plotW;
 const toY=v=>RADAR_B-(Math.min(yMax,Math.max(0,v))/yMax)*plotH;
 const grid=root.querySelector('#radarGrid');
 grid.innerHTML=points.length?[0,.25,.5,.75,1].map(fr=>{const y=RADAR_T+fr*plotH;return `<line x1="${RADAR_L}" y1="${y}" x2="${RADAR_R}" y2="${y}"/><text x="${RADAR_W-6}" y="${y+4}" text-anchor="end">${(yMax*(1-fr)).toLocaleString('en-US',{maximumFractionDigits:1})} ms</text>`;}).join(''):[0,.25,.5,.75,1].map(fr=>{const y=RADAR_T+fr*plotH;return `<line x1="${RADAR_L}" y1="${y}" x2="${RADAR_R}" y2="${y}"/>`;}).join('');
 const timeGrid=root.querySelector('#radarTimeGrid');
 timeGrid.innerHTML=Number.isFinite(end)?[0,.5,1].map(f=>{
   const x=RADAR_L+(RADAR_R-RADAR_L)*f;
   const tickTime=new Date(end-(1-f)*state.radarWindowSec*1000).toLocaleTimeString("en-US",{hour12:false});
   return `<line x1="${x}" y1="${RADAR_T}" x2="${x}" y2="${RADAR_B}"/><text x="${x}" y="${RADAR_H-7}" text-anchor="${f===0?'start':f===1?'end':'middle'}">${tickTime}</text>`;
 }).join(''):'';
 const coords=points.map(s=>({...s,x:toX(radarTimeMs(s)),y:radarSampleRtt(s)===null?null:toY(s.icmpMs)}));
 radarHoverPoints=coords;
 const seg=[];let pending=[];
 for(const p of [...coords,null]){
   if(p&&p.y!==null){
     // Missed sampling intervals are 'not observed', not a line through unknown time.
     if(pending.length&&radarTimeMs(p)-radarTimeMs(pending.at(-1))>Math.max(1200,state.radarInterval*1.85)){seg.push(pending);pending=[];}
     pending.push(p);
   }else if(pending.length){seg.push(pending);pending=[];}
 }
 const paths=seg.map(run=>run.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' '));
 root.querySelector('#radarLinePaths').innerHTML=paths.map(d=>`<path d="${d}" class="radar-main-stroke"/>`).join('');
 root.querySelector('#radarAreaPaths').innerHTML=seg.filter(run=>run.length>1).map(run=>{const d=`M${run[0].x.toFixed(2)} ${RADAR_B} `+run.map(p=>`L${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')+` L${run.at(-1).x.toFixed(2)} ${RADAR_B} Z`;return `<path class="radar-main-area" d="${d}"/>`;}).join('');
 // A failed echo is an unconfirmed probe, not proof of packet loss or an offline host.
 const sampleBand=Math.max(3,Math.min(15,plotW*state.radarInterval/(state.radarWindowSec*1000)*.65));
 root.querySelector('#radarLossZones').innerHTML=coords.filter(p=>p.y===null).map(p=>`<rect x="${(p.x-sampleBand/2).toFixed(2)}" y="${RADAR_T}" width="${sampleBand.toFixed(2)}" height="${plotH}" class="radar-loss-band"/><line x1="${p.x}" x2="${p.x}" y1="${RADAR_B-5}" y2="${RADAR_B}" class="radar-loss-base"/>`).join('');
 const successful=coords.filter(p=>p.y!==null), rtts=successful.map(p=>p.icmpMs);
 const mean=rtts.length?rtts.reduce((a,b)=>a+b,0)/rtts.length:0;
 let markers='';
 coords.forEach((p,i)=>{
   if(p.y===null)return;
   if(i&&coords[i-1].y===null)markers+=`<circle cx="${p.x}" cy="${p.y}" r="4.2" class="radar-recovered"/>`;
   if(p.icmpMs>Math.max(15,mean*2.2))markers+=`<circle cx="${p.x}" cy="${p.y}" r="3.5" class="radar-spike"/>`;
 });
 root.querySelector('#radarMarkers').innerHTML=markers;
 root.querySelector('#radarExtrema').textContent=rtts.length?`lowest ${Math.min(...rtts).toFixed(1)} ms · Maximum ${Math.max(...rtts).toFixed(1)} ms`:"No valid RTT yet";
 root.querySelector('#radarChartPeriod').textContent=points.length?`${state.radarWindowSec/60} Minute window · ${points.length} actual measurements · The latest on the right`:"Waiting for the first batch of Windows samples";
 root.querySelector('#radarChartScale').textContent=`Vertical axis 0–${yMax} ms`;
 root.querySelector('#radarChartEmpty').hidden=points.length>0;
 const live=root.querySelector('#radarLiveDot'), last=coords.at(-1);
 live.hidden=!(last&&last.y!==null);
 if(!live.hidden){live.style.left=(last.x/RADAR_W*100)+'%';live.style.top=(last.y/RADAR_H*100)+'%';}
 // Slide by actual elapsed timestamp interval; never simulate a new sample or smooth RTT magnitudes.
 const previous=radarLastPaintedTime;
 const current=Number.isFinite(end)?end:NaN;
 const track=root.querySelector('#radarChartTrack');
 if(track){
   track.getAnimations().forEach(a=>a.cancel());
   const dx=Number.isFinite(previous)&&Number.isFinite(current)?(current-previous)/(state.radarWindowSec*1000)*plotW:0;
   if(animate&&dx>0&&dx<plotW*.22&&typeof track.animate==='function'&&
      !document.hidden&&window.matchMedia('(prefers-reduced-motion: reduce)').matches===false&&
      !document.body.classList.contains('radar-low-power')){
     track.animate([{transform:`translateX(${dx}px)`},{transform:'translateX(0)'}],{duration:320,easing:'cubic-bezier(.22,1,.36,1)'});
   }
 }
 // Glass feedback is triggered only by a NEW native probe. The optics never create sample values.
 const stage=root.querySelector('#radarChartStage');
 if(stage){
  const currentProbe=history.at(-1);
  stage.dataset.probe=currentProbe?.icmp==='ok'?'reply':currentProbe?'unconfirmed':'waiting';
  stage.dataset.streaming=state.radarRunning?'true':'false';
  if(animate&&Number.isFinite(current)&&current>previous&&state.glassMode==='full'&&
      !document.hidden&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   const signal=stage.querySelector('#radarGlassSignal');
   if(signal&&typeof signal.animate==='function'){
    signal.getAnimations().forEach(a=>a.cancel());
    signal.animate([{opacity:currentProbe?.icmp==='ok'?.5:.24,transform:'translateX(-3%) scale(.985)'},
                    {opacity:0,transform:'translateX(5%) scale(1.02)'}],{duration:850,easing:'ease-out'});
   }
  }
 }
 radarLastPaintedTime=current;
 // Pulse only upon a fresh successful native sample. No idle animation that implies fresh results.
 if(animate&&!live.hidden&&!document.hidden&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   const pulse=live.querySelector('.radar-live-pulse');pulse.classList.remove('radar-pulse-on');void pulse.offsetWidth;pulse.classList.add('radar-pulse-on');
 }
 const tooltip=root.querySelector('#radarTooltip');if(tooltip)tooltip.hidden=true;
 const pointer=root.querySelector('#radarPointer');if(pointer)pointer.setAttribute('visibility','hidden');
}
function radarPatchLiveView(panel){
 const replacement=document.createElement('template');replacement.innerHTML=radarLiveView();
 const stale=panel.querySelector('#radarChartSvg');
 // If a target change or navigation replaced the view, create it once. Otherwise preserve the SVG DOM.
 if(!stale){panel.innerHTML=replacement.innerHTML;radarChartIdentity='';radarDrawChart(false);return;}
 for(const selector of ['.radar-panel-title','.radar-stat-grid','.radar-protocol-row','.radar-side-panel']){
   const old=panel.querySelector(selector), fresh=replacement.content.querySelector(selector);
   if(old&&fresh)old.replaceWith(fresh);
 }
 radarDrawChart(true);
}
function radarShowTooltip(e){
 const stage=e.target.closest('#radarChartStage');if(!stage||!radarHoverPoints.length)return;
 const bounds=stage.getBoundingClientRect(),x=(e.clientX-bounds.left)/bounds.width*RADAR_W;
 if(state.glassMode==='full'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  stage.style.setProperty('--radar-light-x',((e.clientX-bounds.left)/bounds.width*100).toFixed(1)+'%');
  stage.style.setProperty('--radar-light-y',((e.clientY-bounds.top)/bounds.height*100).toFixed(1)+'%');
 }
 const closest=radarHoverPoints.reduce((prev,curr)=>Math.abs(curr.x-x)<Math.abs(prev.x-x)?curr:prev);
 if(Math.abs(x-closest.x)>Math.max(12,(RADAR_R-RADAR_L)*state.radarInterval/(state.radarWindowSec*1000)*.65)){
   radarHideTooltip();return;
 }
 const rule=root.querySelector('#radarHoverRule'),circle=root.querySelector('#radarHoverCircle');
 const group=root.querySelector('#radarPointer'),tip=root.querySelector('#radarTooltip');if(!rule||!group||!tip)return;
 rule.setAttribute('x1',closest.x);rule.setAttribute('x2',closest.x);group.setAttribute('visibility','visible');
 circle.setAttribute('visibility',closest.y===null?'hidden':'visible');
 if(closest.y!==null){circle.setAttribute('cx',closest.x);circle.setAttribute('cy',closest.y);}
 tip.querySelector('.radar-tt-time').textContent=new Date(radarTimeMs(closest)).toLocaleTimeString("en-US",{hour12:false});
 tip.querySelector('.radar-tt-value').textContent=closest.y===null?(closest.icmp==='timeout'?"ICMP timeout":"ICMP Unacknowledged"):closest.icmpMs.toFixed(1)+' ms';
 const target=radarCurrentTarget();tip.querySelector('.radar-tt-tcp').textContent=target?.port?(closest.tcp==='ok'?`TCP ${target.port} Reachable`:closest.tcp==='timeout'?`TCP ${target.port} Timeout`:closest.tcp==='refused'?`TCP ${target.port} Rejected`:`TCP ${target.port} Not confirmed`):"ICMP probe only";
 tip.hidden=false;
 tip.style.left=Math.min(bounds.width-158,Math.max(8,closest.x/RADAR_W*bounds.width-70))+'px';
}
function radarHideTooltip(){const tip=root.querySelector('#radarTooltip'),g=root.querySelector('#radarPointer');if(tip)tip.hidden=true;if(g)g.setAttribute('visibility','hidden');}
function radarStatus(target,history){
 const last=history[history.length-1];
 if(!last)return badge("Waiting for samples");
 if(last.icmp==='ok'&&target.port>0&&last.tcp!=='ok')return badge("Host response/port not confirmed",'amber');
 if(last.icmp==='ok'||last.tcp==='ok')return badge("Response received",'green');
 return badge("Connectivity not confirmed",'amber');
}
function radarLiveView(){
 const t=state.radarTargets.find(x=>x.id===state.radarSelected)||state.radarTargets[0];
 const hist=t?(state.radarSamples[t.id]||[]):[];
 const latest=hist[hist.length-1];const metrics=radarMetrics(hist);
 const traffic=state.radarLast?.traffic;
 return `<div class="radar-monitor-grid">
  <section class="radar-detail-panel">
   <div class="radar-panel-title"><div><strong>${t?esc(t.name):"Select a monitoring target"}</strong><small>${t?esc(t.ip)+(t.port?':'+t.port:'')+' · '+(t.port?'ICMP + TCP':"ICMP only"):"Up to 8 computers can be added, or only the current network adapter traffic can be monitored."}</small></div>${t?radarStatus(t,hist):badge("Not selected")}</div>
   <div class="radar-stat-grid">
    <div><strong>${metrics.average===null?'—':metrics.average.toFixed(1)+' ms'}</strong><small>Average ICMP RTT</small></div>
    <div><strong>${metrics.loss===null?'—':metrics.loss.toFixed(0)+'%'}</strong><small>ICMP no-response rate</small></div>
    <div><strong>${metrics.jitter===null?'—':metrics.jitter.toFixed(1)+' ms'}</strong><small>RTT variation (mean difference)</small></div>
   </div>
   ${radarCurve()}
   <div class="radar-protocol-row"><span>ICMP：${latest?esc(latest.icmp==='ok'?"Response received":latest.icmp==='timeout'?"Timeout/may be filtered":"Unable to confirm"):"Not detected yet"}</span><span>${t?.port?`TCP ${t.port}：${latest?esc(latest.tcp==='ok'?"Connectable ("+latest.tcpMs+'ms）':latest.tcp==='refused'?"Connection refused":latest.tcp==='timeout'?"Connection timeout":"Unable to confirm"):"Not detected yet"}`:"TCP port not set"}</span></div>
   <p class="radar-footnote">No ICMP reply does not mean that the device is offline; TCP connectability does not mean that the game can be joined normally. The chart is actual sampling on this machine and does not represent in-game ping.</p>
  </section>
  <section class="radar-side-panel">
   <h3>${icon('activity',17)} Local network adapter real-time traffic</h3><small>${esc(traffic?.adapterName||selectedLanInterface()?.name||"Waiting for network adapter collection")}</small>
   <div class="radar-traffic-row"><div><span>Download/Receive</span><strong>${radarFormatRate(traffic?.receiveBps)}</strong></div><div><span>Upload/Send</span><strong>${radarFormatRate(traffic?.sendBps)}</strong></div></div>
   <div class="radar-traffic-visual"><div class="radar-traffic-down" style="width:${Math.min(100,Math.max(0,(traffic?.receiveBps||0)/1250000*100)).toFixed(1)}%"></div></div>
   <div class="radar-traffic-visual"><div class="radar-traffic-up" style="width:${Math.min(100,Math.max(0,(traffic?.sendBps||0)/1250000*100)).toFixed(1)}%"></div></div>
   <p class="radar-footnote">Rates are derived from the cumulative byte differential of the selected network adapter; not the traffic of a single game or program. The first sample shows —.</p>
   <h3>Recent state changes</h3>
   <div class="radar-events">${state.radarEvents.slice(0,5).map(e=>`<div><span>${esc(e.id.split('@')[0])} · ${esc(new Date(e.time).toLocaleTimeString("en-US"))}</span><small>${esc(e.message)}</small></div>`).join('')||"<div class=\"radar-event-empty\">There is no recorded status change yet.</div>"}</div>
  </section>
 </div>`;
}
function radarPage(){
 const nic=selectedLanInterface();const running=state.radarRunning;
 return `<div class="radar-workbench">
  <div class="game-heading"><div><span class="core-eyebrow">NETWORK / HEALTH MONITOR</span><h1>${icon('activity',28)} Live Network Radar</h1><p>Observe the traffic of ordinary LAN devices, game ports and local network adapters at the same time. All data comes from actual Windows probes.</p></div>${badge("Read only · Do not modify network configuration")}</div>
  <div class="radar-topbar"><div><small>Selected adapter</small><strong>${esc(nic?.name||"Failed to obtain active network adapter")} · ${esc(nic?.ip||'—')}</strong></div><label>Sampling interval <select id="radarInterval" ${running?'disabled':''}><option value="1000" ${state.radarInterval===1000?'selected':''}>1 second</option><option value="2000" ${state.radarInterval===2000?'selected':''}>2 seconds</option><option value="5000" ${state.radarInterval===5000?'selected':''}>5 seconds</option></select></label>${running?elButton(icon('x',16)+" Stop monitoring",'radar-stop','btn ghost'):elButton(icon('activity',16)+" Start live monitoring",'radar-start','btn primary',live()&&nic?'':'disabled')}</div>
  ${!live()?`<div class="callout amber">${icon('info',16)} A real Windows machine connection is required before sampling; this page does not generate simulation delays or traffic.</div>`:''}
  ${state.radarError?`<div class="callout amber">${esc(state.radarError)}</div>`:''}
  <div class="radar-layout"><section class="radar-targets panel"><div class="panel-title"><h2>Monitoring targets</h2>${badge(`${state.radarTargets.length}/8`)}</div>
  <div class="radar-add-controls"><input id="radarName" placeholder="Label, e.g. Friend’s PC" maxlength="60" aria-label="Target label"><input id="radarIp" placeholder="IPv4, such as 192.168.10.20" inputmode="decimal" aria-label="Target IP"><input id="radarPort" type="number" min="0" max="65535" placeholder="Port (optional)" aria-label="Optional TCP port"><div class="radar-presets" aria-label="Port presets">${[ ['ICMP',0],['MC 25565',25565],['SMB 445',445]].map(([name,port])=>elButton(name,'radar-port-preset','btn tiny ghost',`data-port="${port}"`)).join('')}</div><span class="radar-port-hint">Leave blank = Ping only; TCP port detection and ICMP independent display</span>${elButton(icon('plus',16)+" Add target",'radar-add','btn ghost',running?'disabled':'')}</div>
  ${state.radarTargets.map(t=>`<div class="radar-target-row ${state.radarSelected===t.id?'selected':''}" data-action="radar-select" data-id="${attr(t.id)}"><div class="radar-target-symbol">${icon(t.port?'gamepad':'monitor',20)}</div><div class="radar-target-info"><strong>${esc(t.name)}</strong><small>${esc(t.ip)}${t.port?':'+t.port+' · TCP':' · ICMP'}</small><span class="radar-mini-slot">${radarSparkline(state.radarSamples[t.id]||[])}</span></div>${radarStatus(t,state.radarSamples[t.id]||[])}${elButton(icon('x',15),'radar-remove','iconbtn',`data-id="${attr(t.id)}" ${running?'disabled':''}`)}</div>`).join('')||"<div class=\"radar-empty-target\">No target yet. Add an IP or select from the scan results below.</div>"}
  ${state.lanResults?.devices?.length?`<details class="radar-import"><summary>Add a discovered device</summary>${state.lanResults.devices.slice(0,30).map(d=>`<div><code>${esc(d.ip)}</code>${elButton("Monitor",'radar-import-lan','btn tiny',`data-ip="${attr(d.ip)}" ${running?'disabled':''}`)}</div>`).join('')}</details>`:''}
  </section><div id="radarLiveView">${radarLiveView()}</div></div>
  <section class="radar-listeners panel"><div class="panel-title"><div><h2>${icon('monitor',18)} Local servers & listening ports</h2><p class="radar-footnote">Display according to the PID/process name corresponding to the Windows listening port, and ordinary processes such as javaw are not directly recognized as Minecraft.</p></div>${elButton(icon('rotate',15)+" Read listening ports",'radar-listeners','btn ghost',live()&&!desktopBusy?'':'disabled')}</div>
  ${state.radarPortsError?`<div class="callout amber">${esc(state.radarPortsError)}</div>`:''}
  ${state.radarPorts?(!state.radarPorts.readable?"<div class=\"callout amber\">Windows failed to read the listening process; unable to determine whether there is a server startup process.</div>":`<div class="radar-listener-list"><div class="radar-listener-head"><span>Listening address / port</span><span>Process (PID)</span><span>Category</span></div>${state.radarPorts.listeners.map(x=>`<div class="radar-listener-row"><code>${esc(x.ip)}:${esc(x.port)}</code><span>${esc(x.process||"Process name unavailable")} (${esc(x.pid)})</span><span>${esc(x.category==='windows-system'?"Windows system":x.category==='game-candidate'?"Suspected game-specific process":"Application/Unconfirmed")}</span></div>`).join('')||"<div class=\"radar-event-empty\">TCP listening socket not reported by Windows</div>"}</div>${state.radarPorts.truncated?"<p class=\"radar-footnote\">There are more than 250 results, only the first 250 are displayed.</p>":''}`):"<div class=\"radar-empty-target\">Read local TCP listening ports and their owning processes on demand. The firewall will not be modified and new ports will not be opened.</div>"}
  </section>
  <p class="game-disclaimer">By default, the network radar only monitors the targets you explicitly add (up to 8), and stops sending packets after stopping; it does not automatically scan the public network. TCP only establishes short connections and does not log in to the game server. Dual-machine collaborative throughput testing requires the active consent of the remote user, and the current version does not provide remote testing services. Monitoring data is only saved in the memory of this program.</p>
 </div>`;
}
function gamePage(){
 const nic=selectedLanInterface(),isWin=live();
 const results=state.gameResults?.games||[];
 const list=results.filter(g=>state.gameTab==='all'||state.gameTab==='minecraft'&&g.game==='Minecraft'||state.gameTab==='other'&&g.game!=='Minecraft');
 const stale=state.gameResults&&state.gameResults.localIp!==nic?.ip;
 const gameEnabled=isWin&&!desktopBusy&&!state.gameBusy&&!!nic;
 return `<div class="game-workbench">
  <div class="game-heading"><div><span class="core-eyebrow">LOCAL MULTIPLAYER / DISCOVERY</span><h1>${icon('gamepad',28)} Multiplayer</h1><p>Discover nearby LAN worlds, check the verification results, and copy the server address with one click.</p></div>${badge("Local network · Read-only discovery",'neutral')}</div>
  <div class="game-feature-grid">
   <button class="game-feature ${state.gameTab==='all'?'selected':''}" data-action="game-tab-all">${icon('search',24)}<strong>Discover games</strong><span>Find nearby multiplayer worlds</span></button>
   <button class="game-feature ${state.gameTab==='minecraft'?'selected':''}" data-action="game-tab-minecraft">${icon('gamepad',24)}<strong>Minecraft</strong><span>Java / Bedrock Edition</span></button>
   <button class="game-feature ${state.gameTab==='other'?'selected':''}" data-action="game-tab-other">${icon('settings',24)}<strong>Other games</strong><span>Common ports and custom protocols</span></button>
  </div>
  <div class="game-scan-console"><div class="game-scan-source"><small>Network adapter</small><strong>${esc(nic?.name||"Windows network adapter not read yet")} · ${esc(nic?.ip||'—')}</strong><span>Automatic discovery subnet:${esc(lanSubnet(nic?.ip||''))}(network adapter prefix /${esc(nic?.prefix??'?')}; Please verify manually for other subnets)</span></div>
  <details class="game-range-advanced"><summary>Scan range: current /24 subnet (default .1–.254) · Customized</summary><div class="game-range-inline"><label>Host number from <input id="gameStartHost" type="number" min="1" max="254" value="${state.gameStartHost}" ${state.gameBusy?'disabled':''}></label><label>to <input id="gameEndHost" type="number" min="1" max="254" value="${state.gameEndHost}" ${state.gameBusy?'disabled':''}></label></div></details>
  ${state.gameTab==='other'||state.gameTab==='all'?`<label class="game-extra-port">Optional TCP port <input id="gameCustomPort" type="number" min="0" max="65535" value="${state.gameCustomPort||''}" placeholder="For example 27015"></label>`:''}
  <div>${state.gameBusy?elButton(icon('x',16)+" Cancel scan",'game-cancel','btn ghost'):elButton(icon('search',17)+" Start discovery",'game-scan','btn primary',gameEnabled?'':'disabled')}</div></div>
  ${!isWin?`<div class="callout amber">${icon('info',16)} No live Windows connection is available. Reconnect in the desktop app to discover real LAN servers.</div>`:''}
  ${state.gameError?`<div class="callout amber">${icon('alert',16)} ${esc(state.gameError)}</div>`:''}
  ${state.gameNotice?`<div class="game-notice" role="status">${icon('info',16)} ${esc(state.gameNotice)}</div>`:''}
  ${state.gameTab==='minecraft'?`<section class="game-explainer"><div class="game-explainer-heading">${icon('gamepad',22)} Minecraft Zone ${badge("Java + Bedrock Edition",'blue')}</div><p>Automatically attempts Java TCP 25565 status queries, listens to Java LAN broadcasts to discover random ports, and detects Bedrock Edition via RakNet UDP 19132. When multicast or firewall is restricted, you may need to enter the IP and port displayed by the other party for manual detection.</p></section>`:''}
  <section class="game-results"><div class="game-section-heading"><h2>${state.gameTab==='minecraft'?"Minecraft · LAN worlds":state.gameTab==='other'?"Other games · Reachable endpoints":"Nearby games & multiplayer endpoints"}</h2><span>${stale?"The result has expired after switching the network adapter.":state.gameResults?`Last scan ${esc(state.gameResults.scannedAt||'')}`:"No scan results yet"}</span></div>
   ${stale?"<div class=\"game-empty\">The scanning network adapter has been changed, please rediscover the game.</div>":list.length?`<div class="game-results-grid">${list.map(gameCard).join('')}</div>`:`<div class="game-empty">${icon('search',28)}<strong>No multiplayer worlds found yet</strong><p>${state.gameResults?"There is no corresponding response endpoint in the current scanning range; it may also be that multicast is restricted, the port is modified, or the firewall blocks it.":"Click \"Start Discovery\" or enter a known friend's IP and port below."}</p>${gameEnabled?elButton(icon('search',16)+" Start discovery",'game-scan-empty','btn primary'):''}</div>`}
   ${(state.gameResults?.warnings||[]).map(w=>`<p class="game-warning">${icon('alert',15)} ${esc(w)}</p>`).join('')}
  </section>
  <section class="game-manual"><div class="game-section-heading"><h2>${icon('settings',18)} Test a known server</h2><span>Servers in other private subnets can be specified</span></div><div class="game-manual-controls">
   <label>Target IPv4 <input id="gameTargetIp" type="text" inputmode="decimal" placeholder="For example 192.168.10.20" value="${attr(state.gameTargetIp)}"></label>
   <label>port <input id="gameTargetPort" type="number" min="1" max="65535" value="${state.gameTargetPort}"></label>
   <label>Protocol <select id="gameProtocol"><option value="java" ${state.gameProtocol==='java'?'selected':''}>Minecraft Java</option><option value="bedrock" ${state.gameProtocol==='bedrock'?'selected':''}>Minecraft Bedrock Edition</option><option value="tcp" ${state.gameProtocol==='tcp'?'selected':''}>Other games TCP</option></select></label>
   ${elButton("Verify address",'game-check','btn ghost',gameEnabled?'':'disabled')}
   </div>${state.gameManual?.endpoint?`<div class="game-manual-result">${gameCard(state.gameManual.endpoint)}</div>`:state.gameManual?`<div class="game-warning">${esc(state.gameManual.note||"No service response received")}</div>`:''}
  </section>
  <p class="game-disclaimer">Automatic scanning only targets the private /24 subnet of the selected network adapter; manual detection supports other routable private IPv4 addresses; no authentication is performed, no firewall modifications are performed, and no commitment is made to discover all games. Port connectable ≠ Game protocol verified; UDP no reply ≠ Game not running. Please only scan networks that you are authorized to use.</p>
 </div>`;
}
function content(){
 if(desktopDisconnected()&&!['settings','games','radar'].includes(state.page))return desktopConnectionPage();
 if(!desktopAvailable()&&!real()&&!['settings','games','radar'].includes(state.page))return coreBrowserGuide();
 switch(state.page){case'shares':return sharesPage();case'users':return usersPage();case'lan':return lanPage();case'games':return gamePage();case'radar':return radarPage();case'permissions':return permissionsAnalysisPage();case'connections':return connectionsPage();case'settings':return settingsPage();default:return sharesPage();}
}
function statusPopover(){
 const connected=live();
 const text=desktopDisconnected()?state.desktopConnection==='failed'?"Connection failed":"Connecting":connected?"Windows · Connected":real()?"Read-only snapshot":"Disconnected";
 return `<details class="system-status"><summary>${badge(text,connected?'green':'neutral')}</summary><div class="system-status-detail"><strong>${esc(text)}</strong><span>Computer:${esc(state.snapshot?.computerName||"Not read")}</span><span>Collection time:${esc(state.snapshot?.capturedAt||"Not read yet")}</span><span>Actual account and sharing data comes from Windows snapshots</span></div></details>`;
}
function render(){
 document.body.classList.toggle('light',state.theme==='light');
 document.body.dataset.glass=state.glassMode;
 const current=NAV.find(x=>x[0]===state.page)?.[2]||"File Sharing";
 document.title=`SwitchLAN Studio Core · ${current}`;
 root.innerHTML=`<div class="core-ambient" aria-hidden="true"><div class="ambient-orb orb-a"></div><div class="ambient-orb orb-b"></div><div class="ambient-orb orb-c"></div></div><div class="shell core-shell"><aside class="sidebar liquid-surface ${state.sidebarOpen?'open':''}"><div class="brand"><div class="brandlogo liquid-prism">${icon('folder-open',25)}</div><div><b>SwitchLAN</b><small>STUDIO <span>CORE 1.4.5</span></small></div>${elButton(icon('x'),'close-sidebar','mobile-only iconbtn')}</div><div class="navcaption">Core management area <span class="core-nav-hint">/ CORE</span></div><nav class="nav">${NAV.map(([id,ic,t])=>`<button class="nav-link liquid-button ${state.page===id?'selected':''}" data-page="${id}">${icon(ic,19)}<span>${t}</span>${id==='lan'&&state.lanScanning?"<span class=\"lan-nav-spinner\" aria-label=\"Scanning\"></span>":id==='lan'&&state.lanResults?`<span class="lan-nav-count">${state.lanResults.devices?.length||0}</span>`:''}</button>`).join('')}</nav><div class="sidebar-footer" role="button" tabindex="0" data-action="go-settings" title="Open diagnostics and safety status"><div class="foot-icon">${icon('lock',18)}</div><div><strong>Live Windows objects</strong><small>${live()?"Windows is connected, managed by permissions":desktopAvailable()?"Wait for Windows status":"Requires Windows desktop program"}</small></div></div></aside><div class="main"><header class="topbar liquid-surface">${elButton(icon('menu'),'toggle-sidebar','mobile-only iconbtn')}<div class="breadcrumbs">SwitchLAN Core <span>/</span> <b>${esc(current)}</b></div><div class="top-actions">${elButton('<span class="glass-dot"></span> GLASS','glass-toggle','glass-toggle',`title="Switching liquid glass, low performance devices can be turned off" aria-pressed="${state.glassMode!=='off'}"`)}${statusPopover()}${live()?elButton(icon('rotate',16)+" <span class=\"hide-small\">Refresh</span>",'admin-refresh','btn tiny',desktopBusy?'disabled':''):''}${elButton(icon(state.theme==='dark'?'sun':'moon',18),'theme','iconbtn')}</div></header><main class="content">${state.page==='settings'||desktopDisconnected()||state.lastError||state.lastCleanupInfo?notice():''}${content()}<footer class="bottom-info"><span>SwitchLAN Studio · Core 1.4.5 Beta</span><span>Windows LAN · File sharing & multiplayer</span></footer></main></div></div>`;
 if(state.page==='radar')radarDrawChart(false);
}

function showForm(which,data={}){
 if(ro()){toast("Data cannot be modified in read-only snapshot mode, please return to the demo");return;}
 if(which==='user')modal("Create a new ordinary shared account",`<label class="fieldlabel">Account name</label><input name="name" required minlength="3" maxlength="20" placeholder="For example lan_zhangsan"/><div class="fieldhint">3–20 letters, numbers, underscores, dots, or hyphens; begins with a letter.</div><label class="fieldlabel">Simulate password (only test strength, not retained)</label><input name="password" type="password" minlength="12" required autocomplete="new-password" placeholder="At least 12 characters"/><div class="callout">${icon('info',15)}This interface does not create a real Windows account, and the password will not be written to data and logs.</div>`,"Preview creation");
 if(which==='share')modal("Create a new shared folder",`<label class="fieldlabel">Share name</label><input name="name" required placeholder="e.g. Courses"/><label class="fieldlabel">Windows folder path</label><input name="path" required placeholder="E:\\LANShare\\Courses"/><div class="fieldhint">The official version will provide the system’s native folder selector; the path is used for demonstration at the current stage.</div><label class="fieldlabel">Which dedicated account is granted?</label><select name="sid">${state.users.filter(u=>u.managed).map(u=>`<option value="${attr(u.sid)}">${esc(u.name)}</option>`).join('')}</select><label class="fieldlabel">Permission template</label><select name="role"><option value="read">Read-only (recommended)</option><option value="change">Modify (includes deleting files)</option></select>`,"Preview sharing");
 if(which==='peer')modal("Add trusted device",`<label class="fieldlabel">Device label</label><input name="name" required maxlength="40" placeholder="e.g. Friend’s PC"/><label class="fieldlabel">IPv4 address or CIDR subnet</label><input name="ip" required placeholder="192.0.2.23"/><div class="callout amber">${icon('alert',15)}Allowing an entire subnet greater exposure than allowing just a single device. IP addresses are also not a substitute for SMB authentication.</div>`,"Preview added");
 if(which==='permission'){
  const s=state.shares.find(x=>x.id===data.share),u=getUser(data.sid);if(!s||!u)return;
  const p=s.permissions.find(x=>x.sid===u.sid)||{smb:'none',ntfs:'none'};
  modal(`Authorization:${u.name} → ${s.name}`,`<div class="callout">${icon('info',16)}Share permissions work with NTFS permissions to restrict access through this share. The permissions matrix does not account for groups and inheritance.</div><label class="fieldlabel">SMB share permissions</label><select name="smb">${P.ROLES.filter(x=>x!=='full').map(x=>`<option value="${x}" ${p.smb===x?'selected':''}>${P.roleText[x]}</option>`).join('')}</select><label class="fieldlabel">NTFS permissions</label><select name="ntfs">${P.ROLES.filter(x=>x!=='full').map(x=>`<option value="${x}" ${p.ntfs===x?'selected':''}>${P.roleText[x]}</option>`).join('')}</select><input type="hidden" name="share" value="${attr(s.id)}"/><input type="hidden" name="sid" value="${attr(u.sid)}"/>`,"Preview authorization");
 }
}
function showAdminUserForm(){
 modal("Create local user",`<div class="form-target-banner">${icon('users',22)}<div><strong>Create a standard Windows account</strong><small>Target: Current computer · Local account</small></div></div><div class="form-step-title">① Account identity</div><label class="fieldlabel">Account name</label><input name="adminName" required minlength="3" maxlength="20" placeholder="For example lan_zhangsan"/><div class="fieldhint">3–20 letters, numbers, underscores, dots, or hyphens; begins with a letter.</div>
 <div class="form-step-title">② Login password</div><label class="fieldlabel">Password option</label><select name="passwordMode" id="createPasswordMode"><option value="custom">Enter a password</option><option value="generate">Generate a strong password (recommended)</option></select>
 <div id="createPasswordCustomBox"><label class="fieldlabel">New password</label><input type="password" name="password" id="createPasswordInput" autocomplete="new-password" minlength="1" maxlength="128" required/><label class="fieldlabel">Confirm password</label><input type="password" name="confirmPassword" id="createPasswordConfirm" autocomplete="new-password" minlength="1" maxlength="128" required/><p class="fieldhint">Allow input such as Abc12345; the final success is determined by the local password policy of Windows. Windows password policy will not be modified.</p></div>
 <div class="callout">${icon('info',15)}This creates a standard local Windows account without administrator privileges. SwitchLAN does not store its password in the managed-account registry. Use a strong, unique password.</div>`,"Create account");
}
function showAdminResetPassword(name){
 modal("Reset local user password",`<input type="hidden" name="adminName" value="${attr(name)}"/><div class="callout amber">${icon('alert',18)}will be <strong>${esc(name)}</strong> Generate a new password; the original password will become invalid immediately and the connected session may remain.</div><label class="fieldlabel">Enter account name to confirm</label><input name="confirmName" required autocomplete="off"/>`,"Reset password");
}
function showAdminSetUserEnabled(name,enabled){
 modal(enabled?"Enable local user":"Disable local user",`<input type="hidden" name="adminName" value="${attr(name)}"/><input type="hidden" name="enabled" value="${enabled?'true':'false'}"/><div class="callout amber">${icon('alert',18)}${enabled?"Enable":"Disable"} Windows local account <strong>${esc(name)}</strong>. Existing SMB sessions may not be disconnected immediately after being disabled.</div><label class="fieldlabel">Enter account name to confirm</label><input name="confirmName" required autocomplete="off"/>`,enabled?"Enable account":"Disable account");
}
function showAdminDeleteUser(name){
 modal("Delete local user",`<input type="hidden" name="adminName" value="${attr(name)}"/><div class="callout danger">${icon('alert',18)}Windows local accounts will be deleted <strong>${esc(name)}</strong>. User directories/files will not be deleted; connected sessions need to be checked separately.</div><label class="fieldlabel">Enter account name to confirm</label><input name="confirmName" required autocomplete="off" placeholder="${attr(name)}"/>`,"Delete account");
}
function showAdminShareForm(){
 const users=(state.snapshot?.users||[]).filter(u=>u.enabled!==false && editableLocalUser(u));
 if(!users.length)return showAdminUserForm();
 const options=users.map(u=>`<option value="${attr(u.sid)}">${esc(u.name)}${isManagedUser(u.name)?" · Managed":''}</option>`).join('');
 modal("Share setup · Create an SMB share",`<div class="wizard-steps"><span>① Prepare local account</span><span>② Select folder</span><span>③ Set permissions and create share</span></div><label class="fieldlabel">Share name</label><input name="adminShareName" required maxlength="60" placeholder="e.g. Courses"/><label class="fieldlabel">Folder to share</label><div class="inline-actions"><input id="adminSharePath" name="adminPath" required placeholder="Select or enter an existing folder" style="flex:1"/><button type="button" class="btn ghost" data-action="admin-pick-folder">Browse…</button></div><label class="fieldlabel">Account to grant access</label><select name="account">${options}</select><label class="fieldlabel">Share permissions</label><select name="right"><option value="Read">Read-only (recommended)</option><option value="Change">Modify (includes writing and deleting files)</option></select><div class="callout">${icon('info',15)}You can choose a non-built-in local account already on your computer or a SwitchLAN dedicated account. The backend will verify again that the account is not a member of the Administrators group. The new share will add corresponding NTFS permissions for the target account, please use a clean test directory.</div>`,"Create share");
}
function showEditUser(index){
 const u=state.snapshot?.users?.[index];if(!live()||!editableLocalUser(u))return toast("This account cannot be modified");
 modal("Edit local account",`<input type="hidden" name="name" value="${attr(u.name)}"/><input type="hidden" name="sid" value="${attr(u.sid)}"/><label class="fieldlabel">Username (cannot be renamed here)</label><div class="connect-path">${esc(u.name)}</div><label class="fieldlabel">Display name</label><input name="fullName" maxlength="100" value="${attr(u.fullName||'')}"/><label class="fieldlabel">Account description</label><input name="description" maxlength="240" value="${attr(isManagedUser(u.name)?"(SwitchLAN managed tags cannot be modified)":u.description||'')}" ${isManagedUser(u.name)?'disabled':''}/><div class="callout amber">${icon('alert',16)}Directly modify Windows local accounts. System built-in, current operating account and administrator group members will be rejected by the backend.</div><label class="fieldlabel">Enter username to confirm</label><input name="confirm" required autocomplete="off"/>`,"Save changes");
}
function showExistingUserStatus(index,enabled){
 const u=state.snapshot?.users?.[index];if(!live()||!editableLocalUser(u))return;
 modal("Change account status",`<input type="hidden" name="name" value="${attr(u.name)}"/><input type="hidden" name="sid" value="${attr(u.sid)}"/><input type="hidden" name="enabled" value="${enabled?'true':'false'}"/><div class="callout amber">will${enabled?"Enable":"Disable"}Live account <strong>${esc(u.name)}</strong>, may affect the account's login or existing shared connections.</div><label class="fieldlabel">Enter username to confirm</label><input name="confirm" required/>`,"Confirm");
}
function showExistingUserPassword(index){
 const u=state.snapshot?.users?.[index];if(!live()||!editableLocalUser(u))return;
 if(dlg.open)closeDialog();
 modal("Reset account password",`<div class="form-target-banner">${icon('key-round',22)}<div><strong>Account to update:${esc(u.name)}</strong><small>Target account SID:${esc(u.sid)}</small></div></div><input type="hidden" name="name" value="${attr(u.name)}"/><input type="hidden" name="sid" value="${attr(u.sid)}"/>
 <div class="callout amber">Windows does not allow viewing of the original password. The old password becomes invalid after reset, which may affect the SMB credentials saved by the other party. Current accounts, built-in accounts and administrators are protected by the backend.</div>
 <div class="form-step-title">① Set new password</div><label class="fieldlabel">Password option</label><select id="passwordMode" name="mode"><option value="custom">Enter a new password</option><option value="generate">Generate a strong password</option></select>
 <div id="passwordCustomBox"><label class="fieldlabel">New password</label><input type="password" name="newPassword" id="passwordCustomInput" minlength="1" maxlength="128" required autocomplete="new-password"/><label class="fieldlabel">Confirm new password</label><input type="password" name="confirmPassword" id="passwordCustomConfirm" minlength="1" maxlength="128" required autocomplete="new-password"/><p class="fieldhint">SwitchLAN does not impose a 12-character minimum or require special characters. Your Windows password policy may still require a more complex password.</p></div>
 <div class="form-step-title">② Check the modification target</div><label class="fieldlabel">Enter username <strong>${esc(u.name)}</strong> Confirm</label><input name="confirm" required autocomplete="off"/>`,"Update password");
}
function showDeleteExistingUser(index){
 const u=state.snapshot?.users?.[index];if(!live()||!editableLocalUser(u))return;
 if(dlg.open)closeDialog();
 modal("Delete standard Windows account",`<input type="hidden" name="name" value="${attr(u.name)}"/><input type="hidden" name="sid" value="${attr(u.sid)}"/><div class="callout danger">${icon('alert',18)}Permanently delete local Windows account <strong>${esc(u.name)}</strong>（SID: ${esc(u.sid)}), the original identity cannot be restored.<strong>Personal files, the user profile folder and NTFS ACLs will be kept.</strong> The permission records of the old SID may be retained and need to be reviewed separately later. Account deletion cannot be regarded as permission clearance.<p>Deletion is blocked while the account has direct SMB permissions or is referenced by a managed share. Do not select an account you use for everyday sign-in.</p></div><label class="delete-ack"><input type="checkbox" name="preserveNtfs" value="yes" required/> I confirm that only the account identity will be deleted. All files and NTFS permission entries will be kept.</label><label class="fieldlabel">Enter username to confirm deletion</label><input name="confirm" required autocomplete="off" placeholder="${attr(u.name)}"/>`,"Permanently delete account");
}
function showUnshareExisting(index){
 const sh=state.snapshot?.shares?.[index];if(!live()||!editableShare(sh))return;
 if(dlg.open)closeDialog();
 modal("Stop sharing (keep local files)",`<input type="hidden" name="name" value="${attr(sh.name)}"/><input type="hidden" name="expectedPath" value="${attr(sh.path)}"/><div class="callout danger">${icon('alert',18)}Remove the Windows SMB share <strong>${esc(sh.name)}</strong>, the network address will become invalid.<strong>The local folder and its files will be kept.</strong></div><div class="share-overview"><div><small>Shared folders</small><strong class="mono">${esc(sh.path)}</strong></div><div><small>Source</small>${badge(isManagedShare(sh.name)?"SwitchLAN creation":"Existing Windows share")}</div></div><div class="callout amber">Existing connections will be forcibly disconnected. Stop file transfers first to avoid losing unsaved changes. NTFS permissions on existing Windows shares stay unchanged. For SwitchLAN-managed shares, the app attempts to remove the NTFS permissions it originally added.</div><label class="fieldlabel">Enter the share name to confirm</label><input name="confirm" required autocomplete="off" placeholder="${attr(sh.name)}"/>`,"Stop sharing");
}
// The permissions editor is embedded directly in the share details dialog.
function showEditShareAccess(index,initialSid=''){
 return showInspectShare('real-'+index,initialSid);
}
function permissionEditor(share,index,initialSid=''){
 if(!live()||!editableShare(share))return '';
 const users=(state.snapshot?.users||[]).filter(u=>u.enabled!==false&&editableLocalUser(u));
 if(!users.length)return "<div class=\"callout\">There are currently no enabled local standard accounts to edit.</div>";
 const chosen=users.find(u=>u.sid===initialSid)||users[0];
 const before=currentDirectRight(share,chosen);
 const blocked=['Deny','Multiple','Unknown'].includes(before);
 return `<section class="access-editor" aria-label="Edit direct SMB permissions">
   <div class="form-target-banner"><span class="editor-icon">${icon('folder-open',19)}</span><div><strong>Target sharing:${esc(share.name)}</strong><small>${esc(share.path||'')}</small></div></div><div class="editor-title"><span class="editor-icon">${icon('key-round',17)}</span><div><strong>Only this account’s direct SMB permissions will change</strong><small>NTFS permissions and other accounts’ entries stay unchanged</small></div></div>
   <div class="form-step-title">① Select the authorized account</div><label class="fieldlabel" for="shareAccessUser">Local account</label>
   <select id="shareAccessUser" name="sid">${users.map(u=>`<option value="${attr(u.sid)}" ${u.sid===chosen.sid?'selected':''}>${esc(u.name)}</option>`).join('')}</select>
   <div class="form-step-title">② Specify sharing permissions</div><label class="fieldlabel" for="shareAccessRight">Change to</label>
   <select id="shareAccessRight" name="right"><option value="Read">Allow read access</option><option value="Change">Allow modify access (includes deleting files)</option><option value="Remove">Remove this account’s direct allow entry</option></select>
   <div class="permission-diff" id="permissionDiff" role="status" aria-live="polite"></div>
   <div class="callout amber">${icon('alert',16)}Removing a direct allow entry does not deny access. Everyone, group membership and NTFS permissions may still grant access. Those entries will not be changed.</div>
   <div class="form-step-title">③ Check and save</div><label class="fieldlabel" for="shareAccessConfirm">Enter share name <strong>${esc(share.name)}</strong> Confirm</label><input id="shareAccessConfirm" name="confirm" required autocomplete="off" placeholder="${attr(share.name)}"/>
 </section>`;
}
function refreshPermissionDiff(){
 const out=dlg.querySelector('#permissionDiff');if(!out||!pending?.shareIndex&&pending?.shareIndex!==0)return;
 const share=state.snapshot?.shares?.[pending.shareIndex];
 const u=state.snapshot?.users?.find(x=>x.sid===dlg.querySelector('#shareAccessUser')?.value);
 if(!share||!u)return;
 const before=currentDirectRight(share,u),right=dlg.querySelector('#shareAccessRight')?.value||'Read';
 const blocked=['Deny','Multiple','Unknown'].includes(before);
 const unchanged=before===(right==='Remove'?'None':right);
 out.innerHTML=`<div class="diff-side"><small>Current (from Windows snapshot)</small><strong>${esc(rightName(before))}</strong></div>${icon('arrow-right',19)}<div class="diff-side"><small>The plan is modified to</small><strong>${esc(rightName(right))}</strong></div>${blocked?"<p class=\"diff-note\">This account already has rejected, duplicate or unknown entries. To avoid overwriting, it cannot be modified directly.</p>":unchanged?"<p class=\"diff-note\">No change, please choose different permissions.</p>":"<p class=\"diff-note\">The path and existing authorization will be rechecked before saving. Windows will also be reread when completed.</p>"}`;
 const footer=dlg.querySelector('#permissionFooterDiff');if(footer)footer.textContent=rightName(before)+' → '+rightName(right);
 const submit=dlg.querySelector('button[type="submit"]');if(submit)submit.disabled=blocked||unchanged||!live();
}

function showAdminDeleteShare(name){
 modal("Delete local share",`<input type="hidden" name="adminShareName" value="${attr(name)}"/><div class="callout danger">${icon('alert',18)}SMB share portal will be removed <strong>${esc(name)}</strong> And attempts to revoke the NTFS authorization added by the software; disk files or folders will not be deleted.</div><label class="fieldlabel">Enter the share name to confirm</label><input name="confirmShareName" required autocomplete="off" placeholder="${attr(name)}"/>`,"Delete share");
}
function showEditShareDescription(index){
 const sh=state.snapshot?.shares?.[index];
 if(!live()||!editableShare(sh))return toast("This share cannot be modified currently.");
 if(isManagedShare(sh.name))return toast("The description of the managed share is used to verify ownership and cannot be modified here.");
 modal("Edit share description",`<input type="hidden" name="name" value="${attr(sh.name)}"/><input type="hidden" name="expectedPath" value="${attr(sh.path)}"/><input type="hidden" name="expectedDescription" value="${attr(sh.description||'')}"/><label class="fieldlabel">Current sharing</label><div class="connect-path">${esc(sh.name)} · ${esc(sh.path)}</div><label class="fieldlabel">New comment (0–256 characters)</label><input name="description" maxlength="256" value="${attr(sh.description||'')}"/><div class="callout">${icon('info',16)}Only change the Windows SMB share description, not the share name, folder path, file contents, or access permissions. The background will first check the path and old notes.</div><label class="fieldlabel">Enter the share name to confirm</label><input name="confirm" required autocomplete="off"/>`,"Save description");
}
function submitForm(e){e.preventDefault();if(!pending)return;const kind=pending.kind;const f=new FormData(e.target);const val=k=>String(f.get(k)||'').trim();
 if(kind==="Edit share description"){
  const name=val('name'),description=val('description'),expectedPath=val('expectedPath'),expectedDescription=val('expectedDescription');
  if(val('confirm')!==name)return toast("Inconsistent share names");
  if(description.length>256||/[\x00-\x1f]/.test(description))return toast("The comment format is incorrect");
  const current=state.snapshot?.shares?.find(sh=>sh.name===name&&sh.path===expectedPath&&sh.description===expectedDescription);
  if(!current||!editableShare(current)||isManagedShare(name))return toast("The share has changed or is protected, please refresh");
  if(description===expectedDescription)return toast("No change in remarks");
  closeDialog();if(desktopPost('admin-update-share-description',{name,description,expectedPath,expectedDescription}))toast("Requesting Windows to modify share notes…");return;
 }
 if(kind==="Delete standard Windows account"){
  const name=val('name'),sid=val('sid');if(val('confirm')!==name)return toast("Enter the username exactly as shown.");
  if(f.get('preserveNtfs')!=='yes')return toast("Please make sure to retain NTFS permissions and files");
  if(!state.snapshot?.users?.some(u=>u.name===name&&u.sid===sid&&editableLocalUser(u)))return toast("The account snapshot has changed, please refresh");
  closeDialog();if(desktopPost('admin-delete-existing-user',{name,sid,preserveNtfs:true}))toast("Account deletion request submitted; NTFS permissions remain intact…");return;
 }
 if(kind==="Stop sharing (keep local files)"){
  const name=val('name'),expectedPath=val('expectedPath');if(val('confirm')!==name)return toast("Enter the share name exactly as shown.");
  if(!state.snapshot?.shares?.some(sh=>sh.name===name&&sh.path===expectedPath&&editableShare(sh)))return toast("The shared information has changed, please refresh");
  closeDialog();if(desktopPost('admin-unshare-existing',{name,expectedPath}))toast("Requesting Windows to stop SMB sharing…");return;
 }
 if(["Edit local account","Change account status","Reset account password","Shared Authorization Editing"].includes(kind)){
  const name=val('name');if(val('confirm')!==name)return toast("Confirmed name inconsistency");
  const sid=val('sid');
  if(kind==="Edit local account"){
   const fullName=val('fullName'),description=val('description');closeDialog();
   if(desktopPost('admin-update-existing-user',{name,sid,fullName,description}))toast("Modification has been submitted, please confirm UAC…");return;
  }
  if(kind==="Change account status"){
   const enabled=val('enabled')==='true';closeDialog();
   if(desktopPost('admin-set-existing-user-enabled',{name,sid,enabled}))toast("Status modification has been submitted, please confirm UAC...");return;
  }
  if(kind==="Reset account password"){
   if(val('mode')==='custom'){
    const password=String(f.get('newPassword')||'');
    if(password.length<1||password.length>128||/[\x00-\x1f\x7f]/.test(password))return toast("Enter a valid password of 1–128 characters.");
    if(password!==String(f.get('confirmPassword')||''))return toast("The passwords do not match.");
    closeDialog();if(desktopPost('admin-set-existing-user-password',{name,sid,password}))toast("Password update has been submitted; the custom password will not be echoed in the interface");return;
   }
   closeDialog();if(desktopPost('admin-reset-existing-user-password',{name,sid}))toast("Random password reset submitted, please confirm UAC…");return;
  }
  const accountSid=val('sid');const account=(state.snapshot?.users||[]).find(u=>u.sid===accountSid);
  const share=state.snapshot?.shares?.find(sh=>sh.name===name);
  const right=val('right');if(!account||!editableLocalUser(account)||account.enabled===false||!share||!editableShare(share))return toast("Account or sharing has changed, please refresh");
  if(!Array.isArray(share.permissions))return toast("The sharing permission data has not been obtained, please refresh before editing.");
  if(!['Read','Change','Remove'].includes(right))return toast("Invalid permission option");
  const before=currentDirectRight(share,account),expected=right==='Remove'?'None':right;
  if(!['None','Read','Change','Full'].includes(before)||before===expected)return toast("The authorization cannot be directly adjusted or has no change");
  const change={name,account:account.name,sid:accountSid,right,before,path:share.path};
  closeDialog();state.shareFeedback=null;
  if(desktopPost('admin-modify-share-access',{name,account:account.name,sid:accountSid,right,expectedRight:before,expectedPath:share.path})){
   awaitedShareChange=change;toast("Requesting Windows modification; actual permissions will be reread when completed...");
  }return;
 }
 if(kind==="Reset local user password"||kind==="Enable local user"||kind==="Disable local user"){
  const name=val('adminName');if(val('confirmName')!==name)return toast("Account name confirmation is inconsistent");
  const enabled=val('enabled')==='true';closeDialog();
  const requestType=kind==="Reset local user password"?'admin-reset-user-password':'admin-set-user-enabled';
  if(desktopPost(requestType,kind==="Reset local user password"?{name}:{name,enabled}))toast("Submitted, please confirm in UAC...");
  return;
 }
 if(kind==="Create local user"){
  const name=val('adminName');
  if(!P.validAccount(name))return toast("Username does not meet naming requirements");
  const passwordMode=val('passwordMode');if(!['custom','generate'].includes(passwordMode))return toast("Please select the password setting method");
  const password=String(f.get('password')||'');
  if(passwordMode==='custom'){
   if(password.length<1||password.length>128||/[\x00-\x1f\x7f]/.test(password))return toast("Please enter a valid password of 1–128 digits");
   if(password!==String(f.get('confirmPassword')||''))return toast("Two passwords are inconsistent");
  }
  closeDialog();
  if(desktopPost('admin-create-user',passwordMode==='custom'?{name,passwordMode,password}:{name,passwordMode}))toast("Submitted, please confirm account creation in UAC...");
  return;
 }
 if(kind==="Delete local user"){
  const name=val('adminName'),confirm=val('confirmName');
  if(confirm!==name)return toast("The entered account names are inconsistent");
  closeDialog();
  if(desktopPost('admin-delete-user',{name}))toast("Submitted, please confirm deletion of account in UAC...");
  return;
 }
 if(kind==="Share setup · Create an SMB share"){
  const name=val('adminShareName'),path=val('adminPath'),accountSid=val('account'),right=val('right');
  const selectedAccount=(state.snapshot?.users||[]).find(u=>u.sid===accountSid);
  if(!name||name.length<2||name.length>60)return toast("Share name length should be 2–60 characters");
  if(!path)return toast("Please select the folder to share");
  if(!selectedAccount||selectedAccount.enabled===false||!editableLocalUser(selectedAccount))return toast("Please select a valid ordinary local account");
  if(!['Read','Change'].includes(right))return toast("Please select sharing permissions");
  closeDialog();
  if(desktopPost('admin-create-share',{name,path,account:selectedAccount.name,accountSid,right}))toast("Submitted, please confirm creation of share in UAC...");
  return;
 }
 if(kind==="Delete local share"){
  const name=val('adminShareName'),confirm=val('confirmShareName');
  if(confirm!==name)return toast("The entered share names are inconsistent.");
  closeDialog();
  if(desktopPost('admin-delete-share',{name}))toast("Submitted, please confirm deletion of share in UAC...");
  return;
 }
 if(kind==="Create a new ordinary shared account"){
  const name=val('name'),password=String(f.get('password')||'');
  if(!P.validAccount(name))return toast("Username does not meet naming requirements");
  if(state.users.some(u=>u.name.toLowerCase()===name.toLowerCase()))return toast("The username already exists");
  if(password.length<12||!/[a-zA-Z]/.test(password)||!/[0-9]/.test(password))return toast("Please use a password of at least 12 characters containing letters and numbers");
  preview("Confirm creation of demo account",[`Create a Windows local standard account:${name}`,"Do not join the Administrators group","No shared folder permissions have been granted yet","The password you just entered will not be saved."],()=>{state.users.push({sid:'DEMO-S-'+Date.now(),name,enabled:true,managed:true});log("Create a demo account",`Add special account ${name}`);render();toast("Account created in demo data");});
 } else if(kind==="Create a new shared folder"){
  const name=val('name'),path=val('path'),sid=val('sid'),role=val('role');
  if(!P.validShare(name))return toast("The share name is illegal (2–60 characters, no spaces or special reserved characters)");
  if(!P.safePath(path))return toast("The directory is unsafe or the path is invalid. Please avoid system directories, C:\\Users and root directories.");
  if(state.shares.some(s=>s.name.toLowerCase()===name.toLowerCase()))return toast("The share name already exists");
  if(!getUser(sid)||!['read','change'].includes(role))return toast("Please select the correct account and permissions");
  const u=getUser(sid);
  preview("Confirm creation of simulation share",[`Share name:${name}`,`Local path: ${path}`,`Account:${u.name}`,`SMB / NTFS：${P.roleText[role]} / ${P.roleText[role]}`,"Before executing the official version, the existence, ACL and inheritance of the directory will be verified."],()=>{state.shares.push({id:'sh'+Date.now(),name,path,managed:true,permissions:[{sid,smb:role,ntfs:role}]});log("Create a new simulation share",`${name} → ${path}`);render();toast("Impersonation share created");});
 } else if(kind==="Add trusted device"){
  const name=val('name'),ip=val('ip');if(!name)return toast("Please enter device remarks");if(!P.validPeer(ip))return toast("Invalid IPv4 or CIDR format");if(state.peers.some(p=>p.ip===ip))return toast("The address already exists in the whitelist");
  preview("Confirm to join the simulation whitelist",[`Equipment:${name}`,`Source:${ip}`,"Only affects TCP 445 whitelist simulated by this tool","Does not bypass Windows user and SMB / NTFS permissions"],()=>{state.peers.push({id:'p'+Date.now(),name,ip,enabled:true});log("Simulating whitelist changes",`New ${name} (${ip})`);render();toast("Added to impersonation whitelist");},ip.includes('/'));
 } else if(kind.startsWith("Authorization:")){
  const share=val('share'),sid=val('sid'),smb=val('smb'),ntfs=val('ntfs');const s=state.shares.find(x=>x.id===share),u=getUser(sid);
  if(!s||!u||!P.ROLES.includes(smb)||!P.ROLES.includes(ntfs))return toast("Invalid parameter");
  preview("Confirm modification of simulation permissions",[`Share:${s.name}, account:${u.name}`,`SMB：${P.roleText[smb]}`,`NTFS：${P.roleText[ntfs]}`,`Theoretical results:${P.permissionSummary(smb,ntfs)}`],()=>{s.permissions=s.permissions.filter(x=>x.sid!==sid);if(smb!=='none'||ntfs!=='none')s.permissions.push({sid,smb,ntfs});log("Impersonation permission modification",`${u.name} → ${s.name}：SMB ${P.roleText[smb]}，NTFS ${P.roleText[ntfs]}`);render();toast("Impersonation permissions have been modified");},smb==='change'||ntfs==='change');
 }
}
function ntfsSummaryPanel(s){
 if(!real())return '';
 const ntfs=s.ntfsReadable&&s.ntfs&&Array.isArray(s.ntfs.access)?s.ntfs:null;
 if(!ntfs)return `<section class="permissions-ntfs"><div class="ntfs-heading"><h3>NTFS file permissions</h3>${badge("Read failed",'amber')}</div><p class="muted small">Unable to read local folder ACL; actual access permissions cannot be determined from this.</p></section>`;
 const entries=ntfs.access.slice(0,40);
 const rows=entries.map(a=>`<div class="ntfs-row"><div><b>${esc(a.identity||"Unknown principal")}</b><small>${a.inherited?"Inheritance rules":"Explicit rules"} · ${esc(a.type||'')}</small></div><strong>${esc(a.rights||"Unknown")}</strong></div>`).join('');
 return `<section class="permissions-ntfs"><div class="ntfs-heading"><h3>NTFS file permissions</h3>${badge("Windows file system ACLs")}</div><div class="ntfs-owner">Folder owner <strong>${esc(ntfs.owner||"Unknown")}</strong></div>
 <div class="ntfs-access-guide">${icon('info',15)} The accounts and read-write levels you see in the Windows "Share to specific users" window may come from this layer of file system authorization, rather than the SMB advanced share list above. Only the underlying ACL is shown here and is not guaranteed to be identical to the wizard.</div>
 <details open><summary>File system ACL entries (${entries.length}, including inherited)</summary><div class="ntfs-list">${rows||"<p class=\"muted\">No ACL rules returned</p>"}</div></details>
 ${ntfs.truncated?"<div class=\"callout amber\">There are too many NTFS rules. Only the first 40 are shown in the list, and the final authority cannot be asserted based on this.</div>":''}
 <p class="muted tiny-text">SMB direct authorization, NTFS file permissions, group membership, and deny rules all affect effective access; final readable/writable identities are not deduced here.</p></section>`;
}
function showInspectShare(id,initialSid=''){
 const index=id.startsWith('real-')?Number(id.slice(5)):-1;
 const s=real()?state.snapshot?.shares?.[index]:state.shares.find(x=>(x.id||x.name)===id);
 if(!s)return;
 if(!real()){toast("Please view the real share in Windows desktop management mode");return;}
 const managed=isManagedShare(s.name)&&live();
 const aces=Array.isArray(s.permissions)?s.permissions:[];
 const editable=live()&&editableShareAccess(s);
 const feedback=state.shareFeedback?.name===s.name?state.shareFeedback:null;
 const notice=feedback?`<div class="permission-receipt ${feedback.verified?'verified':'unverified'}">${icon(feedback.verified?'check':'alert',18)}<div><strong>${feedback.verified?"Windows has reread and verified SMB authorization":"New authorization not yet verified"}</strong><p>${esc(feedback.account)}：${esc(rightName(feedback.before))} → ${esc(rightName(feedback.right))} · Actual:${esc(rightName(feedback.actual))}</p></div></div>`:'';
 const aceRows=aces.map(a=>`<div class="access-row"><div class="access-person"><span class="access-avatar">${icon('users',16)}</span><div><strong>${esc(a.account||"Unknown principal")}</strong><small>${esc(a.accessControlType||"Unknown")} · Direct SMB authorization</small></div></div><div class="access-controls">${badge(rightName(a.accessRight||'Unknown'),a.accessControlType==='Deny'?'amber':'blue')}</div></div>`).join('')||"<div class=\"empty\">No direct authorization entry read</div>";
 const unc=String.fromCharCode(92,92)+(state.snapshot?.computerName||"This unit")+String.fromCharCode(92)+s.name;
 const content=`<input type="hidden" name="name" value="${attr(s.name)}"/>
 <div class="dialog-head"><div class="mark">${icon('key-round',20)}</div><div class="dialog-heading"><h2>Edit sharing authorization</h2><p>Only modify the direct authorization of the selected account in the SMB share layer</p></div>${elButton(icon('x'),'dialog-close','iconbtn')}</div>
 <div class="dialog-body core-permission-dialog">${notice}
 <div class="core-dialog-target"><span class="eyebrow">Windows share being modified</span><strong>${esc(s.name)}</strong><small class="mono">${esc(unc)}</small></div>
 ${editable?permissionEditor(s,index,initialSid):"<div class=\"callout amber\">The current share is in a protected or authorized read failure state, and modifications cannot be submitted.</div>"}
 <details class="core-fold core-permission-reference" open><summary>${icon('eye',16)} Reference: Windows Current SMB and NTFS Authorization</summary><div class="core-fold-body"><h3>Advanced SMB share permissions</h3><p class="muted small">From Get-SmbShareAccess. You cannot judge what someone actually has access to based on this layer alone.</p>${aces.some(a=>String(a.account||'').toLowerCase()==='everyone')?`<div class="core-inline-note">${icon('info',15)} Windows has returned Everyone share permissions, which cannot simply be hidden; the file system NTFS will still be further restrictive.</div>`:''}<div class="access-list">${aceRows}</div>${ntfsSummaryPanel(s)}</div></details>
 </div><div class="dialog-actions">${editable?'<span class="permission-footer-diff" id="permissionFooterDiff"></span>':''}${elButton("Close",'dialog-close','btn ghost')}${editable?"<button type=\"submit\" class=\"btn primary\">Save SMB authorization changes "+icon('arrow-right',15)+'</button>':''}</div>`;
 pending=editable?{kind:"Shared Authorization Editing",shareIndex:index}:null;
 dlg.innerHTML=editable?`<form id="dialogForm" method="dialog">${content}</form>`:content;
 if(!dlg.open)dlg.showModal();
 if(editable)refreshPermissionDiff();
}

function action(act,data={}){
 if(act==='game-scan-empty')return action('game-scan');
 if(act==='lan-scan-empty')return action('lan-scan');
 // No simulated mutations from the desktop program while Windows is disconnected.
 if(desktopDisconnected()&&!act.startsWith('radar-')&&!['admin-refresh','desktop-diagnostic','desktop-open-report','copy-last-error','theme','glass-mode','toggle-sidebar','close-sidebar','game-tab-minecraft','game-tab-all','game-tab-other','game-copy','game-cancel'].includes(act)){toast("Not connected to Windows yet: Please reconnect or check diagnostics first, impersonation management is not allowed");return;}
 if(act==='copy-last-error'){if(navigator.clipboard?.writeText)navigator.clipboard.writeText(state.lastError).then(()=>toast("Error content has been copied")).catch(()=>toast("Unable to copy, please select text manually"));return;}
 if(act==='admin-copy-password'){
  const password=dlg.dataset.password||'';
  if(password&&navigator.clipboard){navigator.clipboard.writeText(password).then(()=>toast("Password copied")).catch(()=>toast("Copy failed, please select a password manually."));}
  return;
 }
 if(act==='focus-share-from-permissions'){state.focus.share=data.key||'';state.page='shares';render();return;}
 if(act==='focus-user'){state.focus.user=data.key||'';render();return;}
 if(act==='focus-share'){state.focus.share=data.key||'';render();return;}
 if(act==='copy-unc'){copyText(data.value||'');return;}
 if(act==='share-copy-guide'){
  const sh=state.snapshot?.shares?.[Number(data.index)];if(!sh)return toast("Sharing has changed, please refresh");
  const host=state.snapshot?.computerName||'';const ip=selectedLanInterface()?.ip||'';
  const unc=String.fromCharCode(92,92)+(ip||host)+String.fromCharCode(92)+sh.name;
  // Plain-text instructions only; never embed passwords, store credentials or disconnect existing mappings.
  copyText("SwitchLAN LAN shared connection instructions\nShare:"+sh.name+"\nAddress:"+unc+"\nIf prompted for credentials, enter the authorized account and password on the shared host.\nIf the host name cannot be resolved, try an IPv4 address; Everyone share authorization does not equal password-free access.");return;
 }
 if(act==='edit-share-description')return showEditShareDescription(Number(data.index));
 if(act==='inspect-user'){const u=state.snapshot?.users?.[Number(data.index)];if(u){state.focus.user=u.sid;state.page='users';render();}else userDetails(Number(data.index));return;}
 if(act==='share-help')return shareAccessHelp(data.name||'');
 if(act==='copy-share-address'){copyText(dlg.dataset.unc||'');return;}
 if(act==='create-share-next'){closeDialog();showAdminShareForm();return;}
 if(act==='go-shares'){state.page='shares';render();return;}
 if(act==='open-permission-analysis'){state.permissionShare=data.share||'';state.page='permissions';render();return;}
 if(act==='analysis-go-share'){state.focus.share=data.share||'';state.page='shares';render();return;}
 if(act==='radar-add'||act==='radar-import-lan'||act==='radar-import-game'){
  if(state.radarRunning)return toast("Please stop monitoring before modifying the target.");
  const ip=(act==='radar-add'?root.querySelector('#radarIp')?.value:data.ip||'').trim();
  const port=act==='radar-add'?Number(root.querySelector('#radarPort')?.value||0):act==='radar-import-game'?Number(data.port||0):0;
  const name=(act==='radar-add'?root.querySelector('#radarName')?.value:data.name||"LAN equipment").trim()||ip;
  const values=ip.split('.').map(Number);
  if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)||values.some(v=>v<0||v>255)||values[0]===0||values[0]>=224||values[0]===127||values[3]===255)return toast("Please enter a valid unicast IPv4 address");
  if(!Number.isInteger(port)||port<0||port>65535)return toast("TCP port should be 0–65535");
  if(state.radarTargets.length>=8)return toast("Monitor up to 8 devices simultaneously");
  if(state.radarTargets.some(t=>t.ip===ip&&t.port===port))return toast("This monitoring address and port have been added");
  const id=ip+'@'+port;
  state.radarTargets.push({id,ip,port,name:name.slice(0,60)});state.radarSelected=id;
  state.page='radar';render();radarDrawChart(false);return;
 }
 if(act==='radar-port-preset'){const input=root.querySelector('#radarPort');if(input){input.value=String(Number(data.port)||0);input.focus();}return;}
 if(act==='lan-to-radar'){
  if(state.radarRunning)return toast("Monitoring is running, please stop it first and then add the target.");
  action('radar-import-lan',{ip:data.ip,name:data.name||"LAN equipment"});return;
 }
 if(act==='lan-to-games'){
  if(!data.ip)return;state.gameTargetIp=data.ip;state.gameTargetPort=25565;state.gameProtocol='java';state.gameTab='minecraft';state.page='games';render();return;
 }
 if(act==='radar-select'){state.radarSelected=data.id;render();radarDrawChart(false);return;}
 if(act==='radar-glass'){
  const next=state.glassMode==='full'?'subtle':state.glassMode==='subtle'?'off':'full';
  state.glassMode=next;
  try{localStorage.setItem('switchlan-glass-mode',next);}catch(_){}
  render();toast(next==='full'?"Liquid Radar: Complete Refraction":next==='subtle'?"Liquid radar: lightweight glass":"Liquid Radar: Turn off optical effects");return;
 }
 if(act==='radar-window'){const sec=Number(data.seconds);if([60,120,300].includes(sec)){state.radarWindowSec=sec;root.querySelectorAll('.radar-window-btn').forEach(b=>{b.classList.toggle('active',Number(b.dataset.seconds)===sec);b.setAttribute('aria-pressed',String(Number(b.dataset.seconds)===sec));});radarDrawChart(false);}return;}
 if(act==='radar-remove'){
  if(state.radarRunning)return toast("Please stop monitoring before removing the target");
  state.radarTargets=state.radarTargets.filter(t=>t.id!==data.id);
  delete state.radarSamples[data.id];
  if(state.radarSelected===data.id)state.radarSelected=state.radarTargets[0]?.id||'';
  render();radarDrawChart(false);return;
 }
 if(act==='radar-start'){
  if(!live()||!desktopAvailable())return toast("Windows desktop connection required for monitoring");
  const nic=selectedLanInterface();if(!nic)return toast("Please select a valid network adapter");
  if(state.radarRunning)return;
  state.radarError='';state.radarSamples={};state.radarEvents=[];state.radarLast=null;state.radarScales={};
  // Independent read-only streaming command: does not occupy the admin operation lock.
  window.chrome.webview.postMessage({type:'radar-start',localIp:nic.ip,intervalMs:state.radarInterval,targets:state.radarTargets});
  return;
 }
 if(act==='radar-stop'){
  if(desktopAvailable())window.chrome.webview.postMessage({type:'radar-stop'});
  return;
 }
 if(act==='radar-listeners'){
  if(!live())return toast("Need to connect to Windows");
  if(desktopPost('radar-listeners'))toast("Reading Windows TCP listening port…");
  return;
 }
 if(act.startsWith('game-tab-')){const tab=act.slice(9);if(['minecraft','all','other'].includes(tab)){state.gameTab=tab;render();}return;}
 if(act==='game-copy'){const value=data.address||'';if(validGameAddress(value))copyText(value);return;}
 if(act==='game-cancel'){
  if(state.gameBusy&&desktopAvailable()){window.chrome.webview.postMessage({type:'game-cancel'});toast("Canceling game scan…");}
  return;
 }
 if(act==='game-scan'){
  const selected=selectedLanInterface();
  if(!live()||!selected)return toast("Please connect to Windows first and select the LAN network adapter");
  if(state.gameBusy||desktopBusy)return toast("There are still scanning tasks currently");
  if(state.gameStartHost>state.gameEndHost)return toast("Incorrect scan range");
  if(desktopPost('game-scan',{localIp:selected.ip,startHost:state.gameStartHost,endHost:state.gameEndHost,mode:state.gameTab,customPort:state.gameCustomPort})){
   state.gameBusy=true;state.gameError='';state.gameNotice="Scanning selected LANs; other computers will not be modified...";render();
  }return;
 }
 if(act==='game-check'){
  const selected=selectedLanInterface();
  if(!live()||!selected)return toast("Please connect to Windows first and select the LAN network adapter");
  if(state.gameBusy||desktopBusy)return toast("There are still scanning tasks currently");
  if(desktopPost('game-check',{localIp:selected.ip,targetIp:state.gameTargetIp.trim(),port:state.gameTargetPort,protocol:state.gameProtocol})){
   state.gameBusy=true;state.gameManual=null;state.gameError='';state.gameNotice="Verifying the specified address...";render();
  }return;
 }
 if(act==='connections-refresh'){if(!live())return toast("Need to connect to Windows first");if(desktopPost('connections-refresh'))toast("Reading SMB current session…");return;}
 if(act==='lan-view-map'||act==='lan-view-list'){state.lanView=act.slice('lan-view-'.length);render();return;}
 if(act==='lan-map-focus'){state.lanExpanded[data.ip]=true;render();const target=[...root.querySelectorAll('.lan-device-card')].find(e=>e.getAttribute('aria-label')==="Device "+data.ip);if(target)target.scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(act==='go-settings'){state.page='settings';render();return;}
 if(act==='go-lan'){state.page='lan';render();return;}
 if(act==='copy-local-ip'){const addr=state.page==='lan'?selectedLanInterface():localLanIPv4();if(addr)copyText(addr.ip);return;}
 if(act==='glass-toggle'){
  state.glassMode=state.glassMode==='off'?'full':'off';
  try{localStorage.setItem('switchlan-glass-mode',state.glassMode);}catch(_){}
  render();return;
 }
 if(act==='copy-ip'){copyText(data.value||'');return;}
 if(['lan-filter-all','lan-filter-smb','lan-filter-readable'].includes(act)){state.lanFilter=act.slice('lan-filter-'.length);render();return;}
 if(act==='lan-toggle-device'){state.lanExpanded[data.ip]=!state.lanExpanded[data.ip];render();return;}
 if(act==='lan-cancel'){
  if(state.lanScanning&&desktopAvailable()){
   window.chrome.webview.postMessage({type:'lan-cancel'});toast("Stopping scan…");
  }
  return;
 }
 if(act==='lan-rescan-one'){
  if(desktopPost('lan-rescan-one',{ip:data.ip,localIp:selectedLanInterface()?.ip||''})){
   // Access status is invalidated after probing the target again.
   state.lanSingleBusy=data.ip;toast("Redetecting "+data.ip);
  }
  return;
 }
 if(act==='lan-open-share'){
  if(desktopAvailable())window.chrome.webview.postMessage({type:'lan-open-share',ip:data.ip,share:data.share});return;
 }
 if(act==='lan-share-check'){if(desktopPost('lan-share-check',{ip:data.ip,share:data.share}))toast("Attempting to read-only enumerate remote directory...");return;}
 if(act==='go-users'){state.page='users';render();return;}
 if(act==='admin-refresh'){if(desktopAvailable()&&!live()){state.desktopConnection='connecting';state.lastError='';}if(desktopPost('admin-refresh')){render();toast("Reading local status...");}return;}
 if(act==='admin-delete-existing-user')return showDeleteExistingUser(Number(data.index));
 if(act==='admin-unshare-existing')return showUnshareExisting(Number(data.index));
 if(act==='security-scan'){if(desktopPost('security-scan'))toast("Reading Windows security configuration...");return;}
 if(act==='admin-edit-user')return showEditUser(Number(data.index));
 if(act==='admin-set-existing-user-enabled')return showExistingUserStatus(Number(data.index),data.enabled==='true');
 if(act==='admin-reset-existing-user-password')return showExistingUserPassword(Number(data.index));
 if(act==='admin-edit-share-access')return showEditShareAccess(Number(data.index),data.sid||'');
 if(act==='access-pick-user'){const input=dlg.querySelector('#shareAccessUser');if(input){input.value=data.sid||'';refreshPermissionDiff();input.focus();}return;}
 if(act==='share-refresh'){closeDialog();if(desktopPost('admin-refresh'))toast("Rereading Windows permissions…");return;}
 if(act==='lan-scan'){
  const selected=selectedLanInterface();
  if(!selected)return toast("No available private IPv4 network adapter found");
  if(!lanScanAllowed())return toast("Scanning cannot be started at this time. Please complete other operations first.");
  if(desktopPost('lan-scan',{localIp:selected.ip,startHost:state.lanStartHost,endHost:state.lanEndHost})){
   state.lanScanStartedAt=Date.now();state.lanProgress={done:0,total:state.lanEndHost-state.lanStartHost+1};
   state.lanScanning=true;state.lanFilter='all';render();toast("Detection started "+lanSubnet(selected.ip));
  }
  return;
 }
 if(act==='admin-new-user')return showAdminUserForm();
 if(act==='admin-new-share')return showAdminShareForm();
 if(act==='admin-delete-user')return showAdminDeleteUser(data.name||'');
 if(act==='admin-reset-user-password')return showAdminResetPassword(data.name||'');
 if(act==='admin-set-user-enabled')return showAdminSetUserEnabled(data.name||'',data.enabled==='true');
 if(act==='admin-delete-share')return showAdminDeleteShare(data.name||'');
 if(act==='admin-pick-folder'){if(desktopPost('admin-pick-folder'))toast("Please select a folder…");return;}
 if(act==='admin-open-folder'){
  if(desktopAvailable()&&data.path)window.chrome.webview.postMessage({type:'admin-open-folder',path:data.path});
  return;
 }
 if(act==='toggle-sidebar'){state.sidebarOpen=!state.sidebarOpen;render();return;}if(act==='close-sidebar'){state.sidebarOpen=false;render();return;}
 if(act==='glass-mode'){
  const mode=data.mode||'';
  if(!glassOptions.includes(mode))return;
  state.glassMode=mode;
  try{localStorage.setItem('switchlan-glass-mode',mode);}catch(_){/* preference is optional */}
  render();toast(mode==='off'?"Liquid glass effect turned off":mode==='full'?"Full liquid glass effect enabled":"Switched to light glass effect");return;
 }
 if(act==='theme'){state.theme=state.theme==='dark'?'light':'dark';render();return;}
 if(act==='import-snapshot'){document.getElementById('snapshotFile').click();return;}
 if(act==='desktop-diagnostic'){if(desktopPost('run-diagnostic'))toast("Running read-only diagnostics as normal user...");return;}
 if(act==='desktop-export'){if(desktopPost('export-snapshot'))toast("Reading local read-only snapshot…");return;}
 if(act==='desktop-open-report'){if(desktopAvailable())window.chrome.webview.postMessage({type:'open-diagnostics'});return;}
 if(act==='back-demo'){state.mode='demo';state.snapshot=null;state.liveMode=false;render();toast("Returned to demo mode");return;}
 if(act==='dialog-close'){closeDialog();return;}if(act==='share-permissions'){closeDialog();state.page='permissions';render();return;}
 if(act==='apply-preview'){if(!pending||pending.kind!=='preview')return;const fn=pending.commit;closeDialog();fn();return;}
 if(act==='go-security'){state.page='security';render();return;}if(act==='go-knowledge'){state.page='knowledge';render();return;}
 if(act==='new-user')return showForm('user');if(act==='new-share')return showForm('share');if(act==='new-peer')return showForm('peer');
 if(act.startsWith('permission-')){const rest=act.substring('permission-'.length);const share=rest.split('-')[0],sid=rest.substring(share.length+1);return showForm('permission',{share,sid});}
 if(act.startsWith('inspect-share-')){const id=act.substring('inspect-share-'.length);if(id.startsWith('real-')&&real()){const sh=state.snapshot?.shares?.[Number(id.slice(5))];if(sh){state.focus.share=sh.name;state.page='shares';render();return;}}return showInspectShare(id);}
 if(ro()){toast("Read-only snapshots prohibit modification of Windows");return;}
 // Core edition never exposes the old simulated write actions.
 if(!desktopAvailable()){toast("Please run the Windows desktop program before performing management operations.");return;}
 if(act==='toggle-rule'){
  if(!state.managedEnabled){preview("Simulate open LAN access",[`Allow ${state.peers.filter(p=>p.enabled).length} devices or subnets`, "Only plan to host TCP 445 inbound rules","System firewall remains open","Other broad permission rules need to be checked before actual opening"],()=>{state.managedEnabled=true;log("Impersonation enablement rules","Managed rules set to open");render();toast("Demo: Managed rules turned on");},true);}else{preview("Simulate closing LAN access",["Disable rules managed by this tool","Does not turn off the entire Windows Firewall","Existing SMB sessions are not guaranteed to be disconnected immediately","Other permission rules in the system need to be checked separately."],()=>{state.managedEnabled=false;log("Simulation shutdown rules","Managed rules set to off");render();toast("Demo: Managed rules turned off");});}return;
 }
 if(act.startsWith('toggle-user-')){const u=getUser(act.substring(12));if(!u?.managed)return;preview(`${u.enabled?"Disable":"Enable"}Demo account`,[`Account:${u.name}`,u.enabled?"This account is prohibited from initiating new identity authentication in the future.":"Allow this account to authenticate again","Does not mean immediate disconnection of established SMB sessions"],()=>{u.enabled=!u.enabled;log("Demo account status",`${u.name} → ${u.enabled?"Enable":"Disable"}`);render();toast("Demo account status updated");},u.enabled);return;}
 if(act.startsWith('delete-user-')){const u=getUser(act.substring(12));if(!u?.managed)return;const ref=state.shares.filter(s=>s.permissions.some(p=>p.sid===u.sid)).map(s=>s.name);preview("Delete demo account",[`Will be deleted ${u.name}`,`Involving authorized sharing:${ref.join('、')||"None"}`,"First revoke the user authorization in each share","No real Windows users or disk files will be deleted"],()=>{state.users=state.users.filter(x=>x.sid!==u.sid);for(const s of state.shares)s.permissions=s.permissions.filter(p=>p.sid!==u.sid);log("Simulate account deletion",u.name);render();toast("Demo account deleted");},true);return;}
 if(act.startsWith('edit-share-')){const s=state.shares.find(x=>x.id===act.substring(11));if(!s)return;showInspectShare(s.id);return;}
 if(act.startsWith('delete-share-')){const s=state.shares.find(x=>x.id===act.substring(13));if(!s||!s.managed)return;closeDialog();preview("Confirm deletion of simulated share",[`The shared entry will be removed:${s.name}`,`Local folder:${s.path}`,"No files on disk will be deleted","Legacy real NTFS ACLs need to be reviewed and handled separately in production releases"],()=>{state.shares=state.shares.filter(x=>x.id!==s.id);log("Simulate deletion of shares",s.name);render();toast("The demo sharing entrance has been deleted");},true);return;}
 if(act.startsWith('toggle-peer-')){const p=state.peers.find(x=>x.id===act.substring(12));if(!p)return;preview("Adjust simulated device status",[`${p.name} (${p.ip})`,p.enabled?"Suspend this device from whitelist":"Enable whitelist entry for this device"],()=>{p.enabled=!p.enabled;log("Simulate device status",`${p.name} → ${p.enabled?"Allow":"Pause"}`);render();toast("Device status updated");});return;}
 if(act.startsWith('delete-peer-')){const p=state.peers.find(x=>x.id===act.substring(12));if(!p)return;preview("Remove impersonation whitelist entry",[`Delete ${p.name} (${p.ip})`,"Windows users or shared files are not deleted"],()=>{state.peers=state.peers.filter(x=>x.id!==p.id);log("Simulate deletion of device",p.name);render();toast("Whitelist entry deleted");},true);return;}
 if(act.startsWith('drop-session-')){const s=state.sessions.find(x=>x.id===act.substring(13));if(!s)return;preview("Simulating a disconnected SMB session",[`Client ${s.name}`,`Account ${s.account}`,"Real operations may affect files being transferred","Disconnecting does not mean automatically clearing the other party’s saved login credentials."],()=>{state.sessions=state.sessions.filter(x=>x.id!==s.id);log("Simulate disconnected session",s.name);render();toast("Session disconnected in demo data");},true);return;}
}
root.addEventListener('keydown',e=>{
 const el=e.target.closest('[role="button"][data-action]');
 if(el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();action(el.dataset.action,el.dataset);}
});
root.addEventListener('click',e=>{const nav=e.target.closest('[data-page]');if(nav){if(!NAV.some(n=>n[0]===nav.dataset.page))return;state.page=nav.dataset.page;state.sidebarOpen=false;render();if(state.page==='connections'&&live()&&!state.connections&&!desktopBusy){action('connections-refresh');}return;}const button=e.target.closest('[data-action]');if(button){e.preventDefault();action(button.dataset.action,button.dataset);}});
dlg.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b){e.preventDefault();action(b.dataset.action,b.dataset);}});
dlg.addEventListener('submit',submitForm);
dlg.addEventListener('change',e=>{
 if(e.target.id==='shareAccessUser'||e.target.id==='shareAccessRight')refreshPermissionDiff();
 if(e.target.id==='createPasswordMode'){
  const custom=e.target.value==='custom',box=dlg.querySelector('#createPasswordCustomBox');if(box)box.hidden=!custom;
  for(const id of ['createPasswordInput','createPasswordConfirm']){const el=dlg.querySelector('#'+id);if(el){el.required=custom;el.disabled=!custom;}}
 }
 if(e.target.id==='passwordMode'){
  const custom=e.target.value==='custom',box=dlg.querySelector('#passwordCustomBox'),input=dlg.querySelector('#passwordCustomInput');
  if(box)box.hidden=!custom;
  if(input){input.disabled=!custom;input.required=custom;}
  const verify=dlg.querySelector('#passwordCustomConfirm');if(verify){verify.disabled=!custom;verify.required=custom;}
 }
});
root.addEventListener('pointermove',e=>{if(e.target.closest('#radarChartStage'))radarShowTooltip(e);});
root.addEventListener('pointerout',e=>{if(e.target.closest('#radarChartStage')&&!e.relatedTarget?.closest?.('#radarChartStage'))radarHideTooltip();});
root.addEventListener('change',e=>{
 if(e.target.id==='radarInterval'){state.radarInterval=Number(e.target.value);return;}
 if(['userScope','shareScope','adminUserScope','adminShareScope'].includes(e.target.id)){state[e.target.id]=e.target.value;render();return;}
 if(['gameStartHost','gameEndHost','gameTargetPort','gameCustomPort'].includes(e.target.id)){
  const id=e.target.id,num=e.target.value===''&&id==='gameCustomPort'?0:Number(e.target.value);
  const min=id==='gameCustomPort'?0:1,max=id.startsWith('gameTarget')||id==='gameCustomPort'?65535:254;
  if(!Number.isInteger(num)||num<min||num>max){toast("The port or host number exceeds the allowed range.");render();return;}
  state[id]=num;return;
 }
 if(e.target.id==='gameProtocol'){
  state.gameProtocol=e.target.value;
  if(e.target.value==='java')state.gameTargetPort=25565;
  if(e.target.value==='bedrock')state.gameTargetPort=19132;
  if(e.target.value==='tcp')state.gameTargetPort=7777;
  render();return;
 }
 if(e.target.id==='analysisShare'){state.permissionShare=e.target.value;render();return;}
 if(e.target.id==='analysisUser'){state.permissionUser=e.target.value;render();return;}
 if(e.target.id==='lanInterface'){
  const valid=availableLanInterfaces().find(n=>n.ip===e.target.value);
  if(valid){state.lanSelectedIp=valid.ip;state.lanFilter='all';render();}return;
 }
 if(e.target.id==='lanStartHost'||e.target.id==='lanEndHost'){
  const value=Number(e.target.value);
  if(!Number.isInteger(value)||value<1||value>254){toast("The host number can only be 1–254");e.target.value=e.target.id==='lanStartHost'?state.lanStartHost:state.lanEndHost;return;}
  if(e.target.id==='lanStartHost')state.lanStartHost=value;else state.lanEndHost=value;
  if(state.lanStartHost>state.lanEndHost){toast("The starting address cannot be greater than the ending address");
   if(e.target.id==='lanStartHost'){state.lanEndHost=value;root.querySelector('#lanEndHost').value=value;}
   else{state.lanStartHost=value;root.querySelector('#lanStartHost').value=value;}}
  return;
 }
 if(e.target.id==='peerMode'){
  const next=e.target.value;if(next==='subnet'){preview("Confirm simulation switching wide range mode",["The entire subnet may include unknown devices","Each IP in the whitelist is no longer the only permissible source.","Even if the device is allowed, account and folder authorization are still required"],()=>{state.peerMode='subnet';log("Simulation strategy switching","The entire subnet");render();toast("Demo: Mode switched");},true);}else{state.peerMode='allowlist';log("Simulation strategy switching","Allowlist");render();}return;
 }
 if(e.target.id==='icmp-toggle'){state.icmpEnabled=e.target.checked;log("Simulate ICMP switching",state.icmpEnabled?"Enable":"Disable");render();toast("Change demo settings only");}
});
root.addEventListener('input',e=>{
 if(e.target.id==='usersWorkFilter'||e.target.id==='sharesWorkFilter'){
  const id=e.target.id,kind=id==='usersWorkFilter'?'users':'shares',value=e.target.value,cursor=e.target.selectionStart;
  state.filter[kind]=value;render();const field=document.getElementById(id);
  if(field){field.focus();field.setSelectionRange(cursor,cursor);}return;
 }
 if(e.target.id==='gameTargetIp'){state.gameTargetIp=e.target.value;return;}
 if(e.target.id==='lanSearch'){
  state.lanSearch=e.target.value;
  const location=e.target.selectionStart;render();
  const field=root.querySelector('#lanSearch');if(field){field.focus();field.setSelectionRange(location,location);}
  return;
 }
 if(e.target.id==='knowledgeSearch'){
  const pos=e.target.selectionStart;state.knowledgeSearch=e.target.value;
  const grid=root.querySelector('.glossary-grid'),count=root.querySelector('.searchbox span');
  const list=K.filter(x=>(x.term+x.desc+x.example+x.tag).toLowerCase().includes(state.knowledgeSearch.toLowerCase()));
  count.textContent=list.length+" entries";
  grid.innerHTML=list.map(x=>`<article class="glossary-card"><span class="eyebrow">${esc(x.tag)}</span><h3>${esc(x.term)}</h3><p>${esc(x.desc)}</p><div class="glossary-example"><strong>For example</strong> ${esc(x.example)}</div></article>`).join('')||"<p>No related terms found.</p>";
 }
});
dlg.addEventListener('click',e=>{if(e.target===dlg)closeDialog();});
document.getElementById('snapshotFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];e.target.value='';if(!file)return;
 if(file.size>2_000_000){toast("The snapshot file exceeds 2MB, please confirm the file source.");return;}
 try{state.liveMode=false;state.managedUsers=[];state.managedShares=[];applySnapshot(validateSnapshot(JSON.parse(await file.text())));}
 catch(err){toast("Snapshot cannot be read:"+String(err.message||err).slice(0,60));}
});
initDesktopBridge();
render();
if(desktopAvailable()){
 state.desktopConnection='connecting';
 try{window.chrome.webview.postMessage({type:'ui-ready'});}catch(_){/* dashboard shows connection failure if bridge fails */}
 desktopPost('admin-refresh');
 // Windows snapshot collection has a 90-second host limit. Never spin forever.
 setTimeout(()=>{
  if(state.desktopConnection==='connecting'&&!live()){
   desktopBusy=false;
   state.desktopConnection='failed';
   state.lastError="Waited more than 110 seconds without receiving a response from the Windows backend. Please run Check-SwitchLAN.cmd to view messages and navigation logs.";
   render();
  }
 },110000);
}
})();
