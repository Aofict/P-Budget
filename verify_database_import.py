"""Real EXE + browser restore tests, using isolated databases only."""
from pathlib import Path
from contextlib import closing
import json, os, socket, sqlite3, subprocess, sys, tempfile, time, urllib.request
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.browser-check/python'))
from playwright.sync_api import sync_playwright, expect
from server import create_app
from maintenance import snapshot


def verify():
    exe=ROOT/'dist/DatabaseImport-2.1.2/PBudgetManager/PBudgetManager.exe'
    with tempfile.TemporaryDirectory(prefix='restore-browser-',dir=ROOT/'.test-data') as directory:
        folder=Path(directory)
        incoming=folder/'incoming.db'
        other=create_app(folder/'source/master.db').test_client()
        for name in ['Imported project','Second imported project']:
            assert other.post('/api/projects',json=dict(name=name,statusId='pending-approval',progress=0,finances=dict(loan=3,revenue=2))).status_code==201
        other.post('/api/nine-box/import',json=dict(yearsData={'2570':[]},currentYear='2570',version=0))
        snapshot(folder/'source/master.db',incoming)
        invalid=folder/'invalid.db';invalid.write_bytes(b'not sqlite')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        base=f'http://127.0.0.1:{port}'
        env=dict(os.environ,PORT=str(port),P_BUDGET_DB=str(folder/'current/master.db'),P_BUDGET_OPEN_BROWSER='0')
        process=subprocess.Popen([str(exe)],env=env,cwd=folder,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
        def api(path):
            with urllib.request.urlopen(base+path,timeout=3) as r:return json.load(r)
        def add(page,name):
            return page.evaluate('''async name => {
                const r=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,statusId:'pending-approval',progress:0,finances:{loan:1,revenue:0}})});
                return {status:r.status,data:await r.json()};
            }''',name)
        try:
            deadline=time.monotonic()+25
            while time.monotonic()<deadline:
                try:
                    if api('/api/updates')['version']=='2.1.2':break
                except (OSError,ValueError):time.sleep(.15)
            else:raise AssertionError('EXE startup failed')
            with sync_playwright() as pw:
                browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
                context=browser.new_context(viewport=dict(width=1450,height=1000))
                context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(base+'/') else route.abort())
                page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(base+'/#settings');expect(page.locator('#database-file')).to_be_enabled()
                added=add(page,'Old local project');assert added['status']==201,added
                stale=context.new_page();stale.goto(base+'/#settings');expect(stale.locator('#database-file')).to_be_enabled()
                page.locator('#database-file').set_input_files(invalid)
                expect(page.locator('#database-message')).to_contain_text('ไม่ใช่ฐานข้อมูล SQLite')
                assert len(api('/api/projects')['projects'])==1
                page.locator('#database-file').set_input_files(incoming)
                expect(page.locator('#database-preview')).to_be_visible()
                expect(page.locator('#database-counts')).to_contain_text('ในไฟล์: 2 โครงการ')
                expect(page.locator('#database-restore')).to_be_disabled()
                page.locator('#database-cancel').click();expect(page.locator('#database-preview')).to_be_hidden()
                assert len(api('/api/projects')['projects'])==1
                page.locator('#database-file').set_input_files(incoming)
                expect(page.locator('#database-preview')).to_be_visible()
                page.locator('#database-confirm').check()
                expect(page.locator('#database-restore')).to_be_enabled()
                page.locator('#database-restore').click()
                expect(page.locator('#database-message')).to_contain_text('นำเข้าล่าสุด',timeout=15000)
                assert {p['name'] for p in api('/api/projects')['projects']}=={'Imported project','Second imported project'}
                assert api('/api/nine-box')['currentYear']=='2570'
                report=api('/api/database-transfer')['last']
                with closing(sqlite3.connect(report['backupPath'])) as db:
                    assert db.execute('SELECT name FROM projects').fetchone()[0]=='Old local project'
                assert stale.evaluate("async()=> (await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status")==409
                added=add(page,'After restore')
                assert added['status']==201 and added['data']['code'].endswith('-00003'),added
                page.bring_to_front()
                page.locator('#database-settings').scroll_into_view_if_needed()
                page.screenshot(path=str(ROOT/'preview-database-import.png'),animations='disabled')
                page.set_viewport_size(dict(width=500,height=950))
                page.bring_to_front()
                page.locator('#database-settings').scroll_into_view_if_needed()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.screenshot(path=str(ROOT/'preview-database-import-mobile.png'),animations='disabled')
                assert not errors,errors
                browser.close()
            print('PASS: EXE 2.1.2 + Chrome upload, invalid file, preview, cancel, confirmation, restore, backup, nine-box, stale tab rejection, continued sequence and mobile layout',flush=True)
        finally:
            if process.poll() is None:process.terminate();process.wait(timeout=10)

if __name__=='__main__':verify()
