"""Portable, read-only HTML snapshot. No database files or remote dependencies."""
import json
from pathlib import Path

from meeting_workspace import document_for, summary_row
from patch_updates import APP_VERSION


def snapshot(conn, projects, masters, schema_version, exported_at):
    rounds = []
    for meeting in conn.execute('SELECT * FROM budget_meetings ORDER BY year_be DESC,round_no DESC'):
        item = dict(meeting)
        item['projects'] = []
        for entry in conn.execute('SELECT * FROM meeting_projects WHERE meeting_id=? ORDER BY created_at,id', (meeting['id'],)):
            doc = document_for(entry, meeting['year_be'])
            meta = json.loads(entry['workspace_meta_json'])
            item['projects'].append(dict(
                id=entry['id'],projectId=entry['project_id'],meetingId=entry['meeting_id'],version=entry['version'],updated=entry['updated_at'],
                project=json.loads(entry['snapshot_json']),
                document=doc, metadata=meta,
                summaries={str(y): summary_row(doc, meta, y) for y in range(meeting['year_be'], meeting['year_be']+7)},
                beforeBudget=entry['before_baht']/1e6, afterBudget=entry['after_baht']/1e6,
                monthlyPlan=[v/1e6 for v in json.loads(entry['plan_json'])],
                reason=entry['reason'], notes=entry['notes'], reviewed=bool(entry['reviewed']),
            ))
        state = conn.execute('SELECT funds_json FROM meeting_workspace_state WHERE meeting_id=?', (meeting['id'],)).fetchone()
        item['funds'] = json.loads(state['funds_json']) if state else {}
        rounds.append(item)
    nine = conn.execute('SELECT * FROM nine_box_state WHERE id=1').fetchone()
    return dict(format=1, exportedAt=exported_at, version=APP_VERSION,
                schemaVersion=schema_version, projects=projects, masters=masters,
                meetings=rounds, nineBox=json.loads(nine['data_json']) if nine else {},
                nineBoxYear=nine['current_year'] if nine else None,nineBoxVersion=nine['version'] if nine else 0)


def document(data, root):
    from html_portable import document as application_document
    return application_document(data, root)
