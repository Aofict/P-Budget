"""Check editable meeting fields in the packaged app using disposable data."""
from pathlib import Path
import sys, os, subprocess, time, socket, json, urllib.request
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.browser-check/python'))
from playwright.sync_api import sync_playwright,expect
from test_meeting_independent import MeetingIndependentTests

case=MeetingIndependentTests();case.setUp()
process=None
try:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    exe=ROOT/'dist/MeetingIndependent-2.1.3/PBudgetManager/PBudgetManager.exe'
    env=dict(os.environ,PORT=str(port),P_BUDGET_DB=str(case.database),P_BUDGET_OPEN_BROWSER='0')
    process=subprocess.Popen([str(exe)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
    def api(path):
        with urllib.request.urlopen(base+path,timeout=3) as response:return json.load(response)
    deadline=time.monotonic()+25
    while time.monotonic()<deadline:
        try:
            if api('/api/updates')['version']=='2.1.3':break
        except (OSError,ValueError):time.sleep(.15)
    else:raise AssertionError('EXE failed to start')
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
        context=browser.new_context(viewport={'width':1450,'height':1050})
        context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(base+'/') else route.abort())
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda dialog:dialog.accept())
        page.goto(base+'/meeting-app/'+case.meeting['id']+'/project_detail.html?id='+case.project['code'])
        page.wait_for_function('window.meetingWorkspaceReady?.()')
        expect(page.locator('#info-name')).to_have_value('Master project')
        expect(page.locator('#info-short-name')).to_have_value('SHORT-01')
        assert not page.locator('#info-name').is_editable()
        assert not page.locator('#info-short-name').is_editable()
        for field in ['info-owner','info-owner-department','info-owner-division','info-description','info-area','info-timeline','info-approval-date','info-loan-total','info-revenue-total','estimated-payback','estimated-npv','estimated-firr','estimated-eirr']:
            assert page.locator('#'+field).is_editable(),field
        expect(page.locator('#info-owner')).to_have_value('')
        assert page.locator('#info-loan-total').input_value() in ('0.000','0','')
        page.locator('#info-owner').fill('Meeting director from browser')
        page.locator('#info-owner-department').fill('Meeting department')
        page.locator('#info-description').fill('Independent meeting scope')
        page.locator('#info-area').fill('Meeting area')
        page.locator('#info-loan-total').fill('12')
        page.locator('#info-revenue-total').fill('8')
        page.locator('#estimated-npv').fill('-1')
        page.locator('#estimated-npv').blur()
        assert page.evaluate('saveProjectData()') is True
        saved=api(case.base+'/get-project/'+case.project['code'])['data']
        assert saved['owner']=='Meeting director from browser',saved
        assert saved['loan_total']==12 and saved['revenue_total']==8
        assert json.loads(saved['estimated_return'])['npv']==-1
        assert api('/api/projects/'+case.project['id'])==case.project
        page.reload();page.wait_for_function('window.meetingWorkspaceReady?.()')
        expect(page.locator('#info-owner')).to_have_value('Meeting director from browser')
        page.bring_to_front();page.screenshot(path=str(ROOT/'preview-meeting-independent.png'),animations='disabled')
        page.goto(base+'/meeting-app/'+case.meeting['id']+'/index.html')
        page.wait_for_function('window.meetingInitialLoadComplete === true')
        page.evaluate('(code)=>openProjectForm(code)',case.project['code'])
        expect(page.locator('#master-owner')).to_be_enabled()
        expect(page.locator('#master-unit')).to_be_enabled()
        expect(page.locator('#master-name')).to_be_disabled()
        page.locator('#master-owner').fill('Manager form owner')
        page.evaluate('saveProjectMasterForm()')
        assert api(case.base+'/get-project/'+case.project['code'])['data']['owner']=='Manager form owner'
        assert not errors,errors
        browser.close()
    print('PASS: EXE 2.1.3, names-only import, editable Tab 1, persisted amounts/returns, independent Master DB, reload and project-manager edits')
finally:
    if process and process.poll() is None:process.terminate();process.wait(timeout=10)
    case.tearDown()
