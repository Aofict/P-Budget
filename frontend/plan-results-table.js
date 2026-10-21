// Owns comparison status thresholds, search, pagination, rows and filtered totals.
// render receives the already scoped portfolio and ledger period from dashboard.js.
window.createPBudgetResultsTable = function ({$, format, escapeHtml, sum, getSelectedProjectId}) {
  let tableQuery = '', tableStatus = 'all', tablePage = 0, tablePageSize = 6, tableSearchTimer;
  let context, initialized = false;
  const amount = value => value === null ? '—' : format(value,3);
  function resultStatus(plan, actual) {
    if (plan === null || plan <= 0) return {key:'missing', label:'ยังไม่มีแผน', rate:null};
    if (actual === null) return {key:'missing', label:'ยังไม่มีผล', rate:null};
    const rate = actual/plan*100;
    if (rate >= 100) return {key:'complete', label:'ครบตามแผน', rate};
    if (rate >= 90) return {key:'on-track', label:'ตามแผน', rate};
    if (rate >= 80) return {key:'warning', label:'เฝ้าระวัง', rate};
    return {key:'delayed', label:'ล่าช้า', rate};
  }
  function renderProjectTable() {
    const {projects: currentProjects, keys, kind} = context;
    const query = tableQuery.trim().toLocaleLowerCase('th');
    const rows = currentProjects.map(project=>{
      const plan = sum([project],keys,kind), actual = sum([project],keys,'actual');
      return {project,plan,actual,status:resultStatus(plan,actual),gap:plan!==null && actual!==null ? actual-plan : null};
    }).filter(({project,status})=>{
      const matchesText = [project.name,project.code,project.details?.shortName,project.details?.department,project.details?.division].join(' ').toLocaleLowerCase('th').includes(query);
      const matchesStatus = tableStatus==='all' || (tableStatus==='on-track' ? ['on-track','complete'].includes(status.key) : status.key===tableStatus);
      return matchesText && matchesStatus;
    }).sort((a,b)=>(a.gap ?? Infinity)-(b.gap ?? Infinity));
    const pageCount = Math.max(1,Math.ceil(rows.length/tablePageSize));
    tablePage = Math.max(0,Math.min(tablePage,pageCount-1));
    const first = tablePage*tablePageSize, shown = rows.slice(first,first+tablePageSize);
    const badge = status => `<span class="analytics-result-badge is-${status.key}">${status.label}</span>`;
    $('#analytics-project-count').textContent = `${rows.length} โครงการ`;
    $('#analytics-project-rows').innerHTML = shown.length ? shown.map(({project,plan,actual,status})=>{
      const metadata = `รหัส: ${project.code || '—'}${project.details?.department ? ' · '+project.details.department : project.details?.division ? ' · สายงาน '+project.details.division : ''}`;
      const active = project.id===getSelectedProjectId();
      const rateText = status.rate===null ? '—' : format(status.rate,1)+'%';
      return `<tr data-analytics-project-row="${escapeHtml(project.id)}" class="${active?'project-row-selected':''}"><td><button type="button" class="analytics-project-select" data-analytics-project="${escapeHtml(project.id)}" aria-pressed="${active}" aria-label="แสดงกราฟ ${escapeHtml(project.name)}">${escapeHtml(project.name)}</button><small class="analytics-project-metadata">${escapeHtml(metadata)}</small></td><td class="number">${amount(plan)}</td><td class="number analytics-result-amount is-${status.key}">${amount(actual)}</td><td><div class="analytics-result-ratio is-${status.key}"><span class="analytics-result-track" role="img" aria-label="ผลเทียบแผน ${rateText}"><i style="width:${Math.min(100,Math.max(0,status.rate ?? 0))}%"></i></span><span>${rateText}</span></div></td><td>${badge(status)}</td><td><button type="button" class="secondary" data-edit="${escapeHtml(project.id)}" aria-label="แก้ไข ${escapeHtml(project.name)}">แก้ไข</button></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="analytics-table-empty">ไม่พบโครงการที่ตรงกับเงื่อนไข</td></tr>';
    const filteredTotal = field => rows.some(row=>row[field]!==null) ? rows.reduce((total,row)=>total+(row[field] ?? 0),0) : null;
    const planTotal = filteredTotal('plan'), actualTotal = filteredTotal('actual');
    const totalStatus = rows.some(row=>row.status.key==='missing')
      ? {key:'missing',label:'ข้อมูลไม่ครบ',rate:planTotal>0 && actualTotal!==null ? actualTotal/planTotal*100 : null}
      : resultStatus(planTotal,actualTotal);
    $('#analytics-project-totals').innerHTML = `<tr><th scope="row">รวมทุกโครงการตามตัวกรอง (Σ ${rows.length} โครงการ)</th><td class="number">${amount(planTotal)}</td><td class="number analytics-result-amount is-${totalStatus.key}">${amount(actualTotal)}</td><td class="analytics-result-total-rate">${totalStatus.rate===null?'—':format(totalStatus.rate,2)+'%'}</td><td>${badge(totalStatus)}</td><td>—</td></tr>`;
    $('#analytics-table-caption').textContent = `แสดง ${rows.length?first+1:0}–${Math.min(first+tablePageSize,rows.length)} จาก ${rows.length} โครงการ`;
    $('#analytics-table-previous').disabled = tablePage===0;
    $('#analytics-table-next').disabled = tablePage>=pageCount-1;
    $('#analytics-table-status').value = tableStatus;
    document.querySelectorAll('[data-analytics-status]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.analyticsStatus===tableStatus)));
  }

  function render(nextContext) {
    context = nextContext;
    if (!initialized) {
      const search = $('#analytics-table-search');
      const updateSearch = event => {
        if (event.isComposing) return;
        clearTimeout(tableSearchTimer);
        tableSearchTimer = setTimeout(()=>{tableQuery=search.value;tablePage=0;renderProjectTable();},180);
      };
      search.addEventListener('input',updateSearch);
      search.addEventListener('compositionend',updateSearch);
      document.querySelectorAll('[data-analytics-status]').forEach(button=>button.addEventListener('click',()=>{
        tableStatus=button.dataset.analyticsStatus;tablePage=0;renderProjectTable();
      }));
      $('#analytics-table-status').addEventListener('change',event=>{
        tableStatus=event.target.value;tablePage=0;renderProjectTable();
      });
      $('#analytics-table-page-size').addEventListener('change',event=>{
        tablePageSize=Number(event.target.value);tablePage=0;renderProjectTable();
      });
      $('#analytics-table-previous').addEventListener('click',()=>{tablePage--;renderProjectTable();});
      $('#analytics-table-next').addEventListener('click',()=>{tablePage++;renderProjectTable();});

      initialized = true;
    }
    renderProjectTable();
  }
  return {render};
};
