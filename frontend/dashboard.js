// Owns dashboard cards, annual/monthly charts, and comparison-table coordination.
// getPage reads live navigation state; all financial values retain missing entries as null.
window.createPBudgetDashboard = function ({$, format, escapeHtml, uiIcon, finance, getPage}) {
  const {approvedBudget, cumulativeSpent, disbursementPercent, fundingBreakdown} = finance;

  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  let currentProjects = [], initialized = false, view = 'annual', chartProjectId = null, splitRevenue = false;
  let comparisonTable;
  const amount = value => value === null ? '—' : format(value, 3);
  function portfolioTotals(projects) {
    const totals = projects.reduce((totals, project) => {
      const spent=cumulativeSpent(project);
      return {
        budget: totals.budget + Number(project.budget || 0),
        approved: totals.approved + approvedBudget(project),
        spent: totals.spent + spent.loanSpent + spent.revenueSpent,
        loan: totals.loan + Number(project.finances?.loan || 0),
        foreignLoan: totals.foreignLoan + Number(project.details?.foreignLoan || 0),
        revenue: totals.revenue + Number(project.finances?.revenue || 0),
        oh: totals.oh + Number(project.finances?.oh || 0),
        idc: totals.idc + Number(project.finances?.idc || 0),
        land: totals.land + Number(project.details?.land || 0),
        approvedLoan: totals.approvedLoan + Number(project.details?.approvedLoan || 0),
        approvedRevenue: totals.approvedRevenue + Number(project.details?.approvedRevenue || 0),
        loanSpent: totals.loanSpent + spent.loanSpent,
        revenueSpent: totals.revenueSpent + spent.revenueSpent,
      };
    }, {budget:0, approved:0, spent:0, loan:0, foreignLoan:0, revenue:0, oh:0, idc:0, land:0, approvedLoan:0, approvedRevenue:0, loanSpent:0, revenueSpent:0});
    return {...totals, rate:disbursementPercent(totals.spent, totals.approved)};
  }
  function period(year, mode) {
    return Array.from({length:12}, (_, index) => {
      const month = mode === 'fiscal' ? (index + 9) % 12 + 1 : index + 1;
      const calendarYear = mode === 'fiscal' && month >= 10 ? year - 1 : year;
      return {key:`${calendarYear}-${String(month).padStart(2,'0')}`, label:months[month - 1], year:calendarYear};
    });
  }
  function budgetPie(totals, projectCount) {
    const categories = [
      {label:'เงินกู้ในประเทศ', value:Math.max(0, totals.loan-totals.foreignLoan), color:'#0051d5'},
      {label:'เงินกู้ต่างประเทศ', value:totals.foreignLoan, color:'#00b9e8', foreign:true},
      {label:'เงินรายได้', value:Math.max(0, totals.revenue-totals.land-totals.oh-totals.idc), color:'#009668'},
      {label:'ที่ดิน', value:totals.land, color:'#f4d32d', child:true},
      {label:'OH', value:totals.oh, color:'#9674ce', child:true},
      {label:'IDC', value:totals.idc, color:'#ff3030', child:true},
    ];
    const slices = splitRevenue ? [...categories] : categories.filter(item=>!item.child).map(item=>item.label==='เงินรายได้'?{...item,value:totals.revenue}:item);
    const other = Math.max(0, totals.budget-totals.loan-totals.revenue);
    if(other >= 0.0005) slices.push({label:'ยังไม่แยกแหล่งเงิน',value:other,color:'#8a8a94'});
    const total = slices.reduce((sum,item)=>sum+item.value,0);
    const pct = value => total ? value/total*100 : 0;
    const ordered = slices.filter(item=>item.value>0).sort((a,b)=>b.value-a.value);
    let offset = 0;
    const segments = ordered.map(item=>{
      const length = pct(item.value);
      const segment = '<circle cx="80" cy="80" r="64" fill="none" stroke="'+item.color+'" stroke-width="22" pathLength="100" stroke-dasharray="'+length+' '+(100-length)+'" stroke-dashoffset="'+(-offset)+'"/>';
      offset += length;
      return segment;
    }).join('');
    const leading = ordered[0];
    const details = categories.filter(item=>(splitRevenue || !item.child) && (!item.foreign || item.value>0)).map(item=>{
      const value = item.label==='เงินรายได้' && !splitRevenue ? totals.revenue : item.value;
      return '<div class="budget-pie-detail '+(item.child?'is-child':'')+'" style="--pie-source:'+item.color+'"><i style="background:'+item.color+'"></i><span>'+item.label+'</span><b>'+format(pct(value),1)+'%</b><small>'+amount(value)+' ล้านบาท</small></div>';
    }).join('');
    const legend = ordered.map(item=>'<span><i style="background:'+item.color+'"></i>'+item.label+' '+format(pct(item.value),1)+'%</span>').join('');
    return '<article class="stat du-card analytics-budget-donut"><div class="overview-budget-head"><div class="stat-icon teal">'+uiIcon('pie')+'</div><div><h2 class="du-card-title">งบประมาณรวม</h2><p>โครงสร้างกรอบงบประมาณทั้งโครงการ</p></div><span class="overview-project-count">'+projectCount+' โครงการ</span></div><div class="budget-pie-layout"><div class="budget-pie-visual"><div class="overview-ring"><svg viewBox="0 0 160 160" role="img" aria-label="สัดส่วนงบประมาณรวม '+amount(totals.budget)+' ล้านบาท"><circle cx="80" cy="80" r="64" fill="none" stroke="var(--overview-track)" stroke-width="22"/>'+segments+'</svg><div class="overview-ring-center"><span>สัดส่วนหลัก</span><strong>'+(leading?format(pct(leading.value),1)+'%':'—')+'</strong><small>'+(leading?leading.label:'ยังไม่มีงบประมาณ')+'</small></div></div><div class="overview-ring-legend">'+legend+'</div></div><aside class="budget-pie-details"><h3>แหล่งเงินทุน</h3><label class="budget-pie-option"><input type="checkbox" data-split-revenue '+(splitRevenue?'checked':'')+'>แยกที่ดิน OH IDC</label>'+details+'</aside></div><div class="overview-grand-total"><span>มูลค่างบประมาณรวมทั้งสิ้น</span><div><strong>'+amount(totals.budget)+'</strong><span>ล้านบาท</span></div></div></article>';
  }
  function sum(projects, keys, kind) {
    let total = 0, found = false;
    for (const project of projects) for (const key of keys) {
      const values = project.details?.monthlyDisbursement?.months?.[key]?.[kind];
      if (values && Object.keys(values).length) {
        found = true;
        total += Object.values(values).reduce((value, entry) => value + Math.round(Number(entry || 0) * 100), 0);
      }
    }
    return found ? total / 100 / 1_000_000 : null;
  }
  function yearsFor(projects, mode) {
    const years = new Set();
    for (const project of projects) {
      const legacyRange = String(project.details?.timeline || '').match(/(\d{4})\s*[-–—]\s*(\d{4})/);
      const start = Number(project.details?.timelineStartYear || legacyRange?.[1]), end = Number(project.details?.timelineEndYear || legacyRange?.[2]);
      if (start >= 2400 && end <= 3000 && end >= start) for (let year = start; year <= end; year++) years.add(year);
      for (const key of Object.keys(project.details?.monthlyDisbursement?.months || {})) {
        const [year, month] = key.split('-').map(Number);
        years.add(year + (mode === 'fiscal' && month >= 10 ? 1 : 0));
      }
    }
    return [...years].sort((a,b) => a-b);
  }
  function currentBudgetYear(mode) {
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Bangkok', year:'numeric', month:'numeric'}).formatToParts(new Date());
    const year = Number(parts.find(part=>part.type==='year').value)+543;
    const month = Number(parts.find(part=>part.type==='month').value);
    return year+(mode==='fiscal' && month>=10 ? 1 : 0);
  }
  function chart(rows, selectedYear, annual) {
    const maximum = Math.max(0, ...rows.flatMap(row => [row.plan || 0, row.actual || 0]));
    const rawStep = (maximum || 1)/4;
    const magnitude = 10**Math.floor(Math.log10(rawStep));
    const step = ([1,2,2.5,5,10].find(value=>value>=rawStep/magnitude) || 10)*magnitude;
    const axisMax = step*4;
    const current = currentBudgetYear($('#analytics-mode').value);
    const ticks = Array.from({length:5},(_,i)=>({position:i*25, value:axisMax-step*i}));
    const yAxis = ticks.map(tick=>'<span style="top:'+tick.position+'%">'+format(tick.value, step<1?2:0)+'</span>').join('');
    const grid = ticks.map(tick=>'<i style="top:'+tick.position+'%"></i>').join('');
    const bars = rows.map(row => {
      const title = row.label+': เป้าหมาย '+amount(row.plan)+' · เบิกจ่ายจริง '+amount(row.actual)+' ล้านบาท';
      const isCurrent = annual && row.year===current;
      const future = row.year>current;
      const badge = isCurrent ? '<span class="analytics-year-badge">ปีปัจจุบัน</span>' : annual && future ? '<span class="analytics-future-badge">แผนล่วงหน้า</span>' : '';
      const showValue = isCurrent || (row.plan!==null && row.plan===maximum);
      const planHeight = Math.max(0,row.plan || 0)/axisMax*100;
      const actualHeight = Math.max(0,row.actual || 0)/axisMax*100;
      const contents = badge+'<div class="analytics-bar-values">'+(showValue?amount(row.plan):row.plan===null && row.actual===null?'—':'')+'</div><div class="analytics-bar-pair"><i class="analytics-plan-bar" style="height:'+planHeight+'%"></i><i class="analytics-actual-bar" style="height:'+actualHeight+'%"></i></div><strong>'+escapeHtml(row.label)+'</strong>'+(annual?'':'<small>'+row.year+'</small>');
      const classes = 'analytics-column'+(annual?' is-annual':' is-monthly')+(row.year===selectedYear?' selected':'')+(isCurrent?' is-current':'')+(future?' is-future':'');
      return annual ? '<button type="button" class="'+classes+'" data-analytics-year="'+row.year+'" aria-pressed="'+(row.year===selectedYear)+'" aria-label="'+escapeHtml(title)+'">'+contents+'</button>' : '<div class="'+classes+'" role="img" aria-label="'+escapeHtml(title)+'">'+contents+'</div>';
    }).join('');
    return '<div class="analytics-chart-frame"><div class="analytics-y-axis" aria-hidden="true"><div>'+yAxis+'</div></div><div class="analytics-plot"><div class="analytics-chart-grid" aria-hidden="true">'+grid+'</div>'+bars+'</div></div>';
  }
  function renderCharts() {
    const project = currentProjects.find(project => project.id === chartProjectId);
    const chartProjects = project ? [project] : currentProjects;
    const mode = $('#analytics-mode').value, kind = $('#analytics-plan').value;
    const years = yearsFor(chartProjects, mode);
    const selected = $('#analytics-year').value === 'all' ? null : Number($('#analytics-year').value);
    const visibleYears = selected === null ? years : [selected];
    const dates = visibleYears.flatMap(year => period(year, mode));
    const annualRows = visibleYears.map(year => {
      const keys = period(year, mode).map(date => date.key);
      return {label:String(year), year, plan:sum(chartProjects, keys, kind), actual:sum(chartProjects, keys, 'actual')};
    });
    const monthlyRows = dates.map(date => ({...date, plan:sum(chartProjects, [date.key], kind), actual:sum(chartProjects, [date.key], 'actual')}));
    $('#analytics-annual').innerHTML = visibleYears.length ? chart(annualRows, selected, true) : '<p class="dashboard-empty">ยังไม่มีช่วงปีของโครงการ</p>';
    $('#analytics-chart-title').textContent = view === 'monthly' ? 'แผนและผลรายเดือน' : 'แผนและผลรายปี';
    $('#analytics-chart-project').textContent = project ? project.name : 'ทุกโครงการตามตัวกรอง';
    $('#analytics-chart-reset').hidden = !project;
    $('#analytics-monthly').hidden = view !== 'monthly';
    $('#analytics-annual').hidden = view !== 'annual';
    document.querySelectorAll('[data-analytics-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.analyticsView === view)));
    $('#analytics-monthly').innerHTML = dates.length ? chart(monthlyRows, selected, false) : '<p class="dashboard-empty">ยังไม่มีข้อมูลรายเดือน</p>';
    const current = currentBudgetYear(mode);
    const futureYears = visibleYears.filter(year=>year>current);
    $('#analytics-chart-range').textContent = visibleYears.length ? 'ช่วงข้อมูลปี พ.ศ. '+visibleYears[0]+' – '+visibleYears.at(-1)+(futureYears.length?' · แผนล่วงหน้า '+futureYears[0]+'–'+futureYears.at(-1):'') : 'ยังไม่มีช่วงปีของโครงการ';
    const summaryRows = view==='annual' ? annualRows : monthlyRows;
    const recordedTotal = field => summaryRows.some(row=>row[field]!==null) ? summaryRows.reduce((total,row)=>total+(row[field] ?? 0),0) : null;
    const planTotal = recordedTotal('plan'), actualTotal = recordedTotal('actual');
    const successRate = planTotal>0 && actualTotal!==null ? actualTotal/planTotal*100 : null;
    const peak = summaryRows.filter(row=>row.actual!==null).reduce((best,row)=>!best || row.actual>best.actual ? row : best,null);
    const periodLabel = view==='annual' ? visibleYears.length+' ปี' : dates.length+' เดือน';
    const peakLabel = view==='annual' ? 'ปีที่มีการเบิกจ่ายสูงสุด' : 'เดือนที่มีการเบิกจ่ายสูงสุด';
    const peakValue = peak ? (view==='annual'?'พ.ศ. '+peak.year:peak.label+' '+peak.year) : '—';
    $('#analytics-chart-summary').innerHTML = '<article class="du-card analytics-summary-card"><span>ยอดเป้าหมายสะสม ('+periodLabel+')</span><div><strong>'+amount(planTotal)+'</strong><small>ลบ.</small></div></article><article class="du-card analytics-summary-card is-actual"><span>ยอดเบิกจ่ายจริงรวมแล้ว</span><div><strong>'+amount(actualTotal)+'</strong><small>ลบ.</small></div></article><article class="du-card analytics-summary-card is-rate"><span>อัตราผลสำเร็จเทียบแผนสะสม</span><div><strong>'+(successRate===null?'—':format(successRate,2)+'%')+'</strong></div></article><article class="du-card analytics-summary-card"><span>'+peakLabel+'</span><div><strong>'+escapeHtml(peakValue)+'</strong>'+(peak?'<small>('+amount(peak.actual)+' ลบ.)</small>':'')+'</div></article>';
    $('#analytics-project-rows').querySelectorAll('[data-analytics-project-row]').forEach(row => {
      const active = row.dataset.analyticsProjectRow === chartProjectId;
      row.classList.toggle('project-row-selected', active);
      row.querySelector('[data-analytics-project]').setAttribute('aria-pressed', String(active));
    });
  }
  function render(scopedProjects) {
    currentProjects = scopedProjects;
    if (!currentProjects.some(project => project.id === chartProjectId)) chartProjectId = null;
    if (!initialized) {
      $('#analytics-kpis').addEventListener('change', event => {
        if (!event.target.matches('[data-split-revenue]')) return;
        splitRevenue=event.target.checked;
        render(currentProjects);
        $('#analytics-kpis [data-split-revenue]').focus({preventScroll:true});
      });
      document.querySelectorAll('[data-analytics-view]').forEach(button => button.addEventListener('click', () => {
        view = button.dataset.analyticsView;
        if (view === 'monthly') $('#analytics-year').value = 'all';
        render(currentProjects);
      }));
      for (const id of ['analytics-mode','analytics-year','analytics-plan']) $(`#${id}`).addEventListener('change', () => render(currentProjects));
      $('#analytics-annual').addEventListener('click', event => {
        const button = event.target.closest('[data-analytics-year]');
        if (!button) return;
        $('#analytics-year').value = button.dataset.analyticsYear;
        view = 'monthly';
        render(currentProjects);
        $('[data-analytics-view="monthly"]').focus();
      });
      $('#analytics-project-rows').addEventListener('click', event => {
        if (event.target.closest('[data-edit]')) return;
        const row = event.target.closest('[data-analytics-project-row]');
        if (!row) return;
        chartProjectId = chartProjectId === row.dataset.analyticsProjectRow ? null : row.dataset.analyticsProjectRow;
        renderCharts();
      });
      $('#analytics-chart-reset').addEventListener('click', () => {
        chartProjectId = null;
        renderCharts();
        $('[data-analytics-view="'+view+'"]').focus();
      });
      document.addEventListener('click', event => {
        if (!['dashboard', 'plan-results'].includes(getPage()) || !chartProjectId) return;
        if (event.target.closest('.analytics-table-scroll')) return;
        chartProjectId = null;
        renderCharts();
      });
      initialized = true;
    }
    const mode = $('#analytics-mode').value, kind = $('#analytics-plan').value;
    const years = yearsFor(scopedProjects, mode), select = $('#analytics-year');
    const selected = years.includes(Number(select.value)) ? Number(select.value) : null;
    select.innerHTML = '<option value="all">ทุกปี</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('');
    select.disabled = !years.length;
    select.value = selected === null ? 'all' : String(selected);
    const dates = (selected === null ? years : [selected]).flatMap(year => period(year, mode)), keys = dates.map(date => date.key);
    const totals = portfolioTotals(scopedProjects);
    const coverage = type => scopedProjects.filter(project => keys.some(key => Object.keys(project.details?.monthlyDisbursement?.months?.[key]?.[type] || {}).length)).length;
    $('#analytics-scope').textContent = years.length ? `${mode === 'fiscal' ? 'ปีงบประมาณ' : 'ปีปฏิทิน'} ${selected ?? 'ทุกปี'} · มีแผน ${coverage(kind)}/${scopedProjects.length} โครงการ · มีผล ${coverage('actual')}/${scopedProjects.length} โครงการ` : 'ระบุระยะเวลาดำเนินการในข้อมูลโครงการ แล้วบันทึกแผนและผลรายเดือน';
    const rateFill = Math.min(100, Math.max(0, totals.rate ?? 0));
    const sourceRate = (spent, approved) => {
      const rate = disbursementPercent(spent, approved);
      return rate === null ? '—' : format(rate,3)+'%';
    };
    const rateFooter = `<div class="overview-rate-sources"><span>แหล่งทุนแยกประเภท:</span><span>เงินกู้ <strong>${sourceRate(totals.loanSpent,totals.approvedLoan)}</strong></span><span class="overview-rate-separator" aria-hidden="true">•</span><span>เงินรายได้ <strong>${sourceRate(totals.revenueSpent,totals.approvedRevenue)}</strong></span></div>`;
    const cumulativeFooter = `<div class="overview-cumulative-footer"><div class="stat-source-bar overview-cumulative-track" role="${totals.rate === null ? 'img' : 'progressbar'}" aria-label="สัดส่วนเบิกจ่ายสะสมต่องบประมาณอนุมัติ" ${totals.rate === null ? 'aria-valuetext="ยังไม่มีงบประมาณอนุมัติสำหรับคำนวณ"' : `aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rateFill}" aria-valuetext="${format(totals.rate,1)}%"`}><span class="stat-source-loan" style="width:${rateFill}%"></span></div><div class="overview-cumulative-details"><div class="overview-cumulative-sources"><span>เงินกู้ <strong>${amount(totals.loanSpent)}</strong> ล้านบาท</span><span>เงินรายได้ <strong>${amount(totals.revenueSpent)}</strong> ล้านบาท</span></div><span class="overview-cumulative-progress">ความคืบหน้าสะสม: <strong>${totals.rate === null ? '—' : format(totals.rate,1)+'%'}</strong></span></div></div>`;
    const cards = [
      ['งบประมาณที่ได้รับอนุมัติแล้ว',amount(totals.approved),'purple','wallet',fundingBreakdown(totals.approvedLoan,totals.approvedRevenue,true),'ล้านบาท'],
      ['เบิกจ่ายสะสม',amount(totals.spent),'azure','chart',cumulativeFooter,'ล้านบาท'],
      ['อัตราการเบิกจ่าย',totals.rate === null ? '—' : format(totals.rate,3),'orange','gauge',rateFooter,'%'],
    ];
    const donut = budgetPie(totals, scopedProjects.length);
    const descriptions = ['Approved Budget ตามกรอบแผนงาน', 'Cumulative Disbursement Realization', 'Disbursement Pacing vs Target KPI'];
    $('#analytics-kpis').innerHTML = donut + cards.map(([label,value,color,icon,footer,unit],index) => `<article class="stat du-card overview-metric overview-metric-${index}"><div class="overview-metric-head"><div class="stat-icon ${color}">${uiIcon(icon)}</div><div class="overview-metric-title"><h2 class="stat-label du-card-title">${label}</h2><p>${descriptions[index]}</p></div><div class="stat-value stat-value-with-unit"><span class="stat-amount">${value}</span><span class="stat-unit${unit === '%' ? ' stat-unit-percent' : ''}">${unit}</span></div></div><div class="stat-foot">${footer}</div></article>`).join('');
    if (!comparisonTable) comparisonTable = window.createPBudgetResultsTable({
      $, format, escapeHtml, sum, getSelectedProjectId: () => chartProjectId,
    });
    comparisonTable.render({projects: scopedProjects, keys, kind});
    renderCharts();
  }
  return {render, period, sum, yearsFor, portfolioTotals};

};
