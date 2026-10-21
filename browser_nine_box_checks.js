<script>
window.addEventListener('load', async () => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  window.alert = message => { window.lastAlert = message; };
  window.confirm = () => true;
  try {
    for (let i = 0; i < 150 && !planReady; i++) await sleep(100);
    assert(planReady, document.getElementById('storageStatus').textContent);
    assert(planVersion === 1, 'legacy automatically migrated exactly once');
    assert(localStorage.getItem('budget_years_data'), 'legacy browser copy preserved');
    assert(projectsData[0].name === 'Offline project', 'legacy project rendered');
    const cell = document.querySelector('td[contenteditable="true"]');
    assert(cell, 'editable table cell rendered');
    cell.focus();
    cell.textContent = '12.345';
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'s', ctrlKey:true, bubbles:true}));
    assert(await flushPlan(), 'save edited amount');
    let saved = await planRequest('/api/nine-box');
    assert(saved.yearsData['2566'][0].items[0].bComm === 12.345, 'edit persisted');
    // A second load must use the DB, not overwrite with stale localStorage.
    await loadDataFromStorage();
    assert(projectsData[0].items[0].bComm === 12.345, 'database wins over old browser data');
    const before = JSON.stringify(saved.yearsData);
    const version = saved.version;
    assert(!await importPlan({'bad-year': []}), 'invalid import rejected');
    assert((await planRequest('/api/nine-box')).version === version, 'invalid import left DB untouched');
    window.confirm = () => false;
    assert(!await importPlan({'2569': []}), 'cancelled import');
    assert((await planRequest('/api/nine-box')).version === version, 'cancel left DB untouched');
    window.confirm = () => true;
    assert(await importPlan({'2569': []}), 'confirmed import');
    const backups = await planRequest('/api/nine-box/backups');
    const old = await planRequest(`/api/nine-box/backups/${backups[0].id}`);
    assert(JSON.stringify(old) === before, 'exact pre-import backup');
    assert(await importPlan(old), 'restore downloaded backup');
    // Exercise error/retry behavior without killing a real server.
    const originalFetch = window.fetch;
    window.fetch = (url, opts) => url === '/api/nine-box' && opts?.method === 'PUT'
      ? Promise.resolve(new Response(JSON.stringify({error:'test unavailable'}), {status:503}))
      : originalFetch(url, opts);
    updateValue(0, 0, 'bComm', '22.5');
    assert(!await flushPlan(), 'failed save reported');
    assert(!canLeaveNineBox(), 'unsaved navigation blocked');
    window.fetch = originalFetch;
    assert(await flushPlan(), 'retry saved');
    assert(canLeaveNineBox(), 'navigation allowed after save');
    assert(typeof ExcelJS.Workbook === 'function' && typeof saveAs === 'function', 'offline libraries loaded');
    let exported;
    window.saveAs = (blob, name) => { exported = {blob, name}; };
    await exportFullTableToExcel();
    assert(exported?.name.endsWith('.xlsx'), 'Excel produced');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await exported.blob.arrayBuffer());
    assert(book.worksheets.length === 1, 'valid Excel workbook');
    const cells = JSON.stringify(book.worksheets[0].getSheetValues());
    assert(cells.includes('Offline project') && cells.includes('22.5'), 'Excel contains project and edited amount');
    saved = await planRequest('/api/nine-box');
    await planRequest('/api/nine-box', 'PUT', {...saved, yearsData:{'2569':[]}, currentYear:'2569'});
    updateValue(0, 0, 'bComm', '99');
    assert(!await flushPlan(), 'stale editor rejected');
    assert((await planRequest('/api/nine-box')).currentYear === '2569', 'other window data preserved');
    assert(snapshotPlan().yearsData['2566'][0].items[0].bComm === 99, 'unsaved edits available for JSON export');
    document.body.dataset.testResult = 'PASS: migration, persistence, import validation/cancel/backup/restore, retry, conflict protection, offline Excel';
  } catch (error) {
    document.body.dataset.testResult = 'FAIL: ' + error.message;
  }
});
</script>
