window.DisbursementPlan = (() => {
  const sources=[['domestic','เงินกู้ในประเทศ'],['foreign','เงินกู้ต่างประเทศ'],['revenue','เงินรายได้']];
  const kinds=[['cabinet','ชุดมติ ครม.'],['revised','ชุดเปลี่ยนแปลงงบ'],['actual','ผลการเบิกจ่าย']];
  const monthNames=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  let ledger={years:[],months:{}}, selectedYear, mode='calendar', planKind='cabinet', root, form;
  const money=value=>Number(value || 0).toLocaleString('en-US',{maximumFractionDigits:2});
  const millions=baht=>(Number(baht || 0)/1_000_000).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3});
  function millionInputBaht(raw) {
    const [integer='0',fraction='']=raw.split('.');
    const units=BigInt(integer || '0')*1000n+BigInt(fraction.slice(0,3).padEnd(3,'0'))+(Number(fraction[3] || 0)>=5?1n:0n);
    return Number(units*1000n);
  }
  const cents=value=>Math.round(Number(value || 0)*100);
  function selectedSources() {
    const selected=form.elements.fundingSources.value.split(',');
    return sources.filter(([id])=>selected.includes(id));
  }
  function period(year) {
    return Array.from({length:12},(_,i)=>{
      const month=mode==='fiscal'?(i+9)%12+1:i+1;
      const calendarYear=mode==='fiscal'&&month>=10?year-1:year;
      return {key:`${calendarYear}-${String(month).padStart(2,'0')}`,month,year:calendarYear};
    });
  }
  function total(keys,kind,source) {
    return keys.reduce((sum,key)=>sum+(source?cents(ledger.months[key]?.[kind]?.[source]):sources.reduce((n,[id])=>n+cents(ledger.months[key]?.[kind]?.[id]),0)),0)/100;
  }
  function write() {
    form.elements.monthlyDisbursement.value=JSON.stringify(ledger);
    form.elements.monthlyDisbursement.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function setup(projectForm) {
    form=projectForm;root=form.querySelector('#profile-section-disbursement');
    root.innerHTML='<h3>แผนและผลการเบิกจ่าย</h3><input type="hidden" name="monthlyDisbursement"><div class="disbursement-overview"><div><span>วงเงินดำเนินการ</span><strong id="disbursement-budget"></strong></div><div><span>วงเงินที่ได้รับอนุมัติ</span><strong id="disbursement-approved"></strong></div><div><span>ผลการเบิกจ่ายสะสม</span><strong id="disbursement-cumulative"></strong></div></div><div class="disbursement-controls"><label>เลือกแสดง<select id="disbursement-mode"><option value="calendar">ปีปฏิทิน (ม.ค.–ธ.ค.)</option><option value="fiscal">ปีงบประมาณ (ต.ค.–ก.ย.)</option></select></label></div><p class="profile-hint">ตารางหน่วย: ล้านบาท · ทศนิยม 3 ตำแหน่ง · เลือกปีในตารางสรุปเพื่อกรอกข้อมูลรายเดือน</p><p id="disbursement-error" role="alert"></p><div class="disbursement-scroll"><table class="disbursement-annual"><thead></thead><tbody id="disbursement-years"></tbody></table></div><div id="disbursement-months"></div>';
    function validMonths() {
      const invalid=root.querySelector('[data-disbursement-month]:invalid');
      if(invalid){invalid.focus();return false;}return true;
    }
    root.querySelector('#disbursement-mode').onchange=event=>{if(!validMonths()){event.target.value=mode;return;}mode=event.target.value;render();};
    const planSelector=document.createElement('label');
    planSelector.innerHTML='แผนการเบิกจ่ายใช้<select id="disbursement-plan-kind"><option value="cabinet">ชุดมติ ครม.</option><option value="revised">ชุดเปลี่ยนแปลงงบ</option></select>';
    root.querySelector('.disbursement-controls').append(planSelector);
    planSelector.querySelector('select').onchange=event=>{planKind=event.target.value;updateSums();};
    root.addEventListener('click',event=>{
      const button=event.target.closest('[data-disbursement-year]');if(!button)return;
      if(!validMonths())return;
      selectedYear=Number(button.dataset.disbursementYear);render();
      root.querySelector(`[data-disbursement-year="${selectedYear}"]`).focus();
    });
    root.addEventListener('input',event=>{
      const input=event.target;if(!input.dataset.disbursementMonth)return;
      const raw=input.value.replace(/,/g,'').trim();
      const valid=raw===''||/^\d*(?:\.\d*)?$/.test(raw)&&Number.isFinite(Number(raw))&&Number(raw)<=9e9;
      input.setCustomValidity(valid?'':'กรอกจำนวนเงินล้านบาทตั้งแต่ 0 และไม่เกิน 9,000,000,000');
      if(!valid){input.setAttribute('aria-invalid','true');root.querySelector('#disbursement-error').textContent='กรอกจำนวนเงินล้านบาทตั้งแต่ 0 และไม่เกิน 9,000,000,000';return;}
      input.removeAttribute('aria-invalid');root.querySelector('#disbursement-error').textContent='';
      const key=input.dataset.disbursementMonth,kind=input.dataset.kind,source=input.dataset.source;
      ledger.months[key]??={};ledger.months[key][kind]??={};ledger.months[key][kind][source]=millionInputBaht(raw);
      write();updateSums();
    });
    root.addEventListener('focusin',event=>{
      const input=event.target;
      if(input.dataset.disbursementMonth && Number(input.value.replace(/,/g,''))===0)input.value='';
    });
    root.addEventListener('paste',event=>{
      const input=event.target;if(!input.dataset.disbursementMonth)return;
      const text=event.clipboardData?.getData('text/plain') || '';
      if(!text.includes('\t'))return;
      event.preventDefault();
      const rows=text.replace(/(?:\r?\n)+$/,'').split(/\r?\n/);
      const cells=rows[0].split('\t');
      const error=root.querySelector('#disbursement-error');
      if(rows.length!==1 || cells.length!==12){error.textContent='คัดลอกข้อมูล 1 แถว 12 คอลัมน์จาก Excel ตามลำดับเดือนในตาราง';return;}
      const amounts=cells.map(cell=>{
        const raw=cell.replace(/,/g,'').trim();
        if(raw==='' || /^[-–—−]$/.test(raw))return 0;
        return /^\d*(?:\.\d*)?$/.test(raw)&&Number.isFinite(Number(raw))&&Number(raw)<=9e9?millionInputBaht(raw):null;
      });
      if(amounts.includes(null)){error.textContent='ข้อมูลต้องเป็นจำนวนเงินล้านบาทตั้งแต่ 0 ทุกช่อง โดยช่องว่างหรือ - ถือเป็น 0';return;}
      const months=period(selectedYear);
      const kind=input.dataset.kind,source=input.dataset.source;
      amounts.forEach((amount,i)=>{
        const key=months[i].key;
        ledger.months[key]??={};ledger.months[key][kind]??={};ledger.months[key][kind][source]=amount;
      });
      error.textContent='';write();render();
      root.querySelector(`[data-kind="${kind}"][data-source="${source}"][data-disbursement-month="${input.dataset.disbursementMonth}"]`)?.focus();
    });
    root.addEventListener('focusout',event=>{if(event.target.dataset.disbursementMonth&&event.target.validity.valid)event.target.value=millions(millionInputBaht(event.target.value.replace(/,/g,'').trim()));});
  }
  function open(project) {
    ledger=structuredClone(project?.details?.monthlyDisbursement || {years:[],months:{}});
    const now=new Date(),current=now.getFullYear()+543;
    selectedYear=current;mode='calendar';planKind='cabinet';
    root.querySelector('#disbursement-plan-kind').value=planKind;
    root.querySelector('#disbursement-mode').value=mode;
    syncTimeline();
  }
  function syncTimeline() {
    const start=Number(form.elements.timelineStartYear.value),end=Number(form.elements.timelineEndYear.value);
    const valid=Number.isInteger(start)&&Number.isInteger(end)&&start>=2400&&end<=3000&&end>=start;
    ledger.years=valid?Array.from({length:end-start+1},(_,i)=>start+i):[];
    if(!ledger.years.includes(selectedYear))selectedYear=ledger.years[0];
    form.elements.monthlyDisbursement.value=JSON.stringify(ledger);render();
  }
  function render() {
    if(!selectedYear) {
      root.querySelector('.disbursement-annual thead').innerHTML='<tr><th>ปี</th></tr>';
      root.querySelector('#disbursement-years').innerHTML='';
      root.querySelector('#disbursement-months').innerHTML='<p class="profile-hint">กรอกปีเริ่มต้นและปีสิ้นสุดในแท็บ 1 เพื่อแสดงตารางรายปีและรายเดือน</p>';
      updateSums();return;
    }
    const months=period(selectedYear);
    const activeSources=selectedSources();
    root.querySelector('#disbursement-months').innerHTML=kinds.map(([kind,label])=>`<section class="disbursement-month-panel"><h4>${label} · ${mode==='fiscal'?'ปีงบประมาณ':'ปีปฏิทิน'} ${selectedYear}</h4><div class="disbursement-scroll"><table class="disbursement-month-table"><thead><tr><th scope="col">แหล่งเงิน</th>${months.map(m=>`<th scope="col">${monthNames[m.month-1]}<small>${m.year}</small></th>`).join('')}<th scope="col">รวม</th></tr></thead><tbody>${activeSources.map(([source,name])=>`<tr><th scope="row">${name}</th>${months.map(m=>`<td><input name="monthly-${kind}-${source}-${m.key}" type="text" inputmode="decimal" autocomplete="off" aria-label="${label} ${name} ${monthNames[m.month-1]} ${m.year}" value="${millions(ledger.months[m.key]?.[kind]?.[source])}" data-disbursement-month="${m.key}" data-kind="${kind}" data-source="${source}"></td>`).join('')}<td data-month-source-total="${kind}-${source}"></td></tr>`).join('')}<tr class="disbursement-total"><th scope="row">รวม</th>${months.map(m=>`<td data-month-total="${kind}-${m.key}"></td>`).join('')}<td data-kind-total="${kind}"></td></tr></tbody></table></div></section>`).join('');
    updateSums();
  }
  function updateSums() {
    if(!root)return;
    const all=Object.keys(ledger.months);
    form.elements.loanSpent.value=money((cents(total(all,'actual','domestic'))+cents(total(all,'actual','foreign')))/100);
    form.elements.revenueSpent.value=money(total(all,'actual','revenue'));
    root.querySelector('#disbursement-budget').textContent=form.elements.budget.value+' บาท';
    root.querySelector('#disbursement-approved').textContent=form.elements.approvedTotal.value+' บาท';
    root.querySelector('#disbursement-cumulative').textContent=money(total(Object.keys(ledger.months),'actual'))+' บาท';
    if(!selectedYear)return;
    const orderedYears=ledger.years;
    const annualTable=root.querySelector('.disbursement-annual');
    annualTable.style.width=(200+orderedYears.length*150)+'px';
    annualTable.querySelector('thead').innerHTML=`<tr><th scope="col">${mode==='calendar'?'ปีปฏิทิน':'ปีงบประมาณ'}</th>${orderedYears.map(year=>`<th scope="col" class="${year===selectedYear?'is-selected':''}"><button type="button" data-disbursement-year="${year}" aria-pressed="${year===selectedYear}">${year}</button></th>`).join('')}</tr>`;
    root.querySelector('#disbursement-years').innerHTML=[['แผนการเบิกจ่าย',planKind],['ผลการเบิกจ่าย','actual']].map(([label,kind])=>`<tr><th scope="row">${label}</th>${orderedYears.map(year=>`<td class="${year===selectedYear?'disbursement-selected-year':''}">${millions(total(period(year).map(m=>m.key),kind))}</td>`).join('')}</tr>`).join('');
    const keys=period(selectedYear).map(m=>m.key);
    kinds.forEach(([kind])=>{
      selectedSources().forEach(([source])=>root.querySelector(`[data-month-source-total="${kind}-${source}"]`).textContent=millions(total(keys,kind,source)));
      keys.forEach(key=>root.querySelector(`[data-month-total="${kind}-${key}"]`).textContent=millions(total([key],kind)));
      root.querySelector(`[data-kind-total="${kind}"]`).textContent=millions(total(keys,kind));
    });
  }
  return {setup,open,updateSums,syncTimeline,syncSources:render};
})();
