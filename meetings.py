"""Budget meeting rounds and immutable pre-meeting project snapshots."""
from datetime import date
import json
import uuid
from flask import jsonify, request


def register_meetings(app, db, *, error, money, get_project, now, check_version, text_field):
    def body():
        data = request.get_json()
        if not isinstance(data, dict):
            raise error('ข้อมูลต้องเป็น JSON object')
        return data

    def get_round(conn, meeting_id, writable=False):
        row = conn.execute('SELECT * FROM budget_meetings WHERE id=?', (meeting_id,)).fetchone()
        if not row:
            raise error('ไม่พบรอบประชุม', 404)
        if writable and row['status'] == 'closed':
            raise error('รอบประชุมนี้ปิดแล้ว ไม่สามารถแก้ไขได้', 409)
        return dict(row)

    def entry_item(row):
        return dict(id=row['id'], meetingId=row['meeting_id'], projectId=row['project_id'],
                    project=json.loads(row['snapshot_json']), beforeBudget=row['before_baht']/1_000_000,
                    afterBudget=row['after_baht']/1_000_000,
                    monthlyPlan=[v/1_000_000 for v in json.loads(row['plan_json'])],
                    reason=row['reason'], notes=row['notes'], reviewed=bool(row['reviewed']),
                    version=row['version'], updated=row['updated_at'],
                    workspace=json.loads(row['workspace_json']), workspaceMetadata=json.loads(row['workspace_meta_json']))

    def get_entry(conn, meeting_id, entry_id):
        row = conn.execute('SELECT * FROM meeting_projects WHERE id=? AND meeting_id=?', (entry_id,meeting_id)).fetchone()
        if not row:
            raise error('ไม่พบโครงการในรอบประชุมนี้', 404)
        return row

    def detail(conn, meeting_id):
        meeting = get_round(conn, meeting_id)
        rows = conn.execute('SELECT * FROM meeting_projects WHERE meeting_id=? ORDER BY created_at,id', (meeting_id,)).fetchall()
        meeting['projects'] = [entry_item(row) for row in rows]
        before = sum(r['before_baht'] for r in rows)
        after = sum(r['after_baht'] for r in rows)
        meeting['summary'] = dict(count=len(rows), before=before/1_000_000, after=after/1_000_000,
                                  difference=(after-before)/1_000_000,
                                  pending=sum(not r['reviewed'] for r in rows))
        return meeting

    def audit(conn, entry_id, snapshot):
        conn.execute('INSERT INTO meeting_project_events(entry_id,snapshot_json,occurred_at) VALUES(?,?,?)',
                     (entry_id,json.dumps(snapshot,ensure_ascii=False),now()))

    @app.get('/api/meetings')
    def list_meetings():
        with db() as conn:
            rows = conn.execute('''SELECT m.*, COUNT(p.id) project_count FROM budget_meetings m
                LEFT JOIN meeting_projects p ON p.meeting_id=m.id GROUP BY m.id ORDER BY m.year_be DESC,m.round_no DESC''')
            return jsonify(meetings=[dict(r) for r in rows])

    @app.post('/api/meetings')
    def create_meeting():
        data = body()
        if type(data.get('year')) is not int or not 2400 <= data['year'] <= 3000:
            raise error('ปีประชุมต้องเป็น พ.ศ. ระหว่าง 2400 ถึง 3000')
        if type(data.get('round')) is not int or not 1 <= data['round'] <= 999:
            raise error('ครั้งที่ประชุมต้องอยู่ระหว่าง 1 ถึง 999')
        title = text_field(data.get('title'),'ชื่อรอบประชุม',180)
        try:
            meeting_date = date.fromisoformat(data.get('date'))
        except (TypeError,ValueError):
            raise error('วันที่ประชุมไม่ถูกต้อง')
        meeting_id, stamp = str(uuid.uuid4()), now()
        with db(True) as conn:
            conn.execute('''INSERT INTO budget_meetings(id,year_be,round_no,title,meeting_date,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?)''', (meeting_id,data['year'],data['round'],title,meeting_date.isoformat(),stamp,stamp))
            return jsonify(detail(conn,meeting_id)),201

    @app.get('/api/meetings/<meeting_id>')
    def read_meeting(meeting_id):
        with db() as conn:
            return jsonify(detail(conn,meeting_id))

    @app.delete('/api/meetings/<meeting_id>')
    def delete_meeting(meeting_id):
        data = body()
        with db(True) as conn:
            meeting = get_round(conn, meeting_id)
            check_version(data, meeting)
            conn.execute('DELETE FROM meeting_project_events WHERE entry_id IN (SELECT id FROM meeting_projects WHERE meeting_id=?)', (meeting_id,))
            conn.execute('DELETE FROM meeting_projects WHERE meeting_id=?', (meeting_id,))
            conn.execute('DELETE FROM meeting_workspace_state WHERE meeting_id=?', (meeting_id,))
            conn.execute('DELETE FROM budget_meetings WHERE id=?', (meeting_id,))
            for row in conn.execute('SELECT source_hash,mapping_json FROM meeting_legacy_imports').fetchall():
                mapping = json.loads(row['mapping_json'])
                rounds = mapping.get('rounds', {})
                if meeting_id not in rounds.values():
                    continue
                mapping['rounds'] = {year: identifier for year, identifier in rounds.items() if identifier != meeting_id}
                if mapping['rounds']:
                    conn.execute('UPDATE meeting_legacy_imports SET mapping_json=? WHERE source_hash=?', (json.dumps(mapping, ensure_ascii=False), row['source_hash']))
                else:
                    conn.execute('DELETE FROM meeting_legacy_imports WHERE source_hash=?', (row['source_hash'],))
            return jsonify(success=True)

    @app.patch('/api/meetings/<meeting_id>')
    def rename_meeting(meeting_id):
        data = body()
        title = text_field(data.get('title'), 'ชื่อรอบประชุม', 180)
        with db(True) as conn:
            meeting = get_round(conn, meeting_id, True)
            check_version(data, meeting)
            conn.execute('UPDATE budget_meetings SET title=?,version=version+1,updated_at=? WHERE id=?',
                         (title, now(), meeting_id))
            return jsonify(detail(conn, meeting_id))

    @app.post('/api/meetings/<meeting_id>/projects')
    def add_projects(meeting_id):
        ids = body().get('projectIds')
        if not isinstance(ids,list) or not ids or len(ids)>1000 or any(not isinstance(i,str) for i in ids) or len(set(ids))!=len(ids):
            raise error('กรุณาเลือกโครงการไม่ซ้ำกัน 1–1,000 โครงการ')
        with db(True) as conn:
            get_round(conn,meeting_id,True)
            for project_id in ids:
                project = get_project(conn,project_id)
                # Only identity labels enter the meeting. Meeting figures start independently.
                project = dict(id=project['id'], code=project['code'], name=project['name'],
                               details=dict(shortName=project.get('details', {}).get('shortName', '')), identityOnly=True)
                amount = 0
                entry_id, stamp = str(uuid.uuid4()),now()
                conn.execute('''INSERT INTO meeting_projects(id,meeting_id,project_id,snapshot_json,before_baht,after_baht,plan_json,created_at,updated_at)
                    VALUES(?,?,?,?,?,?,?,?,?)''', (entry_id,meeting_id,project_id,json.dumps(project,ensure_ascii=False),amount,amount,json.dumps([0]*12),stamp,stamp))
                audit(conn,entry_id,entry_item(get_entry(conn,meeting_id,entry_id)))
            conn.execute('UPDATE budget_meetings SET version=version+1,updated_at=? WHERE id=?',(now(),meeting_id))
            return jsonify(detail(conn,meeting_id)),201

    @app.put('/api/meetings/<meeting_id>/projects/<entry_id>')
    def update_entry(meeting_id,entry_id):
        data = body()
        after = money(data.get('afterBudget'),'งบหลังประชุม')
        plan = data.get('monthlyPlan')
        if not isinstance(plan,list) or len(plan)!=12:
            raise error('แผนงบประมาณต้องมี 12 เดือน มกราคม–ธันวาคม')
        plan = [money(v,'แผนรายเดือน') for v in plan]
        if sum(plan)>after:
            raise error('ผลรวมแผนรายเดือนต้องไม่เกินงบหลังประชุม')
        reason, notes = data.get('reason',''), data.get('notes','')
        if not isinstance(reason,str) or len(reason)>4000 or not isinstance(notes,str) or len(notes)>8000:
            raise error('เหตุผลไม่เกิน 4,000 ตัวอักษร และบันทึกไม่เกิน 8,000 ตัวอักษร')
        reviewed = data.get('reviewed',False)
        if type(reviewed) is not bool:
            raise error('สถานะพิจารณาไม่ถูกต้อง')
        with db(True) as conn:
            get_round(conn,meeting_id,True)
            old = get_entry(conn,meeting_id,entry_id)
            check_version(data,old)
            if after != old['before_baht'] and not reason.strip():
                raise error('กรุณาระบุเหตุผลในการเปลี่ยนแปลงงบประมาณ')
            conn.execute('''UPDATE meeting_projects SET after_baht=?,plan_json=?,reason=?,notes=?,reviewed=?,version=version+1,updated_at=? WHERE id=?''',
                         (after,json.dumps(plan),reason.strip(),notes.strip(),reviewed,now(),entry_id))
            result = entry_item(get_entry(conn,meeting_id,entry_id))
            audit(conn,entry_id,result)
            conn.execute('UPDATE budget_meetings SET version=version+1,updated_at=? WHERE id=?',(now(),meeting_id))
            return jsonify(result)

    @app.get('/api/meetings/<meeting_id>/projects/<entry_id>/history')
    def entry_history(meeting_id,entry_id):
        with db() as conn:
            get_entry(conn,meeting_id,entry_id)
            rows = conn.execute('SELECT snapshot_json,occurred_at FROM meeting_project_events WHERE entry_id=? ORDER BY id DESC',(entry_id,))
            return jsonify(events=[dict(entry=json.loads(r['snapshot_json']),at=r['occurred_at']) for r in rows])

    @app.post('/api/meetings/<meeting_id>/close')
    def close_meeting(meeting_id):
        data = body()
        with db(True) as conn:
            meeting = get_round(conn,meeting_id,True)
            check_version(data,meeting)
            rows = conn.execute('SELECT reviewed FROM meeting_projects WHERE meeting_id=?',(meeting_id,)).fetchall()
            if not rows or any(not row['reviewed'] for row in rows):
                raise error('ต้องมีโครงการและพิจารณาครบทุกโครงการก่อนปิดรอบประชุม')
            conn.execute("UPDATE budget_meetings SET status='closed',version=version+1,updated_at=? WHERE id=?",(now(),meeting_id))
            return jsonify(detail(conn,meeting_id))
