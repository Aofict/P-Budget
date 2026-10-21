/* Offline adapter for the original P-Budget screens. Never contacts a server. */
(() => {
  'use strict';
  const bundle=window.__offlineBundle || window.parent.__offlineBundle;
  if(!bundle)throw Error('ไม่พบข้อมูลในไฟล์ HTML');
  window.__offlineBundle=bundle;
  bundle.errors ||= [];
  window.addEventListener('error',event=>bundle.errors.push({page:window.__offlinePath || '/',message:event.message}));
  window.addEventListener('unhandledrejection',event=>bundle.errors.push({page:window.__offlinePath || '/',message:String(event.reason)}));
  window.__pBudgetReadOnly=true;
  const child=Boolean(window.__offlinePath);
  const origin='https://pbudget.offline';
  const virtual=()=>new URL(window.__offlinePath || '/index.html',origin);
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json;charset=utf-8'}});
  const memory=new Map([['p-budget-theme',bundle.theme],...Object.entries(bundle.viewState || {})]);
  const storage={getItem:k=>memory.get(String(k)) ?? null,setItem:(k,v)=>memory.set(String(k),String(v)),removeItem:k=>memory.delete(String(k)),clear:()=>memory.clear(),key:i=>[...memory.keys()][i] ?? null,get length(){return memory.size;}};
  for(const name of ['localStorage','sessionStorage'])try{Object.defineProperty(window,name,{value:storage,configurable:true});}catch(_){/* No persistent data is required for viewing. */}
  const originalPost=window.postMessage.bind(window);
  window.postMessage=(message,target,...rest)=>originalPost(message,target==='null'?'*':target,...rest);
  function pageName(path){return /^\/meeting-app\/[^/]+\//.test(path)?path.replace(/^\/meeting-app\/[^/]+\//,'/meeting-app/'):path;}
  function pageHtml(url){
    const html=bundle.pages[pageName(url.pathname)];
    if(!html)return null;
    return html.replace('window.__offlinePath="OFFLINE_PAGE_PATH";',`window.__offlinePath=${JSON.stringify(url.pathname+url.search).replace(/</g,'\\u003c')};`);
  }
  function framePage(frame,path){
    const url=new URL(path,virtual()),html=pageHtml(url);
    if(!html)return false;
    frame.dataset.offlineUrl=url.pathname+url.search;
    frame.srcdoc=html;
    return true;
  }
  window.__offlineLocation={
    get pathname(){return virtual().pathname;},get search(){return virtual().search;},
    get href(){return virtual().href;},
    set href(path){if(window.frameElement)framePage(window.frameElement,path);},
    reload(){if(window.frameElement)framePage(window.frameElement,window.__offlinePath);}
  };
  if(child){
    const replace=history.replaceState.bind(history);
    history.replaceState=(state,title,url)=>{if(url){window.__offlinePath=new URL(url,virtual()).pathname+new URL(url,virtual()).search;}else replace(state,title);};
  }
  const frameSrc=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'src');
  Object.defineProperty(HTMLIFrameElement.prototype,'src',{
    configurable:true,get(){return this.dataset.offlineUrl || frameSrc.get.call(this);},
    set(value){if(!framePage(this,String(value)))frameSrc.set.call(this,value);}
  });
  const originalAttribute=Element.prototype.setAttribute;
  Element.prototype.setAttribute=function(name,value){if(this instanceof HTMLIFrameElement && String(name).toLowerCase()==='src' && framePage(this,String(value)))return;return originalAttribute.call(this,name,value);};
  window.fetch=async(input,options={})=>{
    if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
    const method=String(options.method || (input instanceof Request?input.method:'GET')).toUpperCase();
    if(!['GET','HEAD'].includes(method))return json({error:'สำเนา HTML เปิดอ่านได้อย่างเดียว',message:'สำเนา HTML เปิดอ่านได้อย่างเดียว'},403);
    const url=new URL(input instanceof Request?input.url:String(input),virtual());
    const path=decodeURIComponent(url.pathname);
    const key=path+(url.searchParams.get('include_inactive')==='1'?'?include_inactive=1':'');
    if(Object.hasOwn(bundle.api,key))return json(bundle.api[key]);
    if(Object.hasOwn(bundle.api,path))return json(bundle.api[path]);
    if(bundle.pages[pageName(path)])return new Response(bundle.pages[pageName(path)],{headers:{'Content-Type':'text/html;charset=utf-8'}});
    if(/\/dashboard-state\//.test(path))return json({success:true,data:[]});
    console.warn('Offline data unavailable:',path);
    return json({error:'รายการนี้ต้องเปิดจากโปรแกรมหลัก',message:'รายการนี้ต้องเปิดจากโปรแกรมหลัก'},404);
  };
  window.XMLHttpRequest=class {open(){throw Error('สำเนา HTML ไม่เชื่อมต่อเครือข่าย');}};
  if(navigator.sendBeacon)navigator.sendBeacon=()=>false;
  const lockedScope='#project-form input:not([type=hidden]),#project-form textarea,#project-form select:not(#disbursement-mode):not(#disbursement-plan-kind),#info-pane input,#info-pane textarea,#info-pane select,#budget-pane .input-budget,#budget-pane .budget-meta-input,#budget-pane textarea,#detail-budget-pane input,#detail-budget-pane textarea,#detail-budget-pane select,#workflow-pane input,#workflow-pane textarea,[data-fund-key],#planEditor [contenteditable],#planEditor input,#planEditor select[onchange*="addUnbound"]';
  const blockedActions=new Set(['delete','delete-project','new','add','save','save-project','database-backup','backup','import','migrate-local','export-local','master-add','master-edit','master-delete']);
  const blockedMeeting=new Set(['new','rename','delete-round','close','choose','remove','save']);
  function blocked(element){
    if(element.matches('#budget-shift-button,#budget-shift-undo'))return true;
    if(element.matches('#add-project,#project-delete,#html-export,#report-export,input[type=file],[data-master-add],[data-master-edit],#master-form button[type=submit],#project-form button[type=submit],#project-form [data-remove-source],#project-form #investment-import,#project-form #investment-clear'))return true;
    const action=element.dataset.action;
    if(blockedActions.has(action)||blockedMeeting.has(element.dataset.meetingAction))return true;
    if(element.matches('[data-master-action]')&&!['select','page','prev','next'].includes(element.dataset.masterAction))return true;
    const code=element.getAttribute('onclick') || '';
    return /\b(?:saveProjectData|deleteCurrentProject|addWorkflow|resetWorkflow|chooseWorkflowExcel|confirmWorkflow|updateWorkflow|saveWorkbook|saveAsFile|saveAll|openWorkbook|addNewYear|editStartYear|submitMasterProject|openFile|openExcelImport|editProjectEndYear|deleteProject|deleteYear|removeUnboundProject|openProjectManager|openProjectForm|openMaster|addProject|addProjectToSummary|removeProjectFromMeeting|openSummaryProjectPicker|saveProjectMasterForm|setProjectActive|toggleManagerSummary|changeMeetingYear|clearBudgetInputs|clearDetailBudget|setMeetingDecision|addWorkVolumeRow|removeWorkVolumeRow|addDetailRow|addDetailSubrow|removeDetailRow|deleteAllProject|saveDashboard|openFileDialog)\s*\(/i.test(code);
  }
  function enforce(){
    document.querySelectorAll('iframe[src]').forEach(frame=>{if(!frame.dataset.offlineUrl)framePage(frame,frame.getAttribute('src'));});
    document.querySelectorAll(lockedScope).forEach(el=>{
      if(el.matches('[contenteditable]')){el.contentEditable='false';el.setAttribute('aria-readonly','true');}
      else if(el.tagName==='SELECT'||['checkbox','radio','file'].includes(el.type)){el.disabled=true;}
      else {el.readOnly=true;el.setAttribute('aria-readonly','true');}
    });
    document.querySelectorAll('button,input[type=file],[onclick],[data-action],[data-master-action]').forEach(el=>{
      if(!blocked(el))return;
      el.setAttribute('aria-disabled','true');el.title='สำเนา HTML สำหรับอ่านอย่างเดียว';
      if('disabled' in el)el.disabled=true;
    });
    document.querySelectorAll('[draggable=true]').forEach(el=>el.draggable=false);
    // View controls stay active: project tabs, filters, years, chart choices and
    // fullscreen use the exact original application handlers.
    if(!child){
      const status=document.getElementById('settings-system-status');
      if(status&&status.textContent!=='สำเนา HTML · เปิดอ่านออฟไลน์')status.textContent='สำเนา HTML · เปิดอ่านออฟไลน์';
      const editButtons=document.querySelectorAll('button[data-action=edit]');
      editButtons.forEach(b=>{b.setAttribute('aria-label','ดูรายละเอียดโครงการ');b.title='ดูรายละเอียดโครงการ';});
    }
  }
  let queued=false;
  const queue=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;enforce();});};
  const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'))queue();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('beforeinput',e=>{if(e.target.closest(lockedScope)){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('change',e=>{if(e.target.matches(lockedScope)){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();},true);
  document.addEventListener('click',e=>{
    const button=e.target.closest('button,[onclick],[data-action],[data-master-action]');
    if(button&&blocked(button)){e.preventDefault();e.stopImmediatePropagation();return;}
    const link=e.target.closest('a[href]');
    if(!link||link.download||link.getAttribute('href')?.startsWith('#'))return;
    const url=new URL(link.getAttribute('href'),virtual());
    if(pageHtml(url)&&window.frameElement){e.preventDefault();e.stopImmediatePropagation();framePage(window.frameElement,url.href);}
    else if(url.protocol==='http:'||url.protocol==='https:'){e.preventDefault();}
  },true);
  window.addEventListener('DOMContentLoaded',()=>{
    if(child && window.frameElement?.id==='meeting-workspace-frame'){
      // file:// and srcdoc can report different message origins. Resize our
      // own same-origin frame directly; keep the live app's origin checks intact.
      const frame=window.frameElement;
      let resizePending=false;
      const fitMeeting=()=>{
        if(resizePending)return;
        resizePending=true;
        requestAnimationFrame(()=>{
          resizePending=false;
          if(document.fullscreenElement || document.body.classList.contains('presentation-mode') || document.body.classList.contains('dashboard-fullscreen-fallback'))return;
          if(frame.contentWindow!==window || !frame.isConnected)return;
          const height=Math.ceil(document.body.getBoundingClientRect().height)+2;
          if(height>0 && height<1000000 && frame.style.height!==height+'px')frame.style.height=height+'px';
        });
      };
      new ResizeObserver(fitMeeting).observe(document.body);
      window.addEventListener('load',fitMeeting);
      window.addEventListener('resize',fitMeeting);
      document.addEventListener('fullscreenchange',fitMeeting);
      document.fonts?.ready.then(fitMeeting);
      fitMeeting();
    }
    const style=document.createElement('style');
    style.textContent=`.offline-reading-notice{position:fixed;bottom:8px;left:8px;z-index:2147483000;padding:5px 10px;border:1px solid #ac9478;border-radius:7px;background:#fffaf2ee;color:#59412b;font:12px/1.5 Tahoma,sans-serif;pointer-events:none}body:not(.light) .offline-reading-notice{background:#182334ee;color:#e9e2d5}button[aria-disabled=true]{cursor:default!important}#project-form input[aria-readonly=true],#project-form textarea[aria-readonly=true]{cursor:text} [aria-disabled=true]{pointer-events:none}`;
    document.head.append(style);
    if(!child){
      const note=document.createElement('div');note.className='offline-reading-notice';note.setAttribute('role','status');
      note.textContent='อ่านอย่างเดียว · ข้อมูล ณ '+new Date(bundle.exportedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'});
      document.body.append(note);
    }
    enforce();
    // Existing formatters can run once after fields are populated. Do not mark
    // forms dirty or show leave warnings in this read-only copy.
    if(window.ProjectForm){ProjectForm.isDirty=()=>false;}
    if(window.MeetingModule){MeetingModule.canLeave=()=>true;}
    if(typeof window.saveDataToStorage==='function')window.saveDataToStorage=()=>Promise.resolve();
    if(typeof window.canLeaveNineBox==='function')window.canLeaveNineBox=()=>true;
    if(typeof window.meetingCanLeave==='function')window.meetingCanLeave=()=>true;
  });
})();
