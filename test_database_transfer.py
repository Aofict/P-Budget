import io
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
import threading
import time
from maintenance import snapshot
from server import create_app
from database_schema import SCHEMA_VERSION
import database_transfer as transfer


class TransferTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.database=self.root/'current/master.db'
        self.app=create_app(self.database)
        self.client=self.app.test_client()
        self.token=self.client.get('/api/database-transfer').json['token']
        self.headers={'X-PBudget-Database':self.token}
        self.original=self.add(self.client,'original')
        source=self.root/'source/master.db'
        other=create_app(source).test_client()
        self.incoming=self.add(other,'incoming')
        self.add(other,'second incoming')
        other.post('/api/nine-box/import',json=dict(yearsData={'2570':[]},currentYear='2570',version=0))
        self.import_file=self.root/'incoming.db'
        snapshot(source,self.import_file)

    def tearDown(self):self.temp.cleanup()

    def add(self,client,name,headers=None):
        result=client.post('/api/projects',json=dict(name=name,statusId='in-progress',progress=0,finances=dict(loan=3,revenue=2)),headers=headers)
        self.assertEqual(result.status_code,201,result.json)
        return result.json

    def preview(self,path=None):
        return self.client.post('/api/database-transfer/preview',headers=self.headers,data={'database':(io.BytesIO((path or self.import_file).read_bytes()),'snapshot.db')})

    def restore(self,identifier):
        return self.client.post('/api/database-transfer/restore',headers=self.headers,json=dict(id=identifier,replaceAll=True))

    def test_preview_cancel_and_required_confirmation(self):
        result=self.preview(); self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(result.json['incoming']['schemaVersion'], SCHEMA_VERSION)
        self.assertEqual(result.json['incoming']['projects'],2)
        self.assertEqual(result.json['current']['projects'],1)
        self.assertEqual(len(self.client.get('/api/projects').json['projects']),1)
        bad=self.client.post('/api/database-transfer/restore',headers=self.headers,json={'id':result.json['id']})
        self.assertEqual(bad.status_code,409)
        self.client.post('/api/database-transfer/cancel',headers=self.headers)
        self.assertEqual(self.restore(result.json['id']).status_code,409)
        self.assertFalse(list((self.database.parent/'restore-staging').glob('*.db')))

    def test_restore_backup_sequences_and_stale_tab_protection(self):
        result=self.preview(); identifier=result.json['id']
        # A live connection keeps WAL sidecars present during restoration.
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute('SELECT COUNT(*) FROM projects').fetchone()
            restored=self.restore(identifier)
        self.assertEqual(restored.status_code,200,restored.json)
        backup=Path(restored.json['backupPath'])
        with closing(sqlite3.connect(backup)) as db:
            self.assertEqual(db.execute('SELECT name FROM projects').fetchone()[0],'original')
        self.assertEqual({p['name'] for p in self.client.get('/api/projects').json['projects']},{'incoming','second incoming'})
        self.assertEqual(self.client.get('/api/nine-box').json['currentYear'],'2570')
        for headers in (None,self.headers):
            self.assertEqual(self.client.post('/api/projects',json={},headers=headers).status_code,409)
        new={'X-PBudget-Database':self.client.get('/api/database-transfer').json['token']}
        added=self.add(self.client,'after restore',new)
        self.assertTrue(added['code'].endswith('-00003'),added)
        self.assertEqual(create_app(self.database).test_client().get('/api/database-transfer').json['last']['status'],'success')

    def test_reject_invalid_corrupt_wrong_schema_future_and_modified_file(self):
        fake=self.root/'fake.db'; fake.write_bytes(b'not sqlite')
        self.assertEqual(self.preview(fake).status_code,400)
        with closing(sqlite3.connect(self.import_file)) as db,db:
            db.execute("CREATE TABLE foreign_application(x TEXT)")
        self.assertEqual(self.preview().status_code,400)
        with closing(sqlite3.connect(self.import_file)) as db,db:
            db.execute('DROP TABLE foreign_application')
            db.execute("INSERT INTO schema_migrations VALUES(99,'future')")
        self.assertEqual(self.preview().status_code,400)
        with closing(sqlite3.connect(self.import_file)) as db,db:db.execute('DELETE FROM schema_migrations WHERE version=99')
        preview=self.preview(); self.assertEqual(preview.status_code,200,preview.json)
        staged=Path(self.app.extensions['database_transfer']['staged']['path'])
        staged.write_bytes(b'tampered')
        self.assertEqual(self.restore(preview.json['id']).status_code,400)
        self.assertEqual(self.client.get('/api/projects').json['projects'][0]['name'],'original')

    def test_backup_failure_leaves_database_untouched(self):
        result=self.preview()
        with patch.object(transfer,'snapshot',side_effect=OSError('disk full')):
            self.assertEqual(self.restore(result.json['id']).status_code,400)
        self.assertEqual(self.client.get('/api/projects').json['projects'][0]['name'],'original')

    def test_post_restore_failure_recovers_backup(self):
        result=self.preview()
        original_inspect=transfer.inspect_database
        def fail_live(path,expected):
            if Path(path)==self.database:raise ValueError('simulated validation failure')
            return original_inspect(path,expected)
        with patch.object(transfer,'inspect_database',side_effect=fail_live):
            self.assertEqual(self.restore(result.json['id']).status_code,400)
        self.assertEqual(self.client.get('/api/projects').json['projects'][0]['name'],'original')

    def test_origin_token_and_html_guards(self):
        self.assertEqual(self.client.get('/api/database-transfer',headers={'Host':'evil.test'}).status_code,403)
        self.assertEqual(self.client.post('/api/database-transfer/preview').status_code,403)
        self.assertEqual(self.client.post('/api/database-transfer/preview',headers={**self.headers,'Origin':'https://evil.test'}).status_code,403)
        meeting=self.client.post('/api/meetings',json=dict(year=2569,round=1,title='Review',date='2026-09-24')).json
        for url in ['/',f"/meeting-app/{meeting['id']}/index.html",f"/meeting-app/{meeting['id']}/project_detail.html",'/nine-box-app/index.html']:
            result=self.client.get(url,headers={'If-Modified-Since':'Thu, 24 Sep 2037 00:00:00 GMT'})
            self.assertEqual(result.status_code,200,url)
            self.assertIn(b'<script src="/database-session.js"></script>',result.data)
            result.close()

    def test_writes_wait_for_restore_then_reject_old_generation(self):
        result=self.preview()
        entered=threading.Event(); release=threading.Event()
        original_replace=transfer.replace_contents
        def paused(*args):
            entered.set(); release.wait(3); original_replace(*args)
        with patch.object(transfer,'replace_contents',side_effect=paused),ThreadPoolExecutor(2) as pool:
            restoring=pool.submit(self.restore,result.json['id'])
            self.assertTrue(entered.wait(3))
            stale=pool.submit(lambda:self.app.test_client().post('/api/projects',json={},headers=self.headers))
            time.sleep(.1);self.assertFalse(stale.done())
            release.set()
            self.assertEqual(restoring.result().status_code,200)
            self.assertEqual(stale.result().status_code,409)

if __name__=='__main__':unittest.main()
