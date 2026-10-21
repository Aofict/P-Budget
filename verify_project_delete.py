"""Exercise dialog deletion against an isolated packaged EXE and retained meeting snapshot."""
from pathlib import Path
import sys,os,subprocess,time,socket,json,urllib.request,sqlite3
from contextlib import closing
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.browser-check/python'))
from playwright.sync_api import sync_playwright,expect
from test_meeting_independent import MeetingIndependentTests
case=MeetingIndependentTests();case.setUp();process=None
try:
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    exe=ROOT/'dist/ProjectDelete-2.1.4/PBudgetManager/PBudgetManager.exe'
    process=subprocess.Popen([str(exe)],env=dict(os.environ,PORT=str(port),P_BUDGET_DB=str(case.database),P_BUDGET_OPEN_BROWSER='0'),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
    def api(path):
        with urllib.request.urlopen(base+path,timeout=3) as r:return json.load(r)
    deadline=time.monotonic()+25
    while time.monotonic()<deadline:
        try:
            if api('/api/updates')['version']=='2.1.4':break
        except (OSError,ValueError):time.sleep(.15)
    else:raise AssertionError('EXE startup failed')
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
        context=browser.new_context(viewport=dict(width=1450,height=1050))
        context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') else r.abort())
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/#projects');page.wait_for_function('ready === true')
        page.locator('#add-project').click();expect(page.locator('#project-delete')).to_be_hidden()
        page.locator('#project-dialog .close-dialog').first.click()
        page.evaluate('(id)=>openForm(id)',case.project['id'])
        expect(page.locator('#project-delete')).to_be_visible()
        page.once('dialog',lambda d:d.dismiss());page.locator('#project-delete').click()
        expect(page.locator('#project-dialog')).to_be_visible()
        assert len(api('/api/projects')['projects'])==1
        # A concurrent edit must prevent deletion of a stale form.
        updated=case.c.put('/api/projects/'+case.project['id'],json={**case.project,'name':'Concurrent edit'} )
        assert updated.status_code==200,updated.json
        page.once('dialog',lambda d:d.accept());page.locator('#project-delete').click()
        expect(page.locator('#form-error')).not_to_be_empty()
        expect(page.locator('#project-dialog')).to_be_visible()
        assert len(api('/api/projects')['projects'])==1
        page.wait_for_function('projects[0].version === 2')
        # The cached list refresh must not silently authorize the stale form's version.
        page.once('dialog',lambda d:d.accept());page.locator('#project-delete').click()
        expect(page.locator('#project-delete')).to_be_enabled()
        assert len(api('/api/projects')['projects'])==1
        page.locator('#project-dialog .close-dialog').first.click()
        page.evaluate('(id)=>openForm(id)',case.project['id'])
        page.screenshot(path=str(ROOT/'preview-project-delete.png'),animations='disabled')
        page.set_viewport_size(dict(width=500,height=950))
        expect(page.locator('#project-delete')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(ROOT/'preview-project-delete-mobile.png'),animations='disabled')
        page.once('dialog',lambda d:d.accept());page.locator('#project-delete').click()
        expect(page.locator('#project-dialog')).not_to_be_visible()
        assert api('/api/projects')['projects']==[]
        assert api(case.base+'/get-project/'+case.project['code'])['data']['name']=='Master project'
        assert api('/api/projects/'+case.project['id']+'/history')['events'][-1]['action']=='delete'
        with closing(sqlite3.connect(case.database)) as db:
            assert db.execute('SELECT deleted_at FROM projects WHERE id=?',(case.project['id'],)).fetchone()[0]
        next_project=case.c.post('/api/projects',json=dict(name='Next project',statusId='pending-approval',progress=0,finances=dict(loan=1,revenue=0)))
        assert next_project.status_code==201 and next_project.json['code'].endswith('-00002')
        assert not errors,errors
        browser.close()
    print('PASS: EXE 2.1.4 hidden on add, visible on edit, cancel, stale-version rejection, confirmed delete, preserved history/meeting and sequence, desktop/mobile')
finally:
    if process and process.poll() is None:process.terminate();process.wait(timeout=10)
    case.tearDown()
