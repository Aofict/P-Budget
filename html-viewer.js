(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('snapshot').textContent);
  const main = document.getElementById('content');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => value == null ? '—' : Number(value).toLocaleString('en-US', {minimumFractionDigits:3, maximumFractionDigits:3});
  const sum = values => values.reduce((n,v)=>n+Number(v || 0),0);
  const sources = [['domestic','เงินกู้ในประเทศ'],['foreign','เงินกู้ต่างประเทศ'],['revenue','เงินรายได้']];
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const labels = {
    name:'ชื่อโครงการ',code:'รหัสโครงการ',shortName:'ชื่อย่อ',short_name:'ชื่อย่อ',status:'สถานะ',fund:'แหล่งเงิน',fundComponent:'ประเภทแหล่งเงิน',budget:'งบประมาณรวม',spent:'เบิกจ่ายสะสม',progress:'ความคืบหน้า (%)',details:'รายละเอียด',finances:'วงเงินการลงทุน (ล้านบาท)',
    nationalDevelopmentPlan:'แผนพัฒนาฯ ฉบับที่',director:'ผู้อำนวยการโครงการ',department:'หน่วยงานที่รับผิดชอบ',division:'สายงาน',objectives:'วัตถุประสงค์',area:'พื้นที่ดำเนินการ',timeline:'ระยะเวลาดำเนินการ',cabinetDate:'อนุมัติ ครม. วันที่',statusNotes:'รายละเอียดสถานะ',studySource:'ที่มาของผลศึกษา',fundingSources:'แหล่งเงินที่เลือก',startDate:'วันเริ่มโครงการ',endDate:'วันสิ้นสุดโครงการ',studyDate:'วันที่ผลศึกษา',paybackYears:'ระยะเวลาคืนทุน (ปี)',npv:'NPV',firr:'FIRR (%)',eirr:'EIRR (%)',approvedLoan:'งบอนุมัติเงินกู้รวม',approvedRevenue:'งบอนุมัติเงินรายได้',foreignLoan:'เงินกู้ต่างประเทศ',approvedForeignLoan:'งบอนุมัติเงินกู้ต่างประเทศ',land:'ที่ดิน',projectType:'ประเภทโครงการ',loan:'เงินกู้รวม',revenue:'เงินรายได้',oh:'OH',idc:'IDC',loanSpent:'เงินกู้เบิกจ่ายสะสม',revenueSpent:'เงินรายได้เบิกจ่ายสะสม',unallocated:'ยังไม่แยกแหล่งเงิน',unallocatedSpent:'เบิกจ่ายยังไม่แยกแหล่งเงิน',owner:'ผอ.โครงการ',owner_department:'หน่วยงานที่รับผิดชอบ',owner_division:'สายงาน',description:'รายละเอียดโครงการ',project_stage:'ขั้นตอนโครงการ',project_type:'ประเภทโครงการ',approval_date:'วันที่อนุมัติ',loan_total:'วงเงินกู้',revenue_total:'วงเงินรายได้',oh_total:'OH',idc_total:'IDC',estimated_return:'ผลตอบแทน',work_volume:'ปริมาณงาน',meeting_decision:'ผลการพิจารณา',meeting_comment:'ข้อสังเกตที่ประชุม',cabinet_target_comment:'เหตุผลสูง(ต่ำ)กว่าเป้ามติ ครม.',approved_budget_to_prev_year:'งบอนุมัติถึงปีก่อน',actual_disbursement_to_prev_year:'จ่ายจริงถึงปีก่อน',budgetBefore:'งบก่อนประชุม',budgetAfter:'งบหลังประชุม',beforeBudget:'งบก่อนประชุม',afterBudget:'งบหลังประชุม',reason:'เหตุผล',notes:'หมายเหตุ',reviewed:'พิจารณาแล้ว',metadata:'การจัดกลุ่มสรุป',summary_group:'กลุ่มสรุป',display_order:'ลำดับแสดง',is_active:'เปิดใช้งาน',show_change_summary:'แสดงสรุปเปลี่ยนแปลงงบ',show_set_summary:'แสดงสรุปตั้งงบ',detailBudget:'รายละเอียดเปลี่ยนแปลงงบ',setBudget:'ตั้งงบ',changeBudget:'เปลี่ยนแปลงงบ',item:'รายการ',quantity:'ปริมาณ',unit:'หน่วย',price:'ราคา',amount:'จำนวนเงิน',total:'รวม',title:'ชื่อ',type:'ประเภท',note:'หมายเหตุ',year:'ปี',years:'ปี',source:'แหล่งเงิน',funds:'วงเงินแยกแหล่งเงิน',pre:'ก่อนประชุม',post:'หลังประชุม',cost_saving:'Cost Saving',reserve:'งบสำรอง',cancel_budget:'ยกเลิกงบ/งาน',over_under:'สูง(ต่ำ)กว่างบ',cancel_reason:'เหตุผลยกเลิกงบ/งาน',created:'วันที่สร้าง',updated:'แก้ไขล่าสุด',created_at:'วันที่สร้าง',updated_at:'แก้ไขล่าสุด',bComm:'วงเงินผูกพัน',bInv:'วงเงินลงทุน',tComm:'เป้าจ่ายผูกพัน',tInv:'เป้าจ่ายลงทุน',endYear:'ปีสิ้นสุด',unboundLoan:'ไม่ผูกพันเงินกู้',unboundRevenue:'ไม่ผูกพันเงินรายได้',isUnboundSelected:'เลือกวงเงินไม่ผูกพัน',sortOrder:'ลำดับ',budget_before:'วงเงินก่อนประชุม',budget_after:'วงเงินหลังประชุม',target_before:'เป้าจ่ายก่อนประชุม',target_after:'เป้าจ่ายหลังประชุม',continuing_budget:'โครงการต่อเนื่องมีงบ',continuing_no_budget:'โครงการต่อเนื่องไม่มีงบ',new_project:'โครงการใหม่',statusId:'สถานะโครงการ',fundId:'แหล่งเงิน',version:'รุ่นข้อมูล'
  };
  const budgetFields = [['committed','ผูกพันยกมา'],['investment_set','ลงทุนตั้งงบ (ก่อน)'],['investment_set_post','ลงทุนตั้งงบ'],['investment_change_before','ลงทุนเปลี่ยนแปลงงบ (ก่อน)'],['investment_change','ลงทุนเปลี่ยนแปลงงบ'],['disbursement_target','เป้าหมายเบิกจ่าย (ก่อน)'],['disbursement_target_post','เป้าหมายเบิกจ่าย'],['next_year_uncommitted','ไม่ผูกพันงบไปปีถัดไป'],['cabinet_target','เป้าหมายเบิกจ่าย (มติ ครม.)'],['high_target','สูง(ต่ำ) กว่าเป้ามติ ครม.']];
  budgetFields.forEach(([key,label])=>labels[key]=label);
  Object.assign(labels,{createdAt:'วันที่สร้าง',isTerminal:'สถานะสิ้นสุด',fundingSourceId:'แหล่งเงินหลัก',change_budget_comment:'เหตุผลเปลี่ยนแปลงงบ',development_plan_no:'แผนพัฒนาฯ ฉบับที่',external_opinions:'ความเห็นหน่วยงานภายนอก',investment_types:'ลักษณะการลงทุน',necessity_other:'ความจำเป็นอื่น ๆ',necessity_type:'ความจำเป็นของโครงการ',meeting_year:'ปีประชุม',continuing_budget:'โครงการต่อเนื่องมีงบ',continuing_no_budget:'โครงการต่อเนื่องไม่มีงบ',new_project:'โครงการใหม่'});
  const hidden = new Set(['id','masterProjectId','masterCode','projectId','meetingId','master_project_id','source_row','source_file','source_sheet','source_total','source_grand_total','parent_key']);
  let tableId=0;
  const tables = new Map();
  const cell = (text, numeric=false) => ({html:esc(text), numeric});
  const money = value => cell(number(value),true);
  const link = (text,hash) => ({html:`<a href="#${esc(hash)}">${esc(text)}</a>`});
  function table(headings, rows, options={}) {
    const id=`t${++tableId}`;
    tables.set(id,{headings,rows,page:0,options});
    return `<div data-table="${id}">${tableBody(id)}</div>`;
  }
  function tableBody(id) {
    const state=tables.get(id), {headings,rows,page,options}=state;
    const size=50, slice=rows.slice(page*size,(page+1)*size);
    return `<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(options.label || 'ตารางข้อมูล')}"><table class="${esc(options.className || '')}"><thead><tr>${headings.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${slice.length?slice.map(row=>`<tr class="${esc(row.className || '')}">${row.map(v=>`<td${v?.numeric?' class="num"':''}>${v?.html ?? esc(v)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headings.length}" class="empty">ไม่มีข้อมูล</td></tr>`}</tbody></table></div>${rows.length>size?`<div class="pager"><button data-pager="${id}" data-step="-1" ${page===0?'disabled':''}>ก่อนหน้า</button><span>${page*size+1}–${Math.min((page+1)*size,rows.length)} จาก ${rows.length} แถว</span><button data-pager="${id}" data-step="1" ${(page+1)*size>=rows.length?'disabled':''}>ถัดไป</button></div>`:''}`;
  }
  function scalar(value,key='') {
    if(value==null || value==='')return '—';
    if(typeof value==='boolean')return value?'ใช่':'ไม่';
    if(key==='fundingSources')return String(value).split(',').map(s=>sources.find(([id])=>id===s)?.[1] || s).join(', ');
    if(key==='statusId')return data.masters.statuses.find(s=>s.id===value)?.name || value;
    if(key==='fundId')return data.masters['funding-sources'].find(s=>s.id===value)?.name || value;
    return typeof value==='number'?number(value):String(value);
  }
  function fields(object, omit=[]) {
    if(!object || typeof object!=='object')return `<p>${esc(scalar(object))}</p>`;
    return `<div class="fields">${Object.entries(object).filter(([k,v])=>!hidden.has(k)&&!omit.includes(k)&&(v==null||typeof v!=='object')).map(([k,v])=>`<div class="field"><small>${esc(labels[k] || k)}</small><span>${esc(scalar(v,k))}</span></div>`).join('')}</div>`+Object.entries(object).filter(([k,v])=>!hidden.has(k)&&!omit.includes(k)&&v&&typeof v==='object').map(([k,v])=>`<details><summary>${esc(labels[k] || k)}</summary>${nested(v)}</details>`).join('');
  }
  function nested(value) {
    if(Array.isArray(value)) {
      if(!value.length)return '<p class="empty">ไม่มีข้อมูล</p>';
      if(value.every(v=>v&&typeof v==='object'&&!Array.isArray(v))) {
        const keys=[...new Set(value.flatMap(v=>Object.keys(v)))].filter(k=>!hidden.has(k));
        return table(keys.map(k=>labels[k] || k),value.map(v=>keys.map(k=>({html:typeof v[k]==='object'?`<details><summary>ดูข้อมูล</summary>${nested(v[k])}</details>`:esc(scalar(v[k],k))}))));
      }
      return value.map((v,i)=>`<details><summary>รายการ ${i+1}</summary>${typeof v==='object'?nested(v):esc(scalar(v))}</details>`).join('');
    }
    return fields(value);
  }
  function panel(title,body) {return `<section class="panel"><h2>${esc(title)}</h2>${body}</section>`;}
  function picker(id,label,items,selected) {return `<label>${esc(label)}<select id="${id}">${items.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;}
  function metric(label,value,unit='ล้านบาท') {return `<div class="panel metric"><small>${esc(label)}</small><strong>${unit==='โครงการ'?Number(value).toLocaleString('en-US'):number(value)}</strong> ${esc(unit)}</div>`;}
  const projectList = () => data.projects.map(p=>[p.id,`${p.details?.shortName || p.code} · ${p.name}`]);
  function funding(projects,split=false) {
    const totals=projects.reduce((a,p)=>{const f=p.finances || {},d=p.details || {};a[0]+=Math.max(0,Number(f.loan || 0)-Number(d.foreignLoan || 0));a[1]+=Number(d.foreignLoan || 0);a[2]+=Number(f.revenue || 0);return a;},[0,0,0]);
    const colors=['#2684e8','#00b9e8','#14ab91'];
    const extras=[['ที่ดิน',sum(projects.map(p=>p.details?.land)),'#f4d32d'],['OH',sum(projects.map(p=>p.finances?.oh)),'#9674ce'],['IDC',sum(projects.map(p=>p.finances?.idc)),'#ff3030']];
    const items=sources.map((s,i)=>({name:s[1],value:totals[i],color:colors[i]}));
    const pieces=items.map(i=>({...i}));
    if(split){pieces[2].value=Math.max(0,totals[2]-sum(extras.map(e=>e[1])));extras.forEach(([name,value,color])=>pieces.push({name,value,color}));}
    const parts=pieces.filter(v=>v.value>0).sort((a,b)=>b.value-a.value);
    const total=sum(parts.map(p=>p.value)); let angle=Math.PI-(parts[0]?.value/total*Math.PI || 0);
    const paths=parts.map(part=>{const delta=part.value/total*2*Math.PI,end=angle+delta,mid=angle+delta/2,r=135,c=165;
      const shape=delta>=2*Math.PI-.00001?`<circle cx="${c}" cy="${c}" r="${r}" fill="${part.color}"/>`:`<path d="M${c},${c} L${c+r*Math.cos(angle)},${c+r*Math.sin(angle)} A${r},${r} 0 ${delta>Math.PI?1:0} 1 ${c+r*Math.cos(end)},${c+r*Math.sin(end)} Z" fill="${part.color}" stroke="#fffaf3"/>`;
      angle=end;const outside=delta<.25,dist=outside?155:85;
      return shape+`${outside?`<path d="M${c+130*Math.cos(mid)},${c+130*Math.sin(mid)} L${c+150*Math.cos(mid)},${c+150*Math.sin(mid)}" stroke="${part.color}"/>`:''}<text x="${c+dist*Math.cos(mid)}" y="${c+dist*Math.sin(mid)}" text-anchor="middle" dominant-baseline="middle" fill="${outside?'#392c20':'white'}" font-size="${outside?11:16}" font-weight="bold">${(part.value/total*100).toFixed(1)}%</text>`;
    }).join('');
    return `<div class="chart-grid"><svg class="pie" viewBox="0 0 330 330" role="img" aria-label="สัดส่วนแหล่งเงินทุน">${paths || '<text x="165" y="165" text-anchor="middle">ยังไม่มีวงเงิน</text>'}</svg><div><h3>แหล่งเงินทุน</h3><label style="display:flex;align-items:center;gap:8px"><input id="funding-split" type="checkbox" ${split?'checked':''}>ที่ดิน OH IDC</label>${items.filter((s,i)=>i!==1||s.value>0).map(s=>`<div class="source"><span><i style="background:${s.color}"></i>${s.name}</span><b>${number(s.value)}</b></div>`).join('')}${split?extras.map(([name,value,color])=>`<div class="source" style="margin-left:20px"><span><i style="background:${color}"></i>${name}</span><b>${number(value)}</b></div>`).join(''):''}<p class="note">หน่วย: ล้านบาท · เงินรายได้รวมที่ดิน / OH / IDC</p></div></div>`;
  }
  function aggregate(projects,keys,kind,source) {
    let recorded=false,total=0;
    projects.forEach(p=>keys.forEach(k=>{const entry=p.details?.monthlyDisbursement?.months?.[k]?.[kind];const values=source?[entry?.[source]]:sources.map(([s])=>entry?.[s]);values.forEach(v=>{if(v!=null){recorded=true;total+=Number(v);}});}));
    return recorded?total/1e6:null;
  }
  function period(year,mode='calendar') {return Array.from({length:12},(_,i)=>{const month=mode==='fiscal'?(i+9)%12+1:i+1;const y=mode==='fiscal'&&month>=10?year-1:year;return `${y}-${String(month).padStart(2,'0')}`;});}
  function yearsFor(projects,mode='calendar') {
    const years=new Set();projects.forEach(p=>{const ledger=p.details?.monthlyDisbursement;Object.keys(ledger?.months || {}).forEach(k=>years.add(Number(k.slice(0,4))+(mode==='fiscal'&&Number(k.slice(5))>=10?1:0)));(ledger?.years || []).forEach(y=>years.add(Number(y)));const timeline=String(p.details?.timeline || '').match(/25\d{2}|26\d{2}/g);if(timeline?.length){const start=Number(timeline[0]),end=Number(timeline.at(-1));if(end>=start&&end-start<=100)for(let y=start;y<=end;y++)years.add(y);}});return [...years].filter(Number.isFinite).sort((a,b)=>a-b);
  }
  function annualChart(projects) {
    const years=yearsFor(projects), rows=years.map(y=>({year:y,plan:aggregate(projects,period(y),'cabinet'),actual:aggregate(projects,period(y),'actual')}));
    const max=Math.max(1,...rows.flatMap(r=>[r.plan || 0,r.actual || 0]));
    return `<p class="bar-legend"><span><i style="background:#2684e8"></i>เป้าหมาย (มติ ครม.)</span><span><i style="background:#14ab91"></i>เบิกจ่ายจริง</span></p><div class="bars">${rows.map(r=>`<div class="bar-group"><div class="bar-pair"><div class="bar plan" style="height:${(r.plan || 0)/max*160}px" title="${number(r.plan)} ล้านบาท"></div><div class="bar actual" style="height:${(r.actual || 0)/max*160}px" title="${number(r.actual)} ล้านบาท"></div></div><b>${r.year}</b><small>${number(r.plan)}<br>${number(r.actual)}</small></div>`).join('') || '<p class="empty">ยังไม่มีแผนหรือผลรายเดือน</p>'}</div>`;
  }
  function projectRows(projects) {return table(['โครงการ','งบประมาณรวม','เบิกจ่ายสะสม','สายงาน','สถานะ'],projects.map(p=>[link(p.name,`projects/${encodeURIComponent(p.id)}/0`),money(p.budget),money(p.spent),cell(p.details?.division),cell(p.status)]));}
  function home() {const projects=data.projects;return `<h1>ภาพรวมงบประมาณโครงการ</h1><div class="metrics">${metric('โครงการทั้งหมด',projects.length,'โครงการ')}${metric('งบประมาณรวม',sum(projects.map(p=>p.budget)))}${metric('เบิกจ่ายสะสม',sum(projects.map(p=>p.spent)))}</div>${panel('งบประมาณรวม',`<div id="funding-snapshot">${funding(projects)}</div>`)}${panel('แผนและผลรายปี · ล้านบาท',annualChart(projects))}${panel('โครงการทั้งหมด',projectRows(projects))}`;}
  const profileTabs=['ข้อมูลโครงการ','วงเงินลงทุน','แผนการลงทุน','สถานะโครงการ','แผนและผลการเบิกจ่าย'];
  function projectsPage(id,tab='0') {
    const p=data.projects.find(p=>p.id===id);
    if(!p)return `<h1>โครงการทั้งหมด</h1><div class="controls"><label>ค้นหาโครงการ<input id="project-search" type="search" placeholder="ชื่อ / ชื่อย่อ / สายงาน"></label></div><div id="project-results">${projectRows(data.projects)}</div>`;
    const d=p.details || {},f=p.finances || {};
    let body='';
    if(tab==='0')body=fields({...p,...d},['finances','details','investmentPlan','monthlyDisbursement','approvedLoan','approvedRevenue','approvedForeignLoan','foreignLoan','land']);
    if(tab==='1')body=`<p class="note">หน่วย: ล้านบาท · ที่ดิน / OH / IDC รวมอยู่ในเงินรายได้แล้ว</p>${table(['แหล่งเงินทุน','วงเงินการลงทุน','งบประมาณที่ได้รับอนุมัติแล้ว','ผลการเบิกจ่ายสะสม'],[
      [cell('เงินกู้ในประเทศ'),money(Math.max(0,(f.loan || 0)-(d.foreignLoan || 0))),money(Math.max(0,(d.approvedLoan || 0)-(d.approvedForeignLoan || 0))),money(aggregate([p],Object.keys(d.monthlyDisbursement?.months || {}),'actual','domestic'))],
      [cell('เงินกู้ต่างประเทศ'),money(d.foreignLoan),money(d.approvedForeignLoan),money(aggregate([p],Object.keys(d.monthlyDisbursement?.months || {}),'actual','foreign'))],
      [cell('เงินรายได้'),money(f.revenue),money(d.approvedRevenue),money(aggregate([p],Object.keys(d.monthlyDisbursement?.months || {}),'actual','revenue'))]
    ])}${panel('ที่ดิน / OH / IDC',fields({land:d.land,oh:f.oh,idc:f.idc}))}`;
    if(tab==='2')body=d.investmentPlan?table(d.investmentPlan.columns,d.investmentPlan.rows.map(r=>r.map(v=>cell(typeof v==='number'?number(v):v,typeof v==='number')))):'<p class="empty">ยังไม่มีแผนการลงทุน</p>';
    if(tab==='3')body=fields({status:p.status,statusNotes:d.statusNotes,progress:p.progress,studyDate:d.studyDate,studySource:d.studySource,paybackYears:d.paybackYears,npv:d.npv,firr:d.firr,eirr:d.eirr});
    if(tab==='4')body=reportControls([p],true);
    return `<h1>${esc(p.name)}</h1><div class="controls">${picker('profile-project','เลือกโครงการ',projectList(),p.id)}</div><div class="tabs" role="tablist">${profileTabs.map((t,i)=>`<button role="tab" aria-selected="${String(i)===tab}" data-profile-tab="${i}" data-project="${esc(p.id)}">${i+1}. ${t}</button>`).join('')}</div>${panel(profileTabs[Number(tab)] || profileTabs[0],body)}`;
  }
  function reportControls(projects,monthly=false) {
    const years=yearsFor(projects);
    window.reportProjects=projects;
    const divisions=[...new Set(projects.map(p=>p.details?.division).filter(Boolean))].sort();
    return `<p class="note">หน่วย: ล้านบาท · — ยังไม่มีข้อมูล · รวมแผนและผลแยกแหล่งเงิน</p><div class="controls">${picker('report-mode','รอบปี',[['calendar','ปีปฏิทิน'],['fiscal','ปีงบประมาณ']],'calendar')}${picker('report-kind','ชุดแผน',[['cabinet','มติ ครม.'],['revised','เปลี่ยนแปลงงบ']],'cabinet')}${picker('report-from','ตั้งแต่ปี',years.map(y=>[y,y]),years[0])}${picker('report-to','ถึงปี',years.map(y=>[y,y]),years.at(-1))}${picker('report-view','รูปแบบ',[['annual','รายปี'],['monthly','รายเดือน']],monthly?'monthly':'annual')}${picker('report-division','สายงาน',[['','ทุกสายงาน'],...divisions.map(d=>[d,d])],'')}${picker('report-status','สถานะ',[['','ทุกสถานะ'],...data.masters.statuses.map(s=>[s.id,s.name])],'')}</div><div id="report-table">${reportTable(projects,monthly?'monthly':'annual','calendar','cabinet',years[0],years.at(-1))}</div>`;
  }
  function reportTable(projects,view,mode,kind,from,to) {
    if(!from || !to)return '<p class="empty">ยังไม่มีช่วงปีสำหรับรายงาน</p>';
    if(Number(from)>Number(to))return '<p class="error" role="alert">ปีเริ่มต้นต้องไม่มากกว่าปีสิ้นสุด</p>';
    const years=Array.from({length:Number(to)-Number(from)+1},(_,i)=>Number(from)+i);
    const periods=view==='monthly'?years.flatMap(y=>period(y,mode).map(key=>({label:`${months[Number(key.slice(5))-1]} ${key.slice(0,4)}`,keys:[key]}))):years.map(y=>({label:String(y),keys:period(y,mode)}));
    const rows=[];
    const append=(ps,name)=>{for(const [k,label] of [[kind,'เป้าหมาย'],['actual','เบิกจ่ายจริง']])for(const [source,title] of [...sources,[null,'รวม']]){const values=periods.map(p=>aggregate(ps,p.keys,k,source));rows.push([cell(name),cell(label),cell(title),...values.map(money),money(aggregate(ps,periods.flatMap(p=>p.keys),k,source))]);}};
    projects.forEach(p=>append([p],p.name));append(projects,'รวมทั้งหมด');
    return table(['โครงการ','แผน / ผล','แหล่งเงิน',...periods.map(p=>p.label),'รวม'],rows);
  }
  function workflow(doc,year) {
    const rows=doc.workflow?.rows || [],future=Array.from({length:14},(_,i)=>year+3+i).filter(y=>rows.some(r=>Number(r.future?.[y] || 0)!==0));
    const totalRow=rows.find(r=>r.key==='grand_total');
    return `<p class="note">หน่วย: ล้านบาท · ข้อมูล Workflow ที่บันทึกไว้ ณ วันส่งออก</p>${table(['ลำดับ','รายการ','ปริมาณ','หน่วย','วงเงินประมาณการ','วงเงินตั้งงบ',`จ่ายจริงถึง ${year-1}`,`จ่ายจริง+ประมาณการ ${year}`,...[year+1,year+2].flatMap(y=>[...Array.from({length:12},(_,m)=>`${y} เดือน ${m+1}`),`${y} รวม`]),...future.map(y=>String(y)),'รวม','Cost Saving','งบสำรอง','ยกเลิกงบ/งาน','สูง(ต่ำ)กว่างบ','รวมทั้งสิ้น','เหตุผล'],rows.filter(r=>r.type!=='detail_child'||r.code||r.item).map(r=>{
      const metric=['annual_target','annual_investment'].includes(r.key),base=r.key==='annual_target'?(totalRow || r):r;
      const t1=sum(base.target1 || []),t2=sum(base.target2 || []),combined=Number(r.actual_prev || 0)+Number(r.estimate_current || 0)+t1+t2+sum(Object.values(r.future || {}));
      const keep=doc.workflow?.preserve_excel_formula_values===true;
      const row=[cell(r.code),cell(r.item),cell(r.quantity),cell(r.unit),money(r.estimate_total),money(r.budget_set),money(r.actual_prev),money(r.estimate_current),...Array.from({length:12},(_,m)=>metric?cell(''):money(r.target1?.[m])),money(t1),...Array.from({length:12},(_,m)=>metric?cell(''):money(r.target2?.[m])),money(t2),...future.map(y=>money(r.future?.[y])),money(keep&&r.source_total!=null?r.source_total:combined),money(r.cost_saving),money(r.reserve),money(r.cancel_budget),money(r.over_under),money(keep&&r.source_grand_total!=null?r.source_grand_total:combined+Number(r.cost_saving || 0)+Number(r.reserve || 0)+Number(r.cancel_budget || 0)),cell(r.cancel_reason)];
      if(['subtotal','total','metric'].includes(r.type))row.className='subtotal';return row;
    }),{className:'workflow'})}`;
  }
  function meetingBudget(doc,year) {
    const budget=doc.budget || {},years=[...new Set([...Array.from({length:7},(_,i)=>String(year+i)),...Object.keys(budget)])].sort();
    const rows=[];
    const value=(y,k)=>Number(budget[y]?.[k] || 0);
    for(const [key,label] of budgetFields){rows.push([cell(label),...years.map(y=>money(budget[y]?.[key]))]);if(key==='investment_change'){rows.push([cell('รวม (ผูกพัน + ลงทุน)'),...years.map(y=>money(value(y,'committed')+value(y,'investment_set_post')+value(y,'investment_change')))]);}if(key==='disbursement_target_post')rows.push([cell('คงเหลือ'),...years.map(y=>money(value(y,'committed')+value(y,'investment_set_post')+value(y,'investment_change')-(budget[y]?.disbursement_target_post==null?value(y,'disbursement_target'):value(y,'disbursement_target_post'))))]);}
    return `<p class="note">หน่วย: ล้านบาท</p>${table(['วงเงินดำเนินการ',...years],rows)}`;
  }
  function meetingSummary(round,year) {
    const rows=round.projects.filter(e=>e.metadata?.is_active!==0).map(e=>{const d=e.document,b=d.budget?.[year] || {},comm=Number(b.committed || 0),investment=Number(b.investment_set_post || 0)+Number(b.investment_change || 0);return [cell(d.name),money(comm),money(investment),money(comm+investment),money(b.disbursement_target),money(b.disbursement_target_post ?? b.disbursement_target),cell(d.owner)];});
    return table(['โครงการ','ผูกพัน','ลงทุน','รวม','เป้าจ่ายก่อน','เป้าจ่ายหลัง','ผอ.โครงการ'],rows);
  }
  function meetingsPage(mid,code,tab='info') {
    const round=data.meetings.find(m=>m.id===mid) || data.meetings[0];
    if(!round)return '<h1>ประชุมงบประมาณ</h1><p class="empty">ยังไม่มีรอบประชุม</p>';
    const entry=round.projects.find(e=>e.document.id===code),doc=entry?.document;
    const menu=[['change',`เปลี่ยนแปลงงบปี ${round.year_be+1}`],['set',`ตั้งงบปี ${round.year_be+2}`],['results','ผลการพิจารณา'],['summary','สรุปงบ'],['info','ข้อมูลโครงการ'],['budget','แผนงบประมาณ'],['changes','รายละเอียดเปลี่ยนแปลงงบ'],['workflow','Workflow']];
    let body;
    if(tab==='change'||tab==='set') {
      const changing=tab==='change',year=round.year_be+(changing?1:2);
      const visible=round.projects.filter(e=>e.metadata?.is_active!==0&&Number(e.metadata?.[changing?'show_change_summary':'show_set_summary'] ?? (changing?0:1))===1);
      const keys=changing?['budget_before','budget_change_before','budget_change_delta','budget_change_after','budget_after','cabinet_target','disbursement_before','disbursement_change','disbursement_after','disbursement_vs_cabinet']:['committed','budget_before','budget_change','budget_after','operating_budget_after','disbursement_before','disbursement_change','disbursement_after'];
      const titles=changing?['ตั้งงบลงทุน','เปลี่ยนแปลงก่อน','เพิ่ม(ลด)','เปลี่ยนแปลงหลัง','รวมลงทุน','มติ ครม.','เป้าจ่ายก่อน','เป้าจ่ายเพิ่ม(ลด)','เป้าจ่ายหลัง','สูง(ต่ำ)กว่า ครม.']:['ผูกพัน','ตั้งงบลงทุนก่อน','เพิ่ม(ลด)','คงเหลือ','รวม','เป้าจ่ายก่อน','เพิ่ม(ลด)เป้าจ่าย','เป้าจ่ายหลัง'];
      const rows=visible.map(e=>{const s=e.summaries?.[year] || {};return [cell(e.document.name),...keys.map(k=>money(s[k])),cell(e.document.owner)];});
      const total=[cell('รวมทั้งหมด'),...keys.map(k=>money(sum(visible.map(e=>e.summaries?.[year]?.[k])))),cell('')];total.className='total';rows.push(total);
      body=panel(`${changing?'เปลี่ยนแปลงงบ':'ตั้งงบ'}ปี ${year} · ล้านบาท`,table(['โครงการ',...titles,'ผอ.โครงการ'],rows));
    }
    else if(tab==='results')body=panel('ผลการพิจารณา',table(['โครงการ','ผลการพิจารณา','ข้อสังเกต','ผอ.โครงการ'],round.projects.map(e=>[cell(e.document.name),cell(e.document.meeting_decision),cell(e.document.meeting_comment),cell(e.document.owner)])));
    else if(tab==='summary'||!doc)body=Array.from({length:7},(_,i)=>panel(`สรุปปี ${round.year_be+i}`,meetingSummary(round,round.year_be+i))).join('')+panel('แหล่งเงินของรอบประชุม',nested(round.funds));
    else if(tab==='budget')body=panel('แผนงบประมาณรายปี',meetingBudget(doc,round.year_be));
    else if(tab==='changes')body=panel('รายละเอียดเปลี่ยนแปลงงบ',nested(doc.detailBudget || {}));
    else if(tab==='workflow')body=panel('Workflow — แบบ งป.016/1',workflow(doc,round.year_be));
    else body=panel(doc.name,fields(doc,['budget','detailBudget','workflow'])+fields({beforeBudget:entry.beforeBudget,afterBudget:entry.afterBudget,reason:entry.reason,notes:entry.notes,reviewed:entry.reviewed})+`<details><summary>ข้อมูลจัดกลุ่มสรุป</summary>${fields(entry.metadata)}</details>`);
    return `<h1>ประชุมงบประมาณ</h1><div class="controls">${picker('meeting-round','รอบประชุม',data.meetings.map(m=>[m.id,`${m.round_no}/${m.year_be} · ${m.title}`]),round.id)}${picker('meeting-project','โครงการ',[['','สรุปทุกโครงการ'],...round.projects.map(e=>[e.document.id,e.document.name])],doc?.id || '')}</div><p>${esc(round.status==='closed'?'ปิดรอบแล้ว':'อยู่ระหว่างพิจารณา')} · เปลี่ยนแปลงงบปี ${round.year_be+1} · ตั้งงบปี ${round.year_be+2}</p><div class="tabs">${menu.map(([k,v])=>`<button data-meeting-tab="${k}" data-round="${esc(round.id)}" data-code="${esc(doc?.id || '')}" aria-selected="${k===tab}">${v}</button>`).join('')}</div>${body}`;
  }
  function ninePage(year) {
    const years=Object.keys(data.nineBox).sort(),selected=years.includes(year)?year:years.at(-1),projects=data.nineBox[selected] || [];
    const rows=projects.flatMap(p=>(p.items || []).map(i=>[cell(p.name),cell(p.endYear),cell(i.source),money(i.bComm),money(i.bInv),money(Number(i.bComm || 0)+Number(i.bInv || 0)),money(i.tComm),money(i.tInv),money(Number(i.tComm || 0)+Number(i.tInv || 0))]));
    return `<h1>9 ช่อง</h1><div class="controls">${picker('nine-year','ปี พ.ศ.',years.map(y=>[y,y]),selected)}</div><p class="note">หน่วย: ล้านบาท</p>${panel(`ข้อมูลปี ${selected || '—'}`,table(['โครงการ','สิ้นสุดปี','แหล่งเงิน','วงเงินผูกพัน','วงเงินลงทุน','รวมวงเงิน','เป้าจ่ายผูกพัน','เป้าจ่ายลงทุน','รวมเป้าจ่าย'],rows))}${panel('วงเงินไม่ผูกพันไปปีถัดไป',table(['โครงการ','เลือกไว้','เงินกู้','เงินรายได้'],projects.map(p=>[cell(p.name),cell(p.isUnboundSelected?'ใช่':'ไม่'),money(p.unboundLoan),money(p.unboundRevenue)])))}`;
  }
  function mastersPage() {const names={'funding-sources':'แหล่งเงิน','statuses':'สถานะโครงการ','fiscal-years':'ปีงบประมาณ','project-types':'ประเภทโครงการ'};return '<h1>ข้อมูลหลัก</h1>'+Object.entries(data.masters).map(([k,rows])=>panel(names[k] || k,table(['รหัส','ชื่อ'],rows.map(r=>[cell(r.code),cell(r.name)])))).join('');}
  function render() {
    tables.clear();tableId=0;
    const parts=location.hash.slice(1).split('/').map(v=>{try{return decodeURIComponent(v);}catch{return '';}}),[page,id,tab,detailTab]=parts;
    document.querySelectorAll('nav a').forEach(a=>{if(a.hash===`#${page || 'home'}`)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if(page==='projects')main.innerHTML=projectsPage(id,tab);
    else if(page==='meetings')main.innerHTML=meetingsPage(id,tab,detailTab);
    else if(page==='nine')main.innerHTML=ninePage(id);
    else if(page==='annual'||page==='monthly')main.innerHTML=`<h1>รายงานแผน${page==='annual'?'รายปี':'รายเดือน'}</h1>${panel('แผนและผลการเบิกจ่าย',reportControls(data.projects,page==='monthly'))}`;
    else if(page==='masters')main.innerHTML=mastersPage();
    else if(page==='settings')main.innerHTML='<h1>ข้อมูลไฟล์</h1>'+panel('สำเนาสำหรับอ่าน',`<p>รุ่นโปรแกรม ${esc(data.version)} · รุ่นฐานข้อมูล ${data.schemaVersion}</p><p>${data.projects.length} โครงการ · ${data.meetings.length} รอบประชุม</p><p>ไฟล์นี้รวมข้อมูลที่บันทึกแล้ว ณ เวลาส่งออก มีไว้เปิดอ่านและส่งต่อ ไม่มีฐานข้อมูล .db หรือฟังก์ชันแก้ไข/นำเข้าข้อมูล การเปลี่ยนแปลงในโปรแกรมภายหลังจะไม่ปรากฏในสำเนานี้</p>`);
    else main.innerHTML=home();
  }
  document.addEventListener('click',event=>{
    const page=event.target.closest('[data-pager]');if(page){const id=page.dataset.pager,s=tables.get(id);s.page+=Number(page.dataset.step);document.querySelector(`[data-table="${id}"]`).innerHTML=tableBody(id);return;}
    const profile=event.target.closest('[data-profile-tab]');if(profile)location.hash=`projects/${encodeURIComponent(profile.dataset.project)}/${profile.dataset.profileTab}`;
    const meeting=event.target.closest('[data-meeting-tab]');if(meeting)location.hash=`meetings/${encodeURIComponent(meeting.dataset.round)}/${encodeURIComponent(meeting.dataset.code)}/${meeting.dataset.meetingTab}`;
  });
  document.addEventListener('change',event=>{
    const id=event.target.id;
    if(id==='funding-split')document.getElementById('funding-snapshot').innerHTML=funding(data.projects,event.target.checked);
    if(id==='profile-project')location.hash=`projects/${encodeURIComponent(event.target.value)}/0`;
    if(id==='meeting-round')location.hash=`meetings/${encodeURIComponent(event.target.value)}`;
    if(id==='meeting-project')location.hash=`meetings/${encodeURIComponent(document.getElementById('meeting-round').value)}/${encodeURIComponent(event.target.value)}/info`;
    if(id==='nine-year')location.hash=`nine/${event.target.value}`;
    if(id.startsWith('report-')){const get=k=>document.getElementById(`report-${k}`).value;const scoped=window.reportProjects.filter(p=>(!get('division')||p.details?.division===get('division'))&&(!get('status')||p.statusId===get('status')));document.getElementById('report-table').innerHTML=scoped.length?reportTable(scoped,get('view'),get('mode'),get('kind'),get('from'),get('to')):'<p class="empty">ไม่พบโครงการที่ตรงกับเงื่อนไข</p>';}
  });
  document.addEventListener('input',event=>{if(event.target.id==='project-search'){const q=event.target.value.toLocaleLowerCase('th');document.getElementById('project-results').innerHTML=projectRows(data.projects.filter(p=>`${p.name} ${p.code} ${p.details?.shortName || ''} ${p.details?.division || ''}`.toLocaleLowerCase('th').includes(q)));}});
  document.getElementById('stamp').textContent=`ข้อมูล ณ ${new Date(data.exportedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · ${data.projects.length} โครงการ · ${data.meetings.length} รอบประชุม`;
  window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
  try {render();} catch(error) {main.innerHTML='<p class="error" role="alert">เปิดข้อมูลไม่สำเร็จ กรุณาส่งออกไฟล์ใหม่</p>';console.error(error);}
})();
