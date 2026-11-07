import os
"""Game UI / bridge integration test: ALL network replies are MOCK; not Windows verification."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import shutil
ROOT = Path(__file__).resolve().parents[1]
SNAP={
 'kind':'switchlan-readonly-snapshot','schemaVersion':1,'capturedAt':'2026-10-29 MOCK',
 'computerName':'LABPC','activeUserSid':'S-1-5-21-1-2-3-1000',
 'users':[],'shares':[],
 'interfaces':[{'name':'Ethernet','status':'Up','isVirtual':False,'speed':'1 Gbps','ipv4':[{'ip':'192.168.10.21','prefix':24}]}],
 'sessions':[],'firewallProfiles':[],'warnings':[]}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('SWITCHLAN_CHROMIUM') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1380,'height':920},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 html=(ROOT/'index.html').read_text('utf-8')
 scripts=['js/knowledge.js','js/policy.js','js/data.js','js/app.js','js/liquid-fusion.js']
 for f in scripts:html=html.replace(f'<script src="{f}"></script>','')
 page.set_content(html)
 page.add_style_tag(content=(ROOT/'assets/style.css').read_text('utf-8'))
 page.evaluate('window.__msgs=[];window.chrome={webview:{postMessage:m=>window.__msgs.push(m),addEventListener:(t,cb)=>{if(t==="message")window.__bridge=cb}}}')
 for f in scripts:page.add_script_tag(content=(ROOT/f).read_text('utf-8'))
 # game page must be reachable even when offline and must NEVER show fictional results
 page.locator('[data-page="games"]').click()
 assert page.locator('.game-feature').count()==3
 assert page.locator('.game-server-card').count()==0
 assert 'No live Windows connection is available' in page.locator('main').inner_text()
 page.evaluate('(m)=>window.__bridge({data:m})',{'type':'admin-result','ok':True,'operation':'admin-refresh','snapshot':SNAP,'managed':{'users':[],'shares':[]}})
 page.locator('[data-page="games"]').click()
 page.locator('[data-action="game-scan"]').click()
 msg=page.evaluate('window.__msgs.at(-1)')
 assert msg['type']=='game-scan' and msg['localIp']=='192.168.10.21' and msg['mode']=='minecraft'
 page.evaluate('(m)=>window.__bridge({data:m})',{'type':'game-result','ok':True,'mode':'scan','result':{'localIp':'192.168.10.21','subnet':'192.168.10.0/24','scannedHosts':254,'scannedAt':'MOCK','warnings':[],'games':[
 {'ip':'192.168.10.20','port':25565,'game':'Minecraft','edition':'Java','verification':'verified','discovery':'Java State Protocol','title':'Friend’s survival world','version':'1.21.x','online':2,'maxPlayers':8},
 {'ip':'192.168.10.23','port':25565,'game':'Minecraft','edition':'Java','verification':'tcp-only','discovery':'TCP probe','title':None,'version':None,'online':None,'maxPlayers':None},
 {'ip':'192.168.10.25','port':7777,'game':'Terraria','edition':'TCP','verification':'tcp-only','discovery':'TCP probe','title':None,'version':None,'online':None,'maxPlayers':None}
 ]}})
 assert page.locator('.game-server-card').count()==2
 assert 'Game protocol verified' in page.locator('main').inner_text()
 assert 'TCP connection only' in page.locator('main').inner_text()
 assert page.locator('[data-address="192.168.10.20:25565"]').count()==1
 page.screenshot(path=str(ROOT/'docs/preview-core141-games-MOCK.png'),full_page=True)
 page.locator('[data-action="game-tab-other"]').click()
 assert page.locator('.game-server-card').count()==1
 page.locator('#gameCustomPort').fill('27015');page.locator('#gameCustomPort').blur()
 page.locator('[data-action="game-scan"]').click()
 assert page.evaluate('window.__msgs.at(-1).customPort')==27015
 page.evaluate('(m)=>window.__bridge({data:m})',{'type':'game-result','ok':False,'cancelled':True})
 page.locator('#gameTargetIp').fill('192.168.10.20')
 page.locator('#gameTargetPort').fill('25565');page.locator('#gameTargetPort').blur()
 page.locator('[data-action="game-check"]').click()
 assert page.evaluate('window.__msgs.at(-1).type')=='game-check'
 page.evaluate('(m)=>window.__bridge({data:m})',{'type':'game-result','ok':True,'mode':'check','result':{'reachable':False,'endpoint':None,'note':'No response received'}})
 assert 'No response received' in page.locator('main').inner_text()
 page.set_viewport_size({'width':420,'height':860})
 page.locator('[data-action="game-tab-minecraft"]').click()
 assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth+2'), 'horizontal overflow'
 page.screenshot(path=str(ROOT/'docs/preview-core141-games-narrow-MOCK.png'),full_page=True)
 assert not errors,errors
 b.close()
print('PASS: game tabs, offline no fake data, desktop scan/check contracts, statuses, port input, 420px responsive')
