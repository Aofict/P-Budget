"""Packaged EXE update and rollback, strictly on disposable data and a random port."""
from pathlib import Path
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
import zipfile
from hashlib import sha256
from build_patch import build

ROOT = Path(__file__).resolve().parent


def processes_under(root):
    output=subprocess.check_output(['powershell.exe','-NoProfile','-NonInteractive','-Command',
        "@(Get-CimInstance Win32_Process -Filter \"Name='PBudgetManager.exe'\" | Select-Object ProcessId,ExecutablePath) | ConvertTo-Json -Compress"], creationflags=subprocess.CREATE_NO_WINDOW)
    records=json.loads(output.decode('utf-8') or '[]') or []
    if isinstance(records,dict):records=[records]
    return [r['ProcessId'] for r in records if r.get('ExecutablePath') and Path(r['ExecutablePath']).resolve().is_relative_to(root.resolve())]


def verify():
    temp=Path(tempfile.mkdtemp(prefix='patch-e2e-',dir=ROOT/'.test-data')).resolve()
    baseline=ROOT/'dist/PatchBaseline/PBudgetManager'
    release=ROOT/'dist/OfflinePatch/PBudgetManager'
    current=temp/'โปรแกรมเดิม'
    shutil.copytree(baseline,current)
    package=build(release,temp/'good.zip',minimum='2.1.0')
    with socket.socket() as s:
        s.bind(('127.0.0.1',0)); port=s.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    env=dict(os.environ,PORT=str(port),P_BUDGET_OPEN_BROWSER='0')
    env.pop('P_BUDGET_DB',None)

    def api(path,data=None,headers=None):
        if isinstance(data,dict):
            data=json.dumps(data).encode();headers={'Content-Type':'application/json',**(headers or {})}
        req=urllib.request.Request(base+path,data=data,headers=headers or {})
        with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)

    def until(check,seconds=75):
        deadline=time.monotonic()+seconds
        while time.monotonic()<deadline:
            try:
                value=check()
                if value:return value
            except (OSError,ValueError):pass
            time.sleep(.3)
        raise AssertionError('Timed out')

    def stage(zip_path):
        info=api('/api/updates');token=info['token']
        boundary='PBudgetBoundaryForTest'
        body=(f'--{boundary}\r\nContent-Disposition: form-data; name="patch"; filename="patch.zip"\r\nContent-Type: application/zip\r\n\r\n'.encode()+zip_path.read_bytes()+f'\r\n--{boundary}--\r\n'.encode())
        result=api('/api/updates/stage',body,{'Content-Type':f'multipart/form-data; boundary={boundary}','X-PBudget-Update':token})
        return result,token

    try:
        subprocess.Popen([str(current/'PBudgetManager.exe')],cwd=temp,env=env,creationflags=subprocess.CREATE_NO_WINDOW)
        until(lambda:api('/api/updates'))
        project=api('/api/projects',dict(name='ข้อมูลทดสอบคงอยู่หลังแพตช์',statusId='pending-approval',progress=0,finances=dict(loan=3,revenue=2)))
        api('/api/nine-box/import',dict(yearsData={'2569':[]},currentYear='2569',version=0))
        preview,token=stage(package)
        assert api('/api/updates')['version']=='2.1.0'
        assert api('/api/projects/'+project['id'])['name']==project['name']
        api('/api/updates/install',{'id':preview['id']},{'X-PBudget-Update':token})
        def finished(status):
            r=api('/api/updates')
            return r if (r.get('last') or {}).get('status')==status and not r['busy'] else None
        success=until(lambda:finished('success'))
        assert success['version']=='2.1.1',success
        assert api('/api/projects/'+project['id'])['name']==project['name']
        assert api('/api/nine-box')['currentYear']=='2569'
        target=Path(success['last']['applicationFolder'])
        assert target!=current and target.parent==current.parent
        assert Path(success['last']['backupPath']).is_file()
        assert (current/'data/master.db').is_file()
        print('PASS: EXE ZIP upload, preview, backup, automatic handoff, version 2.1.1 and preserved project/nine-box data',flush=True)
        # A structurally valid ZIP whose EXE cannot start must revert to the working copy.
        bad=temp/'bad.zip'
        with zipfile.ZipFile(package) as source,zipfile.ZipFile(bad,'w',zipfile.ZIP_DEFLATED) as out:
            manifest=json.loads(source.read('patch.json'))
            manifest['version']='2.1.2'
            for name in manifest['files']:
                payload=source.read(name)
                if name=='PBudgetManager.exe':payload=b'MZ broken executable for rollback test'
                if name=='release.json':payload=b'{"version":"2.1.2"}'
                manifest['files'][name]=sha256(payload).hexdigest()
                out.writestr(name,payload)
            out.writestr('patch.json',json.dumps(manifest))
        preview,token=stage(bad)
        api('/api/updates/install',{'id':preview['id']},{'X-PBudget-Update':token})
        failed=until(lambda:finished('failed'))
        assert failed['version']=='2.1.1'
        assert api('/api/projects/'+project['id'])['name']==project['name']
        assert api('/api/nine-box')['currentYear']=='2569'
        api('/api/projects',dict(name='บันทึกได้หลังย้อนกลับ',statusId='pending-approval',progress=0,finances=dict(loan=1,revenue=0)))
        print('PASS: invalid new executable automatically restores previous EXE and database remains writable',flush=True)
    finally:
        time.sleep(1)
        for pid in processes_under(temp):
            subprocess.run(['taskkill','/PID',str(pid),'/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
        print('Test artifacts:',temp,flush=True)

if __name__=='__main__':verify()
