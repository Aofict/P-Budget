from pathlib import Path
import tempfile, unittest, json
from copy import deepcopy
from server import create_app

class MeetingIndependentTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.database=Path(self.temp.name)/'master.db'
        self.app=create_app(self.database);self.c=self.app.test_client()
        response=self.c.post('/api/projects',json=dict(name='Master project',statusId='in-progress',progress=80,finances=dict(loan=900,revenue=100,oh=20,idc=10),details=dict(shortName='SHORT-01',director='Master director',department='Master department',division='Master division',objectives='Master scope',area='Master area',statusNotes='Master notes',npv=30,projectType='new')))
        self.assertEqual(response.status_code,201,response.json);self.project=response.json
        self.meeting=self.round(1)
        self.base='/api/meeting-workspaces/'+self.meeting['id']+'/api'
    def tearDown(self):self.temp.cleanup()
    def round(self,number):
        meeting=self.c.post('/api/meetings',json=dict(year=2569,round=number,title='Review',date='2026-09-24')).json
        response=self.c.post('/api/meetings/'+meeting['id']+'/projects',json={'projectIds':[self.project['id']]})
        self.assertEqual(response.status_code,201,response.json)
        return response.json
    def doc(self,base=None):return self.c.get((base or self.base)+'/get-project/'+self.project['code']).json['data']
    def test_delete_round_keeps_master_and_other_round(self):
        other = self.round(2)
        url = '/api/meetings/' + self.meeting['id']
        current = self.c.get(url).json
        self.assertEqual(self.c.delete(url, json={'version':current['version']-1}).status_code, 409)
        self.assertEqual(self.c.delete(url, json={'version':current['version']}).status_code, 200)
        self.assertEqual(self.c.get(url).status_code, 404)
        self.assertEqual(self.c.get('/api/projects/'+self.project['id']).status_code, 200)
        self.assertEqual(len(self.c.get('/api/meetings/'+other['id']).json['projects']), 1)
        self.assertEqual(self.c.delete(url, json={'version':current['version']}).status_code, 404)

    def test_annual_overview_uses_total_and_post_target(self):
        doc = self.doc()
        doc['budget'] = {'2569': dict(committed=10, investment_set=20, investment_change_before=3,
                                    investment_change=-2, disbursement_target=4, disbursement_target_post=0,
                                    next_year_uncommitted=1),
                         '2570': dict(investment_set=5, disbursement_target=2, disbursement_target_post=7)}
        response = self.c.post(self.base+'/save-project', json=doc)
        self.assertEqual(response.status_code, 200, response.json)
        self.round(2)
        result = self.c.get(self.base+'/annual-overview').json
        self.assertEqual(result['project_count'], 1)
        self.assertEqual([r['year'] for r in result['data']], list(range(2569,2574)))
        self.assertEqual(result['data'][0]['operating_budget'], -2)
        self.assertEqual(result['data'][0]['disbursement_target'], 0)
        self.assertEqual(result['data'][1]['operating_budget'], -3)
        self.assertEqual(result['data'][1]['disbursement_target'], 7)

    def test_only_identity_is_imported(self):
        d=self.doc()
        self.assertEqual(d['name'],self.project['name']);self.assertEqual(d['short_name'],'SHORT-01')
        for key in ['owner','owner_department','owner_division','description','area','timeline','approval_date','estimated_return','work_volume','project_stage','project_type']:
            self.assertEqual(d[key],'',key)
        for key in ['loan_total','revenue_total','oh_total','idc_total']:self.assertEqual(d[key],0)
        self.assertEqual(d['budget'],{})
        entry=self.meeting['projects'][0]
        self.assertEqual(entry['beforeBudget'],0);self.assertEqual(entry['afterBudget'],0)
        self.assertNotIn('finances',entry['project'])
        self.assertEqual(entry['project']['details'],{'shortName':'SHORT-01'})
    def test_edit_persist_round_isolation_master_unchanged(self):
        m2=self.round(2);d=self.doc()
        changes=dict(owner='Meeting director',owner_department='Meeting department',owner_division='Meeting division',description='Meeting scope',area='Meeting area',timeline='2570-2575',approval_date='1 ม.ค. 2569',status='ชะลอโครงการ',project_stage='Meeting note',project_type='continuing',loan_total=12,revenue_total=8,estimated_return=json.dumps(dict(npv=-1,payback_period=2)),work_volume=json.dumps({'rows':[]}),budget={'2570':dict(investment_set=7,disbursement_target=3)})
        d.update(changes)
        r=self.c.post(self.base+'/save-project',json=d);self.assertEqual(r.status_code,200,r.json)
        saved=self.doc()
        for k,v in changes.items():
            if k!='budget':self.assertEqual(saved[k],v,k)
        self.assertEqual(saved['budget']['2570']['investment_set'],7)
        self.assertEqual(self.c.get('/api/projects/'+self.project['id']).json,self.project)
        self.assertEqual(self.doc('/api/meeting-workspaces/'+m2['id']+'/api')['owner'],'')
        reopened=create_app(self.database).test_client().get(self.base+'/get-project/'+self.project['code']).json['data']
        self.assertEqual(reopened['owner'],'Meeting director')
        self.assertEqual(self.c.post(self.base+'/save-project',json=d).status_code,409)
    def test_name_and_short_name_remain_linked_closed_round_stays_read_only(self):
        for key in ['id','name','short_name']:
            d=self.doc();d[key]='different'
            self.assertEqual(self.c.post(self.base+'/save-project',json=d).status_code,404 if key=='id' else 409)
        d=self.doc();d['meeting_decision']='เห็นชอบ'
        self.assertEqual(self.c.post(self.base+'/save-project',json=d).status_code,200)
        route='/api/meetings/'+self.meeting['id']
        version=self.c.get(route).json['version']
        self.assertEqual(self.c.post(route+'/close',json={'version':version}).status_code,200)
        d=self.doc();d['owner']='blocked'
        self.assertEqual(self.c.post(self.base+'/save-project',json=d).status_code,409)
    def test_project_manager_edit_is_saved_and_shown_in_summary(self):
        d=self.doc()
        r=self.c.put(self.base+'/project-master/'+self.project['code'],json=dict(version=d['version'],owner='Manager edited',responsible_unit='Unit edited',status='เสร็จสิ้น'))
        self.assertEqual(r.status_code,200,r.json)
        self.assertEqual(self.doc()['owner'],'Manager edited')
        self.assertEqual(self.doc()['owner_department'],'Unit edited')
        master=self.c.get(self.base+'/project-master').json['data'][0]
        self.assertEqual(master['owner'],'Manager edited')
        summary=self.c.get(self.base+'/dashboard/2570').json['data'][0]
        self.assertEqual(summary['responsible_unit'],'Unit edited')
        self.assertEqual(self.c.get('/api/projects/'+self.project['id']).json,self.project)

    def test_remove_project_isolated_and_readd(self):
        other=self.round(2)
        d=self.doc();d['owner']='Saved in meeting'
        self.assertEqual(self.c.post(self.base+'/save-project',json=d).status_code,200)
        route=self.base+'/project-master/'+self.project['code']
        self.assertEqual(self.c.delete(route,json={'version':d['version']}).status_code,409)
        self.assertEqual(self.c.delete(route,json={}).status_code,409)
        self.assertEqual(self.c.delete(route,json={'version':self.doc()['version']}).status_code,200)
        self.assertEqual(self.c.get(self.base+'/project-master').json['data'],[])
        self.assertEqual(self.c.get('/api/meetings/'+self.meeting['id']).json['projects'],[])
        self.assertEqual(self.c.get('/api/projects/'+self.project['id']).json,self.project)
        self.assertEqual(len(self.c.get('/api/meetings/'+other['id']).json['projects']),1)
        self.assertEqual(self.c.delete(route,json={'version':1}).status_code,404)
        self.assertEqual(self.c.post('/api/meetings/'+self.meeting['id']+'/projects',json={'projectIds':[self.project['id']]}).status_code,201)
        self.assertEqual(self.doc()['owner'],'')

    def test_remove_closed_round_blocked(self):
        d=self.doc();d['meeting_decision']='เห็นชอบ'
        self.c.post(self.base+'/save-project',json=d)
        route='/api/meetings/'+self.meeting['id']
        version=self.c.get(route).json['version']
        self.assertEqual(self.c.post(route+'/close',json={'version':version}).status_code,200)
        response=self.c.delete(self.base+'/project-master/'+self.project['code'],json={'version':self.doc()['version']})
        self.assertEqual(response.status_code,409)
        self.assertEqual(len(self.c.get(route).json['projects']),1)

if __name__=='__main__':unittest.main()
