/* Export the same rendered summaries, including lazy-loaded years, without changing tabs. */
(() => {
  const fill = color => ({type:'pattern',pattern:'solid',fgColor:{argb:color}});
  function addTable(workbook, {name, table}) {
    const sheet=workbook.addWorksheet(name.slice(0,31));
    const headerRows=table.tHead?.rows.length||1;
    const occupied=new Set();
    const change=table.classList.contains('change-summary-table');
    const expandedSet=table.id==='projectTable';
    const decision=name==='ผลการพิจารณา';
    const decisionSummary=name==='สรุปผลการพิจารณา';
    let width=0;
    Array.from(table.rows).forEach((sourceRow,index)=>{
      const rowNumber=index+3;
      let column=1;
      const header=sourceRow.parentElement.tagName==='THEAD';
      const total=/summary|grand-total|total-row/.test(sourceRow.className);
      const section=sourceRow.classList.contains('row-section-header');
      for(const source of sourceRow.cells) {
        while(occupied.has(`${rowNumber}:${column}`))column++;
        const cell=sheet.getCell(rowNumber,column);
        const clone=source.cloneNode(true);
        clone.querySelectorAll('button,.project-actions,.project-short-name').forEach(node=>node.remove());
        clone.querySelectorAll('br').forEach(node=>node.replaceWith('\n'));
        const input=source.querySelector('input');
        const value=(input?input.value:clone.textContent).trim().replace(/[\t ]+/g,' ').replace(/\s*\n\s*/g,'\n');
        const count=source.dataset.exportCount==='1';
        const numeric=!header&&source.colSpan===1&&(count||column>=3&&/^-?\d[\d,]*\.\d+$/.test(value));
        cell.value=numeric?Number(value.replace(/,/g,'')):value;
        cell.numFmt=numeric?(count?'#,##0':'#,##0.000;[Red](#,##0.000);0.000'):'General';
        const budget=decision||decisionSummary?column>=4&&column<=6:column>=3&&column<=(change?9:expandedSet?7:5);
        const payout=decision||decisionSummary?column>=7&&column<=9:column>=(change?10:expandedSet?8:6)&&column<=(change?14:expandedSet?10:8);
        let color=index%2?'FFF2F5F8':'FFFFFFFF';
        if(header||total)color=budget?'FF19443F':payout?'FF513D22':'FF303034';
        if(section)color='FFE2E8F0';
        if(change&&source.classList.contains('change-budget-total-column')&&!header&&!total)color='FFE7EFE6';
        cell.fill=fill(color);
        cell.font={name:'Tahoma',size:11,bold:header||total||section,color:{argb:header||total?'FFFFFFFF':'FF182432'}};
        cell.alignment={vertical:'middle',horizontal:header?'center':numeric?'right':'left',wrapText:true};
        const border={style:'thin',color:{argb:'FFD0D7DE'}};
        const blueBorder={style:'medium',color:{argb:'FF2563EB'}};
        cell.border={
          top:source.classList.contains('budget-core-outline-top')?blueBorder:border,
          bottom:source.classList.contains('budget-core-outline-bottom')?blueBorder:border,
          left:source.classList.contains('budget-core-outline-left')?blueBorder:border,
          right:source.classList.contains('budget-core-outline-right')?blueBorder:border,
        };
        const lastRow=rowNumber+source.rowSpan-1,lastColumn=column+source.colSpan-1;
        if(source.rowSpan>1||source.colSpan>1)sheet.mergeCells(rowNumber,column,lastRow,lastColumn);
        for(let r=rowNumber;r<=lastRow;r++)for(let c=column;c<=lastColumn;c++)occupied.add(`${r}:${c}`);
        width=Math.max(width,lastColumn);
        column=lastColumn+1;
      }
      sheet.getRow(rowNumber).height=header?44:Math.max(30,Math.ceil((sourceRow.cells[1]?.textContent.length||0)/48)*17+12);
    });
    sheet.mergeCells(1,1,1,width);
    const title=sheet.getCell(1,1);title.value=name+' · หน่วย: ล้านบาท';
    title.font={name:'Tahoma',size:16,bold:true,color:{argb:'FFFFFFFF'}};title.fill=fill('FF172D45');
    title.alignment={vertical:'middle'};sheet.getRow(1).height=38;
    for(let c=1;c<=width;c++)sheet.getColumn(c).width=c===1?(decision||decisionSummary?18:9):c===2?(decisionSummary?24:65):decision||decisionSummary?24:c===width?23:18;
    sheet.views=[{state:'frozen',xSplit:2,ySplit:headerRows+2}];
    sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:`1:${headerRows+2}`,printArea:`A1:${sheet.getColumn(width).letter}${sheet.rowCount}`};
    sheet.headerFooter={oddFooter:'&L'+name+'&Rหน้า &P / &N'};
    return sheet;
  }
  window.exportMeetingExcel=async button=>{
    if(window.meetingExcelExportBusy)return;
    window.meetingExcelExportBusy=true;
    const old=button?.innerHTML;
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='กำลังส่งออก…';}
    try {
      if(!window.ExcelJS||!window.collectMeetingExportTables)throw new Error('ระบบส่งออกยังไม่พร้อม กรุณารอโหลดข้อมูลแล้วลองอีกครั้ง');
      const tables=await window.collectMeetingExportTables();
      const workbook=new ExcelJS.Workbook();
      workbook.creator='P-Budget Manager';workbook.created=new Date();
      tables.forEach(table=>addTable(workbook,table));
      const data=await workbook.xlsx.writeBuffer();
      const url=URL.createObjectURL(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const link=document.createElement('a');link.href=url;link.download=`ประชุมงบประมาณ-${MEETING_YEAR}-${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(error){window.showMeetingSaveNotice?.('ส่งออก Excel ไม่สำเร็จ: '+error.message,true);}
    finally{window.meetingExcelExportBusy=false;if(button){button.innerHTML=old;button.disabled=false;button.removeAttribute('aria-busy');}}
  };
})();
