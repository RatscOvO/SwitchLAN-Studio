import os
"""Core 1.4.5 UX smoke checks. ALL Windows and network values are synthetic."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import shutil
ROOT=Path(__file__).resolve().parents[1]
SNAP={
 'kind':'switchlan-readonly-snapshot','schemaVersion':1,'capturedAt':'2026-10-31 10:00 MOCK','computerName':'LABPC','activeUserSid':'S-1-5-21-1-2-3-1000',
 'users':[{'name':'Admin','sid':'S-1-5-21-1-2-3-1000','enabled':True,'isAdministrator':True,'groups':['Administrators']},
          {'name':'LongNicknameSharedAccount','sid':'S-1-5-21-1-2-3-1001','enabled':True,'isAdministrator':False,'groups':['Users'],'fullName':'Share account','lastLogon':'2026-10-30T10:00:00+08:00'}],
 'shares':[{'name':'Study','path':'D:\\Study','special':False,'permissionsReadable':True,'permissions':[{'account':'Everyone','accessRight':'Full','accessControlType':'Allow'}], 'ntfsReadable':True,'ntfs':{'owner':'LABPC\\Admin','inheritanceProtected':False,'truncated':False,'access':[{'identity':'LABPC\\LongNicknameSharedAccount','rights':'ReadAndExecute','type':'Allow','inherited':True}]}}],
 'interfaces':[{'name':'Ethernet','status':'Up','isVirtual':False,'speed':'1 Gbps','ipv4':[{'ip':'192.168.10.21','prefix':24}]}],
 'sessions':[],'firewallProfiles':[],'warnings':[]}
scriptfiles=['js/knowledge.js','js/policy.js','js/data.js','js/app.js','js/liquid-fusion.js']
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SWITCHLAN_CHROMIUM') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1500,'height':900},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
 html=(ROOT/'index.html').read_text('utf8')
 for fn in scriptfiles:html=html.replace(f'<script src="{fn}"></script>','')
 page.set_content(html);page.add_style_tag(content=(ROOT/'assets/style.css').read_text('utf8'))
 page.evaluate('window.__msgs=[];window.chrome={webview:{postMessage:m=>window.__msgs.push(m),addEventListener:(t,cb)=>{if(t==="message")window.__bridge=cb}}}')
 for fn in scriptfiles:page.add_script_tag(content=(ROOT/fn).read_text('utf8'))
 page.evaluate('(m)=>window.__bridge({data:m})',{'type':'admin-result','ok':True,'operation':'admin-refresh','snapshot':SNAP,'managed':{'users':[],'shares':[]}})
 assert page.locator('[data-action="copy-unc"]').count()>=2
 ipBtn=page.locator('[data-action="copy-unc"]').filter(has_text='IPv4')
 assert ipBtn.count()==1
 assert ipBtn.get_attribute('data-value')=='\\\\192.168.10.21\\Study',repr(ipBtn.get_attribute('data-value'))
 assert page.locator('.core-step-bullet').count()==0
 assert page.evaluate('document.documentElement.scrollHeight <= document.documentElement.clientHeight+2'),page.evaluate('({scroll:document.documentElement.scrollHeight,client:document.documentElement.clientHeight})')
 assert page.locator('.core-shell .content').evaluate('(e)=>getComputedStyle(e).overflowY')=='auto'
 (ROOT/'docs').mkdir(exist_ok=True)
 page.screenshot(path=str(ROOT/'docs/preview-english-shares-MOCK.png'))
 page.locator('[data-page="users"]').click()
 assert page.locator('.account-facts-grid').count()==1
 assert page.locator('.account-status-dot').count()>=1
 assert page.locator('.core-object-summary').count()==0
 assert page.locator('.account-facts-grid').is_visible()
 page.screenshot(path=str(ROOT/'docs/preview-english-users-MOCK.png'))
 # Simulated discovery, using the production UI renderer and action dispatcher.
 page.evaluate('''() => {window.__bridge({data:{type:'lan-scan-result',ok:true,result:{subnet:'192.168.10.0/24',localIp:'192.168.10.21',devices:[{ip:'192.168.10.20',hostname:'FRIEND-PC',ping:true,pingMs:3,port445:true,shares:['Public']}], scannedAt:'2026-10-31T10:00:00+08:00'}}})}''')
 page.locator('[data-page="lan"]').click()
 assert page.locator('[data-action="lan-to-games"]').count()>=1
 page.locator('[data-action="lan-to-games"]').first.click()
 assert page.locator('#gameTargetIp').input_value()=='192.168.10.20'
 assert page.locator('.game-range-advanced').count()==1
 page.screenshot(path=str(ROOT/'docs/preview-english-games-MOCK.png'))
 page.locator('[data-page="radar"]').click()
 assert page.locator('#radarPort').input_value()==''
 assert page.locator('#radarChartEmpty').is_visible()
 assert 'Waiting for live samples' in page.locator('#radarChartEmpty').inner_text()
 page.locator('[data-action="radar-port-preset"][data-port="25565"]').click()
 assert page.locator('#radarPort').input_value()=='25565'
 page.screenshot(path=str(ROOT/'docs/preview-english-radar-MOCK.png'))
 # Synthetic samples prove spike logging and chart are generated from supplied observations.
 page.locator('#radarName').fill('Minecraft LAN test')
 page.locator('#radarIp').fill('192.168.10.20')
 page.locator('[data-action="radar-add"]').click()
 page.locator('[data-action="radar-start"]').click()
 page.evaluate('(m)=>window.__bridge({data:m})',{'type':'radar-state','runId':48,'running':True})
 import datetime
 start=datetime.datetime(2026,10,31,10,0,0,tzinfo=datetime.timezone(datetime.timedelta(hours=8)))
 for i in range(26):
  sample={'type':'radar-sample','runId':48,'sample':{'capturedAt':(start+datetime.timedelta(seconds=i*2)).isoformat(),
   'probes':[{'id':'192.168.10.20@25565','icmp':'ok','icmpMs':(240.0 if i==22 else 3.0+i%3),'tcp':'ok','tcpMs':2.0}],
   'traffic':{'status':'ok','adapterName':'Ethernet','receiveBps':65431,'sendBps':32112}}}
  page.evaluate('(m)=>window.__bridge({data:m})',sample)
 assert 'ICMP RTT spike' in page.locator('.radar-events').inner_text()
 assert page.locator('#radarLinePaths path').count()>0
 page.screenshot(path=str(ROOT/'docs/preview-english-radar-live-MOCK.png'))
 page.set_viewport_size({'width':760,'height':900})
 assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth+5'), page.evaluate('({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})')
 assert not errors,errors
 print('PASS: shell fixed, IP UNC, user compact, LAN -> game, radar preset/empty, responsive; mock Windows data')
 browser.close()
