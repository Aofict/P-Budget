/* Meeting workspace uses the existing application shell and shared API helpers. */
window.MeetingModule = (() => {
  let host, rounds = [], meeting = null, selected = null, tab = 'info', year = '', requestId = 0;
  let dirty = false, busy = false;
  let workspaceTimer;
  function watchWorkspace() {
    clearTimeout(workspaceTimer);
    const frame = document.getElementById('meeting-workspace-frame');
    if (!frame) return;
    const deadline = Date.now() + 45000;
    const check = () => {
      if (!frame.isConnected) return;
      try {
        if (frame.contentWindow.meetingWorkspaceReady?.()) {
          document.getElementById('meeting-workspace-error')?.remove();
          return;
        }
      } catch (_) {}
      if (Date.now() < deadline) {
        workspaceTimer = setTimeout(check, 500);
        return;
      }
      if (document.getElementById('meeting-workspace-error')) return;
      const notice = document.createElement('div');
      notice.id = 'meeting-workspace-error';
      notice.className = 'panel empty';
      notice.setAttribute('role', 'alert');
      notice.textContent = 'หน้าประชุมโหลดไม่สำเร็จ ';
      const retry = document.createElement('button');
      retry.className = 'secondary';
      retry.textContent = 'โหลดหน้าสรุปใหม่';
      retry.onclick = () => {
        if (!confirmLeave()) return;
        frame.src = `/meeting-app/${encodeURIComponent(meeting.id)}/index.html`;
        notice.remove();
        watchWorkspace();
      };
      notice.append(retry);
      frame.before(notice);
    };
    workspaceTimer = setTimeout(check, 500);
  }
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const esc = value => escapeHtml(value ?? '');
  const base = () => `/api/meetings/${encodeURIComponent(meeting.id)}`;
  const entryBase = () => `${base()}/projects/${encodeURIComponent(selected.id)}`;
  const confirmLeave = () => {
    const frame = document.getElementById('meeting-workspace-frame');
    if (frame?.contentWindow?.meetingCanLeave && !frame.contentWindow.meetingCanLeave()) return false;
    return !dirty || confirm('มีข้อมูลที่ยังไม่บันทึก ต้องการละทิ้งการแก้ไขหรือไม่?');
  };
  const options = () => rounds.filter(r => !year || String(r.year_be) === year);
  const projectTitle = entry => `${entry.project.code} · ${entry.project.name}`;

  async function mount(element) {
    clearTimeout(workspaceTimer);
    host = element;
    const token = ++requestId;
    host.innerHTML = '<div class="panel empty">กำลังโหลดรอบประชุม…</div>';
    try {
      rounds = (await api('/api/meetings')).meetings;
      if (token !== requestId) return;
      if (year && !rounds.some(r => String(r.year_be) === year)) year = '';
      const chosen = options().find(r => r.id === meeting?.id) || options()[0];
      meeting = chosen ? await api(`/api/meetings/${encodeURIComponent(chosen.id)}`) : null;
      if (token !== requestId) return;
      selected = meeting?.projects.find(e => e.id === selected?.id) || null;
      dirty = false;
      render();
    } catch (error) {
      if (token === requestId) host.innerHTML = `<div class="panel empty">${esc(error.message)}<br><button class="secondary" data-meeting-action="reload">ลองใหม่</button></div>`;
    }
  }

  function render() {
    const years = [...new Set(rounds.map(r => r.year_be))];
    host.innerHTML = `<div class="meeting-toolbar panel"><div class="meeting-selects"><label>ปีประชุม<select id="meeting-year"><option value="">ทุกปี</option>${years.map(y=>`<option ${String(y)===year?'selected':''}>${y}</option>`).join('')}</select></label><label>รอบประชุม<select id="meeting-round"><option value="">เลือกรอบประชุม</option>${options().map(r=>`<option value="${esc(r.id)}" ${r.id===meeting?.id?'selected':''}>ครั้งที่ ${r.round_no}/${r.year_be} · ${esc(r.title)}</option>`).join('')}</select></label></div>${meeting && meeting.status!=='closed' ? '<button class="secondary" data-meeting-action="rename">แก้ไขชื่อรอบประชุม</button>' : ''}${meeting ? '<button class="secondary" data-meeting-action="delete-round">ลบรอบประชุม</button>' : ''}${meeting && meeting.status!=='closed' ? '<button class="primary" data-meeting-action="close">ปิดรอบประชุม</button>' : ''}<button class="primary" data-meeting-action="new">＋ สร้างรอบประชุม</button>${meeting ? `<p class="meeting-cycle-summary" id="meeting-cycle-summary"><span class="badge ${meeting.status==='closed'?'done':'start'}">${meeting.status==='closed'?'ปิดรอบแล้ว · อ่านอย่างเดียว':'อยู่ระหว่างพิจารณา'}</span> เปลี่ยนแปลงงบปี ${meeting.year_be+1} · ตั้งงบปี ${meeting.year_be+2} · แผน ${meeting.year_be}–${meeting.year_be+5} · หน่วย: ล้านบาท</p>` : ''}</div>
      ${meeting ? overview() : '<div class="panel meeting-empty"><span>▦</span><h2>เริ่มต้นประชุมงบประมาณ</h2><p>สร้างรอบประชุม แล้วเลือกโครงการจากข้อมูลหลักเพื่อจัดทำแผนและเปรียบเทียบงบก่อน–หลังประชุม</p><button class="primary" data-meeting-action="new">สร้างรอบประชุมแรก</button></div>'}
      `;
    watchWorkspace();
    const workspace = document.getElementById('meeting-workspace-frame');
    workspace?.addEventListener('load', () => {
      try {
        if (!workspace.contentWindow.location.pathname.endsWith('/project_detail.html')) return;
      } catch (_) { return; }
      requestAnimationFrame(() => {
        if (!workspace.isConnected) return;
        const header = document.querySelector('.app-header');
        window.scrollTo({top: Math.max(0, window.scrollY + workspace.getBoundingClientRect().top - (header?.offsetHeight || 0) - 12), behavior: 'instant'});
      });
    });
  }

  function overview() {
  return `
    <iframe id="meeting-workspace-frame" title="แผนและผลประชุมงบประมาณ" src="/meeting-app/${encodeURIComponent(meeting.id)}/index.html" allow="fullscreen" class="meeting-workspace-frame"></iframe>`;
  }

  async function renameRound() {
    const current = await api(base());
    dialog(`<form id="meeting-rename-form" data-id="${esc(current.id)}" data-version="${current.version}"><div class="modal-heading"><h2>แก้ไขชื่อรอบประชุม</h2><button type="button" class="icon-button" data-meeting-action="dismiss">×</button></div><label>ชื่อรอบประชุม<input name="title" required maxlength="180" value="${esc(current.title)}"></label><p class="meeting-form-error" role="alert"></p><div class="modal-actions"><button type="button" class="secondary" data-meeting-action="dismiss">ยกเลิก</button><button type="submit" class="primary">บันทึกชื่อ</button></div></form>`);
  }

  function renderDetail() {
    const e = selected, p = e.project, closed = meeting.status==='closed';
    $('#meeting-project-detail').innerHTML = `<article class="panel meeting-detail"><div class="panel-heading"><div><span class="meeting-eyebrow">PROJECT WORKSPACE</span><h2>${esc(p.code)} · ${esc(p.name)}</h2></div></div><div class="meeting-tabs" role="tablist" aria-label="รายละเอียดโครงการประชุม">${[['info','ข้อมูลโครงการ'],['plan','แผนงบประมาณ'],['changes','รายละเอียดเปลี่ยนแปลงงบ'],['notes','มติและบันทึก']].map(([id,label],i)=>`<button type="button" role="tab" id="meeting-tab-${id}" aria-controls="meeting-section-${id}" aria-selected="${tab===id}" data-meeting-tab="${id}" class="${tab===id?'active':''}">${i+1}. ${label}</button>`).join('')}</div>
      <form id="meeting-entry-form" novalidate><fieldset>
      <section id="meeting-section-info" class="meeting-tab-content" role="tabpanel" aria-labelledby="meeting-tab-info" ${tab!=='info'?'hidden':''}><div class="meeting-info-grid">${[['รหัสโครงการ',p.code],['ชื่อโครงการ',p.name],['แหล่งเงิน',(p.fund || '—')+(p.fundComponent?' / '+p.fundComponent:'')],['สถานะ ณ วันที่นำเข้า',p.status],['งบก่อนประชุม',format(e.beforeBudget)+' ล้านบาท'],['เบิกจ่าย ณ วันที่นำเข้า',p.spent == null ? '—' : format(p.spent)+' ล้านบาท']].map(([label,value])=>`<div><small>${label}</small><p>${esc(value)}</p></div>`).join('')}</div><p class="meeting-note">ชื่อโครงการอ้างอิง ณ วันที่นำเข้าประชุม · รายละเอียดของรอบนี้แก้ไขในหน้าประชุมด้านบน</p>${ProjectForm.snapshot(p)}</section>
      <section id="meeting-section-plan" class="meeting-tab-content" role="tabpanel" aria-labelledby="meeting-tab-plan" ${tab!=='plan'?'hidden':''}><h3>แผนรายเดือน ปี ${meeting.year_be}</h3><p class="meeting-note">มกราคม–ธันวาคม · หน่วยล้านบาท · เป็นแผนของรอบประชุมนี้ ผลรวมต้องไม่เกินงบหลังประชุม</p><div class="meeting-months">${months.map((m,i)=>`<label>${m}<input name="month${i}" type="number" min="0" step="0.001" required value="${e.monthlyPlan[i]}"></label>`).join('')}</div><div class="meeting-plan-total">รวมแผนรายเดือน <strong id="meeting-plan-total"></strong> ล้านบาท</div></section>
      <section id="meeting-section-changes" class="meeting-tab-content" role="tabpanel" aria-labelledby="meeting-tab-changes" ${tab!=='changes'?'hidden':''}><div class="form-grid"><label>งบก่อนประชุม (ล้านบาท)<input readonly value="${format(e.beforeBudget)}"></label><label>งบหลังประชุม / ข้อเสนอ (ล้านบาท)<input name="afterBudget" type="number" min="0" step="0.001" required value="${e.afterBudget}"></label></div><label>เหตุผลการเปลี่ยนแปลงงบ<textarea name="reason" maxlength="4000" rows="3" placeholder="ต้องระบุเมื่อยอดงบเปลี่ยนแปลง">${esc(e.reason)}</textarea></label><div id="meeting-history" class="meeting-history"><button type="button" class="secondary" data-meeting-action="history">ดูประวัติการเปลี่ยนแปลง</button></div></section>
      <section id="meeting-section-notes" class="meeting-tab-content" role="tabpanel" aria-labelledby="meeting-tab-notes" ${tab!=='notes'?'hidden':''}><label>มติที่ประชุม / ข้อสังเกต<textarea name="notes" maxlength="8000" rows="6" placeholder="ระบุมติหรือข้อเสนอแนะของที่ประชุม">${esc(e.notes)}</textarea></label></section>
      <div class="meeting-save"><label class="checkbox-label"><input name="reviewed" type="checkbox" ${e.reviewed?'checked':''}> พิจารณาโครงการนี้แล้ว</label><span id="meeting-save-status">${closed?'ปิดรอบแล้ว · อ่านอย่างเดียว':'บันทึกเฉพาะรอบประชุมนี้'}</span>${!closed?'<button type="submit" class="primary">บันทึกผลประชุม</button>':''}</div></fieldset><p id="meeting-entry-error" role="alert"></p></form></article>`;
    if (closed) $('#meeting-entry-form').querySelectorAll('input,textarea,select').forEach(input=>input.disabled=true);
    updateTotal();
  }

  function updateTotal() {
    const form = $('#meeting-entry-form');
    if (!form) return;
    const total = months.reduce((sum,_,i)=>sum+Math.round(Number(form.elements['month'+i].value || 0)*1000),0)/1000;
    $('#meeting-plan-total').textContent = format(total);
  }

  function dialog(markup) {
    $('#meeting-dialog')?.remove();
    const element = document.createElement('dialog');
    element.id = 'meeting-dialog';
    element.innerHTML = markup;
    document.body.append(element);
    element.showModal();
  }

  function newRound() {
    const today = new Date(), be = today.getFullYear()+543;
    const next = Math.max(0,...rounds.filter(r=>r.year_be===be).map(r=>r.round_no))+1;
    dialog(`<form id="meeting-round-form"><div class="modal-heading"><h2>สร้างรอบประชุมงบประมาณ</h2><button type="button" class="icon-button" data-meeting-action="dismiss">×</button></div><label>ชื่อรอบประชุม<input name="title" required maxlength="180" placeholder="เช่น ประชุมทบทวนงบประมาณโครงการ"></label><div class="form-grid"><label>ปีประชุม (พ.ศ.)<input name="year" type="number" min="2400" max="3000" value="${be}" required></label><label>ครั้งที่<input name="round" type="number" min="1" max="999" value="${next}" required></label><label>วันที่ประชุม<input name="date" type="date" required value="${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}"></label></div><p class="meeting-form-error" role="alert"></p><div class="modal-actions"><button type="button" class="secondary" data-meeting-action="dismiss">ยกเลิก</button><button type="submit" class="primary">สร้างรอบประชุม</button></div></form>`);
  }

  async function chooseProjects() {
    meeting = await api(base());
    const available = (await api('/api/projects')).projects.filter(p=>!meeting.projects.some(e=>e.projectId===p.id));
    dialog(`<form id="meeting-add-form"><div class="modal-heading"><h2>เลือกโครงการเข้าประชุม</h2><button type="button" class="icon-button" data-meeting-action="dismiss">×</button></div><p class="meeting-note">นำเข้าเฉพาะชื่อโครงการและชื่อย่อ รายละเอียดและวงเงินกรอกแยกในรอบประชุม</p><input id="meeting-project-search" placeholder="ค้นหารหัส ชื่อโครงการ หรือชื่อย่อ" aria-label="ค้นหาโครงการเข้าประชุมด้วยรหัส ชื่อโครงการ หรือชื่อย่อ"><div class="meeting-project-picker">${available.map(p=>`<label class="meeting-pick-item" data-search="${esc([p.code, p.name, p.details?.shortName || ''].join(' ').toLowerCase())}"><input type="checkbox" name="projectIds" value="${esc(p.id)}"><span><b>${esc(p.code)}</b><span>${esc(p.name)}</span><small>${esc(p.details?.shortName || 'ยังไม่ได้ระบุชื่อย่อ')}</small></span></label>`).join('') || '<p class="empty">ไม่มีโครงการให้เพิ่ม กรุณาสร้างโครงการในเมนูโครงการก่อน</p>'}</div><p class="meeting-form-error" role="alert"></p><div class="modal-actions"><button type="button" class="secondary" data-meeting-action="dismiss">ยกเลิก</button><button type="submit" class="primary" ${available.length?'':'disabled'}>นำโครงการเข้าประชุม</button></div></form>`);
  }

  async function reloadMeeting() {
    meeting = await api(base());
    selected = meeting.projects.find(e=>e.id===selected?.id) || null;
    dirty = false;
    render();
  }

  document.addEventListener('click', async event => {
    const b = event.target.closest('button');
    if (!b || busy) return;
    try {
      if (b.dataset.meetingEntry) {
        if (!confirmLeave()) return;
        selected = meeting.projects.find(e=>e.id===b.dataset.meetingEntry); dirty=false; tab='info'; render();
        $('#meeting-project-detail').scrollIntoView({behavior:'smooth',block:'start'});
      }
      if (b.dataset.meetingTab) {
        tab = b.dataset.meetingTab;
        document.querySelectorAll('[data-meeting-tab]').forEach(button=>{const active=button.dataset.meetingTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
        document.querySelectorAll('.meeting-tab-content').forEach(section=>section.hidden=section.id!=='meeting-section-'+tab);
      }
      const action = b.dataset.meetingAction;
      if (action==='delete-round' && confirmLeave()) {
        busy=true;
        const current=await api(base());
        if(!confirm(`ลบรอบประชุม ครั้งที่ ${current.round_no}/${current.year_be} · ${current.title} หรือไม่?\nข้อมูล แผน และผลพิจารณาของ ${current.projects.length} โครงการในรอบนี้จะถูกลบถาวร\nโครงการในข้อมูลหลักและรอบประชุมอื่นจะยังอยู่`))return;
        await api('/api/meetings/'+encodeURIComponent(current.id),'DELETE',{version:current.version});
        meeting=null;selected=null;dirty=false;
        await mount(host);toast('ลบรอบประชุมแล้ว');
      }
      if (action==='rename') {busy=true;await renameRound();}
      if (action==='new' && confirmLeave()) newRound();
      if (action==='import' && confirmLeave()) $('#meeting-import-file').click();
      if (action==='dismiss') $('#meeting-dialog').close();
      if (action==='reload' && confirmLeave()) await mount(host);
      if (action==='add' && confirmLeave()) {busy=true;await chooseProjects();}
      if (action==='close' && confirmLeave() && confirm('ยืนยันปิดรอบประชุมนี้? หลังปิดจะอ่านข้อมูลได้อย่างเดียว')) {
        busy=true;meeting=await api(base());meeting=await api(base()+'/close','POST',{version:meeting.version});dirty=false;render();toast('ปิดรอบประชุมแล้ว');
      }
      if (action==='history') {
        const id=selected.id, history=await api(entryBase()+'/history');
        if (selected?.id!==id) return;
        $('#meeting-history').innerHTML='<h3>ประวัติที่บันทึก</h3>'+history.events.map(e=>`<p><small>${esc(new Date(e.at).toLocaleString('th-TH'))}</small><br>งบหลังประชุม ${format(e.entry.afterBudget)} ล้านบาท · ${e.entry.reviewed?'พิจารณาแล้ว':'รอพิจารณา'}<br>${esc(e.entry.reason || 'บันทึกข้อมูลเริ่มต้น / ไม่มีการเปลี่ยนยอดงบ')}</p>`).join('');
      }
    } catch(error) {toast(error.message);} finally {busy=false;}
  });

  document.addEventListener('change', async event => {
    if(event.target.id==='meeting-import-file') {
      const file=event.target.files[0]; if(!file || busy)return;
      busy=true;
      try {
        const form=new FormData();form.append('file',file);
        const response=await fetch('/api/meeting-workspaces/import',{method:'POST',body:form});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error || 'นำเข้าไม่สำเร็จ');
        projects=(await api('/api/projects')).projects;
        const years=Object.keys(result.rounds).sort();
        meeting={id:result.rounds[years[0]]};year=years[0];
        await mount(host);toast(result.alreadyImported?'ไฟล์นี้นำเข้าไว้แล้ว':'นำเข้าเป็นรอบประชุมใหม่แล้ว');
      }catch(error){toast(error.message);}finally{busy=false;event.target.value='';}
      return;
    }
    if (!['meeting-year','meeting-round'].includes(event.target.id)) return;
    if (busy || !confirmLeave()) {
      event.target.value=event.target.id==='meeting-year'?year:(meeting?.id || '');
      return;
    }
    const value=event.target.value;
    try {
      busy=true;
      if (event.target.id==='meeting-year') {year=value;meeting=null;await mount(host);}
      else {meeting=value?await api('/api/meetings/'+encodeURIComponent(value)):null;selected=null;dirty=false;render();}
    } catch(error) {toast(error.message);} finally {busy=false;}
  });
  document.addEventListener('input', event => {
    if (event.target.closest('#meeting-entry-form')) {dirty=true;updateTotal();$('#meeting-save-status').textContent='มีการแก้ไขที่ยังไม่บันทึก';}
    if (event.target.id==='meeting-project-search') document.querySelectorAll('.meeting-pick-item').forEach(item=>item.hidden=!item.dataset.search.includes(event.target.value.trim().toLowerCase()));
  });

  document.addEventListener('submit', async event => {
    const form=event.target;
    if (!['meeting-round-form','meeting-rename-form','meeting-add-form','meeting-entry-form'].includes(form.id)) return;
    event.preventDefault();
    if (busy) return;
    busy=true;
    const button=form.querySelector('[type="submit"]'); button.disabled=true;
    const errorNode=form.querySelector('.meeting-form-error') || $('#meeting-entry-error'); errorNode.textContent='';
    try {
      if (form.id==='meeting-rename-form') {
        const result=await api('/api/meetings/'+encodeURIComponent(form.dataset.id),'PATCH',{title:form.elements.title.value.trim(),version:Number(form.dataset.version)});
        const round=rounds.find(r=>r.id===result.id);if(round)Object.assign(round,{title:result.title,version:result.version});
        if(meeting?.id===result.id){meeting.title=result.title;meeting.version=result.version;}
        const option=[...document.querySelectorAll('#meeting-round option')].find(o=>o.value===result.id);
        if(option)option.textContent=`ครั้งที่ ${result.round_no}/${result.year_be} · ${result.title}`;
        $('#meeting-dialog').close();toast('แก้ไขชื่อรอบประชุมแล้ว');
      } else if (form.id==='meeting-round-form') {
        const data=Object.fromEntries(new FormData(form)); data.year=Number(data.year);data.round=Number(data.round);
        const result=await api('/api/meetings','POST',data);meeting=result;year=String(result.year_be);selected=null;dirty=false;$('#meeting-dialog').close();await mount(host);
      } else if (form.id==='meeting-add-form') {
        meeting=await api(base()+'/projects','POST',{projectIds:new FormData(form).getAll('projectIds')});
        selected=null;dirty=false;$('#meeting-dialog').close();render();
      } else {
        const data=Object.fromEntries(new FormData(form));
        const result=await api(entryBase(),'PUT',{version:selected.version,afterBudget:data.afterBudget,
          monthlyPlan:months.map((_,i)=>data['month'+i]),reason:data.reason,notes:data.notes,reviewed:form.elements.reviewed.checked});
        selected=result;dirty=false;
        await reloadMeeting();toast('บันทึกผลประชุมแล้ว');
      }
    } catch(error) {errorNode.textContent=error.message;}
    finally {busy=false;button.disabled=false;}
  });
  window.addEventListener('message',async event=>{
    const frame=document.getElementById('meeting-workspace-frame');
    if(event.origin!==location.origin || event.source!==frame?.contentWindow || event.data?.meetingId!==meeting?.id)return;
    try {
      if(event.data.type==='meeting-navigation-start') {
        watchWorkspace();
        return;
      }
      if(event.data.type==='meeting-content-height') {
        const height=event.data.height;
        if(Number.isFinite(height) && height > 0 && height < 1000000) frame.style.height=Math.ceil(height)+'px';
        return;
      }
      if(event.data.type==='meeting-select-projects' && !busy) await chooseProjects();
      if(event.data.type==='meeting-round-picker') document.getElementById('meeting-round')?.focus();
      if(event.data.type==='meeting-saved') {
        const id=meeting.id,latest=await api(base());
        if(meeting?.id===id)meeting=latest;
      }
    } catch(error){toast(error.message);}
  });
  return {mount,canLeave:confirmLeave};
})();

