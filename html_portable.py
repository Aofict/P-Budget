"""Bundle the actual application screens and read APIs into a single HTML file."""
import base64
from datetime import datetime, timedelta, timezone
import html
import json
import mimetypes
from pathlib import Path
import re
from urllib.parse import unquote, urljoin, urlsplit

from meeting_workspace import cycle, summary_row

ORIGIN = 'https://pbudget.offline'


def api_map(data):
    year = str(datetime.fromisoformat(data['exportedAt']).astimezone(timezone(timedelta(hours=7))).year+543)
    nine = data['nineBox'] or {year:[]}
    nine_year = data.get('nineBoxYear') if data.get('nineBoxYear') in nine else sorted(nine)[-1]
    apis = {
        '/api/bootstrap': dict(projects=data['projects'], masters=data['masters'], schemaVersion=data['schemaVersion'], yearBE=int(year), codeFormat='PRJ-BBBB-NNNNN'),
        '/api/projects': dict(projects=data['projects']), '/api/masters': data['masters'],
        '/api/database-transfer': dict(token='offline', supported=False, busy=False, last=None),
        '/api/updates': dict(version=data['version'], supported=False, busy=False, token='offline'),
        '/api/storage-info': dict(databasePath='สำเนา HTML สำหรับอ่าน', backupDirectory='ไม่มีฐานข้อมูลในไฟล์ HTML', latestBackup=None),
        '/api/nine-box': dict(yearsData=nine, currentYear=nine_year, version=max(1, data.get('nineBoxVersion', 1))),
        '/api/nine-box/backups': dict(backups=[]),
    }
    for p in data['projects']:
        apis['/api/projects/'+p['id']] = p
        apis['/api/projects/'+p['id']+'/history'] = data.get('histories', {}).get(p['id'], dict(events=[]))
    rounds = []
    for m in data['meetings']:
        base = '/api/meeting-workspaces/'+m['id']+'/api'
        entries = m['projects']
        round_info = {k:v for k,v in m.items() if k not in ('projects','funds')}
        rounds.append(dict(round_info, project_count=len(entries)))
        full = dict(round_info, projects=[dict(e, workspace=e['document'], workspaceMetadata=e['metadata']) for e in entries])
        before = sum(e['beforeBudget'] for e in entries)
        after = sum(e['afterBudget'] for e in entries)
        full['summary'] = dict(count=len(entries), before=before, after=after, difference=after-before, pending=sum(not e['reviewed'] for e in entries))
        apis['/api/meetings/'+m['id']] = full
        apis[base+'/config'] = dict(cycle(m['year_be']), meeting_id=m['id'], round_no=m['round_no'], title=m['title'], read_only=m['status']=='closed', version=m['version'])
        master = []
        for i,e in enumerate(entries):
            d,meta = e['document'],e['metadata']
            master.append(dict(id=i+1, code=d['id'], name=d['name'], short_name=d.get('short_name',''), owner=d.get('owner',''), status=d.get('status',''), responsible_unit=d.get('owner_department',''), summary_group=meta.get('summary_group','new_project' if d.get('project_type') in ('new','โครงการใหม่') else 'continuing_budget'), display_order=meta.get('display_order',i), is_active=meta.get('is_active',1), show_set_summary=meta.get('show_set_summary',1), show_change_summary=meta.get('show_change_summary',1), version=d['version'], master_project_id=d.get('master_project_id'), meeting_decision=d.get('meeting_decision','')))
            apis[base+'/get-project/'+d['id']] = dict(success=True, data=d, cycle=cycle(m['year_be']))
        apis[base+'/project-master'] = dict(success=True,data=master,meeting_year=m['year_be'])
        for y in range(m['year_be'],m['year_be']+7):
            all_rows=[e['summaries'][str(y)] for e in entries]
            active=[r for r,e in zip(all_rows,entries) if e['metadata'].get('is_active',1)]
            result=dict(success=True,meeting_year=m['year_be'],year=y,data=active,project_count=len(active),totals={k:sum(r[k] for r in active) for k in ('operating_budget_before','operating_budget_after','disbursement_before','disbursement_after')})
            apis[base+'/dashboard/'+str(y)] = result
            apis[base+'/dashboard/'+str(y)+'?include_inactive=1'] = dict(result,data=all_rows,project_count=len(all_rows),totals={k:sum(r[k] for r in all_rows) for k in result['totals']})
        overview=[]
        for y in range(2569,2574):
            values=[summary_row(e['document'],e['metadata'],y) for e in entries]
            overview.append(dict(year=y,operating_budget=sum(r['operating_budget_after'] for r in values),disbursement_target=sum(r['disbursement_after'] for r in values)))
        apis[base+'/annual-overview'] = dict(success=True,data=overview,project_count=len(entries))
        apis[base+'/dashboard-fund-sources/'+str(m['year_be'])] = dict(success=True,data=m['funds'],version=1)
        apis[base+'/workflow/status'] = dict(success=True,openpyxl_installed=True)
        apis[base+'/file/status'] = dict(success=True,current_file=None)
    apis['/api/meetings'] = dict(meetings=rounds)
    return apis


class Bundler:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.css_cache = {}
        self.runtime = (self.root/'html-portable.js').read_text(encoding='utf-8')

    def resolve(self, name, parent='/'):
        return unquote(urlsplit(urljoin(ORIGIN+parent,html.unescape(name))).path)

    def path(self,name):
        path = (self.root/name.lstrip('/')).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError('Asset outside application folder')
        return path

    def resource(self,name,parent='/'):
        if name.startswith(('data:','#')):
            return name
        if urlsplit(name).scheme in ('http','https') and not name.startswith(ORIGIN):
            return 'data:,'
        target=self.resolve(name,parent)
        path=self.path(target)
        if not path.is_file():
            # Font Awesome ships woff2 only. Its ttf fallback is unused.
            return 'data:,'
        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode('ascii')

    def css(self,name):
        if name in self.css_cache:return self.css_cache[name]
        text=self.path(name).read_text(encoding='utf-8')
        if name=='/assets/fonts/noto-sans-thai.css':
            license_text=self.path('/assets/fonts/OFL-NotoSansThai.txt').read_text(encoding='utf-8')
            text='/* '+license_text.replace('*/','* /')+' */\n'+text
        def imports(match):
            target=match.group(1)
            if target.startswith('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai'):
                return self.css('/assets/fonts/noto-sans-thai.css')
            if urlsplit(target).scheme in ('http','https') and not target.startswith(ORIGIN):return ''
            return self.css(self.resolve(target,name))
        text=re.sub(r'@import\s+(?:url\([\'"]?([^\)\'\"]+)[\'"]?\))\s*;',imports,text)
        text=re.sub(r'url\(\s*([\'"]?)(.*?)\1\s*\)',lambda m:'url("'+self.resource(m.group(2),name)+'")',text)
        self.css_cache[name]=text
        return text

    def js(self,text,child=False):
        # Older vendored polyfills discover the global object with Function().
        # Use its native equivalent so the portable CSP can keep eval disabled.
        text=text.replace('Function("return this")()', 'globalThis')
        text=re.sub(r'Function\("r","regeneratorRuntime = r"\)\((\w+)\)',r'(globalThis.regeneratorRuntime=\1)',text)
        if child:
            # A srcdoc page has about:srcdoc as its real URL. Keep the original
            # round/page query parsing against its exported virtual address.
            text=re.sub(r'(?<![\w.])(?:window\.)?location\.(pathname|search|href|reload)',r'window.__offlineLocation.\1',text)
        # The existing nine-box health check inspects its stylesheet element.
        text=text.replace('link[href^="style.css"]','style[data-offline-href="style.css"]')
        return text.replace('</script','<\\/script')

    def page(self,name,child=False):
        text=self.path(name).read_text(encoding='utf-8')
        def script(match):
            attrs,body=match.group(1),match.group(2)
            src=re.search(r'\bsrc\s*=\s*[\'"]([^\'"]+)',attrs)
            if src:
                path=self.resolve(src.group(1),name)
                # Database-session adds server generation tokens to writes. The
                # portable transport rejects writes before they leave the page.
                body='' if path=='/database-session.js' else self.path(path).read_text(encoding='utf-8')
            return '<script>'+self.js(body,child)+'</script>'
        text=re.sub(r'<script\b([^>]*)>(.*?)</script\s*>',script,text,flags=re.I|re.S)
        def link(match):
            tag=match.group(0)
            href=re.search(r'\bhref\s*=\s*[\'"]([^\'"]+)',tag)
            if not href:return tag
            if re.search(r'rel\s*=\s*[\'"]stylesheet',tag,re.I):
                target=self.resolve(href.group(1),name)
                return '<style data-offline-href="'+html.escape(urlsplit(href.group(1)).path,quote=True)+'">'+self.css(target)+'</style>'
            if href.group(1).startswith('data:'):return tag
            return tag.replace(href.group(1),self.resource(href.group(1),name))
        text=re.sub(r'<link\b[^>]*>',link,text,flags=re.I|re.S)
        text=re.sub(r'(<img\b[^>]*\bsrc\s*=\s*[\'"])([^\'"]+)',lambda m:m.group(1)+self.resource(m.group(2),name),text,flags=re.I)
        # The runtime is installed before any application script runs.
        boot='<script>'+self.runtime.replace('</script','<\\/script')+'</script>'
        if child:
            boot='<script>window.__offlinePath="OFFLINE_PAGE_PATH";</script>'+boot
        # Keep the encoding declaration inside the first 1024 bytes, before
        # the large inline runtime/data. Local-file readers cannot rely on an
        # HTTP Content-Type header to identify Thai text as UTF-8.
        text=re.sub(r'<meta\s+charset\s*=\s*[\'"][^\'"]+[\'"]\s*/?>', '', text, flags=re.I)
        text=text.replace('<head>','<head><meta charset="UTF-8">'+boot,1)
        return text


def document(data,root):
    bundle=Bundler(root)
    pages={name:bundle.page(name,True) for name in ('/meeting-app/index.html','/meeting-app/project_detail.html','/nine-box-app/index.html')}
    payload=dict(api=api_map(data),pages=pages,exportedAt=data['exportedAt'],theme=data.get('theme','light'),yearBE=datetime.fromisoformat(data['exportedAt']).year+543)
    encoded=base64.b64encode(json.dumps(payload,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode('utf-8')).decode('ascii')
    text=bundle.page('/index.html')
    seed='<script>window.__offlineBundle=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob("'+encoded+'"),c=>c.charCodeAt(0))));</script>'
    csp='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' blob: data:; style-src \'unsafe-inline\' data:; font-src data:; img-src data: blob:; frame-src \'self\' blob:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">'
    text=text.replace('<head><meta charset="UTF-8">','<head><meta charset="UTF-8">'+csp+seed,1)
    return text
