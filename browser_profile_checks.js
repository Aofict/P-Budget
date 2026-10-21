<script>
(async()=>{
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  const until=async(check)=>{for(let i=0;i<350;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Timed out waiting for project form');};
  try {
    await window.appReady;
    assert(ready,'API bootstrap');
    assert(projects.length===0,'Clean test database');
    document.querySelector('#add-project').click();
    const form=document.querySelector('#project-form');
    assert(form.elements.code.readOnly && !form.elements.code.value,'Automatic code');
    assert(document.querySelectorAll('[data-profile-tab]').length===4,'Four profile tabs');
    assert(!form.textContent.includes('ปริมาณงาน'),'No work quantity section');
    const set=(values)=>Object.entries(values).forEach(([key,value])=>form.elements[key].value=value);
    set({name:'โครงการพัฒนาระบบไฟฟ้าเพื่อรองรับพื้นที่เศรษฐกิจ',shortName:'คพส.9.3',director:'ผู้อำนวยการโครงการ',department:'กองวางแผนระบบไฟฟ้า',division:'สายงานวางแผนและวิศวกรรม',objectives:'เพิ่มความมั่นคงของระบบจำหน่าย',area:'พื้นที่ภาคเหนือ',startDate:'2026-01-01',endDate:'2030-12-31'});
    document.querySelector('[data-profile-tab="budget"]').click();
    set({loan:6,revenue:4,oh:1,idc:.5,loanSpent:1,revenueSpent:.5});form.elements.loan.dispatchEvent(new Event('input',{bubbles:true}));
    assert(form.elements.budget.value==='10.000','Loan + revenue total without OH double counting');
    assert(form.elements.revenueOther.value==='2.500','Revenue remainder');
    document.querySelector('[data-profile-tab="status"]').click();set({progress:10,projectType:'new',cabinetDate:'2025-10-28',statusNotes:'อยู่ระหว่างเตรียมงาน'});
    document.querySelector('[data-profile-tab="returns"]').click();set({npv:-1.25,firr:5.2,eirr:8.1,studyDate:'2025-09-30',studySource:'รายงานผลศึกษา'});
    form.requestSubmit();await until(()=>!saving);
    assert(projects.length===1,'Create profile: '+document.querySelector('#form-error').textContent);
    const project=projects[0];assert(/^PRJ-\d{4}-00001$/.test(project.code),'Running code');
    assert(project.budget===10 && project.spent===1.5,'Stored totals');
    assert(project.details.paybackYears===null && project.details.npv===-1.25,'Unknown vs negative returns');
    assert(document.querySelectorAll('#legend .legend-row').length===2,'Exactly two funding groups');
    assert(document.querySelector('#legend').textContent.includes('60.0%'),'Loan allocation percentage');
    openForm(project.id);document.querySelector('[data-profile-tab="budget"]').click();
    assert(form.elements.loan.value==='6' && form.elements.oh.value==='1','Saved mixed financing loaded');
    set({oh:5});form.requestSubmit();await until(()=>!saving);
    assert(document.querySelector('#form-error').textContent.includes('OH'),'Reject OH exceeding revenue');
    set({oh:1,loanSpent:7});form.requestSubmit();await until(()=>!saving);
    assert(document.querySelector('#form-error').textContent.length>0 && projects[0].spent===1.5,'Reject spending by source');
    set({loanSpent:2,department:'หน่วยงานที่แก้ไข'});form.requestSubmit();await until(()=>!saving);
    assert(!document.querySelector('#project-dialog').open,'Successful edit closes form');
    await refresh();assert(projects[0].spent===2.5 && projects[0].details.department==='หน่วยงานที่แก้ไข','Persistence of profile edit');
    navigate('projects');document.querySelector('#search').value='คพส.9.3';render();assert(document.querySelectorAll('#project-rows tr').length===1,'Search short name');document.querySelector('#search').value='';
    const exported=await api('/api/backup');assert(exported.schemaVersion===4 && exported.projects[0].finances.revenue===4,'Profile backup');
    assert((await api('/api/import','POST',exported)).skipped===1,'Idempotent profile import');
    const snapshot=await fetch('/api/backup/database');assert(snapshot.ok && (await snapshot.blob()).size>0,'Full database backup');
    const round=await api('/api/meetings','POST',{year:2569,round:1,title:'Profile review',date:'2026-09-21'});
    const meeting=await api('/api/meetings/'+round.id+'/projects','POST',{projectIds:[project.id]});
    assert(meeting.projects[0].project.details.shortName==='คพส.9.3','Meeting snapshot includes profile');
    assert(meeting.projects[0].project.finances.oh===1,'Meeting snapshot includes financing');
    navigate('projects');window.confirm=()=>true;document.querySelector('[data-delete]').click();await until(()=>projects.length===0);
    openForm();set({name:'โครงการตัวอย่างฟอร์มใหม่',loan:6,revenue:4,oh:1,idc:.5,loanSpent:1,revenueSpent:.5});
    form.requestSubmit();await until(()=>!saving);assert(projects[0].code.endsWith('00002'),'Deleted code not reused');
    openForm(projects[0].id);document.querySelector('[data-profile-tab="budget"]').click();
    assert(document.documentElement.scrollWidth<=window.innerWidth,'No page overflow');
    assert(document.querySelector('#project-dialog').scrollWidth<=document.querySelector('#project-dialog').clientWidth,'No dialog overflow');
    document.body.dataset.testResult='PASS: expanded profile, no quantities, mixed funding, OH/IDC totals, validation, nullable returns, edit, search, backup, meeting snapshot';
  } catch(error){document.body.dataset.testResult='FAIL: '+error.stack;}
})();
</script>
