import os
"""Core 1.4 UI integration, all Windows bridge replies are mocked; no real Windows reads."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import shutil
ROOT=Path(__file__).resolve().parents[1]
SNAP={
 'kind':'switchlan-readonly-snapshot','schemaVersion':1,'capturedAt':'2026-10-29 00:00 MOCK',
 'computerName':'LABPC','activeUserSid':'S-1-5-21-1-2-3-1000',
 'users':[{'name':'Admin','sid':'S-1-5-21-1-2-3-1000','enabled':True,'isAdministrator':True,'groups':['Administrators']},
          {'name':'Reader','sid':'S-1-5-21-1-2-3-1001','enabled':True,'isAdministrator':False,'groups':['Users']}],
 'shares':[{'name':'Study','path':'D:\\Study','special':False,'permissionsReadable':True,'permissions':[
    {'account':'Everyone','accessRight':'Full','accessControlType':'Allow'},
    {'account':'LABPC\\Reader','accessRight':'Read','accessControlType':'Allow'},
    {'account':'BUILTIN\\Users','accessRight':'Change','accessControlType':'Allow'}],
    'ntfsReadable':True,'ntfs':{'owner':'LABPC\\Admin','inheritanceProtected':False,'truncated':False,
        'access':[{'identity':'LABPC\\Reader','rights':'ReadAndExecute','type':'Allow','inherited':True}]}},
    {'name':'Data','path':'E:\\Data','special':False,'permissionsReadable':False,'ntfsReadable':False}],
 'interfaces':[{'name':'Ethernet','status':'Up','isVirtual':False,'speed':'1 Gbps','ipv4':[{'ip':'192.168.10.21','prefix':24}]}],
 'sessions':[],'firewallProfiles':[],'warnings':[]
}
def emit(page,msg):page.evaluate('m=>window.__bridge({data:m})',msg)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('SWITCHLAN_CHROMIUM') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1400,'height':920})
 errors=[]
 page.on('pageerror', lambda err:errors.append(str(err)))
 html=(ROOT/'index.html').read_text('utf-8')
 scripts=['js/knowledge.js','js/policy.js','js/data.js','js/app.js','js/liquid-fusion.js']
 for f in scripts:html=html.replace(f'<script src="{f}"></script>','')
 page.set_content(html)
 page.add_style_tag(content=(ROOT/'assets/style.css').read_text('utf-8'))
 page.evaluate('window.__msgs=[];window.chrome={webview:{postMessage:m=>window.__msgs.push(m),addEventListener:(t,cb)=>{if(t==="message")window.__bridge=cb}}}')
 for f in scripts:page.add_script_tag(content=(ROOT/f).read_text('utf-8'))
 emit(page,{'type':'admin-result','ok':True,'operation':'admin-refresh','snapshot':SNAP,'managed':{'users':[],'shares':[]}})
 assert page.locator('[data-page="permissions"]').count()==1
 page.locator('[data-page="permissions"]').click()
 page.locator('#analysisUser').select_option('S-1-5-21-1-2-3-1001')
 assert 'Name/SID matches selected account' in page.locator('main').inner_text()
 assert 'Name matches local group read' in page.locator('main').inner_text()
 assert 'Not an effective access calculation' in page.locator('main').inner_text()
 page.locator('#analysisShare').select_option('Data')
 assert 'SMB permissions could not be read' in page.locator('main').inner_text()
 assert 'Incomplete' in page.locator('main').inner_text()
 page.locator('[data-page="connections"]').click()
 assert page.evaluate('window.__msgs.at(-1).type')=='connections-refresh'
 emit(page,{'type':'connections-result','ok':True,'data':{
  'kind':'switchlan-local-smb-connections','schemaVersion':1,'capturedAt':'2026-10-29 01:00 MOCK',
  'sessionsReadable':True,'filesReadable':True,'sessionsTruncated':False,'filesTruncated':False,'warnings':[],
  'sessions':[{'sessionId':'123','client':'192.168.10.22','username':'LABPC\\Reader','numOpens':1,'dialect':'3.1.1'}],
  'files':[{'fileId':'456','sessionId':'123','client':'192.168.10.22','username':'LABPC\\Reader','path':'D:\\Study\\notes.txt','shareRelativePath':'notes.txt'}]
 }})
 assert '192.168.10.22' in page.locator('.connection-list').first.inner_text()
 assert 'notes.txt' in page.locator('.connection-list').last.inner_text()
 # Partial failure must be UNKNOWN, not empty/zero.
 emit(page,{'type':'connections-result','ok':True,'data':{
  'kind':'switchlan-local-smb-connections','schemaVersion':1,'capturedAt':'MOCK',
  'sessionsReadable':False,'filesReadable':False,'sessions':[],'files':[],
  'warnings':['Insufficient permissions']}})
 assert 'Status unknown' in page.locator('main').inner_text()
 assert 'Unknown does not mean zero sessions' in page.locator('main').inner_text()
 page.locator('[data-page="lan"]').click()
 emit(page,{'type':'lan-scan-result','ok':True,'result':{'subnet':'192.168.10.0/24','localIp':'192.168.10.21','devices':[
 {'ip':'192.168.10.22','hostname':'TESTPC','ping':True,'port445':True,'shares':['ShareA'],'status':'SMB Reachable'},
 {'ip':'192.168.10.23','hostname':'Printer','ping':True,'port445':False,'shares':[],'status':'Ping response'}]}})
 assert page.locator('.lan-map-node').count()==2
 assert 'Not a physical topology map' in page.locator('.lan-map-panel').inner_text()
 page.locator('.lan-map-node').first.click()
 assert page.locator('.lan-device-card.expanded').count()==1
 page.locator('[data-action="lan-view-list"]').click()
 assert page.locator('.lan-map-panel').count()==0
 assert page.locator('.lan-device-card').count()==2
 # Narrow width: map and analyzer remain within content width.
 page.set_viewport_size({'width':420,'height':850})
 page.locator('[data-action="lan-view-map"]').click()
 assert page.locator('.lan-map-node').count()==2
 assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth+2'), 'horizontal overflow'
 assert not errors,errors
 b.close()
print('PASS: permission evidence, partial SMB read, live bridge request and observed LAN map + narrow screen')
