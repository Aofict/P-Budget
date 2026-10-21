<script>
window.addEventListener('load', async () => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const originalFetch = window.fetch;
  const originalTimeout = window.setTimeout;
  let phase = 'initial';
  const panel = document.getElementById('nine-box-panel');
  const wait = async predicate => {
    for (let i = 0; i < 200; i++) {
      if (predicate()) return;
      await new Promise(resolve => originalTimeout(resolve, 50));
    }
    throw new Error('Timeout: ' + phase + ' / ' + panel.dataset.loadState + ' / ' + panel.textContent);
  };
  const mode = value => originalFetch('/__loader-mode', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({mode:value})});
  const retry = async () => {
    await mode('ok');
    panel.querySelector('button').click();
    await wait(() => panel.dataset.loadState === 'ready');
    assert(!document.getElementById('nine-box-frame').hidden, 'ready iframe visible');
    assert(panel.getAttribute('aria-busy') === 'false', 'ready not busy');
  };
  try {
    await window.appReady;
    await mode('missing-html');
    navigate('nine-box');
    assert(panel.dataset.loadState === 'loading', 'loading state shown immediately');
    await wait(() => panel.dataset.loadState === 'error');
    assert(panel.textContent.includes('ไม่พบไฟล์'), '404 explained');
    assert(!document.getElementById('nine-box-frame'), 'JSON error is not displayed in iframe');
    await retry();

    for (const failure of ['missing-script', 'missing-css', 'missing-vendor', 'api-error', 'wrong-content']) {
      phase = failure;
      await mode(failure);
      mountNineBox();
      await wait(() => panel.dataset.loadState === 'error');
      assert(!panel.querySelector('button').hidden, failure + ' has retry');
      await retry();
    }

    phase = 'network';
    window.fetch = (url, options) => url === '/nine-box-app/index.html'
      ? Promise.reject(new TypeError('Failed to fetch')) : originalFetch(url, options);
    mountNineBox();
    await wait(() => panel.dataset.loadState === 'error');
    assert(panel.textContent.includes('เชื่อมต่อโปรแกรมไม่ได้'), 'connection failure explained');
    window.fetch = originalFetch;
    await retry();

    phase = 'timeout';
    window.setTimeout = (fn, ms, ...args) => originalTimeout(fn, ms === 35000 ? 400 : ms, ...args);
    window.fetch = (url, options) => url === '/nine-box-app/index.html'
      ? new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
      : originalFetch(url, options);
    mountNineBox();
    await wait(() => panel.dataset.loadState === 'error');
    assert(panel.textContent.includes('นานเกินไป'), 'timeout explained');
    window.setTimeout = originalTimeout;
    window.fetch = originalFetch;
    await retry();

    phase = 'navigation';
    let release;
    window.fetch = (url, options) => url === '/nine-box-app/index.html'
      ? new Promise(resolve => { release = () => resolve(new Response('<div id="planEditor"></div>', {headers:{'Content-Type':'text/html'}})); })
      : originalFetch(url, options);
    mountNineBox();
    navigate('dashboard');
    release();
    await new Promise(resolve => originalTimeout(resolve, 100));
    assert(!panel.children.length, 'late response does not recreate an abandoned iframe');
    window.fetch = originalFetch;
    navigate('nine-box');
    await wait(() => panel.dataset.loadState === 'ready');
    document.body.dataset.testResult = 'PASS: loading, HTML/script/CSS/vendor failures, API error, invalid content, network failure, timeout, retry, navigation cancellation';
  } catch (error) {
    document.body.dataset.testResult = 'FAIL: ' + error.message;
  } finally {
    window.fetch = originalFetch;
    window.setTimeout = originalTimeout;
  }
});
</script>
