import re
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
 page.set_default_timeout(5000)
 def refresh():
  page.evaluate('(m)=>window.__bridge({data:m})',{'type':'admin-result','ok':True,'operation':'admin-refresh','snapshot':SNAP,'managed':{'users':[],'shares':[]}})
 def english():
  assert not re.search(r'[\u3400-\u9fff]', page.locator('body').inner_text()), page.locator('body').inner_text()
  for value in page.locator('[aria-label], [title], [placeholder]').evaluate_all('(els)=>els.flatMap(e=>[e.getAttribute("aria-label"),e.getAttribute("title"),e.getAttribute("placeholder")]).filter(Boolean)'):
   assert not re.search(r'[\u3400-\u9fff]',value),value
 def submit():
  page.locator('#dialogForm button[type="submit"]').click()
 def last():
  return page.evaluate('window.__msgs.at(-1)')
 for view in ['shares','users','permissions','connections','lan','games','radar','settings']:
  page.locator('[data-page="'+view+'"]').click();english()
  assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth+3'),view
 refresh()
 page.locator('[data-page="users"]').click()
 page.locator('.wb-entry').first.click()
 assert page.locator('[data-action="admin-edit-user"]').count()==0,'Admin account must remain protected'
 page.locator('[data-action="admin-new-user"]').click();english()
 page.locator('[name="adminName"]').fill('demo_reader')
 page.locator('[name="passwordMode"]').select_option('generate')
 submit();assert last()['type']=='admin-create-user' and last()['passwordMode']=='generate'
 refresh();page.locator('.wb-entry').last.click()
 page.locator('[data-action="admin-edit-user"]').click();english()
 page.locator('[name="fullName"]').fill('Demo Reader')
 page.locator('[name="confirm"]').fill('LongNicknameSharedAccount')
 submit();assert last()['type']=='admin-update-existing-user' and last()['fullName']=='Demo Reader'
 refresh();page.locator('.wb-entry').last.click()
 page.locator('[data-action="admin-reset-existing-user-password"]').click();english()
 page.locator('[name="mode"]').select_option('generate')
 page.locator('[name="confirm"]').fill('LongNicknameSharedAccount')
 submit();assert last()['type']=='admin-reset-existing-user-password'
 refresh();page.locator('.wb-entry').last.click()
 page.locator('.core-danger-fold summary').click()
 page.locator('[data-action="admin-delete-existing-user"]').click();english()
 page.locator('[name="preserveNtfs"]').check()
 page.locator('[name="confirm"]').fill('wrong_name')
 count=page.evaluate('window.__msgs.length');submit()
 assert page.evaluate('window.__msgs.length')==count,'Wrong confirmation must not post a deletion'
 page.locator('[name="confirm"]').fill('LongNicknameSharedAccount')
 submit();assert last()['type']=='admin-delete-existing-user' and last()['preserveNtfs'] is True
 refresh();page.locator('[data-page="shares"]').click()
 page.locator('[data-action="admin-new-share"]').click();english()
 page.locator('[name="adminShareName"]').fill('DemoShare')
 page.locator('[name="adminPath"]').fill('D:\\DemoShare')
 submit();assert last()['type']=='admin-create-share' and last()['account']=='LongNicknameSharedAccount'
 refresh();page.locator('[data-action="admin-edit-share-access"]').first.click();english()
 page.locator('#shareAccessRight').select_option('Read')
 page.locator('#shareAccessConfirm').fill('Study')
 submit();assert last()['type']=='admin-modify-share-access' and last()['right']=='Read'
 refresh()
 if page.locator('#editorDialog[open]').count():page.locator('#editorDialog [data-action="dialog-close"]').first.click()
 page.locator('.core-danger-fold summary').click()
 page.locator('[data-action="admin-unshare-existing"]').click();english()
 page.locator('[name="confirm"]').fill('Study')
 submit();assert last()['type']=='admin-unshare-existing' and last()['expectedPath']=='D:\\Study'
 assert not errors,errors
 browser.close()
 print('PASS: eight English pages, accessible labels, protected account, six confirmation/payload flows, wrong-name deletion blocked; MOCK bridge only')
