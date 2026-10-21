from contextlib import closing
from pathlib import Path
import json
import sqlite3
import tempfile
import unittest

from server import create_app


class ProjectProfileTests(unittest.TestCase):
    def setUp(self):
        root=Path(__file__).parent/'.test-data';root.mkdir(exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=root)
        self.db=Path(self.temp.name)/'profile.db'
        self.app=create_app(self.db);self.app.config['TESTING']=True
        self.client=self.app.test_client()
        self.data=dict(name='โครงการข้อมูลครบ',statusId='in-progress',progress=10,
                       finances=dict(loan=6,revenue=4,oh=1,idc=.5,loanSpent=1,revenueSpent=.5),
                       details=dict(shortName='คพส.9.3',nationalDevelopmentPlan='ฉบับที่ 13',director='ผอ.กอง',department='กองวางแผน',division='สายงานวิศวกรรม',
                                    objectives='ขยายระบบจำหน่าย',area='ภาคเหนือ',startDate='2026-01-01',endDate='2030-12-31',
                                    projectType='new',cabinetDate='2025-10-28',statusNotes='อยู่ระหว่างเตรียมงาน',
                                    paybackYears=7.5,npv=-1.25,firr=5.2,eirr=8.1,studyDate='2025-09-30',studySource='รายงานผลศึกษา'))

    def tearDown(self):
        self.temp.cleanup()

    def create(self):
        r=self.client.post('/api/projects',json=self.data)
        self.assertEqual(r.status_code,201,r.json)
        return r.json

    def test_mixed_financing_no_double_count_and_exact_storage(self):
        p=self.create()
        self.assertEqual((p['budget'],p['spent'],p['fundingSourceId']),(10,1.5,'mixed'))
        self.assertEqual(p['finances']['oh'],1)
        for key, value in self.data['details'].items():
            self.assertEqual(p['details'][key], value)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute('SELECT budget_baht,loan_baht,revenue_baht,oh_baht,idc_baht FROM projects').fetchone(),(10000000,6000000,4000000,1000000,500000))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('UPDATE projects SET oh_baht=5000000')

    def test_foreign_loan_split_round_trip_and_totals(self):
        self.data['details'].update(fundingSources='domestic,foreign,revenue', foreignLoan=2,
                                    approvedLoan=5, approvedForeignLoan=1, approvedRevenue=3)
        project=self.create()
        self.assertEqual(project['budget'],10)
        self.assertEqual(project['finances']['loan'],6)
        self.assertEqual(project['details']['foreignLoan'],2)
        self.assertEqual(project['details']['approvedForeignLoan'],1)
        response=self.client.get('/api/projects')
        self.assertEqual(response.json['projects'][0]['details']['fundingSources'],'domestic,foreign,revenue')

    def test_foreign_loan_cannot_exceed_aggregate(self):
        for details in [dict(foreignLoan=7),dict(foreignLoan=-1),
                        dict(approvedLoan=1,approvedForeignLoan=2),dict(fundingSources='unknown')]:
            with self.subTest(details=details):
                self.data['details'].update(details)
                response=self.client.post('/api/projects',json=self.data)
                self.assertEqual(response.status_code,400,response.json)
                for key in details:
                    self.data['details'].pop(key)

    def test_blank_returns_are_null_and_optional_details_preserved(self):
        self.data['details']={}
        p=self.create()
        for key in ['paybackYears','npv','firr','eirr']:
            self.assertIsNone(p['details'][key])
        result=self.client.put('/api/projects/'+p['id'],json=self.data | {'version':1,'details':{'npv':0,'paybackYears':''}})
        self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(result.json['details']['npv'],0)
        self.assertIsNone(result.json['details']['paybackYears'])

    def test_validation(self):
        for finances in [dict(oh=4,idc=1),dict(loanSpent=7),dict(revenueSpent=5),dict(loan=-1),dict(idc='NaN'),dict(oh='.0001'),dict(unallocated=2)]:
            r=self.client.post('/api/projects',json=self.data | {'finances':self.data['finances'] | finances})
            self.assertEqual(r.status_code,400,r.json)
        for details in [dict(endDate='2020-01-01'),dict(cabinetDate='bad'),dict(paybackYears=-1),dict(npv='NaN'),dict(firr=True),dict(projectType='other')]:
            r=self.client.post('/api/projects',json=self.data | {'details':self.data['details'] | details})
            self.assertEqual(r.status_code,400,r.json)
        self.assertEqual(self.client.get('/api/projects').json['projects'],[])

    def test_export_import_restart_and_conflicting_metadata(self):
        p=self.create()
        exported=self.client.get('/api/backup').json
        self.assertEqual(exported['schemaVersion'],4)
        other=create_app(Path(self.temp.name)/'restored.db').test_client()
        self.assertEqual(other.post('/api/import',json=exported).status_code,200)
        saved=other.get('/api/projects/'+p['id']).json
        self.assertEqual(saved['details'],p['details']);self.assertEqual(saved['finances'],p['finances'])
        self.assertEqual(other.post('/api/import',json=exported).json['skipped'],1)
        exported['projects'][0]['details']['director']='Someone else'
        self.assertEqual(other.post('/api/import',json=exported).status_code,409)
        restored=create_app(self.db).test_client().get('/api/projects/'+p['id']).json
        self.assertEqual(restored['details']['shortName'],'คพส.9.3')

    def test_meeting_snapshot_preserves_profile(self):
        p=self.create()
        m=self.client.post('/api/meetings',json=dict(year=2569,round=1,title='Review',date='2026-09-21')).json
        base='/api/meetings/'+m['id']
        self.assertEqual(self.client.post(base+'/projects',json={'projectIds':[p['id']]}).status_code,201)
        self.client.put('/api/projects/'+p['id'],json=self.data | {'version':1,'details':{'director':'เปลี่ยนผู้รับผิดชอบ'}})
        snapshot=self.client.get(base).json['projects'][0]['project']
        self.assertEqual(snapshot['details']['director'],'ผอ.กอง')
        self.assertEqual(snapshot['finances'],p['finances'])

    def test_v3_migration_preserves_legacy_amounts_without_guessing(self):
        from server import ROOT,DEFAULT_FUNDS,DEFAULT_STATUSES,now
        path=Path(self.temp.name)/'legacy.db'
        with closing(sqlite3.connect(path)) as db, db:
            db.executescript((ROOT/'migrations/001_master.sql').read_text(encoding='utf-8'))
            stamp=now()
            db.executemany('INSERT INTO funding_sources(id,code,name,created_at,updated_at) VALUES(?,?,?,?,?)',[(i,c,n,stamp,stamp) for i,c,n in DEFAULT_FUNDS])
            db.executemany('INSERT INTO project_statuses(id,code,name,is_terminal,created_at,updated_at) VALUES(?,?,?,?,?,?)',[(i,c,n,t,stamp,stamp) for i,c,n,t in DEFAULT_STATUSES])
            db.execute('INSERT INTO schema_migrations VALUES(1,?)',(stamp,));db.commit()
            for version,name in [(2,'002_funding_hierarchy.sql'),(3,'003_budget_meetings.sql')]:
                db.executescript((ROOT/'migrations'/name).read_text(encoding='utf-8'))
                db.execute('INSERT INTO schema_migrations VALUES(?,?)',(version,stamp));db.commit()
            for fund in ['domestic-loan','pea-revenue','oh','idc','land']:
                db.execute('INSERT INTO projects(id,code,name,funding_source_id,status_id,budget_baht,spent_baht,progress,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',(fund,fund,'Legacy',fund,'started',12000000,1000000,10,stamp,stamp))
        client=create_app(path).test_client()
        for fund in ['domestic-loan','pea-revenue','oh','idc','land']:
            p=client.get('/api/projects/'+fund).json
            self.assertEqual(p['budget'],12);self.assertEqual(p['spent'],1)
            f=p['finances'];self.assertEqual(f['loan']+f['revenue']+f['unallocated'],12)
            if fund in ('oh','idc'):self.assertEqual(f[fund],12);self.assertEqual(f['revenue'],12)
            if fund=='land':self.assertEqual(f['unallocated'],12)
        export=client.get('/api/backup').json
        other=create_app(Path(self.temp.name)/'legacy-restored.db').test_client()
        result=other.post('/api/import',json=export)
        self.assertEqual(result.status_code,200,result.json)


if __name__=='__main__':unittest.main()
