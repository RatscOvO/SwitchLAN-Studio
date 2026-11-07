(function () {
  'use strict';
  const ROLES=['none','read','change','full'];
  const roleRank = {none:0,read:1,change:2,full:3};
  const roleText = {none:"No permission entry",read:"Read-only",change:"Modify",full:"Full control"};
  function validIPv4(ip) {
    if (typeof ip!=='string'||!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
    return ip.split('.').every((x)=> Number(x)>=0&&Number(x)<=255&&(x==='0'||!x.startsWith('0')));
  }
  function validPeer(value) {
    if (typeof value!=='string') return false;
    const parts=value.split('/');
    if(parts.length===1) return validIPv4(parts[0]);
    return parts.length===2 && validIPv4(parts[0]) && /^(0|[1-9]\d?)$/.test(parts[1]) && Number(parts[1])<=32;
  }
  function validAccount(v) { return typeof v==='string' && /^[a-zA-Z][a-zA-Z0-9_.-]{2,19}$/.test(v) && !/[.]$/.test(v); }
  function validShare(v) { return typeof v==='string' && v.length>=2 && v.length<=60 && !/[\\/\[\]:;|=,+*?<>"\s]/.test(v) && !v.endsWith('$') && !['.','..'].includes(v) && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(v); }
  function safePath(p) {
    if(typeof p!=='string'||! /^[A-Za-z]:\\.+/.test(p)||p.includes('..') || /[\u0000-\u001f]/.test(p)) return false;
    const s=p.replace(/\\+$/,'').toLowerCase();
    if(/^[a-z]:$/.test(s) || /^[a-z]:\\(windows|program files|program files \(x86\)|programdata)(\\|$)/.test(s) || /^[a-z]:\\users(\\|$)/.test(s)) return false;
    return true;
  }
  function permissionSummary(smb,ntfs){
    if(!ROLES.includes(smb)||!ROLES.includes(ntfs)) return "Unverified";
    if(smb==='none'||ntfs==='none') return "No permission entry (direct entries shown here only)";
    const rank=Math.min(roleRank[smb],roleRank[ntfs]);
    return roleText[ROLES[rank]]+" (theoretical intersection; verify groups and inheritance)";
  }
  window.SL_POLICY={validIPv4,validPeer,validAccount,validShare,safePath,permissionSummary,roleText,ROLES};
})();
