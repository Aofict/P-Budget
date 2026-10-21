"""Exercise the meeting workflow in the existing shell using an isolated API."""
import verify_browser

verify_browser.SCREENSHOT_PREFIX = 'preview-meetings'
verify_browser.CHECKS = r'''<script>
(async()=>{
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const until=async(check)=>{for(let n=0;n<350;n++){if(check())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out waiting for meeting UI');};
  try {
    await window.appReady;
    const project=await api('/api/projects','POST',{name:'โครงการทบทวนงบระบบจำหน่าย',fundId:'oh',statusId:'started',budget:10,spent:2,progress:20});
    const header=document.querySelector('header'),sidebar=document.querySelector('.sidebar');
    navigate('meetings');
    await until(()=>document.querySelector('[data-meeting-action="new"]'));
    const nav=[...document.querySelectorAll('nav button')].map(b=>b.dataset.page);
    assert(nav.indexOf('meetings')===nav.indexOf('budget')+1 && nav.indexOf('reports')===nav.indexOf('meetings')+1,'Navigation position');
    document.querySelector('[data-meeting-action="new"]').click();
    const form=document.querySelector('#meeting-round-form');
    form.elements.title.value='ประชุมทบทวนงบประมาณโครงการ';form.elements.year.value='2569';form.elements.round.value='1';form.elements.date.value='2026-09-21';form.requestSubmit();
    await until(()=>document.querySelector('[data-meeting-action="add"]'));
    assert(header===document.querySelector('header') && sidebar===document.querySelector('.sidebar'),'Shared shell retained');
    document.querySelector('[data-meeting-action="add"]').click();
    await until(()=>document.querySelector('#meeting-add-form'));
    document.querySelector('#meeting-add-form input[type="checkbox"]').checked=true;
    document.querySelector('#meeting-add-form').requestSubmit();
    await until(()=>document.querySelector('[data-meeting-entry]'));
    document.querySelector('[data-meeting-entry]').click();
    assert(document.querySelectorAll('[data-meeting-tab]').length===4,'Four project tabs');
    document.querySelector('[data-meeting-tab="plan"]').click();
    const entryForm=document.querySelector('#meeting-entry-form');
    entryForm.elements.month0.value='2';entryForm.elements.month1.value='3';
    document.querySelector('[data-meeting-tab="changes"]').click();
    assert(entryForm.elements.month0.value==='2','Tab switch retains inputs');
    entryForm.elements.afterBudget.value='8';entryForm.elements.reason.value='ปรับลดขอบเขตงานตามมติที่ประชุม';
    document.querySelector('[data-meeting-tab="notes"]').click();
    entryForm.elements.notes.value='เห็นชอบแผนตามที่เสนอ';entryForm.elements.reviewed.checked=true;
    entryForm.requestSubmit();
    await until(()=>document.querySelector('#meeting-entry-form')!==entryForm);
    assert(document.querySelector('.meeting-summary').textContent.includes('8.000'),'Updated after-meeting dashboard');
    assert((await api('/api/projects/'+project.id)).budget===10,'Master budget is unchanged');
    document.querySelector('[data-meeting-tab="changes"]').click();
    document.querySelector('[data-meeting-action="history"]').click();
    await until(()=>document.querySelector('#meeting-history h3'));
    assert(document.querySelectorAll('#meeting-history p').length===2,'History includes baseline and edit');
    window.confirm=()=>true;
    document.querySelector('[data-meeting-action="close"]').click();
    await until(()=>!document.querySelector('[data-meeting-action="close"]'));
    assert(document.querySelector('#meeting-entry-form input[name="afterBudget"]').disabled,'Closed round is read-only');
    assert(document.querySelector('#meeting-entry-form input[name="month0"]').value==='2','Monthly plan persists');
    assert(document.documentElement.scrollWidth<=window.innerWidth,'No horizontal page overflow');
    window.scrollTo(0,0);
    document.body.dataset.testResult='PASS: shared shell, menu order, create round, project selection, four tabs, monthly plan, budget comparison, history, closed round';
  } catch(error){document.body.dataset.testResult='FAIL: '+error.stack;}
})();
</script>'''

if __name__=='__main__':
    raise SystemExit(verify_browser.main())
