"""Additive, repeat-safe import of a supplied legacy .db/.mbg into Master DB.

Never imports or executes the old app.py; the input SQLite database is opened
read-only. Existing projects/rounds are not replaced. Original codes and payloads
remain available in round metadata and the import mapping.
"""
from contextlib import closing
from datetime import date
from pathlib import Path
import argparse
import hashlib
import json
import sqlite3
import uuid

from meeting_workspace import BUDGET_FIELDS, default_document
from server import initialize, connection, now, current_year, validate_project, insert_project, allocate_code


def read_legacy(path):
    path=Path(path).resolve()
    with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)) as src:
        src.row_factory=sqlite3.Row
        src.execute('PRAGMA query_only=ON')
        tables={r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        required={'projects','project_cycle_info','project_budget_plan_cycle','project_budget_details_cycle','project_workflow_cycle'}
        if not required<=tables: raise ValueError('ไม่ใช่ฐานข้อมูล MeetingBudget ที่รองรับ')
        projects=[dict(r) for r in src.execute('SELECT * FROM projects ORDER BY id')]
        if len(projects)>1000: raise ValueError('รองรับไม่เกิน 1,000 โครงการต่อไฟล์')
        info=[dict(r) for r in src.execute('SELECT * FROM project_cycle_info')]
        plan=[dict(r) for r in src.execute('SELECT * FROM project_budget_plan_cycle')]
        details=[dict(r) for r in src.execute('SELECT * FROM project_budget_details_cycle ORDER BY row_index')]
        workflows=[dict(r) for r in src.execute('SELECT * FROM project_workflow_cycle')]
        funds=[dict(r) for r in src.execute('SELECT * FROM dashboard_fund_sources')] if 'dashboard_fund_sources' in tables else []
        years=sorted({r['meeting_year'] for r in info+plan+details+workflows})
        if not years: years=[current_year()]
        if any(type(y) is not int or not 2400<=y<=3000 for y in years): raise ValueError('ปีประชุมในไฟล์ไม่ถูกต้อง')
        return dict(projects=projects,info=info,plan=plan,details=details,workflows=workflows,funds=funds,years=years)


def import_legacy(source,target):
    raw=read_legacy(source)
    digest=hashlib.sha256(Path(source).read_bytes()).hexdigest()
    initialize(target)
    with connection(target,True) as c:
        old=c.execute('SELECT mapping_json FROM meeting_legacy_imports WHERE source_hash=?',(digest,)).fetchone()
        if old: return dict(json.loads(old[0]),alreadyImported=True)
        stamp=now(); project_map={}; rounds={}
        for p in raw['projects']:
            latest=next((r for r in reversed(raw['info']) if r['project_code']==p['code']),{})
            fields={'shortName':'short_name','director':'owner','department':'owner_department','division':'owner_division',
                    'objectives':'description','area':'area','statusNotes':'project_stage'}
            details={k:str(latest.get(v) or p.get(v) or '') for k,v in fields.items()}
            details['projectType']='new' if latest.get('project_type') in ('new','โครงการใหม่') else 'continuing'
            try:
                returns=json.loads(latest.get('estimated_return') or '{}')
                details.update({k:None if returns.get(v) in ('',None) else returns[v] for k,v in {'paybackYears':'payback_period','npv':'npv','firr':'firr','eirr':'eirr'}.items()})
            except (ValueError,AttributeError): pass
            data=dict(name=p['name'],statusId='started',progress=0,details=details,
                        finances=dict(
                            loan=(latest.get('loan_total') or 0) / 1_000_000,
                            revenue=(latest.get('revenue_total') or 0) / 1_000_000
                        )
            created=insert_project(c,validate_project(c,data),allocate_code(c,current_year()),action='import')
            project_map[p['code']]=created
        for year in raw['years']:
            round_no=c.execute('SELECT COALESCE(MAX(round_no),0)+1 FROM budget_meetings WHERE year_be=?',(year,)).fetchone()[0]
            mid=str(uuid.uuid4());rounds[str(year)]=mid
            c.execute('INSERT INTO budget_meetings(id,year_be,round_no,title,meeting_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
                      (mid,year,round_no,'นำเข้าจาก MeetingBudget · '+Path(source).name,date.today().isoformat(),stamp,stamp))
            for i,p in enumerate(raw['projects']):
                master=project_map[p['code']]
                info=next((r for r in raw['info'] if r['project_code']==p['code'] and r['meeting_year']==year),{})
                doc=default_document(master,year)
                doc.update({k:v for k,v in info.items() if k not in ('project_code','meeting_year')})
                for old_key,new_key in [('investment_types_json','investment_types'),('external_opinions_json','external_opinions')]:
                    if old_key in doc:doc[new_key]=json.loads(doc.pop(old_key))
                doc.update(id=master['code'],name=master['name'],master_project_id=master['id'])
                doc['budget']={str(r['fiscal_year']):{k:r.get(k) for k in BUDGET_FIELDS}
                    for r in raw['plan'] if r['project_code']==p['code'] and r['meeting_year']==year}
                for r in raw['details']:
                    if r['project_code']==p['code'] and r['meeting_year']==year:
                        kind=r['detail_type']
                        if kind not in doc['detailBudget']:continue
                        doc['detailBudget'][kind].append(dict(work=r['work'] or '',investment=r['investment'] or 0,
                            months=json.loads(r['months_json']),future=json.loads(r['future_json'])))
                wf=next((r for r in raw['workflows'] if r['project_code']==p['code'] and r['meeting_year']==year),None)
                if wf:doc['workflow']=json.loads(wf['data_json'])
                meta={k:p.get(k,default) for k,default in [('summary_group','continuing_budget'),('display_order',i),('is_active',1),('show_set_summary',1),('show_change_summary',0)]}
                meta.update(legacy_code=p['code'],legacy_master=p,source_hash=digest)
                eid=str(uuid.uuid4());budget=round(master['budget']*1e6)
                c.execute('''INSERT INTO meeting_projects(id,meeting_id,project_id,snapshot_json,before_baht,after_baht,plan_json,notes,reviewed,
                             created_at,updated_at,workspace_json,workspace_meta_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                          (eid,mid,master['id'],json.dumps(master,ensure_ascii=False),budget,budget,json.dumps([0]*12),
                           doc.get('meeting_comment') or '',int(bool(doc.get('meeting_decision'))),stamp,stamp,
                           json.dumps(doc,ensure_ascii=False),json.dumps(meta,ensure_ascii=False)))
                c.execute('INSERT INTO meeting_project_events(entry_id,snapshot_json,occurred_at) VALUES(?,?,?)',
                          (eid,json.dumps(dict(workspace=doc,metadata=meta,afterBudget=master['budget'],reviewed=False,reason='นำเข้าจากแอปเดิม'),ensure_ascii=False),stamp))
            fund=next((r for r in raw['funds'] if r['meeting_year']==year),None)
            if fund:c.execute('INSERT INTO meeting_workspace_state VALUES(?,?,1,?)',(mid,fund['data_json'],stamp))
        result=dict(projects={k:dict(id=v['id'],code=v['code'],name=v['name']) for k,v in project_map.items()},rounds=rounds,sourceHash=digest)
        c.execute('INSERT INTO meeting_legacy_imports VALUES(?,?,?)',(digest,json.dumps(result,ensure_ascii=False),stamp))
        if c.execute('PRAGMA foreign_key_check').fetchone():raise ValueError('ข้อมูลอ้างอิงไม่ครบ')
        return dict(result,alreadyImported=False)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source');parser.add_argument('--database',default='data/master.db')
    args=parser.parse_args()
    print(json.dumps(import_legacy(args.source,args.database),ensure_ascii=False,indent=2))
