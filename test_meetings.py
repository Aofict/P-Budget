from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest

from server import create_app


class MeetingTests(unittest.TestCase):
    def setUp(self):
        root=Path(__file__).parent/'.test-data'
        root.mkdir(exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=root)
        self.db=Path(self.temp.name)/'meetings.db'
        self.app=create_app(self.db)
        self.app.config['TESTING']=True
        self.client=self.app.test_client()
        self.project=self.client.post('/api/projects',json=dict(name='Meeting project',fundId='oh',statusId='started',budget=10,spent=2,progress=20)).json
        self.round_data=dict(year=2569,round=1,title='Budget review',date='2026-09-21')
        self.meeting=self.client.post('/api/meetings',json=self.round_data).json
        self.base='/api/meetings/'+self.meeting['id']

    def tearDown(self):
        self.temp.cleanup()

    def add(self):
        result=self.client.post(self.base+'/projects',json={'projectIds':[self.project['id']]})
        self.assertEqual(result.status_code,201,result.json)
        return result.json['projects'][0]

    def update_data(self,entry,**changes):
        return dict(version=entry['version'],afterBudget=entry['afterBudget'],monthlyPlan=entry['monthlyPlan'],reason=entry['reason'],notes=entry['notes'],reviewed=entry['reviewed']) | changes

    def test_rename_round(self):
        created = self.client.post('/api/projects', json=dict(name='Rename test', statusId='in-progress', progress=0, finances=dict(loan=10,revenue=0,oh=0,idc=0)))
        self.assertEqual(created.status_code, 201, created.json)
        self.project = created.json
        self.add()
        before = self.client.get(self.base).json
        payload = dict(title='ชื่อรอบใหม่', version=before['version'])
        renamed = self.client.patch(self.base, json=payload)
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(renamed.json['title'], 'ชื่อรอบใหม่')
        self.assertEqual(renamed.json['projects'], before['projects'])
        self.assertEqual(self.client.get(self.base).json['title'], 'ชื่อรอบใหม่')
        self.assertEqual(self.client.patch(self.base, json=payload).status_code, 409)
        self.assertEqual(self.client.patch(self.base, json={'title':' ', 'version':renamed.json['version']}).status_code, 400)
        with closing(sqlite3.connect(self.db)) as conn:
            conn.execute('UPDATE meeting_projects SET reviewed=1 WHERE meeting_id=?', (before['id'],))
            conn.commit()
        self.assertEqual(self.client.post(self.base+'/close', json={'version':renamed.json['version']}).status_code, 200)
        closed = self.client.get(self.base).json
        self.assertEqual(self.client.patch(self.base, json={'title':'Changed', 'version':closed['version']}).status_code, 409)

    def test_round_uniqueness_and_validation(self):
        self.assertEqual(self.client.post('/api/meetings',json=self.round_data).status_code,409)
        for change in [{'year':True},{'round':0},{'date':'bad'},{'title':''}]:
            self.assertEqual(self.client.post('/api/meetings',json=self.round_data | change).status_code,400)
        self.assertEqual(len(self.client.get('/api/meetings').json['meetings']),1)

    def test_snapshot_and_totals_are_independent_of_master(self):
        entry=self.add()
        p=self.project
        result=self.client.put('/api/projects/'+p['id'],json=p | {'budget':20,'name':'Updated master','finances':p['finances'] | {'revenue':20,'oh':20}})
        self.assertEqual(result.status_code,200)
        snapshot=self.client.get(self.base).json['projects'][0]
        self.assertEqual(snapshot['beforeBudget'],10)
        self.assertEqual(snapshot['project']['name'],'Meeting project')
        data=self.update_data(entry,afterBudget=8,monthlyPlan=[1]*8+[0]*4,reason='Reduce scope',reviewed=True)
        result=self.client.put(self.base+'/projects/'+entry['id'],json=data)
        self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(self.client.get('/api/projects/'+p['id']).json['budget'],20)
        summary=self.client.get(self.base).json['summary']
        self.assertEqual(summary,dict(count=1,before=10,after=8,difference=-2,pending=0))
        self.assertEqual(snapshot['project']['fundingSourceId'],'pea-revenue')

    def test_atomic_add_duplicate_and_missing(self):
        result=self.client.post(self.base+'/projects',json={'projectIds':[self.project['id'],'missing']})
        self.assertEqual(result.status_code,404)
        self.assertEqual(self.client.get(self.base).json['projects'],[])
        self.add()
        self.assertEqual(self.client.post(self.base+'/projects',json={'projectIds':[self.project['id']]}).status_code,409)
        self.assertEqual(len(self.client.get(self.base).json['projects']),1)

    def test_plan_and_change_reason_validation(self):
        entry=self.add()
        for change in [dict(afterBudget=8),dict(monthlyPlan=[1]*12),dict(monthlyPlan=[0]),dict(afterBudget='NaN'),dict(monthlyPlan=[-1]+[0]*11),dict(reviewed='yes')]:
            result=self.client.put(self.base+'/projects/'+entry['id'],json=self.update_data(entry,**change))
            self.assertEqual(result.status_code,400,result.json)
        self.assertEqual(self.client.get(self.base).json['projects'][0]['version'],1)

    def test_versions_history_and_closed_round(self):
        self.assertEqual(self.client.post(self.base+'/close',json={'version':1}).status_code,400)
        entry=self.add()
        self.assertEqual(self.client.post(self.base+'/close',json={'version':2}).status_code,400)
        data=self.update_data(entry,reviewed=True,notes='Approved')
        url=self.base+'/projects/'+entry['id']
        self.assertEqual(self.client.put(url,json=data).status_code,200)
        self.assertEqual(self.client.put(url,json=data).status_code,409)
        history=self.client.get(url+'/history').json['events']
        self.assertEqual(len(history),2)
        self.assertEqual(history[0]['entry']['notes'],'Approved')
        self.assertEqual(self.client.post(self.base+'/close',json={'version':2}).status_code,409)
        self.assertEqual(self.client.post(self.base+'/close',json={'version':3}).status_code,200)
        self.assertEqual(self.client.put(url,json=data | {'version':2}).status_code,409)
        self.assertEqual(self.client.post(self.base+'/projects',json={'projectIds':[self.project['id']]}).status_code,409)

    def test_round_isolation_restart_and_full_backup(self):
        entry=self.add()
        other=self.client.post('/api/meetings',json=self.round_data | {'round':2}).json
        other_base='/api/meetings/'+other['id']
        self.assertEqual(self.client.get(other_base+'/projects/'+entry['id']+'/history').status_code,404)
        self.assertEqual(self.client.post(other_base+'/projects',json={'projectIds':[self.project['id']]}).status_code,201)
        reopened=create_app(self.db).test_client()
        self.assertEqual(reopened.get(self.base).json['summary']['before'],10)
        path=Path(self.temp.name)/'backup.db'
        path.write_bytes(self.client.get('/api/backup/database').data)
        with closing(sqlite3.connect(path)) as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM budget_meetings').fetchone()[0],2)
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM meeting_projects').fetchone()[0],2)
            self.assertEqual(conn.execute('PRAGMA integrity_check').fetchone()[0],'ok')


if __name__=='__main__':
    unittest.main()
