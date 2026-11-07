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
const NAV=[['shares','folder-open','文件共享'],['users','users','用户管理'],['permissions','shield-check','权限分析'],['connections','activity','SMB 连接'],['lan','wifi','局域网发现'],['games','gamepad','游戏联机'],['radar','activity','网络雷达'],['settings','settings','设置与诊断']];
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
function rightName(value){return ({None:'无直接允许',Read:'只读',Change:'可修改',Full:'完全控制',Remove:'撤销直接允许',Deny:'存在拒绝规则',Multiple:'多条授权',Unknown:'未知'})[value]||value;}

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
function scopePicker(id,value,opts){return `<label class="scope-picker">显示：<select id="${id}" aria-label="筛选列表">${opts.map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`;}
function userPicker(id,value){return scopePicker(id,value,[['people','本机实际账户（不含内置）'],['managed','SwitchLAN 托管'],['all','所有账户（含内置）']]);}
function sharePicker(id,value){return scopePicker(id,value,[['ordinary','实际普通共享'],['managed','SwitchLAN 托管'],['all','所有共享（含系统）']]);}
function scopeInfo(kind,selected,total){return `<div class="footnote">${icon('info',15)} 当前显示 ${selected} / ${total} 个${kind}。这些项目来自 Windows 的真实状态快照；筛选只改变显示，不会删除或修改系统对象。</div>`;}
function userOrigin(u){return isManagedUser(u.name)&&live()?'SwitchLAN 托管':systemAccount(u)?'Windows 内置':'Windows 现有';}
function toLocalTime(v){return v?String(v):'未知 / 从未登录';}
function accountSummary(u){return `${esc(u.fullName||u.name||'')} ${u.description?`<small>${esc(u.description)}</small>`:''}`;}
function userDetails(index){
 const u=state.snapshot?.users?.[index];if(!u)return;
 const managed=isManagedUser(u.name)&&live();
 dlg.innerHTML=`<div class="dialog-head"><div class="mark">${icon('users',20)}</div><h2>Windows 本地账户详情</h2>${elButton(icon('x'),'dialog-close','iconbtn')}</div><div class="dialog-body"><div class="settings-list"><div><span>用户名</span><strong>${esc(u.name)}</strong></div><div><span>显示名称</span><strong>${esc(u.fullName||'未设置')}</strong></div><div><span>账户状态</span>${badge(u.enabled===false?'已禁用':'已启用',u.enabled===false?'neutral':'green')}</div><div><span>类型</span>${badge(managed?'SwitchLAN 托管':userOrigin(u))}</div><div><span>说明</span><strong>${esc(u.description||'无')}</strong></div><div><span>上次登录</span><strong>${esc(toLocalTime(u.lastLogon))}</strong></div><div><span>SID</span><strong class="mono detail-value">${esc(u.sid||'未知')}</strong></div></div><div class="callout">${icon('shield-check',17)}Windows 不保存可供软件查看的账户明文密码，因此无法显示旧密码。可为普通本地账户生成新密码（会立即替换旧密码）。后端会再次验证 SID 和受保护身份。</div></div><div class="dialog-actions">${live()&&editableLocalUser(u)?elButton('重置密码','admin-reset-existing-user-password','btn tiny',`data-index="${index}"`):''}${live()&&editableLocalUser(u)?elButton('删除账户','admin-delete-existing-user','btn tiny danger-text',`data-index="${index}"`):''}${elButton('关闭','dialog-close','btn primary')}</div>`;
 dlg.showModal();
}
function copyText(value){
 if(navigator.clipboard?.writeText){navigator.clipboard.writeText(value).then(()=>toast('已复制')).catch(()=>toast('复制失败，请手动复制'));return;}
 toast('当前环境无法自动复制，请手动选取内容');
}
function shareAccessHelp(name){
 const computer=String(state.snapshot?.computerName||'你的电脑名');
 const unc=String.fromCharCode(92,92)+computer+String.fromCharCode(92)+name;
 const ip=String((state.snapshot?.interfaces||[]).flatMap(i=>i.ipv4||[]).find(v=>/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(v.ip||''))?.ip||'');
 const alt=ip?String.fromCharCode(92,92)+ip+String.fromCharCode(92)+name:null;
 dlg.dataset.unc=unc;
 dlg.innerHTML=`<div class="dialog-head"><div class="mark">${icon('monitor',20)}</div><h2>从另一台电脑访问共享</h2>${elButton(icon('x'),'dialog-close','iconbtn')}</div><div class="dialog-body"><p class="muted">在另一台 Windows 电脑的文件资源管理器地址栏输入：</p><div class="connect-path mono">${esc(unc)}</div>${alt?`<p class="muted small">也可以试试局域网 IPv4：<code>${esc(alt)}</code></p>`:''}<div class="callout">${icon('info',16)}访问时用 <strong>${esc(computer)}&#92;账户名</strong> 和相应密码登录。两台设备需网络互通；Windows 防火墙需在可信网络上允许 SMB 入站（TCP 445）。程序不会自动开放防火墙或公网端口。</div><div class="callout amber">${icon('alert',16)}这里展示的是访问步骤，不表示连接已测试成功。不要在互联网开放 445 端口。</div></div><div class="dialog-actions">${elButton('复制共享地址','copy-share-address','btn primary')}${elButton('关闭','dialog-close','btn ghost')}</div>`;
 dlg.showModal();
}
// Snapshot data is untrusted; never blend it with the demo state.
function validateSnapshot(v){
  const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const str=(x,max=1024)=>typeof x==='string'&&x.length<=max;
  const arr=(x,max)=>Array.isArray(x)&&x.length<=max;
  if(!obj(v)||v.schemaVersion!==1||v.kind!=='switchlan-readonly-snapshot')throw new Error('不是支持的 SwitchLAN 快照');
  if(!arr(v.shares,2000)||!arr(v.users,5000))throw new Error('shares/users 不是有效数组');
  for(const key of ['interfaces','sessions','firewallProfiles','warnings']){
    if(v[key]!==undefined&&!arr(v[key],5000))throw new Error(key+' 应是数组');
  }
  if(v.computerName!==undefined&&!str(v.computerName,255))throw new Error('computerName 格式错误');
  if(v.capturedAt!==undefined&&!str(v.capturedAt,128))throw new Error('capturedAt 格式错误');
  if(v.activeUserSid!==undefined&&!str(v.activeUserSid,256))throw new Error('activeUserSid 格式错误');
  if(v.summary!==undefined&&!obj(v.summary))throw new Error('summary 格式错误');
  for(let index=0;index<v.users.length;index++){
    const u=v.users[index];
    if(!obj(u))throw new Error(`users[${index}] 不是账户对象`);
    if(!str(u.name,256)||!u.name.trim())throw new Error(`users[${index}].name 格式错误`);
    if(!str(u.sid??'',256)||!str(u.fullName??'',512)||!str(u.description??'',4096)||!str(u.lastLogon??'',128))throw new Error(`users[${index}] 账户文字字段格式错误`);
    if(u.enabled!==undefined&&typeof u.enabled!=='boolean')throw new Error(`users[${index}].enabled 格式错误`);
    if(u.isAdministrator!==undefined&&u.isAdministrator!==null&&typeof u.isAdministrator!=='boolean')throw new Error(`users[${index}].isAdministrator 格式错误`);
    // Legacy PowerShell 5.1 exporters could unwrap 0/1 group items into
    // null or a single string. Normalize these display-only fields, while
    // never inferring administrator privileges from group names or emptiness.
    if(u.groups==null){u.groups=[];u.groupsReadable=false;}
    else if(typeof u.groups==='string'){u.groups=[u.groups];u.groupsReadable=true;}
    else if(Array.isArray(u.groups)){u.groupsReadable=true;}
    if(!arr(u.groups,128)||!u.groups.every(g=>str(g,256)))throw new Error(`users[${index}].groups 格式错误`);
  }
  for(const s of v.shares){
    if(!obj(s)||!str(s.name,256)||!str(s.path??'',4096)||!str(s.description??'',4096)||(s.special!==undefined&&typeof s.special!=='boolean')||
       (s.permissionsReadable!==undefined&&typeof s.permissionsReadable!=='boolean')||
       (s.permissions!==undefined&&!arr(s.permissions,2000))||(s.ntfsReadable!==undefined&&typeof s.ntfsReadable!=='boolean')||(s.ntfs!==undefined&&s.ntfs!==null&&!obj(s.ntfs)))throw new Error('shares 中有无效共享');
    if(s.ntfs){
      const n=s.ntfs;
      if(!str(n.owner??'',512)||(n.inheritanceProtected!==undefined&&typeof n.inheritanceProtected!=='boolean')||
         (n.truncated!==undefined&&typeof n.truncated!=='boolean')||!arr(n.access??[],40))throw new Error('NTFS 概览格式错误');
      for(const a of n.access||[]){
        if(!obj(a)||!str(a.identity??'',512)||!str(a.rights??'',256)||!str(a.type??'',64)||
          (a.inherited!==undefined&&typeof a.inherited!=='boolean'))throw new Error('NTFS 权限项格式错误');
      }
    }
    for(const p of s.permissions||[]){
      if(!obj(p)||!str(p.account??'',256)||!str(p.accessRight??'',128)||!str(p.accessControlType??'',128))throw new Error('共享权限项格式错误');
    }
  }
  for(const i of v.interfaces||[]){
    if(!obj(i)||!str(i.name??'',255)||!arr(i.ipv4??[],64)||!str(i.profile??'',128)||!str(i.speed??'',128))throw new Error('interfaces 中有无效网卡');
    for(const ip of i.ipv4||[]){
      if(!obj(ip)||!str(ip.ip,64)||(ip.prefix!==undefined&&(!Number.isInteger(ip.prefix)||ip.prefix<0||ip.prefix>32)))throw new Error('IPv4 字段格式错误');
    }
  }
  for(const s of v.sessions||[]){
    if(!obj(s)||!['client','name','ip','account','username','sessionId','connected'].every(k=>s[k]===undefined||str(s[k],512)))throw new Error('sessions 中有无效会话');
  }
  for(const f of v.firewallProfiles||[]){
    if(!obj(f)||!str(f.name??'',128)||(f.enabled!==undefined&&typeof f.enabled!=='boolean'))throw new Error('firewallProfiles 格式错误');
  }
  if(!(v.warnings||[]).every(w=>str(w,2000)))throw new Error('warnings 格式错误');
  return v;
}
function sessionUncertain(){return !!(real()&&(!Array.isArray(state.snapshot.sessions)||state.snapshot.warnings?.some(w=>/SMB.*会话|会话.*SMB/i.test(w))));}
function desktopAvailable(){return !!(window.chrome&&window.chrome.webview&&typeof window.chrome.webview.postMessage==='function');}
function desktopDisconnected(){return desktopAvailable()&&!live()&&!real();}
function desktopPost(type,payload={}){if(!desktopAvailable())return false;if(desktopBusy){toast('上一次本机操作仍在进行');return false;}desktopBusy=true;try{window.chrome.webview.postMessage(Object.assign({type},payload));return true;}catch(err){desktopBusy=false;toast('无法调用本机后端：'+String(err.message||err).slice(0,60));return false;}}
function applySnapshot(value,targetPage='shares'){const previous={snapshot:state.snapshot,mode:state.mode,page:state.page};try{state.snapshot=value;state.mode='snapshot';state.page=targetPage;render();toast((live()?'已载入 Windows 当前状态':'已载入只读快照'));}catch(renderError){state.snapshot=previous.snapshot;state.mode=previous.mode;state.page=previous.page;render();throw renderError;}}
function showPasswordDialog(password){dlg.dataset.password=password;dlg.innerHTML=`<div class="dialog-head"><div class="mark">${icon('key-round',20)}</div><h2>账户密码（创建或重置）</h2>${elButton(icon('x'),'dialog-close','iconbtn')}</div><div class="dialog-body"><div class="callout amber">${icon('alert',16)}请立即复制并妥善保存密码；关闭后不会再次显示。</div><p class="muted">这是新建或重置操作生成的新密码：</p><div class="preview-list"><div>${icon('check',15)}<code>${esc(password)}</code></div></div></div><div class="dialog-actions">${elButton(icon('copy',16)+' 复制密码','admin-copy-password','btn primary')}${elButton('已保存，继续创建共享','create-share-next','btn ghost')}${elButton('关闭','dialog-close','btn ghost')}</div>`;dlg.showModal();}
function initDesktopBridge(){
 if(!desktopAvailable())return;
 window.chrome.webview.addEventListener('message',event=>{
  const msg=event.data||{};
  if(msg.type==='diagnostic-result'){
   desktopBusy=false;
   if(msg.ok){state.desktopReportAvailable=true;render();toast('诊断完成：'+(Number(msg.checks)||0)+' 项检查');}
   else{state.lastError=String(msg.message||'诊断未完成');render();toast(state.lastError);}
   return;
  }
  if(msg.type==='snapshot-result'){
   desktopBusy=false;
   if(msg.ok){
    try{const fresh=validateSnapshot(msg.snapshot);state.managedUsers=msg.managed?.users||[];state.managedShares=msg.managed?.shares||[];state.liveMode=true;state.desktopConnection='ready';state.lastError='';state.connections=null;applySnapshot(fresh,real()?state.page:'shares');}
    catch(err){state.liveMode=false;state.desktopConnection='failed';state.lastError='本机快照格式异常：'+String(err.message||err).slice(0,200);render();toast('本机状态加载失败');}
   }else{state.desktopConnection='failed';state.lastError=String(msg.message||'快照导出未完成');render();toast(state.lastError);}
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
   if(!msg.ok){recordCoreActivity('操作未完成',false);awaitedShareChange=null;state.shareFeedback=null;state.lastError=String(msg.message||'管理操作失败').slice(0,600);if(!live())state.desktopConnection='failed';render();toast('操作失败，请查看页面上的错误详情');return;}
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
      ? '账户已删除；文件、用户目录、NTFS ACL 均未更改。原 SID 的访问控制记录可能仍存在，需要另行审核。'
      : '账户删除操作已返回结果；请检查 Windows 状态及权限记录。';
    }
    const change=awaitedShareChange;awaitedShareChange=null;
    if(msg.operation==='admin-update-share-description'){
     const sh=msg.snapshot?.shares?.find(s=>s.name===msg.data?.name);
     const verified=!!(sh&&sh.path===msg.data?.path&&sh.description===msg.data?.description);
     state.lastReceipt={kind:'share-description',name:msg.data?.name,verified,at:msg.snapshot?.capturedAt||''};
     if(!verified)state.lastError='Windows 已报告写入成功，但共享备注未能通过二次核验。';
    }
    const fresh=msg.snapshot?validateSnapshot(msg.snapshot):null;
    if(change){
     const afterShare=fresh?.shares?.find(s=>s.name===change.name&&s.path===change.path);
     const afterUser=fresh?.users?.find(u=>u.sid===change.sid);
     const actual=afterShare&&afterShare.permissionsReadable!==false&&Array.isArray(afterShare.permissions)&&afterUser?currentDirectRight(afterShare,afterUser):'Unknown';
     const wanted=change.right==='Remove'?'None':change.right;
     const verified=actual===wanted;
     state.shareFeedback={...change,actual,verified,capturedAt:fresh?.capturedAt||''};
     if(!verified)state.lastError='Windows 已报告操作完成，但重新采集的共享权限未能匹配目标；请刷新并核实。';
     if(fresh)applySnapshot(fresh,'shares');else{state.page='shares';render();}
     const newIndex=fresh?.shares?.findIndex(s=>s.name===change.name);
     if(newIndex>=0)showInspectShare('real-'+newIndex,change.sid);
     toast(verified?'授权已修改，并已复查 Windows 结果':'权限修改未获二次验证，请人工核对');
    }else{
     if(fresh)applySnapshot(fresh,state.page);else{render();state.lastError='系统已报告操作完成，但无法刷新 Windows 状态，请手动核验。';}
     const destructive=['admin-delete-existing-user','admin-unshare-existing','admin-delete-user','admin-delete-share'].includes(msg.operation);
     if(destructive&&msg.verified!==true){state.lastError=msg.verified===false?'Windows 报告执行成功，但刷新后对象仍然存在；请检查后端日志与系统状态。':'Windows 报告执行成功，但暂时无法再次读取并核验结果。请刷新后在 Windows 中确认。';render();}
     if(msg.password)showPasswordDialog(String(msg.password));
     else if(msg.data?.path&&msg.data?.name&&msg.operation==='admin-create-share')shareAccessHelp(String(msg.data.name));
     toast(destructive?(msg.verified===true?'Windows 已复查：目标不再存在':'已执行，但尚未验证操作结果'):String(msg.message||'管理操作完成'));
    }
   }catch(err){if(!real())state.desktopConnection='failed';state.lastError='Windows 返回的数据验证失败：'+String(err.message||err).slice(0,200);render();toast('管理结果无法读取');}
   return;
  }
  if(msg.type==='connections-result'){
   desktopBusy=false;
   if(msg.ok&&msg.data&&msg.data.kind==='switchlan-local-smb-connections'&&
      Array.isArray(msg.data.sessions)&&Array.isArray(msg.data.files)&&
      typeof msg.data.sessionsReadable==='boolean'&&typeof msg.data.filesReadable==='boolean'&&
      msg.data.sessions.length<=200&&msg.data.files.length<=200){
    state.connections=msg.data;state.connectionsError='';
    toast(msg.data.sessionsReadable?'已读取 Windows 当前 SMB 会话':'没有权限确认 SMB 会话');
   }else{state.connections=null;state.connectionsError=String(msg.message||'Windows 会话数据无效').slice(0,280);toast('SMB 会话刷新未成功');}
   render();return;
  }
  if(msg.type==='security-scan-result'){
   desktopBusy=false;
   if(msg.ok&&msg.report?.kind==='switchlan-security-scan'&&Array.isArray(msg.report.findings)&&Array.isArray(msg.report.unknown)){
    state.securityReport=msg.report;state.lastError='';state.page='security';render();toast('只读风险检查完成');
   }else{state.securityReport=null;state.lastError=String(msg.message||'安全扫描返回格式错误');state.page='security';render();toast('安全扫描未完成');}
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
      if(!recent)state.radarEvents.unshift({time:item.capturedAt,id:probe.id,kind:'spike',message:'ICMP RTT 尖峰 '+nextMs.toFixed(1)+' ms（前次 '+prevMs.toFixed(1)+' ms）'});
     }
     const oldState=(previous.icmp==='ok'||previous.tcp==='ok')?'reachable':'unconfirmed';
     const newState=(next.icmp==='ok'||next.tcp==='ok')?'reachable':'unconfirmed';
     if(oldState!==newState)state.radarEvents.unshift({time:item.capturedAt,id:probe.id,message:newState==='reachable'?'重新收到网络响应':'未收到响应（不等于设备离线）'});
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
   }else{state.radarPorts=null;state.radarPortsError=String(msg.message||'本机监听数据格式错误').slice(0,240);}
   if(state.page==='radar')render();
   return;
  }
  if(msg.type==='game-result'){
   desktopBusy=false;state.gameBusy=false;
   if(msg.ok&&msg.mode==='scan'&&msg.result&&Array.isArray(msg.result.games)){
    const games=msg.result.games;
    state.gameResults={...msg.result,games:games.slice(0,600)};
    state.gameError='';state.gameNotice=`本次扫描 ${Number(msg.result.scannedHosts)||0} 台地址，发现 ${games.length} 个候选联机端点。`;
    toast('游戏发现完成：'+games.length+' 个结果');
   }else if(msg.ok&&msg.mode==='check'&&msg.result){
    state.gameManual=msg.result;state.gameError='';
    state.gameNotice=String(msg.result.note||'探测已完成');toast(state.gameNotice);
   }else if(msg.cancelled){state.gameNotice='扫描已取消，上次结果保留。';toast(state.gameNotice);}
   else{state.gameError=String(msg.message||'游戏发现失败').slice(0,240);toast('游戏发现失败');}
   render();return;
  }
  if(msg.type==='lan-scan-progress'){
   state.lanProgress={done:Number(msg.done)||0,total:Number(msg.total)||254};
   if(state.page==='lan'){
    const progress=root.querySelector('.lan-progress-bar');if(progress)progress.style.width=Math.min(100,100*state.lanProgress.done/Math.max(1,state.lanProgress.total))+'%';
    const text=root.querySelector('.lan-run-area small');if(text)text.textContent=`已探测 ${state.lanProgress.done}/${state.lanProgress.total}`;
   }
   return;
  }
  if(msg.type==='lan-scan-result'){
   desktopBusy=false;state.lanScanning=false;
   if(msg.ok&&msg.result&&Array.isArray(msg.result.devices)){
    state.lanResults=msg.result;state.lanReadChecks={};state.lanExpanded={};state.lastError='';
    state.lanLastFinished=new Date().toISOString();state.lanDurationMs=Date.now()-state.lanScanStartedAt;
    toast('局域网探测完成：'+msg.result.devices.length+' 台响应设备');
   }else if(msg.cancelled){toast('已取消扫描，上次结果已保留');}
   else{state.lastError=String(msg.message||'扫描失败');toast('扫描失败：'+state.lastError.slice(0,75));}
   render();return;
  }
  if(msg.type==='lan-rescan-one-result'){
   desktopBusy=false;state.lanSingleBusy='';
   if(msg.ok&&msg.result&&state.lanResults){
    const devices=state.lanResults.devices||[];const i=devices.findIndex(d=>d.ip===msg.result.ip);
    if(i>=0)devices[i]=msg.result;else devices.push(msg.result);
    for(const key of Object.keys(state.lanReadChecks)){if(key.startsWith(msg.result.ip+'|'))delete state.lanReadChecks[key];}
    state.lanExpanded[msg.result.ip]=true;toast('设备探测已更新');
   }else{state.lastError=String(msg.message||'单台重测失败');toast(state.lastError);}
   render();return;
  }
  if(msg.type==='lan-open-share-result'){
   if(!msg.ok)toast('资源管理器启动失败：'+String(msg.message||'系统错误').slice(0,80));
   else toast('已交给 Windows 资源管理器尝试连接；是否能打开取决于远端凭据与权限');
   return;
  }
  if(msg.type==='lan-share-check-result'){
   desktopBusy=false;
   if(msg.ok&&msg.result){
    const r=msg.result;
    const outcome=r.readable===true?'readable':r.outcome==='denied'?'denied':'unknown';
    state.lanReadChecks[r.ip+'|'+r.share]={status:String(r.status||''),readable:outcome==='readable',outcome,errorCode:r.errorCode??null,checkedAt:r.checkedAt||new Date().toISOString()};
    state.lanExpanded[r.ip]=true;
    toast(outcome==='readable'?'当前身份可以列出该目录':outcome==='denied'?'Windows 拒绝列目录':'尚无法确认目录读取权限');
   }
   else{state.lastError=String(msg.message||'读取测试失败');toast('读取测试失败');}
   render();return;
  }
  if(msg.type==='desktop-error'){recordCoreActivity('后端通信错误',false);desktopBusy=false;state.lastError=String(msg.message||'本机操作失败').slice(0,600);if(!live())state.desktopConnection='failed';render();toast('本机操作失败，详见页面错误信息');}
 });
}
function coreActionLabel(operation){
 return ({'admin-create-user':'创建账户','admin-update-existing-user':'修改账户资料','admin-set-existing-user-enabled':'切换账户状态','admin-set-existing-user-password':'设置新密码','admin-reset-existing-user-password':'重置密码','admin-delete-existing-user':'删除普通账户','admin-create-share':'创建文件共享','admin-modify-share-access':'修改 SMB 授权','admin-unshare-existing':'停止文件共享','admin-update-share-description':'编辑共享备注','admin-refresh':'刷新系统状态'})[operation]||'Windows 管理操作';
}
function recordCoreActivity(label,ok){
 state.coreActivity.unshift({label,ok,at:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})});
 state.coreActivity=state.coreActivity.slice(0,15);
}
function notice(){
 if(desktopDisconnected())return `<div class="modebar ${state.desktopConnection==='failed'?'demo':'real'}">${icon('activity',17)}<span><strong>${state.desktopConnection==='failed'?'Windows 连接失败':'正在读取真实 Windows 状态'}</strong> · 连接失败时不显示模拟用户，也不允许写入系统。</span></div>`;
 return `${state.lastCleanupInfo?`<div class="callout">${icon('info',17)} ${esc(state.lastCleanupInfo)}</div>`:''}${state.lastError?`<div class="callout danger">${icon('alert',16)}<span><strong>最近一次错误：</strong>${esc(state.lastError)}</span> ${elButton('复制错误','copy-last-error','btn tiny')}</div>`:''}<div class="modebar ${real()?'real':'demo'}">${icon(real()?'shield-check':'info',16)}<span>${real()?`<strong>${live()?'Windows 本机管理':'导入快照 · 只读'}</strong> · ${esc(state.snapshot.capturedAt||'采集时间未知')} · 账户与共享来自 Windows 实际状态。`:'<strong>未连接 Windows</strong> · 请启动桌面程序，网页版不会伪造账户或共享。'}</span></div>`;
}

function modal(kind,html,actionLabel='下一步'){pending={kind};dlg.innerHTML=`<form id="dialogForm" method="dialog"><div class="dialog-head"><div class="mark">${icon('settings',20)}</div><h2>${kind}</h2>${elButton(icon('x'),'dialog-close','iconbtn')}</div><div class="dialog-body">${html}</div><div class="dialog-actions"><button type="button" class="btn ghost" data-action="dialog-close">取消</button><button type="submit" class="btn primary">${esc(actionLabel)} ${icon('arrow-right',16)}</button></div></form>`;dlg.showModal();}
function preview(title,lines,commit,danger=false){pending={kind:'preview',commit};dlg.innerHTML=`<div class="dialog-head"><div class="mark">${icon(danger?'alert':'shield-check',20)}</div><h2>${esc(title)}</h2>${elButton(icon('x'),'dialog-close','iconbtn')}</div><div class="dialog-body"><p class="muted">请确认本次操作的范围。这里是模拟执行预览，暂不改变 Windows。</p><div class="preview-list">${lines.map(l=>`<div>${icon('check',15)}<span>${esc(l)}</span></div>`).join('')}</div>${danger?`<div class="callout danger">${icon('alert',18)}这是敏感操作。未来真实后端需要额外验证权限、会话与回滚条件。</div>`:''}</div><div class="dialog-actions">${elButton('返回','dialog-close','btn ghost')}${elButton('确认模拟执行','apply-preview',`btn ${danger?'danger-btn':'primary'}`)}</div>`;dlg.showModal();}
function closeDialog(){dlg.close();pending=null;delete dlg.dataset.password;}
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),2800);}
function log(event,detail){state.logs.unshift({id:'l'+Date.now(),time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}),event,detail,status:'demo'});}
function getUser(sid){return state.users.find(u=>u.sid===sid);}
function permission(p){return P.permissionSummary(p.smb,p.ntfs);}
function statCards(){
 const snap=real();
 const d=snap?.summary||null;
 const stats=snap?[
  [icon('folder-open',20),'普通共享',(snap.shares||[]).filter(x=>!x.special&&!String(x.name||'').endsWith('$')).length,`其中 SwitchLAN 托管 ${state.managedShares.length} 个 · 系统共享独立隐藏`],
  [icon('users',20),'本地普通账户',(snap.users||[]).filter(x=>!systemAccount(x)).length,`其中 SwitchLAN 托管 ${state.managedUsers.length} 个`],
  [icon('shield-check',20),'防火墙',d?.firewallEnabled===true?'已启用':d?.firewallEnabled===false?'存在关闭':'待核实','系统当前检测结果'],
  [icon('activity',20),'SMB 会话',sessionUncertain()?'未获取':d?.sessionCount??snap.sessions?.length??'—','权限不足时显示未获取']
 ]:[
  [icon('folder-open',20),'共享文件夹',state.shares.filter(s=>s.managed).length,'托管对象 · 示例'],
  [icon('users',20),'共享账户',state.users.filter(u=>u.managed).length,'模拟本地账户'],
  [icon('monitor',20),'白名单设备',state.peers.filter(p=>p.enabled).length,'已启用的来源'],
  [icon('activity',20),'活动会话',state.sessions.length,'会话仅供演示']
 ];
 return `<div class="stat-grid">${stats.map(([ic,n,v,h])=>`<div class="statcard"><div class="stat-top">${ic}<span>${n}</span></div><strong>${esc(v)}</strong><small>${h}</small></div>`).join('')}</div>`;
}
function availableLanInterfaces(){
 if(!real())return [];
 return (state.snapshot.interfaces||[]).flatMap(n=>(n.ipv4||[])
   .filter(v=>/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(v.ip||'') && (!n.status||/^(up|connected|已连接)$/i.test(n.status)))
   .map(v=>({ip:v.ip,prefix:v.prefix,name:n.name||'未命名网卡',speed:n.speed||'',
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
 const ni=localLanIPv4();if(!ni)return `<div class="lan-mini-hero unavailable">${icon('wifi',20)} <strong>没有获取到局域网私有 IPv4</strong><span>请检查当前网卡</span></div>`;
 return `<div class="lan-mini-hero liquid-banner"><div class="lan-mini-orb">${icon('wifi',22)}</div><div class="lan-mini-label"><small>本机局域网地址 · ${esc(ni.name)}</small><strong class="mono">${esc(ni.ip)}<em> /${esc(ni.prefix??'?')}</em></strong></div><div class="lan-mini-actions">${elButton(icon('copy',15)+' 复制 IP','copy-local-ip','btn tiny liquid-button')} ${elButton(icon('search',15)+' 发现设备','go-lan','btn tiny liquid-button')}</div></div>`;
}
function networkPanel(){const ni=real()?.interfaces?.find(x=>x.ipv4&&x.ipv4.length)||null, i=real()?(ni?{name:ni.name,ip:ni.ipv4[0]?.ip,prefix:ni.ipv4[0]?.prefix,category:ni.profile||'未知',speed:ni.speed||'—',gateway:'按实际路由表查看'}:{name:'未获取网卡',ip:'未获取',prefix:'—',category:'未获取',speed:'—',gateway:'未获取'}):state.interface;return `<section class="panel"><div class="panel-title"><h2>${icon('wifi',18)} 当前网络</h2>${badge(real()?(live()?'本机状态':'只读'):'以太网优先','blue')}</div><div class="networkhero"><div class="network-icon">${icon('monitor',28)}</div><div><strong>${esc(i.name||'未发现网卡')}</strong><div class="muted small">${esc(i.speed||'未知速度')} · ${esc(i.category||'未知配置文件')}</div></div></div><div class="detail-grid"><div><small>IPv4 地址</small><strong class="mono">${esc(i.ip||'未获取')}</strong></div><div><small>前缀长度</small><strong class="mono">/${esc(i.prefix??'—')}</strong></div><div><small>默认网关</small><strong>${esc(i.gateway||'—')}</strong></div><div><small>模式</small><strong>${real()?'Windows 快照':'模拟局域网'}</strong></div></div></section>`;}
function dashboard(){let d=real()?.summary;return `${head('控制总览','网络、文件共享和安全状态，一屏掌握。')}${statCards()}<div class="twocol"><div>${networkPanel()}<section class="panel"><div class="panel-title"><h2>${icon('power',18)} 共享访问控制</h2>${badge(real()?'只读':state.managedEnabled?'模拟开启':'模拟关闭',state.managedEnabled&&!real()?'green':'neutral')}</div><div class="control-strip"><div class="control-status ${state.managedEnabled&&!real()?'active':''}">${icon('shield-check',25)}</div><div><strong>${real()?'共享防火墙控制仍未接入（请手动检查 Windows 防火墙）':state.managedEnabled?'演示：托管规则已开启':'演示：托管规则已关闭'}</strong><p>${real()?'账户和共享请在各自页面管理；防火墙修改尚未接入。':'只模拟本工具规则，不会修改 Windows 内置防火墙或已有会话。'}</p></div></div><div class="inline-actions">${elButton(icon('power',16)+' '+(state.managedEnabled?'模拟关闭访问':'模拟开放访问'),'toggle-rule','btn primary',ro()?'disabled':'')}${elButton('查看安全检查','go-security','btn ghost')}</div></section></div><div><section class="panel"><div class="panel-title"><h2>${icon('shield-check',18)} 安全提示</h2>${badge('需要关注','amber')}</div><div class="alerts">${real()?
 `<div class="alert amber">${icon('alert',17)}快照是采集时刻的信息，不能证明当前外部设备绝对无法访问。</div><div class="alert muted">${icon('info',17)}当前只读阶段不计算复杂 ACL 的最终有效权限。</div>`:
 `<div class="alert amber">${icon('alert',17)}检测到可能存在的系统级宽泛允许规则（模拟）。</div><div class="alert muted">${icon('info',17)}IP 白名单仅限制来源，不能代替共享账户认证。</div><div class="alert muted">${icon('info',17)}开启新规则不会覆盖已有的其他宽泛规则。</div>`}</div>${elButton('进入安全中心 '+icon('arrow-right',15),'go-security','btn link')}</section><section class="panel"><div class="panel-title"><h2>${icon('book-open',18)} 今天学一个概念</h2></div><div class="tip-card"><span class="eyebrow">共享权限 × NTFS</span><h3>为什么两道门都要开？</h3><p>共享层允许修改、NTFS 只读时，通过这个共享访问仍受到只读约束；还要考虑组和继承。</p>${elButton('打开百科 '+icon('arrow-right',14),'go-knowledge','btn link')}</div></section></div></div>`;}
// Stage 3.5: selectable objects keep the action context visible. Writes still use
// the same reviewed Windows bridge and require an elevated, explicit confirmation.
function detailLine(label,value){return `<div class="inspector-field"><span>${esc(label)}</span><strong>${esc(value??'—')}</strong></div>`;}
function inspectorHeader(iconName,title,subtitle){return `<div class="inspector-heading"><div class="inspector-mark">${icon(iconName,23)}</div><div><span class="eyebrow">对象工作区 · Windows 当前状态</span><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div></div>`;}
function selectionIndex(items,kind){const chosen=state.focus[kind];const n=items.findIndex(o=>(kind==='user'?o.sid:o.name)===chosen);return n>=0?n:0;}
function userInspector(u,index){
 if(!u)return '<div class="empty inspector-empty">选择左侧账户，查看资料与可用操作。</div>';
 const writable=live()&&editableLocalUser(u),managed=live()&&isManagedUser(u.name);
 const groups=Array.isArray(u.groups)?u.groups:[];
 const reason=systemAccount(u)?'Windows 内置账户受保护':u.isAdministrator===true?'管理员组账户受保护':String(state.snapshot?.activeUserSid||'')===String(u.sid||'')?'当前登录账户受保护':!live()?'离线快照不可写入':'此账户暂不支持直接编辑';
 return `${inspectorHeader('users',u.name,'本地 Windows 账户')}
 <div class="inspector-tabs">${badge(u.enabled===false?'已禁用':'已启用',u.enabled===false?'neutral':'green')}${badge(userOrigin(u),managed?'blue':'neutral')}</div>
 <section class="core-primary-actions" aria-label="账户主要操作"><div>${icon('settings',18)}<strong>常用管理</strong><small>所有按钮只针对上方选中的账户</small></div><div class="core-action-toolbar">${writable?`${elButton(icon('settings',15)+' 编辑资料','admin-edit-user','btn primary',`data-index="${index}"`)}${elButton(icon('key-round',15)+' 设置新密码','admin-reset-existing-user-password','btn ghost',`data-index="${index}"`)}${elButton(u.enabled===false?'启用账户':'禁用账户','admin-set-existing-user-enabled','btn ghost',`data-index="${index}" data-enabled="${u.enabled===false?'true':'false'}"`)}`:badge(reason,'neutral')}</div></section>
 <section class="inspector-section compact account-facts"><h3>账户资料</h3><div class="account-facts-grid"><div><small>显示名称</small><strong>${esc(u.fullName||'未设置')}</strong></div><div><small>上次登录</small><strong>${esc(toLocalTime(u.lastLogon))}</strong></div><div class="account-facts-note"><small>备注</small><strong>${esc(u.description||'未设置')}</strong></div></div></section>
 <details class="core-fold" open><summary>${icon('users',16)} 所属用户组 <span>${groups.length} 项</span></summary><div class="core-fold-body">${groups.length?`<div class="chips">${groups.map(g=>badge(g)).join('')}</div>`:'<p class="muted small">未获取组信息；不能认定没有组成员身份。</p>'}</div></details>
 <details class="core-fold"><summary>${icon('info',16)} 身份与限制</summary><div class="core-fold-body">${detailLine('SID',u.sid||'未知')}<p class="muted small">Windows 不允许查看已有明文密码。修改密码将替换旧密码，可能影响已有 SMB 凭据。</p></div></details>
 <details class="core-fold core-danger-fold"><summary>${icon('alert',16)} 危险操作 · 删除账户</summary><div class="core-fold-body"><p class="muted small">删除不可恢复账户身份；其他文件或权限可能保留 SID。请先确认不是常用账户。</p>${writable?elButton('删除选中账户','admin-delete-existing-user','btn danger-btn',`data-index="${index}"`):badge(reason)}</div></details>`;
}
function shareInspector(sh,index){
 if(!sh)return '<div class="empty inspector-empty">选择左侧共享，查看 Windows 实际权限。</div>';
 const ordinary=editableShare(sh),writable=live()&&ordinary,canAccess=writable&&editableShareAccess(sh);
 const managed=live()&&isManagedShare(sh.name);
 const unc=String.fromCharCode(92,92)+(state.snapshot?.computerName||'本机')+String.fromCharCode(92)+sh.name;
 const localIp=selectedLanInterface()?.ip||'';
 const ipUnc=localIp?String.fromCharCode(92,92)+localIp+String.fromCharCode(92)+sh.name:'';
 const ntfs=sh.ntfs||null,aces=Array.isArray(sh.permissions)?sh.permissions:[];
 const sourceUnreadable=sh.permissionsReadable===false;
 const aceRows=sourceUnreadable?'<p class="muted small">Windows 未能读取 SMB 授权。禁止在未知状态下覆盖权限。</p>':aces.map(a=>{
  const owner=(state.snapshot?.users||[]).find(u=>editableLocalUser(u)&&directLocalAce({permissions:[a]},u).length);
  return `<div class="inspector-access"><div><strong>${esc(a.account||'未知主体')}</strong><small>${esc(a.accessControlType||'未知')} · Windows SMB 共享层</small></div><div class="core-access-actions">${badge(rightName(a.accessRight||'Unknown'),a.accessControlType==='Deny'?'amber':'blue')}${canAccess&&owner?elButton('修改','admin-edit-share-access','btn tiny',`data-index="${index}" data-sid="${attr(owner.sid)}"`):''}</div></div>`;
 }).join('')||'<p class="muted small">没有返回直接 SMB 授权，不能据此判定无人有权访问。</p>';
 const ntfsRows=sh.ntfsReadable===false?'<p class="muted small">NTFS ACL 读取失败。</p>':ntfs?(ntfs.access||[]).map(a=>`<div class="inspector-access"><div><strong>${esc(a.identity||'未知主体')}</strong><small>${esc(a.inherited?'继承':'显式')} · ${esc(a.type||'')}</small></div><span class="tiny-text">${esc(a.rights||'未知')}</span></div>`).join()||'<p class="muted small">未列出规则，不能认定没有授权。</p>':'<p class="muted small">暂无 NTFS 文件系统 ACL 数据。</p>';
 const everyone=aces.some(a=>String(a.account||'').toLowerCase()==='everyone');
 return `${inspectorHeader('folder-open',sh.name,sh.path||'Windows SMB 共享')}
 <div class="inspector-tabs">${badge(sh.special?'系统管理共享':managed?'SwitchLAN 托管':'Windows 现有共享',managed?'blue':'neutral')}${badge('SMB 入口存在','green')}</div>
 <div class="core-object-summary"><span class="eyebrow">网络共享地址</span><strong class="mono">${esc(unc)}</strong><div class="core-action-toolbar">${elButton(icon('copy',14)+' 复制主机名路径','copy-unc','btn tiny ghost',`data-value="${attr(unc)}"`)}${ipUnc?elButton(icon('copy',14)+' 复制 IPv4 路径','copy-unc','btn tiny ghost',`data-value="${attr(ipUnc)}" title="当前网卡 IPv4；对方仍需与本机网络互通"`):''}${elButton(icon('copy',14)+' 复制连接说明','share-copy-guide','btn tiny ghost',`data-index="${index}"`)}${writable?elButton('修改备注','edit-share-description','btn tiny ghost',`data-index="${index}"`):''}</div></div>
 <section class="core-primary-actions" aria-label="共享主要操作"><div>${icon('key-round',18)}<strong>共享访问授权</strong><small>选择账户，编辑 SMB 直接权限</small></div><div class="core-action-toolbar">${canAccess?elButton(icon('key-round',15)+' 编辑授权','admin-edit-share-access','btn primary',`data-index="${index}"`):badge(writable?'授权读取失败':'只读共享')}</div></section>
 <div class="core-action-toolbar" style="margin:0 0 12px">${elButton(icon('shield-check',15)+' 打开权限分析','open-permission-analysis','btn ghost',`data-share="${attr(sh.name)}"`)}</div><div class="core-permission-explain"><span>${icon('shield-check',18)}</span><div><strong>两层权限，不能混为一谈</strong><p>下面是 Windows 高级 SMB 共享权限。资源管理器“共享给特定用户”可能显示另一个视图；文件访问还受 NTFS、组与拒绝规则限制。</p></div></div>
 <section class="inspector-section compact"><div class="core-section-title"><h3>SMB 高级共享授权</h3>${badge(aces.length+' 条','blue')}</div>${everyone?`<div class="core-inline-note">${icon('info',15)} Windows 返回了 Everyone 的 SMB 授权；这是共享层的真实记录，并不代表任何人都能读写文件。</div>`:''}${aceRows}</section>
 <details class="core-fold" open><summary>${icon('folder-open',16)} NTFS 文件系统权限 <span>${ntfs?.access?.length??'未知'} 条</span></summary><div class="core-fold-body">${detailLine('文件夹所有者',ntfs?.owner||'未获取')}${detailLine('继承',ntfs?ntfs.inheritanceProtected?'已禁用':'允许继承':'未知')}${ntfsRows}${ntfs?.truncated?'<p class="muted small">部分 ACL 未展示，不应据此推断最终权限。</p>':''}<p class="muted small">本版 NTFS 规则仅供核对，不会在修改 SMB 时自动重置。</p></div></details>
 <details class="core-fold"><summary>${icon('info',16)} 共享详情</summary><div class="core-fold-body">${detailLine('本机目录',sh.path||'系统虚拟路径')}${detailLine('备注',sh.description||'未设置')}${detailLine('权限判断','未做最终有效权限推算')}</div></details>
 <details class="core-fold core-danger-fold"><summary>${icon('alert',16)} 危险操作 · 停止共享</summary><div class="core-fold-body"><p class="muted small">只移除网络共享入口，保留磁盘文件；可能断开正在传输的客户端。</p>${writable?elButton('停止此共享（保留文件）','admin-unshare-existing','btn danger-btn',`data-index="${index}"`):badge('系统共享或只读状态')}</div></details>`;
}
function objectWorkbench(kind,items,selected,filter){
 const isUser=kind==='user',label=isUser?'账户':'共享';
 const searchKey=isUser?'users':'shares';
 const filtered=items.filter(o=>String(isUser?(o.name+' '+(o.fullName||'')+' '+(o.description||'')):(o.name+' '+(o.path||'')+' '+(o.description||''))).toLowerCase().includes(filter.toLowerCase()));
 const chosen=filtered.find(o=>(isUser?o.sid:o.name)===state.focus[kind])||filtered[0];
 const index=chosen?selected.indexOf(chosen):-1;
 return `<div class="workbench core-game-workbench"><section class="wb-list"><div class="wb-list-top"><div class="core-list-label"><span class="core-list-led"></span><strong>Windows 实际${label}</strong></div>${badge(filtered.length+' 项','blue')}</div><div class="wb-search">${icon('search',17)}<input id="${searchKey}WorkFilter" placeholder="搜索${label}名称与说明" value="${attr(filter)}" aria-label="搜索${label}" /></div><div class="wb-list-scroll">${filtered.map((o,i)=>{const key=isUser?o.sid:o.name;const active=chosen===o;return `<button type="button" class="wb-entry game-card ${active?'active':''}" style="--card-index:${Math.min(i,12)}" data-action="focus-${kind}" data-key="${attr(key)}" aria-pressed="${active}"><span class="wb-entry-icon">${isUser?icon('users',18):icon('folder-open',18)}</span><span class="wb-entry-copy" title="${attr(o.name)}"><strong>${esc(o.name)}</strong><small>${esc(isUser?(o.fullName||o.description||'本地账户'):(o.path||'系统虚拟共享'))}</small></span>${isUser?`<span class="account-status-dot ${o.enabled===false?'disabled':'enabled'}" title="${o.enabled===false?'已禁用':'已启用'}" aria-label="${o.enabled===false?'已禁用':'已启用'}"></span>`:o.special?badge('系统'):icon('chevron-right',16)}</button>`;}).join('')||`<div class="empty">没有匹配的${label}。调整搜索或筛选。</div>`}</div></section><section class="wb-inspector game-inspector" aria-label="${label}详情">${chosen?(isUser?userInspector(chosen,index):shareInspector(chosen,index)):`<div class="empty">暂无可显示的${label}详情</div>`}</section></div>`;
}
function coreActionCard(iconName,title,description,action,kind='default',disabled=false){
 return `<button type="button" class="core-action-card game-card ${kind==='primary'?'primary':''}" data-action="${action}" ${disabled?'disabled':''}>
 <span class="core-action-symbol">${icon(iconName,22)}</span><span class="core-action-copy"><strong>${title}</strong><small>${description}</small></span>${icon('arrow-right',19)}</button>`;
}
function coreActionDeck(kind){
 if(!live())return '';
 return `<section class="core-action-deck" aria-label="快捷操作">
 <div class="core-deck-title"><span class="core-deck-spark">✦</span><strong>快捷行动</strong><small>直接执行真实 Windows 管理操作</small></div>
 <div class="core-deck-grid">${kind==='share'?
  `${coreActionCard('plus','新建共享','选择文件夹和授权账户','admin-new-share','primary')}${coreActionCard('users','用户账户','查看或维护 Windows 本地用户','go-users')}${coreActionCard('wifi','扫描设备','发现局域网设备与 SMB 共享','go-lan')}`:
  `${coreActionCard('plus','创建账户','为共享建立独立身份','admin-new-user','primary')}${coreActionCard('folder-open','共享文件夹','继续配置 SMB 访问权限','go-shares')}${coreActionCard('wifi','扫描设备','发现局域网设备与 SMB 共享','go-lan')}`
 }</div></section>`;
}
function sharesPage(){
 const snap=real(),all=snap?.shares||[],items=scopedShares(all,state.shareScope);
 return `<div class="core-management-page">${head('文件共享',snap?'查看 Windows 现有共享，管理网络入口与访问授权。':'请连接 Windows 桌面程序。',elButton(icon('plus',16)+' 创建共享','admin-new-share','btn primary',!live()?'disabled':''))}${snap?`<div class="wb-toolbar">${sharePicker('shareScope',state.shareScope)}<span class="muted small">默认隐藏系统共享，仍可选择“所有共享”检查。</span></div>${objectWorkbench('share',items,all,state.filter.shares)}`:`<section class="panel"><div class="table-wrap"><table><tbody>${all.map(s=>`<tr><td>${esc(s.name)} · ${esc(s.path)}</td><td>${elButton('查看模拟详情','inspect-share-'+(s.id||s.name),'btn tiny')}</td></tr>`).join('')}</tbody></table></div></section>`}</div>`;
}
function usersPage(){
 const snap=real(),all=snap?.users||[],items=scopedUsers(all,state.userScope);
 return `<div class="core-management-page">${head('本地用户',snap?'管理本机账户资料、密码和启用状态。':'请连接 Windows 桌面程序。',elButton(icon('plus',16)+' 创建账户','admin-new-user','btn primary',!live()?'disabled':''))}${snap?`<div class="wb-toolbar">${userPicker('userScope',state.userScope)}<span class="muted small">内置账户默认隐藏；管理员 / 当前用户的操作仍由后端保护。</span></div>${objectWorkbench('user',items,all,state.filter.users)}`:`<section class="panel"><div class="table-wrap"><table><tbody>${all.map(u=>`<tr><td>${esc(u.name)}</td><td>${badge(u.enabled?'启用':'禁用')}</td></tr>`).join('')}</tbody></table></div></section>`}</div>`;
}
function permissionsPage(){if(real()){
 const shares=(state.snapshot?.shares||[]).filter(s=>!s.special&&!String(s.name||'').endsWith('$'));
 return `${head('权限中心','查看和修改电脑当前的普通 SMB 共享授权，而非仅 SwitchLAN 创建的共享。')}<div class="callout">${icon('info',16)}下表是 <strong>SMB 共享层的直接权限</strong>；NTFS ACL、组、拒绝规则和继承共同决定实际有效权限。修改后请验证实际访问。</div><section class="panel"><div class="table-wrap"><table><thead><tr><th>共享</th><th>直接授权</th><th>操作</th></tr></thead><tbody>${shares.map((s,i)=>`<tr><td><strong>${esc(s.name)}</strong><small class="path">${esc(s.path||'')}</small></td><td>${(s.permissions||[]).map(p=>`<div>${esc(p.account)} · ${badge(p.accessRight||'未知','blue')} · ${esc(p.accessControlType||'未知')}</div>`).join('')||'无可见授权'}</td><td>${elButton('打开共享工作区','focus-share-from-permissions','btn tiny',`data-key="${attr(s.name)}"`)}</td></tr>`).join('')||'<tr><td colspan="3">暂无普通共享。</td></tr>'}</tbody></table></div></section>`;
}
const users=state.users.filter(u=>u.managed),shares=state.shares.filter(s=>s.managed);return `${head('权限中心','账户 × 共享的授权矩阵；点击单元格可编辑 SMB 与 NTFS 两道权限。')}<section class="panel"><div class="table-wrap"><table class="matrix"><thead><tr><th>共享 / 账户</th>${users.map(u=>`<th>${esc(u.name)}</th>`).join('')}</tr></thead><tbody>${shares.map(s=>`<tr><td><div class="share-name">${icon('folder-open',16)} <strong>${esc(s.name)}</strong></div></td>${users.map(u=>{const p=s.permissions.find(x=>x.sid===u.sid);return `<td><button class="matrix-button" data-action="permission-${s.id}-${u.sid}">${badge(p?P.roleText[p.smb]:'无授权',p?.smb==='change'?'blue':p?.smb==='read'?'green':'neutral')}<small>SMB</small><span class="sep">/</span>${badge(p?P.roleText[p.ntfs]:'无授权',p?.ntfs==='change'?'blue':p?.ntfs==='read'?'green':'neutral')}<small>NTFS</small></button></td>`}).join('')}</tr>`).join('')}</tbody></table></div></section><div class="callout">${icon('info',17)}矩阵展示模拟的直接授权，不代表考虑组成员、继承、Deny 和其他入口后的实际有效权限。</div>`;}

function peersPage(){if(real())return `${head('局域网发现','主动扫描当前物理网卡所在的私有 IPv4 /24 网段。仅探测 TCP 445，不向外网扫描。',live()?elButton(icon('search',16)+' 扫描附近 SMB 设备','lan-scan','btn primary'):'')}<div class="callout">${icon('info',16)}这是手动触发的轻量扫描。445 连通≠登录成功，更≠有权打开共享文件；远端拒绝枚举时会如实显示。不会自动访问文件或尝试密码。</div>${state.lanResults?`<section class="panel"><div class="panel-title"><h2>扫描结果 · ${esc(state.lanResults.subnet||'')}</h2>${badge((state.lanResults.devices||[]).length+' 台 445 可连接','blue')}</div><p class="muted">${esc(state.lanResults.message||'')}</p><div class="table-wrap"><table><thead><tr><th>设备 IP</th><th>状态</th><th>枚举到的普通共享</th></tr></thead><tbody>${(state.lanResults.devices||[]).map(d=>`<tr><td class="mono">${esc(d.ip)}</td><td>${esc(d.status)}</td><td>${(d.shares||[]).length?d.shares.map(sh=>`<div class="mono">${esc(String.fromCharCode(92,92)+d.ip+String.fromCharCode(92)+sh)}</div>`).join(''):badge('未知或未列出')}</td></tr>`).join('')||'<tr><td colspan="3">未检测到可连接 TCP 445 的其他设备。</td></tr>'}</tbody></table></div></section>`:'<div class="empty">尚未发起扫描。点击上方按钮查看同一局域网内的 SMB 服务。</div>'}`;return `${head('可信设备','允许一个或多个 IPv4 地址 / 网段访问托管 SMB 服务。',elButton(icon('plus',16)+' 添加设备','new-peer','btn primary',ro()?'disabled':''))}<div class="twocol"><section class="panel"><div class="panel-title"><h2>${icon('monitor',18)} IP 白名单</h2>${badge(`${state.peers.filter(p=>p.enabled).length} 个已启用`,'blue')}</div><div class="peer-list">${state.peers.map(p=>`<div class="peer"><div class="peer-icon">${icon('monitor',19)}</div><div class="peer-details"><strong>${esc(p.name)}</strong><small class="mono">${esc(p.ip)}</small></div>${badge(p.enabled?'允许':'禁用',p.enabled?'green':'neutral')}${elButton(p.enabled?'暂停':'启用','toggle-peer-'+p.id,'btn tiny',ro()?'disabled':'')}${elButton(icon('x',15),'delete-peer-'+p.id,'iconbtn',ro()?'disabled':'')}</div>`).join('')}</div></section><section class="panel"><div class="panel-title"><h2>${icon('shield-check',18)} 白名单策略</h2></div><label class="fieldlabel" for="peerMode">访问范围</label><select id="peerMode" ${ro()?'disabled':''}><option value="allowlist" ${state.peerMode==='allowlist'?'selected':''}>指定 IP 白名单（推荐）</option><option value="subnet" ${state.peerMode==='subnet'?'selected':''}>允许整段子网（高风险）</option></select><p class="muted">IP 是连接来源，不是账户身份。即使加入白名单，依然需要通过 Windows SMB 凭据验证和权限检查。</p><div class="callout amber">${icon('alert',17)}真实版本必须在修改防火墙前扫描已有宽泛允许规则，否则白名单不能保证排除其他设备。</div></section></div>`;}
function securityPage(){
 const snap=real(), report=state.securityReport, profiles=snap?.firewallProfiles||[];
 const high=(report?.findings||[]).filter(x=>x.severity==='high').length;
 const medium=(report?.findings||[]).filter(x=>x.severity==='medium').length;
 const unknown=(report?.unknown||[]).length;
 const cards=report?`<div class="stat-grid"><div class="statcard"><div class="stat-top">${icon('alert',18)}<span>高风险线索</span></div><strong>${high}</strong><small>需优先人工确认</small></div><div class="statcard"><div class="stat-top">${icon('shield-check',18)}<span>中风险线索</span></div><strong>${medium}</strong><small>建议核对配置</small></div><div class="statcard"><div class="stat-top">${icon('info',18)}<span>未能核验</span></div><strong>${unknown}</strong><small>未检测不代表安全</small></div><div class="statcard"><div class="stat-top">${icon('activity',18)}<span>已执行检查组</span></div><strong>${esc(report.checks??'—')}</strong><small>${esc(report.capturedAt||'未知时间')}</small></div></div>`:'';
 const findings=(report?.findings||[]).map(x=>`<div class="alert ${x.severity==='high'?'red':x.severity==='medium'?'amber':'muted'}"><div><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p><small>建议：${esc(x.advice)}</small></div></div>`).join('');
 const unverified=(report?.unknown||[]).map(x=>`<div class="alert muted">${icon('info',16)} ${esc(x)}</div>`).join('');
 return `${head('安全中心','读取真实 Windows 本机 SMB、账户与防火墙配置，给出可复核的风险线索。',live()?elButton(icon('search',16)+' 开始风险扫描','security-scan','btn primary'):'')}
 <div class="callout">${icon('shield-check',17)}扫描只读，不会更改防火墙、用户或共享。它是有限范围的配置检查，不是杀毒或漏洞扫描，也不能证明某个账户的 NTFS 最终有效权限。</div>
 ${cards}
 <div class="twocol"><section class="panel"><div class="panel-title"><h2>${icon('shield-check',18)} 当前防火墙配置</h2>${badge(snap?'来自系统快照':'演示模式','blue')}</div>
 ${snap?`<div class="settings-list">${profiles.map(p=>`<div><span>${esc(p.name)}</span>${badge(p.enabled?'已启用':'关闭',p.enabled?'green':'amber')}</div>`).join('')||'<div>未获取防火墙配置；请查看快照警告。</div>'}</div>`:'<p class="muted">在 Windows 桌面程序中启动扫描后显示真实结果。</p>'}
 <p class="muted small">具体规则可能受网络配置、程序和组策略影响。不要向公网开放 TCP 445。</p></section>
 <section class="panel"><div class="panel-title"><h2>${icon('search',18)} 风险扫描结果</h2>${report?badge('已检查','green'):badge('尚未扫描','neutral')}</div>
 ${report?`${findings||'<div class="callout">本次检查范围内未发现明确的高/中风险线索，但不代表整机安全。</div>'}${unverified?`<h3>无法核验的项目</h3>${unverified}`:''}<p class="muted small">${esc(report.scope||'仅限已收集的本机配置。')}</p>`:`<div class="empty">尚未获取风险扫描结果。${live()?'点击“开始风险扫描”检查当前电脑。':'浏览器演示与导入快照无法触发实时检查。'}</div>`}
 </section></div>`;
}

function sessionsPage(){const s=real()?(Array.isArray(state.snapshot.sessions)?state.snapshot.sessions:[]):state.sessions;const logs=real()?[]:state.logs;return `${head('连接与日志','检查谁连接过共享以及哪些设置发生了变化。')}<section class="panel"><div class="panel-title"><h2>${icon('activity',18)} SMB 会话</h2>${badge(sessionUncertain()?'未获取':`${s.length} 个`,'blue')}</div><div class="table-wrap"><table><thead><tr><th>客户端</th><th>使用账户</th><th>连接信息</th><th></th></tr></thead><tbody>${s.map(x=>`<tr><td><strong>${esc(x.name||x.client||x.ip||'未知客户端')}</strong><div class="mono tiny-text">${esc(x.ip||'')}</div></td><td>${esc(x.account||x.username||'未知')}</td><td>${esc(x.connected||x.sessionId||'—')}</td><td>${real()?badge('只读'):elButton('模拟断开','drop-session-'+x.id,'btn tiny')}</td></tr>`).join('')||`<tr><td colspan="4">${sessionUncertain()?'会话数据未获取（可能权限不足），不能判断当前没有连接':'没有可显示的会话'}</td></tr>`}</tbody></table></div></section><section class="panel"><div class="panel-title"><h2>${icon('file',18)} 配置操作记录</h2></div><div class="timeline">${logs.map(l=>`<div class="log-row"><div class="logdot"></div><div><strong>${esc(l.event)}</strong><p>${esc(l.detail)}</p></div><time>${esc(l.time)}</time></div>`).join('')||'<div class="empty">只读快照不包含历史配置日志</div>'}</div></section>`;}
function knowledgePage(){const list=K.filter(x=>(x.term+x.desc+x.example+x.tag).toLowerCase().includes(state.knowledgeSearch.toLowerCase()));return `${head('知识百科','专业但不难懂。每个词条都是一句解释、一个真实例子。')}<div class="searchbox">${icon('search',19)}<input id="knowledgeSearch" placeholder="搜索 SMB、NTFS、ARP、路由表……" value="${attr(state.knowledgeSearch)}" autocomplete="off"/><span>${list.length} 个词条</span></div><div class="glossary-grid">${list.map(x=>`<article class="glossary-card"><span class="eyebrow">${esc(x.tag)}</span><h3>${esc(x.term)}</h3><p>${esc(x.desc)}</p><div class="glossary-example"><strong>例如</strong> ${esc(x.example)}</div></article>`).join('')||'<p>没有找到相关术语。</p>'}</div>`;}
function adminPage(){return `${head('管理工具','统一入口：实际账户和共享请直接在各自页面选择对象修改。')}
 <div class="hub-grid"><button type="button" class="hub-card" data-page="users">${icon('users',24)}<strong>账户管理</strong><small>资料、状态、密码与安全删除</small>${icon('arrow-right',17)}</button><button type="button" class="hub-card" data-page="shares">${icon('folder-open',24)}<strong>共享管理</strong><small>网络地址、授权、备注、停止共享</small>${icon('arrow-right',17)}</button><button type="button" class="hub-card" data-page="security">${icon('shield-check',24)}<strong>安全检查</strong><small>主动扫描 Windows 配置风险</small>${icon('arrow-right',17)}</button><button type="button" class="hub-card" data-page="peers">${icon('monitor',24)}<strong>局域网发现</strong><small>扫描可连通的 SMB 设备</small>${icon('arrow-right',17)}</button></div>
 <section class="panel"><div class="panel-title"><h2>${icon('settings',18)} 本机诊断</h2></div><p class="muted">检查读取权限与运行环境。管理操作需要 Windows UAC，后端会重新核验对象身份和受保护属性。</p><div class="inline-actions">${desktopAvailable()?elButton('重新读取 Windows','admin-refresh','btn primary'):badge('浏览器只读演示')}${desktopAvailable()?elButton('运行启动诊断','desktop-diagnostic','btn ghost'):''}</div></section>`;}
function desktopConnectionPage(){
 const fail=state.desktopConnection==='failed';
 return `<div class="pageheading"><div><h1>${fail?'Windows 本机连接失败':'正在加载 Windows 状态'}</h1><p>这是桌面管理程序，不会在连接失败时展示假的用户或共享。</p></div></div><section class="panel" style="max-width:850px"><div class="panel-title"><h2>${icon(fail?'alert':'activity',20)} ${fail?'连接诊断':'读取中'}</h2>${badge(fail?'真实操作已停用':'Windows 后端连接中',fail?'amber':'blue')}</div>${fail?`<div class="callout danger"><strong>Windows 返回的错误：</strong> ${esc(state.lastError||'后端尚未返回有效 Windows 状态。')}</div>`:'<div class="callout">正在从 Windows 获取本地用户、SMB 共享、网络和安全信息。操作按钮仅在状态读取成功后启用。</div>'}<p class="muted">请确认你运行的是 <code>Start-SwitchLAN.cmd</code>，而不是双击 <code>index.html</code>。若反复失败，可运行只读检查脚本 <code>Check-SwitchLAN.cmd</code>，并查看 <code>%TEMP%\SwitchLAN.Desktop.log</code>。</p><div class="inline-actions">${elButton(icon('rotate',16)+' 重新连接 Windows','admin-refresh','btn primary',desktopBusy?'disabled':'')}${elButton('运行本机诊断','desktop-diagnostic','btn ghost',desktopBusy?'disabled':'')}${state.lastError?elButton('复制错误信息','copy-last-error','btn ghost'):''}</div></section>`;
}
function coreBrowserGuide(){
 return `${head('请通过桌面程序打开','此网页不展示虚构的 Windows 用户和共享，也不支持管理操作。')}
 <section class="panel core-empty-panel"><div class="core-empty-icon">${icon('monitor',28)}</div><h2>尚未连接 Windows</h2><p class="muted">请在 Windows 电脑上双击 <code>Start-SwitchLAN.cmd</code>，再从桌面窗口读取真实本地账户和 SMB 共享。</p><p class="muted">你也可以在「设置与诊断」导入一份已脱敏的只读快照用于检查，但无法通过浏览器修改系统。</p>${elButton('查看设置与诊断','go-settings','btn primary')}</section>`;
}
function lanDeviceCard(device){
 const expanded=!!state.lanExpanded[device.ip];
 const title=device.hostname||device.ip;
 const haveSmb=!!device.port445;
 const shareNames=Array.isArray(device.shares)?device.shares:[];
 const pingLabel=device.ping?('Ping '+(Number.isFinite(Number(device.pingMs))?Number(device.pingMs)+'ms':'响应')):'Ping 无响应';
 const uncs=shareNames.map(name=>({name,path:'\\\\'+device.ip+'\\'+name}));
 return `<article class="lan-device-card game-card ${expanded?'expanded':''}" aria-label="设备 ${attr(device.ip)}">
   <div class="lan-device-top"><div class="lan-device-icon ${haveSmb?'smb-on':''}">${icon(haveSmb?'monitor':'wifi',20)}</div>
   <div class="lan-device-info"><strong class="mono">${esc(device.ip)}</strong><small>${esc(device.hostname||'主机名未解析')}</small></div>
   <div class="lan-device-tags">${badge(pingLabel,device.ping?'green':'neutral')}${badge(haveSmb?'TCP 445 可连接':'445 未就绪',haveSmb?'blue':'neutral')}</div>
   <div class="lan-device-actions">${elButton(icon('activity',15)+' 加入雷达','lan-to-radar','btn tiny ghost',`data-ip="${attr(device.ip)}" data-name="${attr(title)}"`)}${elButton(icon('gamepad',15)+' 检测游戏','lan-to-games','btn tiny ghost',`data-ip="${attr(device.ip)}"`)}${elButton(icon('rotate',16),'lan-rescan-one','iconbtn',`data-ip="${attr(device.ip)}" title="仅重测本设备" ${desktopBusy?'disabled':''}`)}
   ${elButton(icon('copy',15),'copy-ip','iconbtn',`data-value="${attr(device.ip)}" title="复制 IP"`)}
   ${elButton((haveSmb&&shareNames.length?`查看共享 (${shareNames.length})`:'诊断详情')+' '+icon(expanded?'chevron-down':'chevron-right',15),'lan-toggle-device','btn ghost',`data-ip="${attr(device.ip)}" aria-expanded="${expanded}"`)}</div></div>
   ${expanded?`<div class="lan-device-details">${haveSmb&&uncs.length?`<div class="lan-share-heading">${icon('info',14)} Windows 公布的共享名称（不是已经授权给你的文件夹）。请先测试读取，再决定是否连接。</div>${uncs.map(u=>{
    const key=device.ip+'|'+u.name,check=state.lanReadChecks[key];
    const checked=!!check,allowed=check?.readable===true,denied=check?.outcome==='denied';
    const permissionLabel=!checked?'读取权限未知':allowed?'当前身份可列目录':denied?'Windows 拒绝列目录':'读取结果未确认';
    const evidenceTime=checked&&check.checkedAt&&!Number.isNaN(Date.parse(check.checkedAt))?new Date(check.checkedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';
    return `<div class="lan-share-row"><span>${icon('folder-open',17)}<span><strong>${esc(u.name)}</strong><small class="mono">${esc(u.path)}</small>
    <span class="lan-access-state ${checked?(allowed?'lan-access-ok':denied?'lan-access-denied':'lan-access-unknown'):'lan-access-unknown'}">${icon(!checked||(!allowed&&!denied)?'circle-help':allowed?'check':'alert',13)} ${permissionLabel}</span>
    ${check?`<small class="lan-verified ${allowed?'':denied?'read-failed':'read-unknown'}">${esc(check.status)}${check.errorCode!=null?' · Windows 错误码 '+esc(check.errorCode):''}${evidenceTime?' · 本次验证 '+esc(evidenceTime):''}</small>`:''}</span></span>
    <div class="lan-share-actions">${elButton(checked?'重新验证':'验证读取','lan-share-check','btn tiny',`data-ip="${attr(device.ip)}" data-share="${attr(u.name)}" ${desktopBusy?'disabled':''}`)}
    ${elButton(allowed?'资源管理器打开':'尝试打开','lan-open-share','btn tiny ghost',`data-ip="${attr(device.ip)}" data-share="${attr(u.name)}" title="调用 Windows 资源管理器尝试连接；可能提示凭据，不能保证访问成功"`)}
    ${elButton(icon('copy',15),'copy-unc','iconbtn',`data-value="${attr(u.path)}" title="复制共享路径"`)}</div></div>`;}).join('')}`:
   `<div class="lan-diagnostic">${icon('info',18)}<div><strong>${haveSmb?'TCP 445 可达，但普通共享未列出':'设备响应不等于开启文件共享'}</strong><p>${esc(device.status||'共享名称未列出。可能没有共享，或远端不允许枚举。')}</p><p class="muted small">可点击“单独重测”重新检查，或联系设备所有者确认 SMB、网络配置及授权。</p></div></div>`}
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
 const elapsed=state.lanLastFinished?new Date(state.lanLastFinished).toLocaleString('zh-CN'):'尚未扫描';
 return `<div class="lan-workbench">
   <div class="lan-workbench-heading"><h1>局域网发现</h1><details class="lan-help"><summary aria-label="扫描规则">${icon('circle-help',17)} 扫描规则</summary><div class="lan-help-card"><b>只在你有权管理的局域网中使用</b><p>ICMP Ping + TCP 445；SMB 共享名枚举取决于系统授权。不会尝试密码或更改远端文件。</p><p>TCP 445 从选定的本地 IP 发起，Ping 仍遵循 Windows 路由表；设备禁 Ping 时可能漏报。</p><p>测试读取仅尝试枚举目录；不会推断实际写入、删除权限。</p></div></details></div>
   <div class="lan-console"><label class="lan-interface-control"><span>扫描网络 / 网卡</span><select id="lanInterface" ${scanning?'disabled':''} aria-label="选择扫描网卡">${availableLanInterfaces().map(n=>`<option value="${attr(n.ip)}" ${n.ip===selected?.ip?'selected':''}>${esc(n.name)} · ${esc(n.ip)}/${esc(n.prefix)} ${n.virtual?'(虚拟/VPN)':'(物理)'}</option>`).join('')||'<option>暂无活动私有 IPv4 网卡</option>'}</select><small>${selected?`${esc(selected.speed||'速度未知')} · ${selected.virtual?'虚拟网卡/VPN':'物理网卡'}`:'请连接网络并刷新本机状态'}</small></label>
   <div class="lan-compact-stat" role="button" tabindex="0" data-action="lan-filter-all" title="显示全部响应设备"><small>响应设备</small><strong>${devices.length}</strong></div>
   <div class="lan-compact-stat ${smbDevices.length?'available':''}" role="button" tabindex="0" data-action="lan-filter-smb" title="只显示 TCP 445 可连接设备"><small>SMB 设备</small><strong>${smbDevices.length}</strong></div>
   <div class="lan-run-area">${scanning?elButton(icon('x',16)+' 停止扫描','lan-cancel','btn lan-scan-stop'):
     elButton(icon('search',17)+' '+(d?'重新扫描':'开始扫描'),'lan-scan','btn primary lan-scan-main',lanScanAllowed()?'':'disabled')}
   <small title="${esc(elapsed)}">${scanning?`已探测 ${state.lanProgress.done}/${state.lanProgress.total}`:d&&!stale?`上次 ${esc(elapsed)}`:stale?'已切换网卡，尚未扫描':'尚未扫描'}</small></div></div>
   <div class="lan-secondary-controls"><div><span class="mono">${esc(selected?.ip||'未获得 IP')}</span>${selected?elButton(icon('copy',14),'copy-local-ip','iconbtn',`title="复制扫描源 IP"`):''}<span class="lan-muted-prefix">${esc(lanSubnet(selected?.ip))}</span></div>
   <details class="lan-range-settings"><summary>${icon('settings',15)} 限定范围</summary><div class="lan-range-fields"><span>扫描主机号</span><input id="lanStartHost" type="number" min="1" max="254" value="${state.lanStartHost}" ${scanning?'disabled':''}/><span>至</span><input id="lanEndHost" type="number" min="1" max="254" value="${state.lanEndHost}" ${scanning?'disabled':''}/><small>限定当前网段最后一段，1–254</small></div></details></div>
   ${scanning?`<div class="lan-progress" role="status"><div class="lan-progress-bar" style="width:${Math.min(100,Math.round(state.lanProgress.done/state.lanProgress.total*100))}%"></div></div>`:''}
   ${stale?'<div class="lan-inline-note">已切换扫描网卡。旧结果属于另一网段，点击“开始扫描”获取当前网段设备。</div>':''}
   <div class="lan-results-heading"><div class="lan-filters"><button type="button" class="lan-filter ${state.lanFilter==='all'?'active':''}" data-action="lan-filter-all">全部 (${devices.length})</button><button type="button" class="lan-filter ${state.lanFilter==='smb'?'active':''}" data-action="lan-filter-smb">TCP 445 (${smbDevices.length})</button><button type="button" class="lan-filter ${state.lanFilter==='readable'?'active':''}" data-action="lan-filter-readable">已验证可读 (${readableDevices.length})</button></div><input id="lanSearch" type="search" placeholder="搜索 IP、主机名或共享" value="${attr(state.lanSearch)}" aria-label="搜索设备"/></div>
   <div class="lan-view-switch" role="group" aria-label="扫描结果布局">${elButton(icon('monitor',15)+' 设备地图','lan-view-map',`btn tiny ${state.lanView==='map'?'is-selected':''}`,`aria-pressed="${state.lanView==='map'}"`)}${elButton(icon('file',15)+' 设备列表','lan-view-list',`btn tiny ${state.lanView==='list'?'is-selected':''}`,`aria-pressed="${state.lanView==='list'}"`)}</div>
   ${state.lanView==='map'?lanMap(selected,filtered,stale):''}
   <div class="lan-result-list" ${state.lanView==='map'?'id="lan-list-details"':''}>${filtered.length?filtered.map(lanDeviceCard).join(''):
     `<div class="lan-empty">${icon('search',29)}<strong>${!d||stale?'还没有当前网卡的扫描结果':devices.length?'没有匹配的设备':'未发现响应设备'}</strong><span>${!d||stale?'选择网卡，然后点击开始扫描。':'可调整筛选条件，或检查对方设备和防火墙设置。'}</span>${!scanning&&lanScanAllowed()?elButton(icon('search',16)+' 开始扫描','lan-scan-empty','btn primary'):''}</div>`}</div>
   ${!live()?'<div class="lan-inline-note">请运行 Windows 桌面版连接本机后扫描。</div>':''}
   </div>`;
}
// Core 1.4: evidence-based analyzer. A name match is only a clue, never a token/EffectiveAccess calculation.
function permissionIdentityMatches(identity,name,computer){
 const raw=String(identity||'').trim().toLowerCase(),n=String(name||'').trim().toLowerCase(),pc=String(computer||'').trim().toLowerCase();
 return !!raw&&!!n&&(raw===n||raw===pc+'\\'+n||raw==='.\\'+n);
}
function analysisRuleList(entries,kind,subject,computer){
 if(entries===null)return `<div class="analysis-uncertain">${icon('alert',15)} Windows 未能读取${kind}授权。不能据此判断权限。</div>`;
 const rows=entries.map(a=>{
  const identity=kind==='SMB'?a.account:a.identity;
  const exact=permissionIdentityMatches(identity,subject.name,computer)||(!!subject.sid&&String(identity||'').toLowerCase()===String(subject.sid).toLowerCase());
  const group=(subject.groups||[]).some(g=>permissionIdentityMatches(identity,g,computer)||permissionIdentityMatches(identity,g,'BUILTIN'));
  const universal=/^(everyone|everyone\s*\(.*\)|s-1-1-0|authenticated users|nt authority\\authenticated users)$/i.test(String(identity||'').trim());
  return `<div class="analysis-rule ${exact?'analysis-exact':group||universal?'analysis-candidate':''}"><div><strong>${esc(identity||'未知主体')}</strong><small>${exact?'名称/SID 匹配所选账户':group?'名称匹配已读取的本地组':universal?'广泛身份组，需按认证上下文判断':'其他授权主体'} · ${kind==='SMB'?'共享层':a.inherited?'NTFS 继承规则':'NTFS 显式规则'}</small></div><div class="analysis-rule-right">${badge(a.accessControlType||a.type||'未知',/deny/i.test(a.accessControlType||a.type||'')?'amber':'neutral')}<span>${esc(a.accessRight||a.rights||'未知')}</span></div></div>`;
 }).join('');
 return rows||'<div class="analysis-uncertain">Windows 未返回可展示的授权项；不代表没有授权。</div>';
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
 if(!snap)return `${head('权限分析','需要先读取 Windows 共享、NTFS 和账户信息。')}<div class="panel">请先连接 Windows 桌面程序，或导入只读快照。</div>`;
 const smb=share?.permissionsReadable===false?null:(share?.permissions||[]),ntfs=share?.ntfsReadable===true&&share.ntfs?share.ntfs.access:null;
 const ntfsPartial=!!share?.ntfs?.truncated;
 const groupStatusIncomplete=(snap.warnings||[]).some(w=>/组成员|本地组|所属组/.test(w));
 const accountKnown=!!(user&&user.groupsReadable!==false&&!groupStatusIncomplete);
 const ntfsClue=!!(share&&user&&accountKnown&&ntfs!==null&&!ntfsPartial&&analysisMissingVisibleNtfsIdentity(ntfs,user,snap.computerName));
 return `<div class="core-management-page">${head('权限分析','把账户、SMB 共享授权和 NTFS 文件权限放在一起核对；不伪造“最终有效权限”。')}
 <section class="panel analysis-picker"><div class="analysis-pick-grid"><label>选择 Windows 共享<select id="analysisShare">${shares.map(s=>`<option value="${attr(s.name)}" ${s===share?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>选择本地账户<select id="analysisUser">${users.map(u=>`<option value="${attr(u.sid)}" ${u===user?'selected':''}>${esc(u.name)}${systemAccount(u)?' (内置)':''}</option>`).join('')}</select></label></div>
 ${share&&user?`<div class="analysis-context"><div><small>正在分析</small><strong>${icon('users',16)} ${esc(user.name)} ${icon('arrow-right',15)} ${icon('folder-open',16)} ${esc(share.name)}</strong><span class="mono">${esc(share.path||'路径未知')}</span></div>${badge('证据对照 · 非有效访问判定','blue')}</div>`:''}
 </section>
 ${!share||!user?'<section class="panel">没有足够的共享或账户信息可供分析。</section>':`
 <div class="analysis-summary"><div class="panel"><small>SMB 直接授权</small><strong>${smb===null?'读取失败':smb.length+' 条'}</strong><span>来自 Get-SmbShareAccess</span></div><div class="panel"><small>NTFS ACL</small><strong>${ntfs===null?'读取失败':ntfsPartial?'前 '+ntfs.length+' 条':ntfs.length+' 条'}</strong><span>${ntfsPartial?'ACL 已截断，不可视为完整':'来自 Get-Acl，最多采集 40 条'}</span></div><div class="panel"><small>本地组成员线索</small><strong>${accountKnown?user.groups.length+' 个':'未知'}</strong><span>不包含完整嵌套/域组 token</span></div></div>
 ${ntfsClue?`<div class="analysis-clue">${icon('info',18)}<div><strong>NTFS 排查线索：未发现与当前账户及已知组直接匹配的可见 ACE</strong><p>这不代表 Windows 已经拒绝访问。实际访问还受域组、嵌套组、身份令牌、特殊主体与继承规则影响；请以目标身份进行访问验证。</p></div></div>`:''}
 <div class="analysis-columns"><section class="panel"><div class="panel-title"><h2>${icon('shield-check',17)} SMB 共享层</h2>${badge(smb===null?'未知':'Windows 数据','blue')}</div>${analysisRuleList(smb,'SMB',user,snap.computerName)}</section>
 <section class="panel"><div class="panel-title"><h2>${icon('folder-open',17)} NTFS 文件系统</h2>${badge(ntfs===null?'不完整':'Windows 数据','blue')}</div>${share.ntfs?`<div class="analysis-owner">所有者：${esc(share.ntfs.owner||'未知')} · ${share.ntfs.inheritanceProtected?'已禁止继承':'允许继承'}</div>`:''}${ntfsPartial?'<div class="analysis-uncertain">规则已截断；下面仅展示已采集部分，不能作为完整的 NTFS 授权清单。</div>':''}${analysisRuleList(ntfs,'NTFS',user,snap.computerName)}</section></div>
 <section class="panel analysis-explanation"><h3>${icon('circle-help',18)} 为什么不直接给出“可读/可写”？</h3><p>上面高亮的是与所选账户名称、SID 或已知本地组同名的规则，仅作为排查线索。Windows 访问检查还依赖当前登录令牌、组嵌套、域身份、Allow/Deny 顺序、NTFS 继承、共享层限制等。名字匹配不等于最终获得权限；NTFS 列表被截断或读取失败时尤其不能下结论。</p><p><b>建议：</b>先核对两层 ACL，再用目标账户从另一台受授权的 Windows 电脑执行真实访问测试。不要将“可以枚举共享名称”当成“可以读取文件”。</p><div class="core-action-toolbar">${elButton('进入共享详情','analysis-go-share','btn primary',`data-share="${attr(share.name)}"`)}${live()?elButton(icon('rotate',15)+' 刷新 Windows 数据','admin-refresh','btn ghost'):''}</div></section>`}</div>`;
}
function connectionsPage(){
 const data=state.connections,ready=!!data&&data.sessionsReadable===true,canFiles=!!data&&data.filesReadable===true;
 const sessions=ready?data.sessions:[],files=canFiles?data.files:[];
 return `<div class="core-management-page">${head('SMB 当前连接','查看访问本机 SMB 服务器的会话及已打开文件；只读，不会中断任何连接。',live()?elButton(icon('rotate',16)+' 立即刷新','connections-refresh','btn primary',desktopBusy?'disabled':''):badge('请连接 Windows','neutral'))}
 <div class="callout">${icon('info',16)} 这里展示的是<strong>别人访问本机 SMB 服务</strong>，不是本机访问别人共享的出站连接。数据只在你主动刷新时采集，不进行后台监控。读取会话可能要求管理员权限。</div>
 ${state.connectionsError?`<div class="callout amber">${icon('alert',16)} ${esc(state.connectionsError)}</div>`:''}
 ${!data?`<section class="panel"><div class="connections-empty">${icon('activity',28)}<strong>尚未取得实时会话清单</strong><p>点击“立即刷新”读取本机 Get-SmbSession / Get-SmbOpenFile。</p>${live()?elButton('读取 SMB 会话','connections-refresh','btn primary',desktopBusy?'disabled':''):''}</div></section>`:
 `<div class="analysis-summary"><div class="panel"><small>SMB 会话</small><strong>${ready?String(sessions.length):'未知'}</strong><span>${ready?'本次读取':'未获读取权限'}</span></div><div class="panel"><small>打开文件</small><strong>${canFiles?String(files.length):'未知'}</strong><span>${canFiles?'本次读取':'未获读取权限'}</span></div><div class="panel"><small>采集时间</small><strong class="connections-time">${esc(data.capturedAt||'未知')}</strong><span>手动快照，不自动更新</span></div></div>
 ${(data.warnings||[]).map(w=>`<p class="analysis-uncertain">${icon('alert',14)} ${esc(w)}</p>`).join('')}
 ${(data.sessionsTruncated||data.filesTruncated)?'<div class="callout amber">结果超过 200 条，清单仅显示前 200 项；以上数量不是完整总数。</div>':''}
 <section class="panel"><div class="panel-title"><h2>${icon('monitor',18)} 当前入站 SMB 会话</h2>${badge(ready?'已读取':'状态未知',ready?'green':'amber')}</div>
 ${ready?(sessions.length?`<div class="connection-list">${sessions.map(s=>`<article class="connection-row"><span class="connection-avatar">${icon('monitor',18)}</span><div><strong>${esc(s.client||'未知客户端')}</strong><small>${esc(s.username||'身份未知')} · 协议 ${esc(s.dialect||'未知')} · Session ID ${esc(s.sessionId||'未知')}</small></div><div class="connection-metrics"><b>${Number(s.numOpens)||0}</b><small>报告打开项</small></div></article>`).join('')}</div>`:'<div class="connections-empty"><strong>Windows 本次未报告活动 SMB 会话</strong><p>这不等于过去没有连接，也不证明没有正在进行的其他网络访问。</p></div>'):'<div class="analysis-uncertain">无法读取 SMB 会话；不能将“未知”显示为“0 台”。</div>'}</section>
 <section class="panel"><div class="panel-title"><h2>${icon('file',18)} 远端客户端打开的文件</h2>${badge(canFiles?'已读取':'状态未知',canFiles?'green':'amber')}</div>
 ${canFiles?(files.length?`<div class="connection-list">${files.map(f=>`<article class="connection-row"><span class="connection-avatar">${icon('file',17)}</span><div><strong>${esc(f.shareRelativePath||f.path||'路径未知')}</strong><small>${esc(f.client||'未知客户端')} · ${esc(f.username||'身份未知')}</small><small>本机路径：${esc(f.path||'未知')} · Session ${esc(f.sessionId||'未知')}</small></div></article>`).join('')}</div>`:'<div class="connections-empty">当前无 SMB 打开文件记录。</div>'):'<div class="analysis-uncertain">无法读取远程打开文件列表。</div>'}</section>`}</div>`;
}
function lanMap(selected,devices,stale){
 if(!state.lanResults||stale)return '';
 const max=devices.slice(0,64);
 return `<section class="panel lan-map-panel" aria-label="本次 LAN 扫描设备示意图"><div class="panel-title"><h2>${icon('monitor',18)} 设备地图 · 探测关系</h2>${badge('非真实物理拓扑','neutral')}</div>
 <div class="lan-map-layout"><div class="lan-map-origin"><div class="lan-map-symbol">${icon('monitor',23)}</div><strong>当前电脑</strong><small class="mono">${esc(selected?.ip||state.lanResults.localIp||'未知')}</small><span>${esc(selected?.name||'扫描源网卡')}</span></div><div class="lan-map-link" aria-hidden="true"></div><div class="lan-map-targets">${max.map(d=>{
  const open=(d.shares||[]).some(name=>state.lanReadChecks[d.ip+'|'+name]?.readable===true);
  return `<button type="button" class="lan-map-node ${d.port445?'lan-map-smb':''} ${open?'lan-map-readable':''}" data-action="lan-map-focus" data-ip="${attr(d.ip)}" title="点击查看设备详情" aria-label="查看设备 ${attr(d.ip)}"><span class="lan-map-symbol">${icon('monitor',19)}</span><strong class="mono">${esc(d.ip)}</strong><small>${esc(d.hostname||'未解析主机名')}</small><span>${open?'可列目录':d.port445?'445 可连接':'Ping 响应'}</span></button>`;
 }).join('')||'<div class="lan-map-none">本次扫描没有发现响应设备。</div>'}</div></div>
 <p class="muted small">连线仅表示扫描源与本次探测到的地址之间的观察关系，<b>不是</b>交换机拓扑、物理连接或设备互信。${devices.length>64?'地图最多展示 64 台，请使用列表查看全部。':''}</p></section>`;
}
function settingsPage(){
 const snap=real(),history=state.coreActivity||[],warnings=snap?.warnings||[];
 return `<div class="core-management-page">${head('设置与诊断','主题偏好与 Windows 连接检查。',desktopAvailable()?elButton(icon('rotate',16)+' 重载本机状态','admin-refresh','btn primary',desktopBusy?'disabled':''):'')}
 <div class="core-settings-grid core-settings-focused"><section class="panel"><div class="panel-title"><h2>${icon('settings',18)} 外观与体验</h2></div>
 <div class="core-setting-row"><div><strong>外观主题</strong><small>仅调整 SwitchLAN 界面</small></div>${elButton(state.theme==='light'?'切换到深色':'切换到浅色','theme','btn ghost')}</div>
 <div class="core-setting-row"><div><strong>液态玻璃效果</strong><small>高性能电脑可选择完整；低配可关闭</small></div><div class="core-glass-choice" role="group" aria-label="玻璃效果">${[['off','关闭'],['subtle','轻盈'],['full','完整']].map(([mode,title])=>elButton(title,'glass-mode',`btn tiny ${state.glassMode===mode?'is-selected':''}`,`data-mode="${mode}" aria-pressed="${state.glassMode===mode}"`)).join('')}</div></div></section>
 <section class="panel"><div class="panel-title"><h2>${icon('monitor',18)} Windows 连接状态</h2>${badge(live()?'已连接':snap?'只读快照':'未连接',live()?'green':'amber')}</div>
 ${detailLine('状态采集',snap?.capturedAt||'未获取')}${detailLine('本地账户',snap?String((snap.users||[]).filter(u=>!systemAccount(u)).length):'—')}${detailLine('普通共享',snap?String((snap.shares||[]).filter(s=>editableShare(s)).length):'—')}
 <div class="core-action-toolbar">${desktopAvailable()?elButton('运行环境自检','desktop-diagnostic','btn ghost',desktopBusy?'disabled':''):''}${desktopAvailable()&&state.desktopReportAvailable?elButton('打开诊断报告','desktop-open-report','btn ghost'):''}</div></section></div>
 <details class="core-settings-advanced"><summary>${icon('settings',17)} 高级工具与诊断信息 <span>展开</span></summary><div class="core-settings-advanced-body"><section class="panel"><h3>状态快照</h3><p class="muted small">含账户名称、SID 与共享路径；请勿公开原始文件。</p><div class="core-action-toolbar">${desktopAvailable()?elButton('导出本机快照','desktop-export','btn ghost'):''}${elButton('导入只读快照','import-snapshot','btn ghost')}</div></section>
 <section class="panel"><h3>活动网卡</h3><div class="diagnostic-nics">${availableLanInterfaces().map(n=>`<div><div><strong>${esc(n.name)}</strong><small>${n.virtual?'虚拟 / VPN':'物理网卡'} · ${esc(n.speed)}</small></div><code>${esc(n.ip)}/${esc(n.prefix)}</code></div>`).join('')||'<p>没有可用的私有 IPv4 网卡。</p>'}</div></section>
 <section class="panel"><h3>本次操作记录</h3><p class="muted small">仅本次会话内存记录，并非 Windows 审计日志。</p><div class="core-activity">${history.map(h=>`<div class="core-activity-row"><span>${icon(h.ok?'check':'alert',16)} ${esc(h.label)}</span><span>${badge(h.ok?'后端已返回':'失败',h.ok?'green':'amber')} <time>${esc(h.at)}</time></span></div>`).join('')||'<p class="muted">尚未进行管理操作。</p>'}</div></section>
 ${warnings.length?`<section class="panel"><h3>状态读取警告</h3>${warnings.slice(0,12).map(w=>`<p class="muted small">${icon('info',14)} ${esc(w)}</p>`).join('')}</section>`:''}</div></details></div>`;
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
 const label=verified?'游戏协议已验证':broadcast?'收到 LAN 广播':'仅 TCP 可连接';
 const badgeType=verified?'green':broadcast?'blue':'neutral';
 const addr=String(item.ip||'')+':'+String(item.port||'');
 return `<article class="game-server-card">
  <div class="game-server-top"><div class="game-server-mark">${icon(item.game==='Minecraft'?'gamepad':'monitor',22)}</div>
   <div class="game-server-identity"><strong>${esc(item.title|| (verified?'已发现游戏服务器':item.game==='Minecraft'?'Minecraft 候选端点':item.game==='Terraria'?'Terraria 常用端口（待确认）':'自定义 TCP 端点'))}</strong><small>${esc(item.game||'游戏')} · ${esc(item.edition||'')} · ${esc(item.discovery||'')}</small></div>${badge(label,badgeType)}</div>
  ${item.version||item.online!==null&&item.online!==undefined?`<div class="game-server-stats">${item.version?`<div><span>游戏版本</span><strong>${esc(item.version)}</strong></div>`:''}${item.online!==null&&item.online!==undefined?`<div><span>在线玩家</span><strong>${esc(item.online)} / ${esc(item.maxPlayers??'?')}</strong></div>`:''}</div>`:''}
  <div class="game-server-address"><code title="${attr(addr)}">${esc(addr)}</code>${elButton(icon('copy',16)+' 复制地址','game-copy','btn primary',`data-address="${attr(addr)}"`)}${elButton(icon('activity',16)+' 监控','radar-import-game','btn ghost',`data-ip="${attr(item.ip)}" data-port="${attr(item.port)}" data-name="${attr(item.game||'游戏服务器')}"`)}</div>
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
 if(!valid.some(v=>v!==null))return '<span class="radar-mini-empty" aria-label="暂无有效 RTT">—</span>';
 const top=Math.max(12,...valid.filter(v=>v!==null))*1.2;
 const coords=valid.map((v,i)=>v===null?null:[2+i*66/Math.max(1,hist.length-1),16-v/top*13]);
 const chunks=[];let run=[];
 for(const p of [...coords,null]){if(p)run.push(p);else if(run.length){chunks.push(run);run=[];}}
 const paths=chunks.map(parts=>`<path d="${parts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ')}"/>`).join('');
 const losses=coords.map((p,i)=>p===null?`<line x1="${(2+i*66/Math.max(1,hist.length-1)).toFixed(1)}" y1="14" x2="${(2+i*66/Math.max(1,hist.length-1)).toFixed(1)}" y2="18" class="mini-loss"/>`:'').join('');
 return `<svg class="radar-spark" viewBox="0 0 70 20" preserveAspectRatio="none" role="img" aria-label="最近 ${hist.length} 次监测的迷你 RTT 曲线">${paths}${losses}</svg>`;
}
function radarCurve(){
 return `<div class="radar-chart-wrap" id="radarChartWrap">
   <div class="radar-chart-toolbar"><div class="radar-legend"><span><i class="radar-key-live"></i> ICMP RTT</span><span><i class="radar-key-loss"></i> 未回复 / 未确认</span><small id="radarExtrema">等待采样</small></div>
    <div class="radar-chart-actions"><button class="radar-optics-switch liquid-button" type="button" data-action="radar-glass" title="切换液态折射级别（使用全局玻璃设置）" aria-label="液态玻璃效果：${state.glassMode==='full'?'完整':state.glassMode==='subtle'?'轻盈':'关闭'}，点击切换"><span class="radar-optics-gem" aria-hidden="true"></span><span>光学 ${state.glassMode==='full'?'完整':state.glassMode==='subtle'?'轻盈':'关闭'}</span></button>
    <div class="radar-window-tabs" role="group" aria-label="显示时间范围">${[60,120,300].map(s=>`<button type="button" class="radar-window-btn ${state.radarWindowSec===s?'active':''}" data-action="radar-window" data-seconds="${s}" aria-pressed="${state.radarWindowSec===s}">${s<60?s+'秒':s/60+'分钟'}</button>`).join('')}</div></div></div>
   <div class="radar-chart-stage" id="radarChartStage" aria-label="ICMP 实测延迟曲线图，可悬停查看每次探测">
    <!-- Optical layers sit BEHIND all numeric marks and chart paths. Never distort actual observations. -->
    <div class="radar-liquid-atmosphere" aria-hidden="true"></div>
    <div class="radar-liquid-refraction" aria-hidden="true"></div>
    <div class="radar-liquid-signal" id="radarGlassSignal" aria-hidden="true"></div>
    <svg class="radar-chart" id="radarChartSvg" viewBox="0 0 ${RADAR_W} ${RADAR_H}" preserveAspectRatio="none" role="img" aria-label="最近一段时间的真实 ICMP 往返时延；未收到响应以中断及竖带表示">
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
    <div class="radar-chart-empty-state" id="radarChartEmpty"><span class="radar-empty-symbol">${icon('activity',23)}</span><strong>等待真实采样</strong><span>添加目标并点击「开始实时监控」后显示 RTT 曲线</span></div>
   </div>
   <div class="radar-chart-caption"><span id="radarChartPeriod">尚无采样</span><span id="radarChartScale">纵轴 —</span></div>
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
   const tickTime=new Date(end-(1-f)*state.radarWindowSec*1000).toLocaleTimeString('zh-CN',{hour12:false});
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
 root.querySelector('#radarExtrema').textContent=rtts.length?`最低 ${Math.min(...rtts).toFixed(1)} ms · 最高 ${Math.max(...rtts).toFixed(1)} ms`:'暂无有效 RTT';
 root.querySelector('#radarChartPeriod').textContent=points.length?`${state.radarWindowSec/60} 分钟窗口 · ${points.length} 次实测 · 右侧为最新`:'等待第一批 Windows 采样';
 root.querySelector('#radarChartScale').textContent=`纵轴 0–${yMax} ms`;
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
 tip.querySelector('.radar-tt-time').textContent=new Date(radarTimeMs(closest)).toLocaleTimeString('zh-CN',{hour12:false});
 tip.querySelector('.radar-tt-value').textContent=closest.y===null?(closest.icmp==='timeout'?'ICMP 超时':'ICMP 未确认'):closest.icmpMs.toFixed(1)+' ms';
 const target=radarCurrentTarget();tip.querySelector('.radar-tt-tcp').textContent=target?.port?(closest.tcp==='ok'?`TCP ${target.port} 可连接`:closest.tcp==='timeout'?`TCP ${target.port} 超时`:closest.tcp==='refused'?`TCP ${target.port} 被拒绝`:`TCP ${target.port} 未确认`):'仅 ICMP 探测';
 tip.hidden=false;
 tip.style.left=Math.min(bounds.width-158,Math.max(8,closest.x/RADAR_W*bounds.width-70))+'px';
}
function radarHideTooltip(){const tip=root.querySelector('#radarTooltip'),g=root.querySelector('#radarPointer');if(tip)tip.hidden=true;if(g)g.setAttribute('visibility','hidden');}
function radarStatus(target,history){
 const last=history[history.length-1];
 if(!last)return badge('等待采样');
 if(last.icmp==='ok'&&target.port>0&&last.tcp!=='ok')return badge('主机响应 / 端口未确认','amber');
 if(last.icmp==='ok'||last.tcp==='ok')return badge('收到响应','green');
 return badge('连通性未确认','amber');
}
function radarLiveView(){
 const t=state.radarTargets.find(x=>x.id===state.radarSelected)||state.radarTargets[0];
 const hist=t?(state.radarSamples[t.id]||[]):[];
 const latest=hist[hist.length-1];const metrics=radarMetrics(hist);
 const traffic=state.radarLast?.traffic;
 return `<div class="radar-monitor-grid">
  <section class="radar-detail-panel">
   <div class="radar-panel-title"><div><strong>${t?esc(t.name):'选择一个监测目标'}</strong><small>${t?esc(t.ip)+(t.port?':'+t.port:'')+' · '+(t.port?'ICMP + TCP':'仅 ICMP'):'最多添加 8 台电脑，也可以只监测当前网卡流量'}</small></div>${t?radarStatus(t,hist):badge('未选择')}</div>
   <div class="radar-stat-grid">
    <div><strong>${metrics.average===null?'—':metrics.average.toFixed(1)+' ms'}</strong><small>ICMP 平均时延</small></div>
    <div><strong>${metrics.loss===null?'—':metrics.loss.toFixed(0)+'%'}</strong><small>ICMP 未回复率</small></div>
    <div><strong>${metrics.jitter===null?'—':metrics.jitter.toFixed(1)+' ms'}</strong><small>RTT 波动（差值均值）</small></div>
   </div>
   ${radarCurve()}
   <div class="radar-protocol-row"><span>ICMP：${latest?esc(latest.icmp==='ok'?'收到响应':latest.icmp==='timeout'?'超时 / 可能被过滤':'未能确认'):'尚未检测'}</span><span>${t?.port?`TCP ${t.port}：${latest?esc(latest.tcp==='ok'?'可连接（'+latest.tcpMs+'ms）':latest.tcp==='refused'?'连接被拒绝':latest.tcp==='timeout'?'连接超时':'未能确认'):'尚未检测'}`:'未设置 TCP 端口'}</span></div>
   <p class="radar-footnote">ICMP 无回复不等于设备离线；TCP 可连接不等于游戏能正常加入。图表是本机实际采样，不代表游戏内 Ping。</p>
  </section>
  <section class="radar-side-panel">
   <h3>${icon('activity',17)} 本机网卡实时流量</h3><small>${esc(traffic?.adapterName||selectedLanInterface()?.name||'等待网卡采集')}</small>
   <div class="radar-traffic-row"><div><span>下载 / 接收</span><strong>${radarFormatRate(traffic?.receiveBps)}</strong></div><div><span>上传 / 发送</span><strong>${radarFormatRate(traffic?.sendBps)}</strong></div></div>
   <div class="radar-traffic-visual"><div class="radar-traffic-down" style="width:${Math.min(100,Math.max(0,(traffic?.receiveBps||0)/1250000*100)).toFixed(1)}%"></div></div>
   <div class="radar-traffic-visual"><div class="radar-traffic-up" style="width:${Math.min(100,Math.max(0,(traffic?.sendBps||0)/1250000*100)).toFixed(1)}%"></div></div>
   <p class="radar-footnote">速率来自选定网卡的累计字节差分；并非单个游戏或程序的流量。第一次采样显示 —。</p>
   <h3>最近状态变化</h3>
   <div class="radar-events">${state.radarEvents.slice(0,5).map(e=>`<div><span>${esc(e.id.split('@')[0])} · ${esc(new Date(e.time).toLocaleTimeString('zh-CN'))}</span><small>${esc(e.message)}</small></div>`).join('')||'<div class="radar-event-empty">暂无可记录的状态变化</div>'}</div>
  </section>
 </div>`;
}
function radarPage(){
 const nic=selectedLanInterface();const running=state.radarRunning;
 return `<div class="radar-workbench">
  <div class="game-heading"><div><span class="core-eyebrow">NETWORK / HEALTH MONITOR</span><h1>${icon('activity',28)} 实时网络雷达</h1><p>同时观察普通局域网设备、游戏端口与本机网卡流量。所有数据来自 Windows 实际探测。</p></div>${badge('只读 · 不修改网络配置')}</div>
  <div class="radar-topbar"><div><small>选定网卡</small><strong>${esc(nic?.name||'未获取活动网卡')} · ${esc(nic?.ip||'—')}</strong></div><label>采样间隔 <select id="radarInterval" ${running?'disabled':''}><option value="1000" ${state.radarInterval===1000?'selected':''}>1 秒</option><option value="2000" ${state.radarInterval===2000?'selected':''}>2 秒</option><option value="5000" ${state.radarInterval===5000?'selected':''}>5 秒</option></select></label>${running?elButton(icon('x',16)+' 停止监控','radar-stop','btn ghost'):elButton(icon('activity',16)+' 开始实时监控','radar-start','btn primary',live()&&nic?'':'disabled')}</div>
  ${!live()?`<div class="callout amber">${icon('info',16)} 需要 Windows 实机连接后才能采样；此页面不生成模拟延迟或流量。</div>`:''}
  ${state.radarError?`<div class="callout amber">${esc(state.radarError)}</div>`:''}
  <div class="radar-layout"><section class="radar-targets panel"><div class="panel-title"><h2>监测目标</h2>${badge(`${state.radarTargets.length}/8`)}</div>
  <div class="radar-add-controls"><input id="radarName" placeholder="备注，如 好友电脑" maxlength="60" aria-label="目标备注"><input id="radarIp" placeholder="IPv4，如 192.168.10.20" inputmode="decimal" aria-label="目标 IP"><input id="radarPort" type="number" min="0" max="65535" placeholder="端口（可空）" aria-label="可选 TCP 端口"><div class="radar-presets" aria-label="探测端口预设">${[ ['ICMP',0],['MC 25565',25565],['SMB 445',445]].map(([name,port])=>elButton(name,'radar-port-preset','btn tiny ghost',`data-port="${port}"`)).join('')}</div><span class="radar-port-hint">留空 = 仅 Ping；TCP 端口检测与 ICMP 独立展示</span>${elButton(icon('plus',16)+' 添加目标','radar-add','btn ghost',running?'disabled':'')}</div>
  ${state.radarTargets.map(t=>`<div class="radar-target-row ${state.radarSelected===t.id?'selected':''}" data-action="radar-select" data-id="${attr(t.id)}"><div class="radar-target-symbol">${icon(t.port?'gamepad':'monitor',20)}</div><div class="radar-target-info"><strong>${esc(t.name)}</strong><small>${esc(t.ip)}${t.port?':'+t.port+' · TCP':' · ICMP'}</small><span class="radar-mini-slot">${radarSparkline(state.radarSamples[t.id]||[])}</span></div>${radarStatus(t,state.radarSamples[t.id]||[])}${elButton(icon('x',15),'radar-remove','iconbtn',`data-id="${attr(t.id)}" ${running?'disabled':''}`)}</div>`).join('')||'<div class="radar-empty-target">暂无目标。添加一个 IP，或从下方扫描结果选取。</div>'}
  ${state.lanResults?.devices?.length?`<details class="radar-import"><summary>从已发现设备添加</summary>${state.lanResults.devices.slice(0,30).map(d=>`<div><code>${esc(d.ip)}</code>${elButton('监控','radar-import-lan','btn tiny',`data-ip="${attr(d.ip)}" ${running?'disabled':''}`)}</div>`).join('')}</details>`:''}
  </section><div id="radarLiveView">${radarLiveView()}</div></div>
  <section class="radar-listeners panel"><div class="panel-title"><div><h2>${icon('monitor',18)} 本机开服与监听端口</h2><p class="radar-footnote">按 Windows 监听端口对应的 PID / 进程名显示，不将 javaw 等普通进程直接认定为 Minecraft。</p></div>${elButton(icon('rotate',15)+' 读取监听端口','radar-listeners','btn ghost',live()&&!desktopBusy?'':'disabled')}</div>
  ${state.radarPortsError?`<div class="callout amber">${esc(state.radarPortsError)}</div>`:''}
  ${state.radarPorts?(!state.radarPorts.readable?'<div class="callout amber">Windows 未能读取监听进程；无法判断是否有开服进程。</div>':`<div class="radar-listener-list"><div class="radar-listener-head"><span>监听地址 / 端口</span><span>进程（PID）</span><span>类别</span></div>${state.radarPorts.listeners.map(x=>`<div class="radar-listener-row"><code>${esc(x.ip)}:${esc(x.port)}</code><span>${esc(x.process||'进程名未知')} (${esc(x.pid)})</span><span>${esc(x.category==='windows-system'?'Windows 系统':x.category==='game-candidate'?'疑似游戏专用进程':'应用 / 未确认')}</span></div>`).join('')||'<div class="radar-event-empty">Windows 未报告 TCP 监听套接字</div>'}</div>${state.radarPorts.truncated?'<p class="radar-footnote">结果超过 250 条，仅显示前 250 条。</p>':''}`):'<div class="radar-empty-target">按需读取当前本机正在监听的 TCP 端口和所属进程。不会修改防火墙，也不会开放新端口。</div>'}
  </section>
  <p class="game-disclaimer">网络雷达默认仅监控你明确添加的目标（最多 8 个），停止后停止发包；不自动扫描公网。TCP 只建立短连接，不登录游戏服务器。双机协同吞吐测试需要远端用户主动同意，当前版本尚未提供远程测试服务。监控数据仅保存在本次程序内存。</p>
 </div>`;
}
function gamePage(){
 const nic=selectedLanInterface(),isWin=live();
 const results=state.gameResults?.games||[];
 const list=results.filter(g=>state.gameTab==='all'||state.gameTab==='minecraft'&&g.game==='Minecraft'||state.gameTab==='other'&&g.game!=='Minecraft');
 const stale=state.gameResults&&state.gameResults.localIp!==nic?.ip;
 const gameEnabled=isWin&&!desktopBusy&&!state.gameBusy&&!!nic;
 return `<div class="game-workbench">
  <div class="game-heading"><div><span class="core-eyebrow">LOCAL MULTIPLAYER / DISCOVERY</span><h1>${icon('gamepad',28)} 游戏联机</h1><p>发现附近的联机房间，查看验证结果，一键复制服务器地址。</p></div>${badge('本地网络 · 只读发现','neutral')}</div>
  <div class="game-feature-grid">
   <button class="game-feature ${state.gameTab==='all'?'selected':''}" data-action="game-tab-all">${icon('search',24)}<strong>发现游戏</strong><span>扫描附近的联机房间</span></button>
   <button class="game-feature ${state.gameTab==='minecraft'?'selected':''}" data-action="game-tab-minecraft">${icon('gamepad',24)}<strong>Minecraft</strong><span>Java / 基岩版</span></button>
   <button class="game-feature ${state.gameTab==='other'?'selected':''}" data-action="game-tab-other">${icon('settings',24)}<strong>其他游戏</strong><span>常用端口与自定义协议</span></button>
  </div>
  <div class="game-scan-console"><div class="game-scan-source"><small>扫描网卡</small><strong>${esc(nic?.name||'尚未读取 Windows 网卡')} · ${esc(nic?.ip||'—')}</strong><span>自动发现块：${esc(lanSubnet(nic?.ip||''))}（网卡前缀 /${esc(nic?.prefix??'?')}；其他网段请手动验证）</span></div>
  <details class="game-range-advanced"><summary>扫描范围：当前 /24 网段（默认 .1–.254） · 自定义</summary><div class="game-range-inline"><label>主机号从 <input id="gameStartHost" type="number" min="1" max="254" value="${state.gameStartHost}" ${state.gameBusy?'disabled':''}></label><label>到 <input id="gameEndHost" type="number" min="1" max="254" value="${state.gameEndHost}" ${state.gameBusy?'disabled':''}></label></div></details>
  ${state.gameTab==='other'||state.gameTab==='all'?`<label class="game-extra-port">可选 TCP 端口 <input id="gameCustomPort" type="number" min="0" max="65535" value="${state.gameCustomPort||''}" placeholder="例如 27015"></label>`:''}
  <div>${state.gameBusy?elButton(icon('x',16)+' 取消扫描','game-cancel','btn ghost'):elButton(icon('search',17)+' 开始发现','game-scan','btn primary',gameEnabled?'':'disabled')}</div></div>
  ${!isWin?`<div class="callout amber">${icon('info',16)} 当前没有可用的 Windows 实机连接；不会显示虚构的局域网游戏服务器。请在 Windows 桌面程序中重新连接。</div>`:''}
  ${state.gameError?`<div class="callout amber">${icon('alert',16)} ${esc(state.gameError)}</div>`:''}
  ${state.gameNotice?`<div class="game-notice" role="status">${icon('info',16)} ${esc(state.gameNotice)}</div>`:''}
  ${state.gameTab==='minecraft'?`<section class="game-explainer"><div class="game-explainer-heading">${icon('gamepad',22)} Minecraft 专区 ${badge('Java + 基岩版','blue')}</div><p>自动尝试 Java TCP 25565 状态查询，监听 Java 局域网广播以发现随机端口，并通过 RakNet UDP 19132 探测基岩版。组播或防火墙受限时，可能需要输入对方显示的 IP 和端口进行手动探测。</p></section>`:''}
  <section class="game-results"><div class="game-section-heading"><h2>${state.gameTab==='minecraft'?'Minecraft · 局域网房间':state.gameTab==='other'?'其他游戏 · 可连接端点':'附近的游戏与联机端点'}</h2><span>${stale?'切换网卡后结果已过期':state.gameResults?`上次扫描 ${esc(state.gameResults.scannedAt||'')}`:'暂无扫描结果'}</span></div>
   ${stale?'<div class="game-empty">扫描网卡已变更，请重新发现游戏。</div>':list.length?`<div class="game-results-grid">${list.map(gameCard).join('')}</div>`:`<div class="game-empty">${icon('search',28)}<strong>暂未发现联机房间</strong><p>${state.gameResults?'当前扫描范围没有对应的响应端点；也可能是组播受限、端口被修改或防火墙阻止。':'点击「开始发现」，或在下面输入已知的朋友 IP 和端口。'}</p>${gameEnabled?elButton(icon('search',16)+' 开始发现','game-scan-empty','btn primary'):''}</div>`}
   ${(state.gameResults?.warnings||[]).map(w=>`<p class="game-warning">${icon('alert',15)} ${esc(w)}</p>`).join('')}
  </section>
  <section class="game-manual"><div class="game-section-heading"><h2>${icon('settings',18)} 指定地址验证</h2><span>可指定其他私有网段的服务器</span></div><div class="game-manual-controls">
   <label>目标 IPv4 <input id="gameTargetIp" type="text" inputmode="decimal" placeholder="例如 192.168.10.20" value="${attr(state.gameTargetIp)}"></label>
   <label>端口 <input id="gameTargetPort" type="number" min="1" max="65535" value="${state.gameTargetPort}"></label>
   <label>验证类型 <select id="gameProtocol"><option value="java" ${state.gameProtocol==='java'?'selected':''}>Minecraft Java</option><option value="bedrock" ${state.gameProtocol==='bedrock'?'selected':''}>Minecraft 基岩版</option><option value="tcp" ${state.gameProtocol==='tcp'?'selected':''}>其他游戏 TCP</option></select></label>
   ${elButton('验证地址','game-check','btn ghost',gameEnabled?'':'disabled')}
   </div>${state.gameManual?.endpoint?`<div class="game-manual-result">${gameCard(state.gameManual.endpoint)}</div>`:state.gameManual?`<div class="game-warning">${esc(state.gameManual.note||'未收到服务响应')}</div>`:''}
  </section>
  <p class="game-disclaimer">自动扫描仅针对所选网卡的私有 /24 网段；手动探测支持其他可路由的私有 IPv4 地址；不执行认证、不修改防火墙，不承诺发现所有游戏。端口可连接 ≠ 已验证游戏协议；UDP 无回复 ≠ 游戏未运行。请仅扫描你获准使用的网络。</p>
 </div>`;
}
function content(){
 if(desktopDisconnected()&&!['settings','games','radar'].includes(state.page))return desktopConnectionPage();
 if(!desktopAvailable()&&!real()&&!['settings','games','radar'].includes(state.page))return coreBrowserGuide();
 switch(state.page){case'shares':return sharesPage();case'users':return usersPage();case'lan':return lanPage();case'games':return gamePage();case'radar':return radarPage();case'permissions':return permissionsAnalysisPage();case'connections':return connectionsPage();case'settings':return settingsPage();default:return sharesPage();}
}
function statusPopover(){
 const connected=live();
 const text=desktopDisconnected()?state.desktopConnection==='failed'?'连接失败':'连接中':connected?'Windows · 已连接':real()?'只读快照':'未连接';
 return `<details class="system-status"><summary>${badge(text,connected?'green':'neutral')}</summary><div class="system-status-detail"><strong>${esc(text)}</strong><span>计算机：${esc(state.snapshot?.computerName||'未读取')}</span><span>采集时间：${esc(state.snapshot?.capturedAt||'尚未读取')}</span><span>实际账户与共享数据来自 Windows 快照</span></div></details>`;
}
function render(){
 document.body.classList.toggle('light',state.theme==='light');
 document.body.dataset.glass=state.glassMode;
 const current=NAV.find(x=>x[0]===state.page)?.[2]||'文件共享';
 document.title=`SwitchLAN Studio Core · ${current}`;
 root.innerHTML=`<div class="core-ambient" aria-hidden="true"><div class="ambient-orb orb-a"></div><div class="ambient-orb orb-b"></div><div class="ambient-orb orb-c"></div></div><div class="shell core-shell"><aside class="sidebar liquid-surface ${state.sidebarOpen?'open':''}"><div class="brand"><div class="brandlogo liquid-prism">${icon('folder-open',25)}</div><div><b>SwitchLAN</b><small>STUDIO <span>CORE 1.4.5</span></small></div>${elButton(icon('x'),'close-sidebar','mobile-only iconbtn')}</div><div class="navcaption">核心管理区 <span class="core-nav-hint">/ CORE</span></div><nav class="nav">${NAV.map(([id,ic,t])=>`<button class="nav-link liquid-button ${state.page===id?'selected':''}" data-page="${id}">${icon(ic,19)}<span>${t}</span>${id==='lan'&&state.lanScanning?'<span class="lan-nav-spinner" aria-label="扫描中"></span>':id==='lan'&&state.lanResults?`<span class="lan-nav-count">${state.lanResults.devices?.length||0}</span>`:''}</button>`).join('')}</nav><div class="sidebar-footer" role="button" tabindex="0" data-action="go-settings" title="打开诊断与安全状态"><div class="foot-icon">${icon('lock',18)}</div><div><strong>只操作真实对象</strong><small>${live()?'Windows 已连接，按权限管理':desktopAvailable()?'等待 Windows 状态':'需要 Windows 桌面程序'}</small></div></div></aside><div class="main"><header class="topbar liquid-surface">${elButton(icon('menu'),'toggle-sidebar','mobile-only iconbtn')}<div class="breadcrumbs">SwitchLAN Core <span>/</span> <b>${esc(current)}</b></div><div class="top-actions">${elButton('<span class="glass-dot"></span> GLASS','glass-toggle','glass-toggle',`title="切换液态玻璃，低性能设备可关闭" aria-pressed="${state.glassMode!=='off'}"`)}${statusPopover()}${live()?elButton(icon('rotate',16)+' <span class="hide-small">刷新</span>','admin-refresh','btn tiny',desktopBusy?'disabled':''):''}${elButton(icon(state.theme==='dark'?'sun':'moon',18),'theme','iconbtn')}</div></header><main class="content">${state.page==='settings'||desktopDisconnected()||state.lastError||state.lastCleanupInfo?notice():''}${content()}<footer class="bottom-info"><span>SwitchLAN Studio · Core 1.4.5 Beta</span><span>Windows 局域网 · 文件共享与游戏联机</span></footer></main></div></div>`;
 if(state.page==='radar')radarDrawChart(false);
}

function showForm(which,data={}){
 if(ro()){toast('只读快照模式无法修改数据，请返回演示');return;}
 if(which==='user')modal('新建普通共享账户',`<label class="fieldlabel">账户名称</label><input name="name" required minlength="3" maxlength="20" placeholder="例如 lan_zhangsan"/><div class="fieldhint">3–20 位字母、数字、下划线、点或连字符；以字母开头。</div><label class="fieldlabel">模拟密码（仅检验强度，不保留）</label><input name="password" type="password" minlength="12" required autocomplete="new-password" placeholder="至少 12 位"/><div class="callout">${icon('info',15)}本界面不创建真实 Windows 账户，密码不会写入数据和日志。</div>`,'预览创建');
 if(which==='share')modal('新建共享文件夹',`<label class="fieldlabel">共享名称</label><input name="name" required placeholder="例如 Courses"/><label class="fieldlabel">Windows 文件夹路径</label><input name="path" required placeholder="E:\\LANShare\\Courses"/><div class="fieldhint">正式版会提供系统原生文件夹选择器；当前阶段用路径演示。</div><label class="fieldlabel">授予哪个专用账户？</label><select name="sid">${state.users.filter(u=>u.managed).map(u=>`<option value="${attr(u.sid)}">${esc(u.name)}</option>`).join('')}</select><label class="fieldlabel">权限模板</label><select name="role"><option value="read">只读（推荐）</option><option value="change">修改（可删除文件）</option></select>`,'预览共享');
 if(which==='peer')modal('添加可信设备',`<label class="fieldlabel">设备备注</label><input name="name" required maxlength="40" placeholder="例如 同学 C"/><label class="fieldlabel">IPv4 地址或 CIDR 网段</label><input name="ip" required placeholder="192.0.2.23"/><div class="callout amber">${icon('alert',15)}允许整个网段比只允许单台设备的暴露面更大。IP 地址也不能代替 SMB 身份验证。</div>`,'预览添加');
 if(which==='permission'){
  const s=state.shares.find(x=>x.id===data.share),u=getUser(data.sid);if(!s||!u)return;
  const p=s.permissions.find(x=>x.sid===u.sid)||{smb:'none',ntfs:'none'};
  modal(`授权：${u.name} → ${s.name}`,`<div class="callout">${icon('info',16)}共享权限与 NTFS 权限共同约束通过此共享的访问。权限矩阵并未计算组与继承。</div><label class="fieldlabel">SMB 共享权限</label><select name="smb">${P.ROLES.filter(x=>x!=='full').map(x=>`<option value="${x}" ${p.smb===x?'selected':''}>${P.roleText[x]}</option>`).join('')}</select><label class="fieldlabel">NTFS 权限</label><select name="ntfs">${P.ROLES.filter(x=>x!=='full').map(x=>`<option value="${x}" ${p.ntfs===x?'selected':''}>${P.roleText[x]}</option>`).join('')}</select><input type="hidden" name="share" value="${attr(s.id)}"/><input type="hidden" name="sid" value="${attr(u.sid)}"/>`,'预览授权');
 }
}
function showAdminUserForm(){
 modal('创建本机用户',`<div class="form-target-banner">${icon('users',22)}<div><strong>新建 Windows 普通账户</strong><small>目标：当前计算机 · 本机账户</small></div></div><div class="form-step-title">① 账户身份</div><label class="fieldlabel">账户名称</label><input name="adminName" required minlength="3" maxlength="20" placeholder="例如 lan_zhangsan"/><div class="fieldhint">3–20 位字母、数字、下划线、点或连字符；以字母开头。</div>
 <div class="form-step-title">② 登录密码</div><label class="fieldlabel">密码设置方式</label><select name="passwordMode" id="createPasswordMode"><option value="custom">自行输入密码</option><option value="generate">生成随机高强度密码（推荐）</option></select>
 <div id="createPasswordCustomBox"><label class="fieldlabel">输入新密码</label><input type="password" name="password" id="createPasswordInput" autocomplete="new-password" minlength="1" maxlength="128" required/><label class="fieldlabel">再次输入确认</label><input type="password" name="confirmPassword" id="createPasswordConfirm" autocomplete="new-password" minlength="1" maxlength="128" required/><p class="fieldhint">允许输入如 Abc12345；最终是否成功，由 Windows 的本地密码策略决定。不会修改 Windows 密码策略。</p></div>
 <div class="callout">${icon('info',15)}将真实创建普通本地用户，不加入管理员组。密码不会保存到 SwitchLAN 托管记录中，建议使用独立且足够强的密码。</div>`,'创建账户');
}
function showAdminResetPassword(name){
 modal('重置本机用户密码',`<input type="hidden" name="adminName" value="${attr(name)}"/><div class="callout amber">${icon('alert',18)}将为 <strong>${esc(name)}</strong> 生成新密码；原密码将立即失效，已连接会话可能仍保持。</div><label class="fieldlabel">输入账户名确认</label><input name="confirmName" required autocomplete="off"/>`,'重置密码');
}
function showAdminSetUserEnabled(name,enabled){
 modal(enabled?'启用本机用户':'禁用本机用户',`<input type="hidden" name="adminName" value="${attr(name)}"/><input type="hidden" name="enabled" value="${enabled?'true':'false'}"/><div class="callout amber">${icon('alert',18)}${enabled?'启用':'禁用'} Windows 本地账户 <strong>${esc(name)}</strong>。禁用后已有 SMB 会话不一定立刻断开。</div><label class="fieldlabel">输入账户名确认</label><input name="confirmName" required autocomplete="off"/>`,enabled?'确认启用':'确认禁用');
}
function showAdminDeleteUser(name){
 modal('删除本机用户',`<input type="hidden" name="adminName" value="${attr(name)}"/><div class="callout danger">${icon('alert',18)}将删除 Windows 本地账户 <strong>${esc(name)}</strong>。不会删除用户目录/文件；已连接的会话需要另行检查。</div><label class="fieldlabel">输入账户名确认</label><input name="confirmName" required autocomplete="off" placeholder="${attr(name)}"/>`,'删除账户');
}
function showAdminShareForm(){
 const users=(state.snapshot?.users||[]).filter(u=>u.enabled!==false && editableLocalUser(u));
 if(!users.length)return showAdminUserForm();
 const options=users.map(u=>`<option value="${attr(u.sid)}">${esc(u.name)}${isManagedUser(u.name)?' · 托管':''}</option>`).join('');
 modal('共享向导 · 创建真实 SMB 共享',`<div class="wizard-steps"><span>① 准备本地账户</span><span>② 选择文件夹</span><span>③ 授权并建立共享</span></div><label class="fieldlabel">共享名称</label><input name="adminShareName" required maxlength="60" placeholder="例如 Courses"/><label class="fieldlabel">要共享的文件夹</label><div class="inline-actions"><input id="adminSharePath" name="adminPath" required placeholder="选择或输入现有文件夹" style="flex:1"/><button type="button" class="btn ghost" data-action="admin-pick-folder">浏览…</button></div><label class="fieldlabel">授权账户</label><select name="account">${options}</select><label class="fieldlabel">共享权限</label><select name="right"><option value="Read">只读（推荐）</option><option value="Change">修改（可写入/删除共享内文件）</option></select><div class="callout">${icon('info',15)}可选择电脑已有的非内置本地账户或 SwitchLAN 专用账户。后端会再次验证该账户不是管理员组成员。新共享会为目标账户添加对应 NTFS 允许项，请使用干净的测试目录。</div>`,'创建共享');
}
function showEditUser(index){
 const u=state.snapshot?.users?.[index];if(!live()||!editableLocalUser(u))return toast('此账户不能修改');
 modal('修改已有本地用户',`<input type="hidden" name="name" value="${attr(u.name)}"/><input type="hidden" name="sid" value="${attr(u.sid)}"/><label class="fieldlabel">用户名（不可在此重命名）</label><div class="connect-path">${esc(u.name)}</div><label class="fieldlabel">显示名称</label><input name="fullName" maxlength="100" value="${attr(u.fullName||'')}"/><label class="fieldlabel">账户备注</label><input name="description" maxlength="240" value="${attr(isManagedUser(u.name)?'（SwitchLAN 托管标记不可修改）':u.description||'')}" ${isManagedUser(u.name)?'disabled':''}/><div class="callout amber">${icon('alert',16)}直接修改 Windows 本地账户。系统内置、当前操作账户和管理员组成员会由后端拒绝。</div><label class="fieldlabel">输入用户名确认</label><input name="confirm" required autocomplete="off"/>`,'确认修改');
}
function showExistingUserStatus(index,enabled){
 const u=state.snapshot?.users?.[index];if(!live()||!editableLocalUser(u))return;
 modal('修改已有账户状态',`<input type="hidden" name="name" value="${attr(u.name)}"/><input type="hidden" name="sid" value="${attr(u.sid)}"/><input type="hidden" name="enabled" value="${enabled?'true':'false'}"/><div class="callout amber">将${enabled?'启用':'禁用'}真实账户 <strong>${esc(u.name)}</strong>，可能影响该账户登录或现有共享连接。</div><label class="fieldlabel">输入用户名确认</label><input name="confirm" required/>`,'确认操作');
}
function showExistingUserPassword(index){
 const u=state.snapshot?.users?.[index];if(!live()||!editableLocalUser(u))return;
 if(dlg.open)closeDialog();
 modal('重置已有账户密码',`<div class="form-target-banner">${icon('key-round',22)}<div><strong>正在修改账户：${esc(u.name)}</strong><small>目标账户 SID：${esc(u.sid)}</small></div></div><input type="hidden" name="name" value="${attr(u.name)}"/><input type="hidden" name="sid" value="${attr(u.sid)}"/>
 <div class="callout amber">Windows 不允许查看原密码。重置后旧密码失效，可能影响对方保存的 SMB 凭据。当前账户、内置账户及管理员由后端保护。</div>
 <div class="form-step-title">① 设置新密码</div><label class="fieldlabel">密码更新方式</label><select id="passwordMode" name="mode"><option value="custom">自行设置新密码</option><option value="generate">生成随机强密码</option></select>
 <div id="passwordCustomBox"><label class="fieldlabel">新密码</label><input type="password" name="newPassword" id="passwordCustomInput" minlength="1" maxlength="128" required autocomplete="new-password"/><label class="fieldlabel">确认新密码</label><input type="password" name="confirmPassword" id="passwordCustomConfirm" minlength="1" maxlength="128" required autocomplete="new-password"/><p class="fieldhint">不强制特殊字符或 12 位长度。Windows 系统密码策略仍可能要求复杂密码。</p></div>
 <div class="form-step-title">② 核对修改目标</div><label class="fieldlabel">输入用户名 <strong>${esc(u.name)}</strong> 确认</label><input name="confirm" required autocomplete="off"/>`,'确认更新密码');
}
function showDeleteExistingUser(index){
 const u=state.snapshot?.users?.[index];if(!live()||!editableLocalUser(u))return;
 if(dlg.open)closeDialog();
 modal('删除 Windows 普通账户',`<input type="hidden" name="name" value="${attr(u.name)}"/><input type="hidden" name="sid" value="${attr(u.sid)}"/><div class="callout danger">${icon('alert',18)}将永久删除 Windows 本地账户 <strong>${esc(u.name)}</strong>（SID: ${esc(u.sid)}），无法恢复原身份。<strong>不会删除个人文件、用户目录，也不会修改任何 NTFS ACL。</strong> 旧 SID 的权限记录可能留存，需要之后单独审核，不能把删除账户当作权限清理。<p>若该账户仍持有 SMB 直接授权或被托管共享引用，后端将拒绝删除。请勿选择日常登录账户。</p></div><label class="delete-ack"><input type="checkbox" name="preserveNtfs" value="yes" required/> 我确认仅删除账户身份，保留所有 NTFS 权限记录和文件。</label><label class="fieldlabel">输入用户名确认删除</label><input name="confirm" required autocomplete="off" placeholder="${attr(u.name)}"/>`,'确认永久删除账户');
}
function showUnshareExisting(index){
 const sh=state.snapshot?.shares?.[index];if(!live()||!editableShare(sh))return;
 if(dlg.open)closeDialog();
 modal('停止共享（保留本地文件）',`<input type="hidden" name="name" value="${attr(sh.name)}"/><input type="hidden" name="expectedPath" value="${attr(sh.path)}"/><div class="callout danger">${icon('alert',18)}将从 Windows 中撤销 SMB 共享入口 <strong>${esc(sh.name)}</strong>，网络地址将失效。<strong>磁盘文件夹及内部文件不会删除。</strong></div><div class="share-overview"><div><small>共享文件夹</small><strong class="mono">${esc(sh.path)}</strong></div><div><small>来源</small>${badge(isManagedShare(sh.name)?'SwitchLAN 创建':'Windows 原有普通共享')}</div></div><div class="callout amber">会强制断开当前连接；如果其他设备正写入文件，可能导致未保存数据丢失。请先停止文件传输。Windows 原有共享的 NTFS 权限保持不变；SwitchLAN 托管共享则尝试清理当初添加的 NTFS 授权。</div><label class="fieldlabel">输入共享名称确认</label><input name="confirm" required autocomplete="off" placeholder="${attr(sh.name)}"/>`,'确认停止共享');
}
// The permissions editor is embedded directly in the share details dialog.
function showEditShareAccess(index,initialSid=''){
 return showInspectShare('real-'+index,initialSid);
}
function permissionEditor(share,index,initialSid=''){
 if(!live()||!editableShare(share))return '';
 const users=(state.snapshot?.users||[]).filter(u=>u.enabled!==false&&editableLocalUser(u));
 if(!users.length)return '<div class="callout">当前没有可编辑的已启用本地普通账户。</div>';
 const chosen=users.find(u=>u.sid===initialSid)||users[0];
 const before=currentDirectRight(share,chosen);
 const blocked=['Deny','Multiple','Unknown'].includes(before);
 return `<section class="access-editor" aria-label="编辑 SMB 直接授权">
   <div class="form-target-banner"><span class="editor-icon">${icon('folder-open',19)}</span><div><strong>目标共享：${esc(share.name)}</strong><small>${esc(share.path||'')}</small></div></div><div class="editor-title"><span class="editor-icon">${icon('key-round',17)}</span><div><strong>只修改所选账户的 SMB 直接授权</strong><small>不会更改 NTFS 权限或其他账户的授权</small></div></div>
   <div class="form-step-title">① 选择授权账户</div><label class="fieldlabel" for="shareAccessUser">本机账户</label>
   <select id="shareAccessUser" name="sid">${users.map(u=>`<option value="${attr(u.sid)}" ${u.sid===chosen.sid?'selected':''}>${esc(u.name)}</option>`).join('')}</select>
   <div class="form-step-title">② 指定共享权限</div><label class="fieldlabel" for="shareAccessRight">改成</label>
   <select id="shareAccessRight" name="right"><option value="Read">允许读取</option><option value="Change">允许修改（含删除文件）</option><option value="Remove">撤销此用户的直接允许权限</option></select>
   <div class="permission-diff" id="permissionDiff" role="status" aria-live="polite"></div>
   <div class="callout amber">${icon('alert',16)}“撤销直接允许”不等于拒绝访问。Everyone、用户组及 NTFS ACL 仍可能使这个账户获得访问；本次不会修改那些规则。</div>
   <div class="form-step-title">③ 核对并保存</div><label class="fieldlabel" for="shareAccessConfirm">输入共享名称 <strong>${esc(share.name)}</strong> 确认</label><input id="shareAccessConfirm" name="confirm" required autocomplete="off" placeholder="${attr(share.name)}"/>
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
 out.innerHTML=`<div class="diff-side"><small>当前（来自 Windows 快照）</small><strong>${esc(rightName(before))}</strong></div>${icon('arrow-right',19)}<div class="diff-side"><small>计划修改为</small><strong>${esc(rightName(right))}</strong></div>${blocked?'<p class="diff-note">该账户已有拒绝、重复或未知条目，为避免覆盖，不能直接修改。</p>':unchanged?'<p class="diff-note">没有变化，请选择不同的权限。</p>':'<p class="diff-note">保存前后台会重新检查路径与现有授权。完成后还会重新读取 Windows。</p>'}`;
 const footer=dlg.querySelector('#permissionFooterDiff');if(footer)footer.textContent=rightName(before)+' → '+rightName(right);
 const submit=dlg.querySelector('button[type="submit"]');if(submit)submit.disabled=blocked||unchanged||!live();
}

function showAdminDeleteShare(name){
 modal('删除本机共享',`<input type="hidden" name="adminShareName" value="${attr(name)}"/><div class="callout danger">${icon('alert',18)}将删除 SMB 共享入口 <strong>${esc(name)}</strong> 并尝试撤销本软件添加的 NTFS 授权；不会删除磁盘文件或文件夹。</div><label class="fieldlabel">输入共享名确认</label><input name="confirmShareName" required autocomplete="off" placeholder="${attr(name)}"/>`,'删除共享');
}
function showEditShareDescription(index){
 const sh=state.snapshot?.shares?.[index];
 if(!live()||!editableShare(sh))return toast('该共享当前不能修改');
 if(isManagedShare(sh.name))return toast('托管共享的描述用于验证归属，不能在此修改');
 modal('编辑共享备注',`<input type="hidden" name="name" value="${attr(sh.name)}"/><input type="hidden" name="expectedPath" value="${attr(sh.path)}"/><input type="hidden" name="expectedDescription" value="${attr(sh.description||'')}"/><label class="fieldlabel">当前共享</label><div class="connect-path">${esc(sh.name)} · ${esc(sh.path)}</div><label class="fieldlabel">新备注（0–256 字符）</label><input name="description" maxlength="256" value="${attr(sh.description||'')}"/><div class="callout">${icon('info',16)}仅更改 Windows SMB 共享描述，不改共享名、文件夹路径、文件内容或访问权限。后台会先核对路径与旧备注。</div><label class="fieldlabel">输入共享名称确认</label><input name="confirm" required autocomplete="off"/>`,'保存备注');
}
function submitForm(e){e.preventDefault();if(!pending)return;const kind=pending.kind;const f=new FormData(e.target);const val=k=>String(f.get(k)||'').trim();
 if(kind==='编辑共享备注'){
  const name=val('name'),description=val('description'),expectedPath=val('expectedPath'),expectedDescription=val('expectedDescription');
  if(val('confirm')!==name)return toast('共享名称不一致');
  if(description.length>256||/[\x00-\x1f]/.test(description))return toast('备注格式不正确');
  const current=state.snapshot?.shares?.find(sh=>sh.name===name&&sh.path===expectedPath&&sh.description===expectedDescription);
  if(!current||!editableShare(current)||isManagedShare(name))return toast('共享已变化或受到保护，请刷新');
  if(description===expectedDescription)return toast('备注没有变化');
  closeDialog();if(desktopPost('admin-update-share-description',{name,description,expectedPath,expectedDescription}))toast('正在请求 Windows 修改共享备注…');return;
 }
 if(kind==='删除 Windows 普通账户'){
  const name=val('name'),sid=val('sid');if(val('confirm')!==name)return toast('请输入完全一致的用户名');
  if(f.get('preserveNtfs')!=='yes')return toast('请确认保留 NTFS 权限与文件');
  if(!state.snapshot?.users?.some(u=>u.name===name&&u.sid===sid&&editableLocalUser(u)))return toast('账户快照已变化，请刷新');
  closeDialog();if(desktopPost('admin-delete-existing-user',{name,sid,preserveNtfs:true}))toast('已提交删除账户请求；NTFS 权限保持原样…');return;
 }
 if(kind==='停止共享（保留本地文件）'){
  const name=val('name'),expectedPath=val('expectedPath');if(val('confirm')!==name)return toast('请输入完全一致的共享名');
  if(!state.snapshot?.shares?.some(sh=>sh.name===name&&sh.path===expectedPath&&editableShare(sh)))return toast('共享信息已变化，请刷新');
  closeDialog();if(desktopPost('admin-unshare-existing',{name,expectedPath}))toast('正在请求 Windows 停止 SMB 共享…');return;
 }
 if(['修改已有本地用户','修改已有账户状态','重置已有账户密码','共享授权编辑'].includes(kind)){
  const name=val('name');if(val('confirm')!==name)return toast('确认名称不一致');
  const sid=val('sid');
  if(kind==='修改已有本地用户'){
   const fullName=val('fullName'),description=val('description');closeDialog();
   if(desktopPost('admin-update-existing-user',{name,sid,fullName,description}))toast('已提交修改，请确认 UAC…');return;
  }
  if(kind==='修改已有账户状态'){
   const enabled=val('enabled')==='true';closeDialog();
   if(desktopPost('admin-set-existing-user-enabled',{name,sid,enabled}))toast('已提交状态修改，请确认 UAC…');return;
  }
  if(kind==='重置已有账户密码'){
   if(val('mode')==='custom'){
    const password=String(f.get('newPassword')||'');
    if(password.length<1||password.length>128||/[\x00-\x1f\x7f]/.test(password))return toast('请输入 1–128 位的有效密码');
    if(password!==String(f.get('confirmPassword')||''))return toast('两次输入的密码不一致');
    closeDialog();if(desktopPost('admin-set-existing-user-password',{name,sid,password}))toast('已提交密码更新；不会在界面里回显自定义密码');return;
   }
   closeDialog();if(desktopPost('admin-reset-existing-user-password',{name,sid}))toast('已提交随机密码重置，请确认 UAC…');return;
  }
  const accountSid=val('sid');const account=(state.snapshot?.users||[]).find(u=>u.sid===accountSid);
  const share=state.snapshot?.shares?.find(sh=>sh.name===name);
  const right=val('right');if(!account||!editableLocalUser(account)||account.enabled===false||!share||!editableShare(share))return toast('账户或共享已变化，请刷新');
  if(!Array.isArray(share.permissions))return toast('共享权限数据未获取，请刷新后再编辑');
  if(!['Read','Change','Remove'].includes(right))return toast('权限选项无效');
  const before=currentDirectRight(share,account),expected=right==='Remove'?'None':right;
  if(!['None','Read','Change','Full'].includes(before)||before===expected)return toast('该授权无法直接调整或没有变化');
  const change={name,account:account.name,sid:accountSid,right,before,path:share.path};
  closeDialog();state.shareFeedback=null;
  if(desktopPost('admin-modify-share-access',{name,account:account.name,sid:accountSid,right,expectedRight:before,expectedPath:share.path})){
   awaitedShareChange=change;toast('正在请求 Windows 修改；完成后会重新读取实际权限…');
  }return;
 }
 if(kind==='重置本机用户密码'||kind==='启用本机用户'||kind==='禁用本机用户'){
  const name=val('adminName');if(val('confirmName')!==name)return toast('账户名确认不一致');
  const enabled=val('enabled')==='true';closeDialog();
  const requestType=kind==='重置本机用户密码'?'admin-reset-user-password':'admin-set-user-enabled';
  if(desktopPost(requestType,kind==='重置本机用户密码'?{name}:{name,enabled}))toast('已提交，请在 UAC 中确认…');
  return;
 }
 if(kind==='创建本机用户'){
  const name=val('adminName');
  if(!P.validAccount(name))return toast('用户名不符合命名要求');
  const passwordMode=val('passwordMode');if(!['custom','generate'].includes(passwordMode))return toast('请选择密码设置方式');
  const password=String(f.get('password')||'');
  if(passwordMode==='custom'){
   if(password.length<1||password.length>128||/[\x00-\x1f\x7f]/.test(password))return toast('请输入 1–128 位有效密码');
   if(password!==String(f.get('confirmPassword')||''))return toast('两次密码不一致');
  }
  closeDialog();
  if(desktopPost('admin-create-user',passwordMode==='custom'?{name,passwordMode,password}:{name,passwordMode}))toast('已提交，请在 UAC 中确认创建账户…');
  return;
 }
 if(kind==='删除本机用户'){
  const name=val('adminName'),confirm=val('confirmName');
  if(confirm!==name)return toast('输入的账户名不一致');
  closeDialog();
  if(desktopPost('admin-delete-user',{name}))toast('已提交，请在 UAC 中确认删除账户…');
  return;
 }
 if(kind==='共享向导 · 创建真实 SMB 共享'){
  const name=val('adminShareName'),path=val('adminPath'),accountSid=val('account'),right=val('right');
  const selectedAccount=(state.snapshot?.users||[]).find(u=>u.sid===accountSid);
  if(!name||name.length<2||name.length>60)return toast('共享名长度应为 2–60 位');
  if(!path)return toast('请选择要共享的文件夹');
  if(!selectedAccount||selectedAccount.enabled===false||!editableLocalUser(selectedAccount))return toast('请选择有效的普通本地账户');
  if(!['Read','Change'].includes(right))return toast('请选择共享权限');
  closeDialog();
  if(desktopPost('admin-create-share',{name,path,account:selectedAccount.name,accountSid,right}))toast('已提交，请在 UAC 中确认创建共享…');
  return;
 }
 if(kind==='删除本机共享'){
  const name=val('adminShareName'),confirm=val('confirmShareName');
  if(confirm!==name)return toast('输入的共享名不一致');
  closeDialog();
  if(desktopPost('admin-delete-share',{name}))toast('已提交，请在 UAC 中确认删除共享…');
  return;
 }
 if(kind==='新建普通共享账户'){
  const name=val('name'),password=String(f.get('password')||'');
  if(!P.validAccount(name))return toast('用户名不符合命名要求');
  if(state.users.some(u=>u.name.toLowerCase()===name.toLowerCase()))return toast('该用户名已存在');
  if(password.length<12||!/[a-zA-Z]/.test(password)||!/[0-9]/.test(password))return toast('请使用至少 12 位且包含字母和数字的密码');
  preview('确认创建模拟账户',[`创建 Windows 本地普通账户：${name}`,'不加入 Administrators 组','尚不授予任何共享文件夹权限','不会保存你刚输入的密码'],()=>{state.users.push({sid:'DEMO-S-'+Date.now(),name,enabled:true,managed:true});log('创建模拟账户',`新增专用账户 ${name}`);render();toast('已在演示数据中创建账户');});
 } else if(kind==='新建共享文件夹'){
  const name=val('name'),path=val('path'),sid=val('sid'),role=val('role');
  if(!P.validShare(name))return toast('共享名不合法（2–60 位，无空格或特殊保留字符）');
  if(!P.safePath(path))return toast('目录不安全或路径无效，请避免系统目录、C:\\Users 和根目录');
  if(state.shares.some(s=>s.name.toLowerCase()===name.toLowerCase()))return toast('共享名已经存在');
  if(!getUser(sid)||!['read','change'].includes(role))return toast('请选择正确的账户与权限');
  const u=getUser(sid);
  preview('确认创建模拟共享',[`共享名称：${name}`,`本机路径：${path}`,`账户：${u.name}`,`SMB / NTFS：${P.roleText[role]} / ${P.roleText[role]}`,'正式版执行前会验证目录是否存在、ACL 与继承'],()=>{state.shares.push({id:'sh'+Date.now(),name,path,managed:true,permissions:[{sid,smb:role,ntfs:role}]});log('新建模拟共享',`${name} → ${path}`);render();toast('模拟共享已创建');});
 } else if(kind==='添加可信设备'){
  const name=val('name'),ip=val('ip');if(!name)return toast('请输入设备备注');if(!P.validPeer(ip))return toast('IPv4 或 CIDR 格式无效');if(state.peers.some(p=>p.ip===ip))return toast('白名单中已经存在该地址');
  preview('确认加入模拟白名单',[`设备：${name}`,`来源：${ip}`,'仅影响本工具模拟的 TCP 445 白名单','不会绕过 Windows 用户及 SMB / NTFS 权限'],()=>{state.peers.push({id:'p'+Date.now(),name,ip,enabled:true});log('模拟白名单变更',`新增 ${name} (${ip})`);render();toast('已添加到模拟白名单');},ip.includes('/'));
 } else if(kind.startsWith('授权：')){
  const share=val('share'),sid=val('sid'),smb=val('smb'),ntfs=val('ntfs');const s=state.shares.find(x=>x.id===share),u=getUser(sid);
  if(!s||!u||!P.ROLES.includes(smb)||!P.ROLES.includes(ntfs))return toast('参数无效');
  preview('确认修改模拟权限',[`共享：${s.name}，账户：${u.name}`,`SMB：${P.roleText[smb]}`,`NTFS：${P.roleText[ntfs]}`,`理论结果：${P.permissionSummary(smb,ntfs)}`],()=>{s.permissions=s.permissions.filter(x=>x.sid!==sid);if(smb!=='none'||ntfs!=='none')s.permissions.push({sid,smb,ntfs});log('模拟权限修改',`${u.name} → ${s.name}：SMB ${P.roleText[smb]}，NTFS ${P.roleText[ntfs]}`);render();toast('模拟权限已修改');},smb==='change'||ntfs==='change');
 }
}
function ntfsSummaryPanel(s){
 if(!real())return '';
 const ntfs=s.ntfsReadable&&s.ntfs&&Array.isArray(s.ntfs.access)?s.ntfs:null;
 if(!ntfs)return `<section class="permissions-ntfs"><div class="ntfs-heading"><h3>NTFS 文件权限</h3>${badge('读取失败','amber')}</div><p class="muted small">无法读取本地文件夹 ACL；不能据此判断实际访问权限。</p></section>`;
 const entries=ntfs.access.slice(0,40);
 const rows=entries.map(a=>`<div class="ntfs-row"><div><b>${esc(a.identity||'未知主体')}</b><small>${a.inherited?'继承规则':'显式规则'} · ${esc(a.type||'')}</small></div><strong>${esc(a.rights||'未知')}</strong></div>`).join('');
 return `<section class="permissions-ntfs"><div class="ntfs-heading"><h3>NTFS 文件权限</h3>${badge('Windows 文件系统 ACL')}</div><div class="ntfs-owner">文件夹所有者 <strong>${esc(ntfs.owner||'未知')}</strong></div>
 <div class="ntfs-access-guide">${icon('info',15)} 你在 Windows“共享给特定用户”窗口看到的账户与读写级别，可能来自这层文件系统授权，而不是上面的 SMB 高级共享列表。这里只展示底层 ACL，不保证与该向导逐项相同。</div>
 <details open><summary>文件系统 ACL 明细（${entries.length} 条，含继承）</summary><div class="ntfs-list">${rows||'<p class="muted">未返回 ACL 规则</p>'}</div></details>
 ${ntfs.truncated?'<div class="callout amber">NTFS 规则过多，列表仅展示前 40 条，不能据此断言最终权限。</div>':''}
 <p class="muted tiny-text">SMB 直接授权、NTFS 文件权限、所属组和拒绝规则都会影响有效访问；此处不推算最终的可读/可写身份。</p></section>`;
}
function showInspectShare(id,initialSid=''){
 const index=id.startsWith('real-')?Number(id.slice(5)):-1;
 const s=real()?state.snapshot?.shares?.[index]:state.shares.find(x=>(x.id||x.name)===id);
 if(!s)return;
 if(!real()){toast('请在 Windows 桌面管理模式查看真实共享');return;}
 const managed=isManagedShare(s.name)&&live();
 const aces=Array.isArray(s.permissions)?s.permissions:[];
 const editable=live()&&editableShareAccess(s);
 const feedback=state.shareFeedback?.name===s.name?state.shareFeedback:null;
 const notice=feedback?`<div class="permission-receipt ${feedback.verified?'verified':'unverified'}">${icon(feedback.verified?'check':'alert',18)}<div><strong>${feedback.verified?'Windows 已重新读取并核验 SMB 授权':'尚未核验新授权'}</strong><p>${esc(feedback.account)}：${esc(rightName(feedback.before))} → ${esc(rightName(feedback.right))} · 实际：${esc(rightName(feedback.actual))}</p></div></div>`:'';
 const aceRows=aces.map(a=>`<div class="access-row"><div class="access-person"><span class="access-avatar">${icon('users',16)}</span><div><strong>${esc(a.account||'未知主体')}</strong><small>${esc(a.accessControlType||'未知')} · 直接 SMB 授权</small></div></div><div class="access-controls">${badge(rightName(a.accessRight||'Unknown'),a.accessControlType==='Deny'?'amber':'blue')}</div></div>`).join('')||'<div class="empty">未读取到直接授权条目</div>';
 const unc=String.fromCharCode(92,92)+(state.snapshot?.computerName||'本机')+String.fromCharCode(92)+s.name;
 const content=`<input type="hidden" name="name" value="${attr(s.name)}"/>
 <div class="dialog-head"><div class="mark">${icon('key-round',20)}</div><div class="dialog-heading"><h2>编辑共享授权</h2><p>仅修改所选账户在 SMB 共享层的直接授权</p></div>${elButton(icon('x'),'dialog-close','iconbtn')}</div>
 <div class="dialog-body core-permission-dialog">${notice}
 <div class="core-dialog-target"><span class="eyebrow">正在修改的 Windows 共享</span><strong>${esc(s.name)}</strong><small class="mono">${esc(unc)}</small></div>
 ${editable?permissionEditor(s,index,initialSid):'<div class="callout amber">当前共享处于受保护或授权读取失败状态，不能提交修改。</div>'}
 <details class="core-fold core-permission-reference" open><summary>${icon('eye',16)} 参考：Windows 当前 SMB 与 NTFS 授权</summary><div class="core-fold-body"><h3>SMB 高级共享授权</h3><p class="muted small">来自 Get-SmbShareAccess。不能单凭这一层判断某人实际能访问什么。</p>${aces.some(a=>String(a.account||'').toLowerCase()==='everyone')?`<div class="core-inline-note">${icon('info',15)} Windows 返回了 Everyone 共享权限，不能简单隐藏；文件系统 NTFS 仍会进一步限制。</div>`:''}<div class="access-list">${aceRows}</div>${ntfsSummaryPanel(s)}</div></details>
 </div><div class="dialog-actions">${editable?'<span class="permission-footer-diff" id="permissionFooterDiff"></span>':''}${elButton('关闭','dialog-close','btn ghost')}${editable?'<button type="submit" class="btn primary">保存 SMB 授权变更 '+icon('arrow-right',15)+'</button>':''}</div>`;
 pending=editable?{kind:'共享授权编辑',shareIndex:index}:null;
 dlg.innerHTML=editable?`<form id="dialogForm" method="dialog">${content}</form>`:content;
 if(!dlg.open)dlg.showModal();
 if(editable)refreshPermissionDiff();
}

function action(act,data={}){
 if(act==='game-scan-empty')return action('game-scan');
 if(act==='lan-scan-empty')return action('lan-scan');
 // No simulated mutations from the desktop program while Windows is disconnected.
 if(desktopDisconnected()&&!act.startsWith('radar-')&&!['admin-refresh','desktop-diagnostic','desktop-open-report','copy-last-error','theme','glass-mode','toggle-sidebar','close-sidebar','game-tab-minecraft','game-tab-all','game-tab-other','game-copy','game-cancel'].includes(act)){toast('尚未连接 Windows：请先重新连接或查看诊断，不允许模拟管理');return;}
 if(act==='copy-last-error'){if(navigator.clipboard?.writeText)navigator.clipboard.writeText(state.lastError).then(()=>toast('错误内容已复制')).catch(()=>toast('无法复制，请手动选择文字'));return;}
 if(act==='admin-copy-password'){
  const password=dlg.dataset.password||'';
  if(password&&navigator.clipboard){navigator.clipboard.writeText(password).then(()=>toast('密码已复制')).catch(()=>toast('复制失败，请手动选择密码'));}
  return;
 }
 if(act==='focus-share-from-permissions'){state.focus.share=data.key||'';state.page='shares';render();return;}
 if(act==='focus-user'){state.focus.user=data.key||'';render();return;}
 if(act==='focus-share'){state.focus.share=data.key||'';render();return;}
 if(act==='copy-unc'){copyText(data.value||'');return;}
 if(act==='share-copy-guide'){
  const sh=state.snapshot?.shares?.[Number(data.index)];if(!sh)return toast('共享已变化，请刷新');
  const host=state.snapshot?.computerName||'';const ip=selectedLanInterface()?.ip||'';
  const unc=String.fromCharCode(92,92)+(ip||host)+String.fromCharCode(92)+sh.name;
  // Plain-text instructions only; never embed passwords, store credentials or disconnect existing mappings.
  copyText('SwitchLAN 局域网共享连接说明\n共享：'+sh.name+'\n地址：'+unc+'\n如提示凭据，请输入共享主机上的授权账户及密码。\n如果主机名无法解析，可尝试 IPv4 地址；Everyone 共享授权不等于免密码访问。');return;
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
  if(state.radarRunning)return toast('请先停止监控再修改目标');
  const ip=(act==='radar-add'?root.querySelector('#radarIp')?.value:data.ip||'').trim();
  const port=act==='radar-add'?Number(root.querySelector('#radarPort')?.value||0):act==='radar-import-game'?Number(data.port||0):0;
  const name=(act==='radar-add'?root.querySelector('#radarName')?.value:data.name||'局域网设备').trim()||ip;
  const values=ip.split('.').map(Number);
  if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)||values.some(v=>v<0||v>255)||values[0]===0||values[0]>=224||values[0]===127||values[3]===255)return toast('请输入有效的单播 IPv4 地址');
  if(!Number.isInteger(port)||port<0||port>65535)return toast('TCP 端口应为 0–65535');
  if(state.radarTargets.length>=8)return toast('最多同时监控 8 台设备');
  if(state.radarTargets.some(t=>t.ip===ip&&t.port===port))return toast('这个监测地址和端口已经添加');
  const id=ip+'@'+port;
  state.radarTargets.push({id,ip,port,name:name.slice(0,60)});state.radarSelected=id;
  state.page='radar';render();radarDrawChart(false);return;
 }
 if(act==='radar-port-preset'){const input=root.querySelector('#radarPort');if(input){input.value=String(Number(data.port)||0);input.focus();}return;}
 if(act==='lan-to-radar'){
  if(state.radarRunning)return toast('监控运行中，请先停止后添加目标');
  action('radar-import-lan',{ip:data.ip,name:data.name||'局域网设备'});return;
 }
 if(act==='lan-to-games'){
  if(!data.ip)return;state.gameTargetIp=data.ip;state.gameTargetPort=25565;state.gameProtocol='java';state.gameTab='minecraft';state.page='games';render();return;
 }
 if(act==='radar-select'){state.radarSelected=data.id;render();radarDrawChart(false);return;}
 if(act==='radar-glass'){
  const next=state.glassMode==='full'?'subtle':state.glassMode==='subtle'?'off':'full';
  state.glassMode=next;
  try{localStorage.setItem('switchlan-glass-mode',next);}catch(_){}
  render();toast(next==='full'?'液态雷达：完整折射':next==='subtle'?'液态雷达：轻盈玻璃':'液态雷达：关闭光学特效');return;
 }
 if(act==='radar-window'){const sec=Number(data.seconds);if([60,120,300].includes(sec)){state.radarWindowSec=sec;root.querySelectorAll('.radar-window-btn').forEach(b=>{b.classList.toggle('active',Number(b.dataset.seconds)===sec);b.setAttribute('aria-pressed',String(Number(b.dataset.seconds)===sec));});radarDrawChart(false);}return;}
 if(act==='radar-remove'){
  if(state.radarRunning)return toast('请先停止监控再移除目标');
  state.radarTargets=state.radarTargets.filter(t=>t.id!==data.id);
  delete state.radarSamples[data.id];
  if(state.radarSelected===data.id)state.radarSelected=state.radarTargets[0]?.id||'';
  render();radarDrawChart(false);return;
 }
 if(act==='radar-start'){
  if(!live()||!desktopAvailable())return toast('需要 Windows 桌面连接才能监控');
  const nic=selectedLanInterface();if(!nic)return toast('请选择有效网卡');
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
  if(!live())return toast('需要连接 Windows');
  if(desktopPost('radar-listeners'))toast('正在读取 Windows TCP 监听端口…');
  return;
 }
 if(act.startsWith('game-tab-')){const tab=act.slice(9);if(['minecraft','all','other'].includes(tab)){state.gameTab=tab;render();}return;}
 if(act==='game-copy'){const value=data.address||'';if(validGameAddress(value))copyText(value);return;}
 if(act==='game-cancel'){
  if(state.gameBusy&&desktopAvailable()){window.chrome.webview.postMessage({type:'game-cancel'});toast('正在取消游戏扫描…');}
  return;
 }
 if(act==='game-scan'){
  const selected=selectedLanInterface();
  if(!live()||!selected)return toast('请先连接 Windows 并选择局域网网卡');
  if(state.gameBusy||desktopBusy)return toast('当前还有扫描任务');
  if(state.gameStartHost>state.gameEndHost)return toast('扫描范围不正确');
  if(desktopPost('game-scan',{localIp:selected.ip,startHost:state.gameStartHost,endHost:state.gameEndHost,mode:state.gameTab,customPort:state.gameCustomPort})){
   state.gameBusy=true;state.gameError='';state.gameNotice='正在扫描所选局域网；不会修改其他电脑…';render();
  }return;
 }
 if(act==='game-check'){
  const selected=selectedLanInterface();
  if(!live()||!selected)return toast('请先连接 Windows 并选择局域网网卡');
  if(state.gameBusy||desktopBusy)return toast('当前还有扫描任务');
  if(desktopPost('game-check',{localIp:selected.ip,targetIp:state.gameTargetIp.trim(),port:state.gameTargetPort,protocol:state.gameProtocol})){
   state.gameBusy=true;state.gameManual=null;state.gameError='';state.gameNotice='正在验证指定地址…';render();
  }return;
 }
 if(act==='connections-refresh'){if(!live())return toast('需要先连接 Windows');if(desktopPost('connections-refresh'))toast('正在读取 SMB 当前会话…');return;}
 if(act==='lan-view-map'||act==='lan-view-list'){state.lanView=act.slice('lan-view-'.length);render();return;}
 if(act==='lan-map-focus'){state.lanExpanded[data.ip]=true;render();const target=[...root.querySelectorAll('.lan-device-card')].find(e=>e.getAttribute('aria-label')==='设备 '+data.ip);if(target)target.scrollIntoView({behavior:'smooth',block:'start'});return;}
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
   window.chrome.webview.postMessage({type:'lan-cancel'});toast('正在停止扫描…');
  }
  return;
 }
 if(act==='lan-rescan-one'){
  if(desktopPost('lan-rescan-one',{ip:data.ip,localIp:selectedLanInterface()?.ip||''})){
   // Access status is invalidated after probing the target again.
   state.lanSingleBusy=data.ip;toast('正在重新探测 '+data.ip);
  }
  return;
 }
 if(act==='lan-open-share'){
  if(desktopAvailable())window.chrome.webview.postMessage({type:'lan-open-share',ip:data.ip,share:data.share});return;
 }
 if(act==='lan-share-check'){if(desktopPost('lan-share-check',{ip:data.ip,share:data.share}))toast('正在尝试只读列举远端目录…');return;}
 if(act==='go-users'){state.page='users';render();return;}
 if(act==='admin-refresh'){if(desktopAvailable()&&!live()){state.desktopConnection='connecting';state.lastError='';}if(desktopPost('admin-refresh')){render();toast('正在读取本机状态…');}return;}
 if(act==='admin-delete-existing-user')return showDeleteExistingUser(Number(data.index));
 if(act==='admin-unshare-existing')return showUnshareExisting(Number(data.index));
 if(act==='security-scan'){if(desktopPost('security-scan'))toast('正在读取 Windows 的安全配置…');return;}
 if(act==='admin-edit-user')return showEditUser(Number(data.index));
 if(act==='admin-set-existing-user-enabled')return showExistingUserStatus(Number(data.index),data.enabled==='true');
 if(act==='admin-reset-existing-user-password')return showExistingUserPassword(Number(data.index));
 if(act==='admin-edit-share-access')return showEditShareAccess(Number(data.index),data.sid||'');
 if(act==='access-pick-user'){const input=dlg.querySelector('#shareAccessUser');if(input){input.value=data.sid||'';refreshPermissionDiff();input.focus();}return;}
 if(act==='share-refresh'){closeDialog();if(desktopPost('admin-refresh'))toast('正在重新读取 Windows 权限…');return;}
 if(act==='lan-scan'){
  const selected=selectedLanInterface();
  if(!selected)return toast('未找到可用的私有 IPv4 网卡');
  if(!lanScanAllowed())return toast('当前无法开始扫描，请先完成其他操作');
  if(desktopPost('lan-scan',{localIp:selected.ip,startHost:state.lanStartHost,endHost:state.lanEndHost})){
   state.lanScanStartedAt=Date.now();state.lanProgress={done:0,total:state.lanEndHost-state.lanStartHost+1};
   state.lanScanning=true;state.lanFilter='all';render();toast('已开始探测 '+lanSubnet(selected.ip));
  }
  return;
 }
 if(act==='admin-new-user')return showAdminUserForm();
 if(act==='admin-new-share')return showAdminShareForm();
 if(act==='admin-delete-user')return showAdminDeleteUser(data.name||'');
 if(act==='admin-reset-user-password')return showAdminResetPassword(data.name||'');
 if(act==='admin-set-user-enabled')return showAdminSetUserEnabled(data.name||'',data.enabled==='true');
 if(act==='admin-delete-share')return showAdminDeleteShare(data.name||'');
 if(act==='admin-pick-folder'){if(desktopPost('admin-pick-folder'))toast('请选择文件夹…');return;}
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
  render();toast(mode==='off'?'已关闭液态玻璃效果':mode==='full'?'已开启完整液态玻璃效果':'已切换为轻盈玻璃效果');return;
 }
 if(act==='theme'){state.theme=state.theme==='dark'?'light':'dark';render();return;}
 if(act==='import-snapshot'){document.getElementById('snapshotFile').click();return;}
 if(act==='desktop-diagnostic'){if(desktopPost('run-diagnostic'))toast('正在以普通用户运行只读诊断…');return;}
 if(act==='desktop-export'){if(desktopPost('export-snapshot'))toast('正在读取本机只读快照…');return;}
 if(act==='desktop-open-report'){if(desktopAvailable())window.chrome.webview.postMessage({type:'open-diagnostics'});return;}
 if(act==='back-demo'){state.mode='demo';state.snapshot=null;state.liveMode=false;render();toast('已返回演示模式');return;}
 if(act==='dialog-close'){closeDialog();return;}if(act==='share-permissions'){closeDialog();state.page='permissions';render();return;}
 if(act==='apply-preview'){if(!pending||pending.kind!=='preview')return;const fn=pending.commit;closeDialog();fn();return;}
 if(act==='go-security'){state.page='security';render();return;}if(act==='go-knowledge'){state.page='knowledge';render();return;}
 if(act==='new-user')return showForm('user');if(act==='new-share')return showForm('share');if(act==='new-peer')return showForm('peer');
 if(act.startsWith('permission-')){const rest=act.substring('permission-'.length);const share=rest.split('-')[0],sid=rest.substring(share.length+1);return showForm('permission',{share,sid});}
 if(act.startsWith('inspect-share-')){const id=act.substring('inspect-share-'.length);if(id.startsWith('real-')&&real()){const sh=state.snapshot?.shares?.[Number(id.slice(5))];if(sh){state.focus.share=sh.name;state.page='shares';render();return;}}return showInspectShare(id);}
 if(ro()){toast('只读快照禁止修改 Windows');return;}
 // Core edition never exposes the old simulated write actions.
 if(!desktopAvailable()){toast('请运行 Windows 桌面程序后再进行管理操作');return;}
 if(act==='toggle-rule'){
  if(!state.managedEnabled){preview('模拟开放局域网访问',[`允许 ${state.peers.filter(p=>p.enabled).length} 个设备或网段`, '仅计划托管 TCP 445 入站规则','系统防火墙仍保持开启','实际开放前需先核查其他宽泛允许规则'],()=>{state.managedEnabled=true;log('模拟启用规则','托管规则设为开放');render();toast('演示：托管规则已开启');},true);}else{preview('模拟关闭局域网访问',['禁用本工具管理的规则','不会关闭整个 Windows 防火墙','已有 SMB 会话不保证立即断开','需另行检查系统中其他允许规则'],()=>{state.managedEnabled=false;log('模拟关闭规则','托管规则设为关闭');render();toast('演示：托管规则已关闭');});}return;
 }
 if(act.startsWith('toggle-user-')){const u=getUser(act.substring(12));if(!u?.managed)return;preview(`${u.enabled?'禁用':'启用'}模拟账户`,[`账户：${u.name}`,u.enabled?'禁止此账户以后发起新的身份认证':'允许此账户再次进行身份认证','不代表立即断开已建立的 SMB 会话'],()=>{u.enabled=!u.enabled;log('模拟账户状态',`${u.name} → ${u.enabled?'启用':'禁用'}`);render();toast('演示账户状态已更新');},u.enabled);return;}
 if(act.startsWith('delete-user-')){const u=getUser(act.substring(12));if(!u?.managed)return;const ref=state.shares.filter(s=>s.permissions.some(p=>p.sid===u.sid)).map(s=>s.name);preview('删除模拟账户',[`将删除 ${u.name}`,`涉及授权共享：${ref.join('、')||'无'}`,'先撤销各共享中的该用户授权','不会删除任何真实 Windows 用户或磁盘文件'],()=>{state.users=state.users.filter(x=>x.sid!==u.sid);for(const s of state.shares)s.permissions=s.permissions.filter(p=>p.sid!==u.sid);log('模拟删除账户',u.name);render();toast('模拟账户已删除');},true);return;}
 if(act.startsWith('edit-share-')){const s=state.shares.find(x=>x.id===act.substring(11));if(!s)return;showInspectShare(s.id);return;}
 if(act.startsWith('delete-share-')){const s=state.shares.find(x=>x.id===act.substring(13));if(!s||!s.managed)return;closeDialog();preview('确认删除模拟共享',[`将移除共享入口：${s.name}`,`本地文件夹：${s.path}`,'不会删除磁盘中的任何文件','原有真实 NTFS ACL 需要在正式版中单独审查和处理'],()=>{state.shares=state.shares.filter(x=>x.id!==s.id);log('模拟删除共享',s.name);render();toast('演示共享入口已删除');},true);return;}
 if(act.startsWith('toggle-peer-')){const p=state.peers.find(x=>x.id===act.substring(12));if(!p)return;preview('调整模拟设备状态',[`${p.name} (${p.ip})`,p.enabled?'从白名单中暂停此设备':'启用此设备的白名单条目'],()=>{p.enabled=!p.enabled;log('模拟设备状态',`${p.name} → ${p.enabled?'允许':'暂停'}`);render();toast('设备状态已更新');});return;}
 if(act.startsWith('delete-peer-')){const p=state.peers.find(x=>x.id===act.substring(12));if(!p)return;preview('删除模拟白名单条目',[`删除 ${p.name} (${p.ip})`,'不会删除 Windows 用户或共享文件'],()=>{state.peers=state.peers.filter(x=>x.id!==p.id);log('模拟删除设备',p.name);render();toast('白名单条目已删除');},true);return;}
 if(act.startsWith('drop-session-')){const s=state.sessions.find(x=>x.id===act.substring(13));if(!s)return;preview('模拟断开 SMB 会话',[`客户端 ${s.name}`,`账户 ${s.account}`,'真实操作可能影响正在传输的文件','断开连接不等于自动清除对方保存的登录凭据'],()=>{state.sessions=state.sessions.filter(x=>x.id!==s.id);log('模拟断开会话',s.name);render();toast('已在演示数据中断开会话');},true);return;}
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
  if(!Number.isInteger(num)||num<min||num>max){toast('端口或主机号超出允许范围');render();return;}
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
  if(!Number.isInteger(value)||value<1||value>254){toast('主机号只能是 1–254');e.target.value=e.target.id==='lanStartHost'?state.lanStartHost:state.lanEndHost;return;}
  if(e.target.id==='lanStartHost')state.lanStartHost=value;else state.lanEndHost=value;
  if(state.lanStartHost>state.lanEndHost){toast('起始地址不能大于结束地址');
   if(e.target.id==='lanStartHost'){state.lanEndHost=value;root.querySelector('#lanEndHost').value=value;}
   else{state.lanStartHost=value;root.querySelector('#lanStartHost').value=value;}}
  return;
 }
 if(e.target.id==='peerMode'){
  const next=e.target.value;if(next==='subnet'){preview('确认模拟切换宽范围模式',['整段网段可能包括未知设备','白名单中每台 IP 不再是唯一可放行的来源','即使设备被允许，仍须账户和文件夹授权'],()=>{state.peerMode='subnet';log('模拟策略切换','整段网段');render();toast('演示：已切换模式');},true);}else{state.peerMode='allowlist';log('模拟策略切换','白名单');render();}return;
 }
 if(e.target.id==='icmp-toggle'){state.icmpEnabled=e.target.checked;log('模拟 ICMP 切换',state.icmpEnabled?'启用':'禁用');render();toast('仅更改演示设置');}
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
  count.textContent=list.length+' 个词条';
  grid.innerHTML=list.map(x=>`<article class="glossary-card"><span class="eyebrow">${esc(x.tag)}</span><h3>${esc(x.term)}</h3><p>${esc(x.desc)}</p><div class="glossary-example"><strong>例如</strong> ${esc(x.example)}</div></article>`).join('')||'<p>没有找到相关术语。</p>';
 }
});
dlg.addEventListener('click',e=>{if(e.target===dlg)closeDialog();});
document.getElementById('snapshotFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];e.target.value='';if(!file)return;
 if(file.size>2_000_000){toast('快照文件超过 2MB，请确认文件来源');return;}
 try{state.liveMode=false;state.managedUsers=[];state.managedShares=[];applySnapshot(validateSnapshot(JSON.parse(await file.text())));}
 catch(err){toast('快照无法读取：'+String(err.message||err).slice(0,60));}
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
   state.lastError='已等待超过 110 秒，仍未收到 Windows 后端响应。请运行 Check-SwitchLAN.cmd 查看消息和导航日志。';
   render();
  }
 },110000);
}
})();
