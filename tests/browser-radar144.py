import os
"""Core 1.4.4 Liquid Radar checks with synthetic bridge data (not Windows verification)."""
from pathlib import Path
from datetime import datetime,timedelta,timezone
from playwright.sync_api import sync_playwright
import shutil
ROOT=Path(__file__).resolve().parents[1]
SNAP={'kind':'switchlan-readonly-snapshot','schemaVersion':1,'capturedAt':'MOCK','computerName':'LABPC','activeUserSid':'S-1-5-21-1-2-3-1000','users':[],'shares':[],'interfaces':[{'name':'Ethernet','status':'Up','isVirtual':False,'speed':'1 Gbps','ipv4':[{'ip':'192.168.10.21','prefix':24}]}],'sessions':[],'firewallProfiles':[],'warnings':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SWITCHLAN_CHROMIUM') or shutil.which('chromium'),headless=True,args=['--no-sandbox','--enable-features=CSSBackdropFilter'])
 page=browser.new_page(viewport={'width':1490,'height':900},device_scale_factor=1)
 errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
 html=(ROOT/'index.html').read_text('utf-8')
 sourcefiles=['js/knowledge.js','js/policy.js','js/data.js','js/app.js','js/liquid-fusion.js']
 for f in sourcefiles:html=html.replace(f'<script src="{f}"></script>','')
 page.set_content(html)
 page.add_style_tag(content=(ROOT/'assets/style.css').read_text('utf-8'))
 page.evaluate('window.__msgs=[];window.chrome={webview:{postMessage:m=>window.__msgs.push(m),addEventListener:(t,cb)=>{if(t==="message")window.__bridge=cb}}}')
 for f in sourcefiles:page.add_script_tag(content=(ROOT/f).read_text('utf-8'))
 page.evaluate('(m)=>window.__bridge({data:m})',{'type':'admin-result','ok':True,'operation':'admin-refresh','snapshot':SNAP,'managed':{'users':[],'shares':[]}})
 page.locator('[data-page="radar"]').click()
 page.locator('#radarName').fill("Friend's Computer · Minecraft");page.locator('#radarIp').fill('192.168.10.20');page.locator('#radarPort').fill('25565');page.locator('[data-action="radar-add"]').click()
 assert page.locator('#radarChartSvg').count()==1
 assert page.locator('.radar-liquid-atmosphere').count()==1
 assert page.locator('.radar-liquid-refraction').count()==1
 assert page.locator('.radar-optics-switch').count()==1
 assert 'Full' in page.locator('.radar-optics-switch').inner_text()
 assert page.locator('body').get_attribute('data-glass')=='full'
 # Decorations behind unfiltered SVG and not inside observed data paths.
 assert page.evaluate('''() => {let a=document.querySelector('.radar-liquid-refraction'), s=document.querySelector('#radarChartSvg');return +getComputedStyle(a).zIndex < +getComputedStyle(s).zIndex && getComputedStyle(s).filter==='none'}''')
 # User can cycle optics while retaining target, independent native bridge.
 page.locator('[data-action="radar-glass"]').click();assert page.locator('body').get_attribute('data-glass')=='subtle'
 page.locator('[data-action="radar-glass"]').click();assert page.locator('body').get_attribute('data-glass')=='off'
 assert page.evaluate("getComputedStyle(document.querySelector('.radar-liquid-atmosphere')).display")=='none'
 page.locator('[data-action="radar-glass"]').click();assert page.locator('body').get_attribute('data-glass')=='full'
 # about:blank inline fixture disallows localStorage; persistence is checked with HTTP-origin integration below.
 page.locator('[data-action="radar-start"]').click()
 page.evaluate('(m)=>window.__bridge({data:m})',{'type':'radar-state','running':True,'runId':71})
 page.evaluate('document.querySelector("#radarChartSvg").__sentinel=144')
 base=datetime(2026,10,29,9,0,tzinfo=timezone(timedelta(hours=8)))
 for i in range(58):
  ts=(base+timedelta(seconds=2*i)).isoformat()
  status='timeout' if i in (16,17,18,35) else 'ok'
  latency=26.3 if i==28 else (2.4+(i%5)*.45)
  page.evaluate('(m)=>window.__bridge({data:m})',{'type':'radar-sample','runId':71,'sample':{'capturedAt':ts,'probes':[{'id':'192.168.10.20@25565','ip':'192.168.10.20','port':25565,'icmp':status,'icmpMs':latency if status=='ok' else None,'tcp':'ok','tcpMs':2.5}], 'traffic':{'receiveBps':230111,'sendBps':3000,'adapterName':'Ethernet','status':'ok'}}})
 assert page.evaluate('document.querySelector("#radarChartSvg").__sentinel')==144
 assert page.locator('#radarLossZones rect').count()==4
 assert page.locator('.radar-recovered').count()>=1
 assert page.locator('.radar-spike').count()>=1
 assert page.locator('#radarChartStage').get_attribute('data-probe')=='reply'
 assert page.locator('#radarChartStage').get_attribute('data-streaming')=='true'
 assert page.locator('#radarLinePaths path').count()>=1
 assert 'ICMP no-response rate' in page.locator('#radarLiveView').inner_text()
 # UI hover lens doesn't change data or chart SVG paths.
 current=page.locator('#radarLinePaths').inner_html()
 rect=page.locator('#radarChartStage').bounding_box()
 page.mouse.move(rect['x']+rect['width']*.92,rect['y']+rect['height']*.55)
 assert page.locator('#radarTooltip').is_visible()
 assert page.locator('#radarLinePaths').inner_html()==current
 assert not errs,errs
 page.mouse.move(1300,130)
 page.wait_for_timeout(1000)
 (ROOT/'docs').mkdir(exist_ok=True)
 page.screenshot(path=str(ROOT/'docs/preview-core144-liquid-radar-MOCK.png'),full_page=True)
 page.set_viewport_size({'width':420,'height':900})
 if page.locator('.sidebar.open').count():page.locator('[data-action="close-sidebar"]').click()
 page.wait_for_timeout(400)
 assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth+3'),'420px overflow'
 page.locator('#radarLiveView').screenshot(path=str(ROOT/'docs/preview-core144-liquid-radar-narrow-MOCK.png'))
 assert not errs,errs
 browser.close()
print('PASS: full/subtle/off optics, chart under inert optical layers, actual native-sample events, responsive 420px (MOCK)')
