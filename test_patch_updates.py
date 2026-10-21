import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from hashlib import sha256
import patch_updates as updater
from server import create_app


class PatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.current = self.root/'current'
        self.current.mkdir()
        self.payload = {name:b'asset' for name in updater.REQUIRED}
        self.payload['PBudgetManager.exe'] = b'MZ-test-exe'
        self.payload['release.json'] = b'{"version":"2.2.0"}'

    def tearDown(self): self.temp.cleanup()

    def archive(self, changes=None, version='2.2.0'):
        payload = dict(self.payload)
        manifest = dict(application='PBudgetManager', format=1, version=version, minimumVersion='2.1.0',
                        files={n:sha256(v).hexdigest() for n,v in payload.items()})
        if changes: changes(payload,manifest)
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w') as z:
            z.writestr('patch.json',json.dumps(manifest))
            for n,v in payload.items():z.writestr(n,v)
        stream.seek(0)
        return stream

    def test_extract_and_recheck_tampering(self):
        target=self.root/'staged'
        info=updater.extract_patch(self.archive(),target)
        self.assertEqual(info['version'],'2.2.0')
        (target/'app.js').write_bytes(b'tamper')
        with self.assertRaises(ValueError):updater.verify_staged(target,'2.1.0')

    def test_reject_bad_checksum_and_missing_file(self):
        for mutate in [lambda p,m:p.update({'app.js':b'bad'}),lambda p,m:p.pop('index.html')]:
            with self.subTest(mutate=mutate):
                target=self.root/'bad'
                with self.assertRaises(ValueError):updater.extract_patch(self.archive(mutate),target)
                self.assertFalse(target.exists())

    def test_reject_unsafe_names_and_embedded_database(self):
        for name in ['../escape','C:/escape','/escape','file:stream','data/master.db','Data/master.db','a/../../x','a\\x','CON','a.','a//x']:
            with self.subTest(name=name):
                def mutate(p,m):
                    p[name]=b'x';m['files'][name]=sha256(b'x').hexdigest()
                with self.assertRaises(ValueError):updater.extract_patch(self.archive(mutate), self.root/'bad')
        self.assertFalse((self.root/'escape').exists())

    def test_reject_downgrade_duplicate_case_and_incompatible_minimum(self):
        with self.assertRaises(ValueError):updater.extract_patch(self.archive(version='2.1.0'),self.root/'bad')
        for mutate in [lambda p,m:p.update({'APP.JS':b'x'}),lambda p,m:m.update(minimumVersion='9.0.0')]:
            with self.assertRaises(ValueError):updater.extract_patch(self.archive(mutate), self.root/'bad')

    def test_api_preview_security_and_write_barrier(self):
        with patch.dict(os.environ):
            os.environ.pop('P_BUDGET_DB',None)
            with patch.object(updater.sys,'frozen',True,create=True),patch.object(updater.sys,'executable',str(self.current/'PBudgetManager.exe')):
                app=create_app(self.current/'data/master.db')
            app.config.update(PATCH_SHUTDOWN=lambda:None,PATCH_PORT=18765)
            client=app.test_client()
            self.assertEqual(client.get('/api/updates',headers={'Host':'evil.test'}).status_code,403)
            self.assertEqual(client.get('/api/updates',headers={'Origin':'https://evil.test'}).status_code,403)
            info=client.get('/api/updates').json
            self.assertTrue(info['supported'])
            self.assertEqual(client.post('/api/updates/stage').status_code,403)
            headers={'X-PBudget-Update':info['token']}
            response=client.post('/api/updates/stage',headers=headers,data={'patch':(self.archive(),'patch.zip')})
            self.assertEqual(response.status_code,200,response.json)
            self.assertFalse(app.extensions['patch_updates']['busy'])
            self.assertEqual(client.post('/api/updates/install',headers=headers,json={'id':'wrong'}).status_code,409)
            with patch.object(updater.subprocess,'Popen',side_effect=OSError('test failure')):
                response=client.post('/api/updates/install',headers=headers,json={'id':response.json['id']})
            self.assertEqual(response.status_code,400)
            self.assertFalse(app.extensions['patch_updates']['busy'])
            self.assertEqual(client.get('/api/updates').json['last']['status'],'failed')
            app.extensions['patch_updates']['busy']=True
            self.assertEqual(client.post('/api/projects',json={}).status_code,503)
            app.extensions['patch_updates']['busy']=False
            self.assertNotEqual(client.post('/api/projects',json={}).status_code,503)

    def test_source_mode_reports_unsupported(self):
        client=create_app(self.current/'data/master.db').test_client()
        info=client.get('/api/updates').json
        self.assertFalse(info['supported'])
        self.assertEqual(client.post('/api/updates/stage',headers={'X-PBudget-Update':info['token']}).status_code,409)


if __name__=='__main__':unittest.main()
