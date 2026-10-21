<script>
window.addEventListener('load',async()=>{
  const check=(v,m)=>{if(!v)throw new Error(m);};
  const wait=async(fn,label)=>{for(let i=0;i<200;i++){try{if(fn())return;}catch{}await new Promise(r=>setTimeout(r,40));}throw new Error('Timeout: '+label);};
  const get=async p=>(await fetch(p)).json();
  try {
    await wait(()=>document.querySelector('#add-project')&&!document.querySelector('#add-project').disabled,'main ready');
    navigate('meetings');
    await wait(()=>document.querySelector('#meeting-workspace-frame')?.contentWindow?.meetingWorkspaceReady?.(),'summary ready');
    let f=document.querySelector('#meeting-workspace-frame'),w=f.contentWindow;
    check(!document.querySelector('.sidebar').hidden,'shared sidebar');
    check(w.document.querySelectorAll('#table-body .project-item-row').length===4,'four imported rows');
    check(w.eval('projectData.filter(r=>r.type==="item").reduce((s,r)=>s+r.col4,0)')===5000,'before5000');
    check(w.eval('projectData.filter(r=>r.type==="item").reduce((s,r)=>s+r.col4+r.col5,0)')===7000,'after7000');
    const p=w.eval('masterProjects.find(p=>p.code.endsWith("00003"))');
    const round=(await get('/api/meetings')).meetings[0];
    const base='/api/meeting-workspaces/'+round.id+'/api';
    w.document.querySelector(`a[data-code="${p.code}"]`).click();
    await wait(()=>f.contentWindow.location.pathname.endsWith('project_detail.html')&&f.contentWindow.meetingWorkspaceReady?.(),'detail ready');
    w=f.contentWindow;w.alert=()=>{};w.confirm=()=>true;
    check(w.document.querySelector('#work-volume-table'),'general quantity restored');
    check(w.document.querySelector('#work-volume-change-head').textContent.includes('2570'),'quantity change year');
    check(w.document.querySelector('#work-volume-set-head').textContent.includes('2571'),'quantity setting year');
    w.eval("setWorkVolumeData('');addWorkVolumeRow(-1);");
    const quantities=['สายส่ง','กม.','100','40','60'];
    [...w.document.querySelectorAll('#work-volume-body tr:first-child input')].forEach((input,i)=>{input.value=quantities[i];input.dispatchEvent(new w.Event('input',{bubbles:true}));});
    w.document.querySelector('#work-volume-change-percent').value='40';
    w.document.querySelector('#work-volume-set-percent').value='60';
    w.eval('addWorkVolumeRow(0);removeWorkVolumeRow(1);');
    check(w.document.querySelectorAll('#work-volume-body tr').length===1,'quantity add/delete rows');
    check(w.document.querySelector('#info-name').readOnly,'master identity readonly');
    check(w.document.querySelector('#workflow-body')||w.document.querySelector('[id*=workflow]'),'workflow present');
    check(w.document.querySelectorAll('[data-bs-toggle="tab"]').length===4,'four tabs');
    w.eval("document.querySelector('[data-year=\"2571\"][data-field=\"disbursement_target_post\"]').value='7200';calculateBudget();setMeetingDecision('เห็นชอบ');");
    check(w.eval("document.querySelector('[data-year=\"2572\"][data-field=\"committed\"]').value.replace(/,/g,'')")==='2600.000','carryforward 2600');
    w.eval("addDetailRow('changeBudget');detailBudget.changeBudget[0].work='งานทดสอบ';detailBudget.changeBudget[0].months[0]=12.345;");
    check(await w.saveProjectData(),'save succeeds');
    const saved=(await get(base+'/get-project/'+p.code)).data;
    check(saved.budget['2571'].disbursement_target_post===7200,'plan persisted');
    check(saved.detailBudget.changeBudget[0].months[0]===12.345,'monthly rows persisted');
    check(saved.meeting_decision==='เห็นชอบ','decision persisted');
    const volume=JSON.parse(saved.work_volume);
    check(volume.rows[0].item==='สายส่ง'&&volume.rows[0].total==='100'&&volume.rows[0].change==='40'&&volume.rows[0].set==='60','quantity persisted');
    check(volume.percentages.change===40&&volume.percentages.set===60,'quantity percentages persisted');
    await w.loadProjectData();
    check(w.document.querySelector('#work-volume-body input').value==='สายส่ง','quantity reloaded');
    // A zero target survives blur, reload and a later save.
    w.eval("const z=document.querySelector('[data-year=\"2571\"][data-field=\"disbursement_target_post\"]');z.value='0';formatBudgetTableInput(z);");
    check(await w.saveProjectData(),'zero save');
    check((await get(base+'/get-project/'+p.code)).data.budget['2571'].disbursement_target_post===0,'explicit zero saved');
    await w.loadProjectData();
    check(w.eval("document.querySelector('[data-year=\"2571\"][data-field=\"disbursement_target_post\"]').value")==='0.000','explicit zero loaded');
    w.eval("document.querySelector('[data-year=\"2571\"][data-field=\"disbursement_target_post\"]').value='7200';calculateBudget();");
    check(await w.saveProjectData(),'restore test proposal');
    w.document.querySelector('#back-to-summary').click();
    await wait(()=>f.contentWindow.location.pathname.endsWith('index.html')&&f.contentWindow.meetingWorkspaceReady?.(),'return summary');
    w=f.contentWindow;
    check(w.eval('projectData.filter(r=>r.type==="item").reduce((s,r)=>s+r.col4+r.col5,0)')===7200,'summary refresh');
    // Every project must be reviewed before closing; closed UI and API remain readable.
    const all=(await get(base+'/project-master')).data;
    for(const p of all) {
      const d=(await get(base+'/get-project/'+p.code)).data;d.meeting_decision='เห็นชอบ';
      const r=await fetch(base+'/save-project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});check(r.ok,'mark reviewed');
    }
    const current=await get('/api/meetings/'+round.id);
    const closing=await fetch('/api/meetings/'+round.id+'/close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:current.version})});check(closing.ok,'close');
    w.eval('location.reload()');
    await wait(()=>f.contentWindow.meetingWorkspaceReady?.()&&f.contentWindow.document.querySelector('.integration-context')?.textContent.includes('อ่านอย่างเดียว'),'closed summary');
    check([...f.contentWindow.document.querySelectorAll('[data-fund-key]')].every(e=>e.disabled),'closed fund controls');
    document.body.dataset.testResult='PASS: quantity section2.7 add/edit/delete/save/reload, percentages, shared shell, four tabs, carryover, explicit zero, closed controls';
  }catch(e){document.body.dataset.testResult='FAIL: '+e.message;console.error(e);}
});
</script>
