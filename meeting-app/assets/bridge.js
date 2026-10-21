/* Integration contract: one server, one Master DB, an isolated document per round. */
(() => {
  // Native alert dialogs can force the browser out of fullscreen.
  window.showMeetingSaveNotice = (message, isError = false) => {
    // The embedded dashboard grows to the table height. Its fixed bottom can be
    // far below the visible page, so use the outer viewport outside fullscreen.
    let noticeDocument = document;
    if (!document.fullscreenElement) {
      try {
        noticeDocument = window.top.document;
      } catch (_) {}
    }
    let notice = noticeDocument.getElementById('meeting-save-notice');
    if (!notice) {
      notice = noticeDocument.createElement('div');
      notice.id = 'meeting-save-notice';
    }
    const host = noticeDocument.fullscreenElement || noticeDocument.body;
    host.appendChild(notice);
    notice.setAttribute('role', isError ? 'alert' : 'status');
    notice.textContent = message;
    notice.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:2147483647;max-width:min(480px,calc(100vw - 48px));padding:14px 20px;border-radius:12px;background:${isError ? '#991b1b' : '#166534'};color:white;box-shadow:0 6px 24px #0003;white-space:pre-line;font:500 16px/1.5 sans-serif;pointer-events:none`;
    clearTimeout(window.meetingSaveNoticeTimer);
    window.meetingSaveNoticeTimer = setTimeout(
      () => notice.remove(),
      isError ? 12000 : 2000,
    );
  };
  const detail = location.pathname.endsWith('project_detail.html');
  if (detail) {
    document.querySelectorAll('#budget-project-overview .budget-meta-label').forEach((label) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'budget-overview-activate';
      button.setAttribute('aria-pressed', 'false');
      while (label.firstChild) button.appendChild(label.firstChild);
      label.appendChild(button);
    });
    document.addEventListener('click', (event) => {
      const line = event.target.closest('#budget-project-overview .budget-overview-line');
      if (!line) return;
      const wasActive = line.classList.contains('is-active');
      const editing = !!event.target.closest('input, textarea, select');
      if (wasActive && editing) return;
      document.querySelectorAll('#budget-project-overview .budget-overview-line.is-active').forEach((item) => {
        item.classList.remove('is-active');
        item.querySelector('.budget-overview-activate')?.setAttribute('aria-pressed', 'false');
      });
      if (!wasActive) {
        line.classList.add('is-active');
        line.querySelector('.budget-overview-activate')?.setAttribute('aria-pressed', 'true');
      }
    });
    const activateBudgetRow = (row, toggle = true) => {
      const wasActive = row.classList.contains('is-active');
      if (wasActive && !toggle) return;
      document.querySelectorAll('#budget-plan-body > tr.is-active').forEach((item) => {
        item.classList.remove('is-active');
        item.querySelector('.budget-row-activate')?.setAttribute('aria-pressed', 'false');
      });
      if (wasActive && toggle) return;
      row.querySelectorAll('input, textarea, select').forEach((input) => {
        const style = getComputedStyle(input);
        let background = style.backgroundColor;
        let surface = input;
        while (background === 'rgba(0, 0, 0, 0)' && surface.parentElement) {
          surface = surface.parentElement;
          background = getComputedStyle(surface).backgroundColor;
        }
        input.style.setProperty('--active-input-background', background);
        input.style.setProperty('--active-input-color', style.color);
      });
      row.classList.add('is-active');
      row.querySelector('.budget-row-activate')?.setAttribute('aria-pressed', 'true');
    };
    document.addEventListener('click', (event) => {
      const row = event.target.closest('#budget-plan-body > tr[data-budget-row-key]');
      if (row) activateBudgetRow(row, !event.target.closest('input, textarea, select'));
    });
    const activateInfoSection = (head) => {
      const card = head.closest('.info-section-card');
      if (!card) return;
      const wasActive = card.classList.contains('is-active');
      document.querySelectorAll('.info-section-card.is-active').forEach((item) => {
        item.classList.remove('is-active');
        item.querySelector('.info-section-head')?.setAttribute('aria-pressed', 'false');
      });
      if (!wasActive) {
        card.classList.add('is-active');
        head.setAttribute('aria-pressed', 'true');
      }
    };
    document.addEventListener('click', (event) => {
      const head = event.target.closest('.info-section-head');
      if (head) activateInfoSection(head);
    });
    document.addEventListener('keydown', (event) => {
      const head = event.target.closest('.info-section-head');
      if (!head || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      activateInfoSection(head);
    });
    document.querySelectorAll('.info-section-head').forEach((head) => {
      head.tabIndex = 0;
      head.setAttribute('role', 'button');
      head.setAttribute('aria-pressed', 'false');
    });
  }
  // Read the shared shell, including details opened in a nested presentation frame.
  let themeSource = document.body;
  try {
    themeSource = window.top.document.body;
  } catch (_) {}
  const applyChartTheme = (chart) => {
    const dark = document.documentElement.classList.contains('meeting-dark');
    const text = dark ? '#bdbdc5' : '#52647a';
    chart.options.color = text;
    if (chart.options.plugins?.legend?.labels)
      chart.options.plugins.legend.labels.color = text;
    for (const axis of Object.values(chart.options.scales || {})) {
      if (axis.ticks) axis.ticks.color = text;
      if (axis.title) axis.title.color = text;
      if (axis.grid) axis.grid.color = dark ? '#38383b' : '#e0e6ee';
    }
  };
  const syncTheme = () => {
    document.documentElement.classList.toggle(
      'meeting-dark',
      !themeSource.classList.contains('light'),
    );
    if (window.Chart)
      for (const chart of Object.values(Chart.instances || {})) {
        applyChartTheme(chart);
        chart.update('none');
      }
  };
  syncTheme();
  new MutationObserver(syncTheme).observe(themeSource, {
    attributes: true,
    attributeFilter: ['class'],
  });
  if (window.Chart)
    Chart.register({ id: 'meetingShellTheme', beforeUpdate: applyChartTheme });

  const embeddedInShell = window.frameElement?.id === 'meeting-workspace-frame';
  if (embeddedInShell && !detail)
    document.documentElement.classList.add('meeting-shell-dashboard');
  let loaded = false,
    failed = false,
    closed = false,
    dirty = false,
    saving = false;
  let documentVersion,
    fundsVersion = 0;
  const versions = new Map();
  const nativeFetch = window.fetch.bind(window);
  const post = (type, extra = {}) =>
    parent.postMessage(
      { type, meetingId: ROUND_ID, ...extra },
      location.origin,
    );
  let navigating = false;
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (
      !link ||
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      link.target
    )
      return;
    const target = new URL(link.href, location.href);
    if (
      target.origin === location.origin &&
      target.pathname !== location.pathname &&
      /\/(index|project_detail)\.html$/.test(target.pathname)
    ) {
      navigating = true;
      post('meeting-navigation-start');
    }
  });
  // Only the main workspace expands into the shell; presentation overlays keep their own viewport.
  if (window.frameElement?.id === 'meeting-workspace-frame') {
    document.documentElement.classList.add('meeting-single-scroll');
    let heightFrame = 0,
      lastHeight = 0;
    const reportHeight = () => {
      if (
        document.fullscreenElement ||
        document.body.classList.contains('presentation-mode') ||
        document.body.classList.contains('dashboard-fullscreen-fallback')
      )
        return;
      if (heightFrame) return;
      heightFrame = requestAnimationFrame(() => {
        heightFrame = 0;
        const height =
          Math.ceil(document.body.getBoundingClientRect().height) + 2;
        if (height !== lastHeight) {
          lastHeight = height;
          post('meeting-content-height', { height });
        }
      });
    };
    new ResizeObserver(reportHeight).observe(document.body);
    window.addEventListener('load', reportHeight);
    window.addEventListener('resize', reportHeight);
    document.addEventListener('fullscreenchange', reportHeight);
    new MutationObserver(reportHeight).observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
    document.fonts?.ready.then(reportHeight);
    reportHeight();
  }
  const setDirty = (value) => {
    dirty = value;
    post('meeting-dirty', { dirty: value });
  };
  window.meetingIsDirty = () =>
    dirty ||
    (!detail && hasUnsavedDashboardChanges) ||
    Boolean(
      document
        .getElementById('presentation-project-frame')
        ?.contentWindow?.meetingIsDirty?.(),
    );
  window.meetingWorkspaceReady = () =>
    !navigating &&
    !failed &&
    (detail ? loaded : Boolean(window.meetingInitialLoadComplete));
  window.meetingCanLeave = () =>
    !window.meetingIsDirty() ||
    confirm('มีข้อมูลประชุมที่ยังไม่บันทึก ต้องการละทิ้งการแก้ไขหรือไม่?');
  window.addEventListener('beforeunload', (e) => {
    if (window.meetingIsDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  const fail = (message) => {
    failed = true;
    let node = document.getElementById('integration-error');
    if (!node) {
      node = document.createElement('div');
      node.id = 'integration-error';
      node.setAttribute('role', 'alert');
      document.body.prepend(node);
    }
    node.replaceChildren(document.createTextNode(message + ' '));
    const retry = document.createElement('button');
    retry.textContent = 'โหลดใหม่';
    retry.onclick = () => location.reload();
    node.append(retry);
    enforce();
  };
  window.fetch = async (input, init = {}) => {
    const url = String(input);
    if (!url.startsWith(API_BASE_URL + '/api/'))
      return nativeFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    if (method !== 'GET' && (closed || failed))
      throw new Error(
        closed
          ? 'รอบประชุมปิดแล้ว อ่านได้อย่างเดียว'
          : 'โหลดข้อมูลไม่สำเร็จ กรุณาโหลดใหม่ก่อนบันทึก',
      );
    if (init.body && typeof init.body === 'string') {
      const data = JSON.parse(init.body);
      if (url.includes('/save-project')) data.version = documentVersion;
      if (url.includes('/dashboard-fund-sources/')) data.version = fundsVersion;
      if (
        ['PUT', 'DELETE'].includes(method) &&
        url.includes('/project-master/')
      )
        data.version = versions.get(decodeURIComponent(url.split('/').pop()));
      if (url.endsWith('/project-master/reorder'))
        data.versions = Object.fromEntries(versions);
      init = { ...init, body: JSON.stringify(data) };
    }
    let response, data;
    try {
      // Retry reads only. Never replay a save when its response is lost.
      const attempts = method === 'GET' && !init.signal ? 3 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timer =
          method === 'GET' && !init.signal
            ? setTimeout(() => controller.abort(), 10000)
            : null;
        try {
          response = await nativeFetch(input, {
            ...init,
            ...(method === 'GET' ? { cache: 'no-store' } : {}),
            ...(timer !== null ? { signal: controller.signal } : {}),
          });
          data = await response.clone().json();
          if (
            ![408, 429, 502, 503, 504].includes(response.status) ||
            attempt === attempts - 1
          )
            break;
        } catch (error) {
          if (attempt === attempts - 1 || init.signal?.aborted) throw error;
        } finally {
          clearTimeout(timer);
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 300 * (attempt + 1)),
        );
      }
    } catch (e) {
      if (method === 'GET') fail('เชื่อมต่อข้อมูลรอบประชุมไม่สำเร็จ');
      throw e;
    }
    if (!response.ok) {
      if (method === 'GET')
        fail(data.error || data.message || 'โหลดข้อมูลไม่สำเร็จ');
      return new Response(
        JSON.stringify({ ...data, message: data.error || data.message }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    if (url.includes('/get-project/')) {
      documentVersion = data.data?.version;
      loaded = Boolean(data.data);
      const select = document.getElementById('info-status'),
        status = data.data?.status;
      if (
        select &&
        status &&
        ![...select.options].some((o) => o.value === status)
      )
        select.add(new Option(status, status));
    }
    if (url.includes('/dashboard-fund-sources/')) {
      fundsVersion = data.version;

      // บันทึกตัวเลขการ์ดสำเร็จแล้ว -> ไม่ถือว่ามีข้อมูลค้าง
      if (method !== 'GET') {
        setDirty(false);

        if (!detail) {
          hasUnsavedDashboardChanges = false;
        }

        post('meeting-saved');
      }
    }
    if (method === 'GET' && /\/project-master(?:\?|$)/.test(url))
      for (const p of data.data || []) versions.set(p.code, p.version);
    if (url.endsWith('/save-project')) {
      documentVersion = data.version;
      setDirty(false);
      post('meeting-saved');
    }
    return response;
  };

  loadCycleConfig = async () => {
    const r = await fetch(API_BASE_URL + '/api/config');
    if (!r.ok) throw new Error('อ่านรอบประชุมไม่สำเร็จ');
    const cfg = await r.json();
    closed = cfg.read_only;
    if (detail) applyCycleConfig(cfg);
    else {
      MEETING_YEAR = cfg.meeting_year;
      CHANGE_YEAR = cfg.change_budget_year;
      SET_YEAR = cfg.set_budget_year;
      PLAN_YEARS = cfg.plan_years;
      applyCycleLabels();
      document.querySelectorAll('[data-future-offset]').forEach((button) => {
        const offset = Number(button.dataset.futureOffset);
        button.textContent = `สรุปปี ${SET_YEAR + offset}${offset === 4 ? '–สิ้นสุดโครงการ' : ''}`;
      });
    }
    enforce();
  };
  const exportRound = () => {
    const a = document.createElement('a');
    a.href = API_BASE_URL + '/api/export';
    a.download = '';
    document.body.append(a);
    a.click();
    a.remove();
  };
  if (!detail) {
    // Modals inside the auto-height iframe must use the visible shell viewport.
    const modals = [...document.querySelectorAll('.app-modal')];
    let modalLock = null;
    const positionModals = () => {
      const open = modals.filter((modal) => modal.classList.contains('show'));
      if (open.length && !modalLock) {
        const documents = [document];
        if (embeddedInShell && !document.fullscreenElement)
          documents.push(parent.document);
        modalLock = documents
          .flatMap((doc) => [doc.documentElement, doc.body])
          .map((el) => ({
            el,
            overflow: el.style.getPropertyValue('overflow'),
            priority: el.style.getPropertyPriority('overflow'),
          }));
        modalLock.forEach(({ el }) =>
          el.style.setProperty('overflow', 'hidden', 'important'),
        );
      } else if (!open.length && modalLock) {
        modalLock.forEach(({ el, overflow, priority }) =>
          el.style.setProperty('overflow', overflow, priority),
        );
        modalLock = null;
      }
      let top = 0,
        height = window.innerHeight;
      if (embeddedInShell && !document.fullscreenElement) {
        const rect = window.frameElement.getBoundingClientRect();
        const header = parent.document.querySelector('.workspace > header');
        const visibleTop = Math.max(
          0,
          header?.getBoundingClientRect().bottom || 0,
          rect.top,
        );
        top = Math.max(0, visibleTop - rect.top);
        height = Math.max(
          120,
          Math.min(parent.innerHeight, rect.bottom) - visibleTop,
        );
      }
      for (const modal of open) {
        modal.style.top = `${top}px`;
        modal.style.bottom = 'auto';
        modal.style.height = `${height}px`;
        modal.style.boxSizing = 'border-box';
        const card = modal.querySelector('.app-modal-card');
        if (card) card.style.maxHeight = `${Math.max(80, height - 32)}px`;
      }
    };
    const modalObserver = new MutationObserver(positionModals);
    modals.forEach((modal) =>
      modalObserver.observe(modal, {
        attributes: true,
        attributeFilter: ['class'],
      }),
    );
    window.addEventListener('resize', positionModals);
    document.addEventListener('fullscreenchange', positionModals);
    if (embeddedInShell) {
      parent.addEventListener('resize', positionModals);
      parent.addEventListener('scroll', positionModals, { passive: true });
    }
    window.addEventListener('pagehide', () => {
      modalLock?.forEach(({ el, overflow, priority }) =>
        el.style.setProperty('overflow', overflow, priority),
      );
      if (embeddedInShell) {
        parent.removeEventListener('resize', positionModals);
        parent.removeEventListener('scroll', positionModals);
      }
    });
    // Keep the embedded page from shrinking and clamping the shell's scroll
    // position when switching to a shorter panel or an asynchronous loading state.
    const preserveTabHeight = (card) => {
      if (document.fullscreenElement === card) return;
      const height = card.getBoundingClientRect().height;
      card.style.boxSizing = 'border-box';
      card.style.minHeight = `${Math.ceil(height)}px`;
    };
    const summaryCard = document.getElementById('summary-table-fullscreen');
    const resultTab = document.createElement('button');
    resultTab.type = 'button';
    resultTab.className = 'summary-table-tab';
    resultTab.setAttribute('aria-controls', 'decision-project-panel');
    resultTab.textContent = 'ผลการพิจารณา';
    const summaryTabs = summaryCard.querySelector('.summary-table-tabs');
    const fullscreenButton = summaryTabs.querySelector('#summary-fullscreen-btn');
    fullscreenButton?.remove();
    summaryTabs.classList.add('summary-tabs-grouped');
    const primaryTabs = document.createElement('div');
    primaryTabs.className = 'summary-tab-group summary-tab-group-primary';
    primaryTabs.setAttribute('role', 'group');
    primaryTabs.setAttribute('aria-label', 'จัดการงบประมาณและผลการพิจารณา');
    primaryTabs.append(...summaryTabs.children, resultTab);
    const annualTabs = document.createElement('div');
    annualTabs.className = 'summary-tab-group summary-tab-group-annual';
    annualTabs.setAttribute('role', 'group');
    annualTabs.setAttribute('aria-label', 'สรุปรายปี');
    const utilityTabs = document.createElement('div');
    utilityTabs.className = 'summary-tab-group summary-tab-group-utility';
    utilityTabs.setAttribute('role', 'group');
    utilityTabs.setAttribute('aria-label', 'การแสดงผล');
    if (fullscreenButton) utilityTabs.append(fullscreenButton);
    summaryTabs.append(primaryTabs, annualTabs, utilityTabs);
    const resultPanel = document.createElement('section');
    resultPanel.id = 'decision-project-panel';
    resultPanel.className = 'decision-project-panel';
    resultPanel.hidden = true;
    summaryCard.append(resultPanel);
    const futurePanel = document.createElement('section');
    futurePanel.className = 'future-summary-panel';
    futurePanel.id = 'future-summary-panel';
    futurePanel.hidden = true;
    summaryCard.append(futurePanel);
    const futureTabs = [];
    let futureOffset = null,
      futureRequest = 0;
    for (const offset of [-2, -1, 0, 1, 2, 3, 4]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'summary-table-tab';
      button.dataset.futureOffset = offset;
      button.textContent = `สรุปปี ${SET_YEAR + offset}${offset === 4 ? '–สิ้นสุดโครงการ' : ''}`;
      button.onclick = () => switchSummaryTable(`future-${offset}`);
      annualTabs.append(button);
      futureTabs.push(button);
    }
    async function refreshFutureSummary(exportOptions) {
      const exporting = Boolean(exportOptions?.target);
      const futurePanel = exporting
        ? exportOptions.target
        : document.getElementById('future-summary-panel');
      if (futureOffset === null && !exporting) return;
      const ticket = exporting ? futureRequest : ++futureRequest,
        offset = exporting ? exportOptions.offset : futureOffset,
        year = SET_YEAR + offset;
      const label = `${year}${offset === 4 ? '–สิ้นสุดโครงการ' : ''}`;
      futurePanel.textContent = 'กำลังโหลดสรุป…';
      try {
        const responses = await Promise.all([
          fetch(
            `${API_BASE_URL}/api/dashboard/${year}?meeting_year=${MEETING_YEAR}&include_inactive=1`,
          ),
          fetch(`${API_BASE_URL}/api/project-master`),
        ]);
        const [dashboard, master] = await Promise.all(
          responses.map((r) => r.json()),
        );
        if (responses.some((r) => !r.ok))
          throw new Error(
            dashboard.message || master.message || 'โหลดสรุปไม่สำเร็จ',
          );
        if (!exporting && (ticket !== futureRequest || offset !== futureOffset))
          return;
        const byCode = new Map(
          (dashboard.data || []).map((row) => [String(row.code), row]),
        );
        // Empty plan years contain calculated zeroes; those do not make a project eligible.
        // Check source amounts separately so reductions cannot cancel out the plan.
        const hasYearPlan = (project) => {
          const row = byCode.get(String(project.code));
          return (
            row &&
            [
              'budget_before',
              'budget_change_before',
              'budget_change',
              'operating_budget_before',
              'operating_budget_after',
              'cabinet_target',
              'disbursement_before',
              'disbursement_after',
            ].some((key) => Number(row[key] || 0) !== 0)
          );
        };
        const projects = (master.data || [])
          .filter((p) => Number(p.is_active ?? 1) === 1 && hasYearPlan(p))
          .sort(
            (a, b) =>
              (Number(a.display_order) || 0) - (Number(b.display_order) || 0) ||
              Number(a.id) - Number(b.id),
          );
        const heading = document.createElement('h3');
        heading.textContent = `สรุปงบลงทุนโครงการ ปี ${label}`;
        const note = document.createElement('p');
        note.className = 'text-muted';
        note.textContent =
          'ข้อมูลจากแผนงบประมาณของแต่ละโครงการ · หน่วย: ล้านบาท';
        const wrap = document.createElement('div');
        wrap.className = 'table-responsive';
        const table = document.getElementById('projectTable').cloneNode(true);
        table.removeAttribute('id');
        // Annual summaries retain three operating columns regardless of the
        // expanded set-budget table used as their visual template.
        const budgetGroup = table.querySelector('.th-group-budget');
        budgetGroup.colSpan = 3;
        Array.from(table.querySelectorAll('.th-budget')).slice(3).forEach(header => header.remove());
        const columns = table.querySelectorAll('colgroup col');
        if (columns.length === 11) {
          columns[8].remove();
          columns[7].remove();
        }
        table.querySelector('.th-group-budget').textContent =
          `วงเงินดำเนินการ ปี ${label}`;
        table.querySelector('.th-group-estimate').textContent =
          `เป้าหมายเบิกจ่าย ปี ${label}`;
        const budgetHeaders = table.querySelectorAll('.th-budget');
        budgetHeaders[0].innerHTML =
          'ผูกพัน<br><span class="sub-formula header-formula">(1)</span>';
        budgetHeaders[1].innerHTML =
          'ลงทุน<br><span class="sub-formula header-formula">(2)</span>';
        budgetHeaders[2].innerHTML =
          'รวม<br><span class="sub-formula header-formula">(3)=(1)+(2)</span>';
        const estimateHeaders = table.querySelectorAll('.th-estimate');
        estimateHeaders[0].innerHTML =
          'ตาม ผอ. โครงการ<br><span class="sub-formula">(ก่อนประชุม)<span class="header-formula">(4)</span></span>';
        estimateHeaders[1].innerHTML =
          'เพิ่ม(ลด)<br><span class="sub-formula header-formula">(5)</span>';
        table.querySelectorAll('.th-estimate')[2].innerHTML =
          'หลังประชุม<br><span class="sub-formula">เป้าหมายล่าสุด<span class="header-formula">(6)=(4)+(5)</span></span>';
        table
          .querySelectorAll('[id]')
          .forEach((node) => node.removeAttribute('id'));
        const body = table.querySelector('tbody');
        body.replaceChildren();
        const number = (value) =>
          Number(value || 0).toLocaleString('en-US', {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
          });
        const totals = Array(6).fill(0);
        const addTotal = (title, values, grand = false) => {
          const row = body.insertRow();
          row.className = grand ? 'row-grand-total' : 'row-summary';
          const cell = row.insertCell();
          cell.colSpan = 2;
          cell.textContent = title;
          cell.style.textAlign = 'right';
          values.forEach((value, index) => {
            const cell = row.insertCell();
            if (index === 4) cell.innerHTML = formatSummaryChange(value);
            else cell.textContent = number(value);
            cell.style.textAlign = 'right';
          });
          row.insertCell();
          return row;
        };
        for (const [index, title, isNew] of [
          [1, 'โครงการต่อเนื่อง', false],
          [2, 'โครงการใหม่', true],
        ]) {
          const header = body.insertRow();
          header.className = 'row-section-header';
          header.dataset.summaryGroup = isNew ? 'new' : 'continuing';
          header.insertCell().textContent = index;
          const titleCell = header.insertCell();
          titleCell.colSpan = 8;
          titleCell.textContent = `${index}. ${title}`;
          const group = projects.filter(
            (p) => (p.summary_group === 'new_project') === isNew,
          );
          const subtotal = Array(6).fill(0);
          group.forEach((project, i) => {
            const data = byCode.get(String(project.code)) || {};
            const investment = Number(data.budget_after || 0);
            const operating = Number(data.operating_budget_after || 0);
            const values = [
              operating - investment,
              investment,
              operating,
              data.disbursement_before,
              data.disbursement_change,
              data.disbursement_after,
            ];
            const row = body.insertRow();
            row.className = 'project-item-row';
            row.insertCell().textContent = `${index}.${i + 1}`;
            const link = document.createElement('a');
            link.className = 'project-link project-name-main';
            link.textContent = project.name;
            link.href = `project_detail.html?id=${encodeURIComponent(project.code)}&meeting_year=${MEETING_YEAR}`;
            link.onclick = (event) =>
              openProjectFromSummary(event, project.code, project.name);
            row.insertCell().append(link);
            values.forEach((value, j) => {
              const cell = row.insertCell();
              cell.textContent = number(value);
              cell.style.textAlign = 'right';
              subtotal[j] += Number(value || 0);
            });
            row.insertCell().textContent = data.owner || project.owner || '';
          });
          if (!group.length) {
            const cell = body.insertRow().insertCell();
            cell.colSpan = 9;
            cell.textContent = 'ไม่มีโครงการ';
          }
          addTotal(`รวม${title}`, subtotal).dataset.summaryGroup = isNew ? 'new' : 'continuing';
          subtotal.forEach((value, j) => (totals[j] += value));
        }
        addTotal('รวมทุกโครงการ', totals, true);
        wrap.append(table);
        const toolbar = document.createElement('div');
        toolbar.className = 'future-summary-toolbar';
        const headingGroup = document.createElement('div');
        headingGroup.append(heading, note);
        toolbar.append(headingGroup);
        futurePanel.replaceChildren(toolbar, wrap);
      } catch (error) {
        if (exporting) throw error;
        if (ticket !== futureRequest) return;
        futurePanel.textContent = error.message;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'ลองใหม่';
        retry.onclick = refreshFutureSummary;
        futurePanel.append(retry);
      }
    }
    window.addEventListener('message', (event) => {
      if (
        event.origin === location.origin &&
        event.source ===
          document.getElementById('presentation-project-frame')
            ?.contentWindow &&
        event.data?.type === 'meeting-saved' &&
        futureOffset !== null
      )
        refreshFutureSummary();
    });
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('meeting-budget-sync-' + ROUND_ID);
      channel.addEventListener('message', (event) => {
        if (event.data?.type === 'project-saved' && futureOffset !== null)
          refreshFutureSummary();
      });
    }
    window.collectMeetingExportTables = async () => {
      if (!dashboardReady || dashboardSyncInProgress || failed)
        throw new Error('กรุณารอให้ข้อมูลตารางโหลดครบก่อนส่งออก');
      const tables = [
        {
          name: `เปลี่ยนแปลงงบ ${CHANGE_YEAR}`,
          table: document.getElementById('changeSummaryTable').cloneNode(true),
        },
        {
          name: `ตั้งงบ ${SET_YEAR}`,
          table: document.getElementById('projectTable').cloneNode(true),
        },
      ];
      for (const offset of [-2, -1, 0, 1, 2, 3, 4]) {
        const target = document.createElement('div');
        await refreshFutureSummary({ offset, target });
        tables.push({
          name: `สรุปปี ${SET_YEAR + offset}${offset === 4 ? '–สิ้นสุดโครงการ' : ''}`,
          table: target.querySelector('table'),
        });
      }
      const response = await fetch(API_BASE_URL + '/api/project-master');
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || 'โหลดผลการพิจารณาไม่สำเร็จ');
      const years = [
        [CHANGE_YEAR, 'show_change_summary'],
        [SET_YEAR, 'show_set_summary'],
      ];
      const annualAmounts = await Promise.all(
        years.map(async ([year]) => {
          const annualResponse = await fetch(
            `${API_BASE_URL}/api/dashboard/${year}?meeting_year=${MEETING_YEAR}`,
          );
          const annualResult = await annualResponse.json();
          if (!annualResponse.ok)
            throw new Error(annualResult.message || `โหลดวงเงินปี ${year} ไม่สำเร็จ`);
          return new Map(
            (annualResult.data || []).map((row) => [String(row.code), row]),
          );
        }),
      );
      const makeTable = (headers) => {
        const table = document.createElement('table');
        const head = table.createTHead().insertRow();
        headers.forEach((title) => {
          head.insertCell().textContent = title;
        });
        return table;
      };
      const addValues = (body, values, countColumn = -1) => {
        const row = body.insertRow();
        values.forEach((value, index) => {
          const cell = row.insertCell();
          if (index === countColumn) cell.dataset.exportCount = '1';
          cell.textContent = typeof value === 'number' && index >= 3
            ? value.toFixed(3)
            : String(value ?? '');
        });
      };
      const summaryTable = makeTable([
        'ปีงบประมาณ', 'ผลการพิจารณา', 'จำนวนโครงการ',
        'วงเงินหลังประชุม', 'วงเงินเพิ่ม', 'วงเงินลด',
        'เป้าเบิกจ่ายหลังประชุม', 'เป้าเพิ่ม', 'เป้าลด',
      ]);
      const summaryBody = summaryTable.createTBody();
      const detailTable = makeTable([
        'ปีงบประมาณ', 'โครงการ', 'ผลการพิจารณา',
        'วงเงินหลังประชุม', 'วงเงินเพิ่ม', 'วงเงินลด',
        'เป้าเบิกจ่ายหลังประชุม', 'เป้าเพิ่ม', 'เป้าลด', 'ผู้รับผิดชอบ',
      ]);
      const detailBody = detailTable.createTBody();
      const statuses = ['เห็นชอบ', 'ไม่เห็นชอบ', 'ทบทวน', 'รอผลการพิจารณา'];
      const groups = new Map();
      for (const [year, field] of [
        [CHANGE_YEAR, 'show_change_summary'],
        [SET_YEAR, 'show_set_summary'],
      ]) {
        const amounts = annualAmounts[year === CHANGE_YEAR ? 0 : 1];
        for (const project of (result.data || []).filter(
          (p) => Number(p.is_active ?? 1) === 1 && Number(p[field] ?? 1) === 1,
        )) {
          const amount = amounts.get(String(project.code));
          if (!amount)
            throw new Error(`ไม่พบข้อมูลวงเงินของโครงการ ${project.code} ปี ${year}`);
          const status = statuses.includes(project.meeting_decision)
            ? project.meeting_decision
            : 'รอผลการพิจารณา';
          const budgetAfter = Number(amount.budget_after || 0);
          const budgetDelta = Number(amount.operating_budget_after || 0) -
            Number(amount.operating_budget_before || 0);
          const targetAfter = Number(amount.disbursement_after || 0);
          const targetDelta = Number(amount.disbursement_change || 0);
          const values = [
            budgetAfter, Math.max(0, budgetDelta), Math.max(0, -budgetDelta),
            targetAfter, Math.max(0, targetDelta), Math.max(0, -targetDelta),
          ];
          addValues(detailBody, [
            year, project.name || project.code, status,
            ...values, project.owner || '',
          ]);
          const key = `${year}:${status}`;
          const group = groups.get(key) || { count: 0, totals: Array(6).fill(0) };
          group.count += 1;
          values.forEach((value, index) => { group.totals[index] += value; });
          groups.set(key, group);
        }
      }
      for (const [year] of years) {
        const yearTotal = { count: 0, totals: Array(6).fill(0) };
        for (const status of statuses) {
          const group = groups.get(`${year}:${status}`) || {
            count: 0, totals: Array(6).fill(0),
          };
          addValues(summaryBody, [year, status, group.count, ...group.totals], 2);
          yearTotal.count += group.count;
          group.totals.forEach((value, index) => { yearTotal.totals[index] += value; });
        }
        addValues(summaryBody, [year, 'รวม', yearTotal.count, ...yearTotal.totals], 2);
      }
      tables.push({ name: 'สรุปผลการพิจารณา', table: summaryTable });
      tables.push({ name: 'ผลการพิจารณา', table: detailTable });
      return tables;
    };
    let resultRequest = 0;
    async function refreshDecisionProjects() {
      const ticket = ++resultRequest;
      preserveTabHeight(summaryCard);
      resultPanel.textContent = 'กำลังโหลดผลการพิจารณา…';
      try {
        const response = await fetch(API_BASE_URL + '/api/project-master');
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message || 'โหลดผลการพิจารณาไม่สำเร็จ');
        const annualAmounts = await Promise.all(
          [CHANGE_YEAR, SET_YEAR].map(async (year) => {
            const response = await fetch(
              `${API_BASE_URL}/api/dashboard/${year}?meeting_year=${MEETING_YEAR}`,
            );
            const data = await response.json();
            if (!response.ok)
              throw new Error(
                data.message || 'โหลดวงเงินผลการพิจารณาไม่สำเร็จ',
              );
            return new Map(
              (data.data || []).map((row) => [String(row.code), row]),
            );
          }),
        );
        const money = (value) =>
          Number(value).toLocaleString('en-US', {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
          });
        const signed = (value) => (value > 0 ? '+' : '') + money(value);
        if (ticket !== resultRequest) return;
        resultPanel.replaceChildren();
        const panelHead = document.createElement('header');
        panelHead.className = 'decision-panel-head';
        const panelTitle = document.createElement('div');
        const heading = document.createElement('h2');
        heading.className = 'decision-eyebrow';
        heading.textContent = 'ผลการพิจารณา';
        panelTitle.append(heading);
        const allProjects = (result.data || []).filter(
          (p) => Number(p.is_active ?? 1) === 1,
        );
        const displayedProjects = allProjects.filter(
          (p) =>
            Number(p.show_change_summary ?? 1) === 1 ||
            Number(p.show_set_summary ?? 1) === 1,
        );
        const decided = displayedProjects.filter((p) =>
          ['เห็นชอบ', 'ไม่เห็นชอบ', 'ทบทวน'].includes(p.meeting_decision),
        ).length;
        const summary = document.createElement('div');
        summary.className = 'decision-overall-count';
        const summaryValue = document.createElement('strong');
        summaryValue.textContent = `${decided}/${displayedProjects.length}`;
        const summaryLabel = document.createElement('span');
        summaryLabel.textContent = 'โครงการมีผลพิจารณา';
        summary.append(summaryValue, summaryLabel);
        panelHead.append(panelTitle, summary);
        resultPanel.append(panelHead);
        const yearsGrid = document.createElement('div');
        yearsGrid.className = 'decision-years-grid';
        resultPanel.append(yearsGrid);
        for (const [title, field] of [
          [`เปลี่ยนแปลงงบประมาณปี ${CHANGE_YEAR}`, 'show_change_summary'],
          [`ตั้งงบประมาณประจำปี ${SET_YEAR}`, 'show_set_summary'],
        ]) {
          const section = document.createElement('section');
          section.className = 'decision-year-section';
          const eligible = allProjects.filter(
            (p) => Number(p[field] ?? 1) === 1,
          );
          const amountRows =
            annualAmounts[field === 'show_change_summary' ? 0 : 1];
          const amounts = (project) => {
            const row = amountRows.get(String(project.code));
            if (!row)
              throw new Error('ไม่พบข้อมูลวงเงินของโครงการ ' + project.code);
            return [
              Number(row.budget_after || 0),
              Number(row.operating_budget_after || 0) -
                Number(row.operating_budget_before || 0),
              Number(row.disbursement_after || 0),
              Number(row.disbursement_change || 0),
            ];
          };
          const pending = eligible.filter(
            (p) =>
              !['เห็นชอบ', 'ไม่เห็นชอบ', 'ทบทวน'].includes(p.meeting_decision),
          ).length;
          const yearHead = document.createElement('header');
          yearHead.className = 'decision-year-head';
          const yearHeading = document.createElement('h2');
          yearHeading.textContent = title;
          const yearMeta = document.createElement('div');
          yearMeta.className = 'decision-year-meta';
          const yearCount = document.createElement('span');
          yearCount.className = 'decision-year-count';
          yearCount.textContent = `${eligible.length} โครงการ`;
          yearMeta.append(yearCount);
          if (pending) {
            const pendingCount = document.createElement('span');
            pendingCount.className = 'decision-pending-count';
            pendingCount.textContent = `รอผล ${pending}`;
            yearMeta.append(pendingCount);
          }
          yearHead.append(yearHeading, yearMeta);
          section.append(yearHead);
          const groups = document.createElement('div');
          groups.className = 'decision-groups';
          for (const [label, tone, symbol] of [
            ['เห็นชอบ', 'approved', '✓'],
            ['ไม่เห็นชอบ', 'rejected', '×'],
            ['ทบทวน', 'review', '↻'],
          ]) {
            const projects = eligible.filter(
              (p) => p.meeting_decision === label,
            );
            const group = document.createElement('section');
            group.className = `decision-project-group decision-${tone}`;
            const groupHead = document.createElement('header');
            groupHead.className = 'decision-group-head';
            const icon = document.createElement('span');
            icon.className = 'decision-group-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = symbol;
            const groupTitle = document.createElement('div');
            const groupHeading = document.createElement('h3');
            groupHeading.textContent = label;
            const groupCount = document.createElement('strong');
            groupCount.textContent = `${projects.length} โครงการ`;
            groupCount.setAttribute('aria-label', `${projects.length} โครงการ`);
            groupTitle.append(groupHeading, groupCount);
            groupHead.append(icon, groupTitle);
            group.append(groupHead);
            if (label === 'เห็นชอบ') {
              const totals = projects.reduce(
                (sum, project) =>
                  amounts(project).map((value, i) => sum[i] + value),
                [0, 0, 0, 0],
              );
              const metrics = document.createElement('dl');
              metrics.className = 'decision-money-summary';
              ['วงเงินดำเนินการ (ลงทุน)', 'เพิ่ม/ลด', 'เป้าหมายการเบิกจ่ายรวม', 'เพิ่ม/ลด'].forEach(
                (title, i) => {
                  const block = document.createElement('div'),
                    term = document.createElement('dt'),
                    value = document.createElement('dd');
                  term.textContent = title;
                  value.textContent =
                    i % 2 ? signed(totals[i]) : money(totals[i]);
                  if (i % 2) {
                    term.title =
                      'เพิ่ม/ลด' +
                      (i === 1 ? 'วงเงินดำเนินการ (ลงทุน)' : 'เป้าหมายการเบิกจ่ายรวม') +
                      'จากก่อนประชุม';
                    const delta = Math.round(totals[i] * 1000) / 1000;
                    value.textContent = signed(delta);
                    value.classList.add('decision-delta');
                    value.classList.toggle('is-increase', delta > 0);
                    value.classList.toggle('is-decrease', delta < 0);
                  }
                  block.append(term, value);
                  metrics.append(block);
                },
              );
              group.append(metrics);
            }
            if (!projects.length) {
              const empty = document.createElement('p');
              empty.className = 'decision-empty';
              empty.textContent = 'ยังไม่มีโครงการในสถานะนี้';
              group.append(empty);
            } else {
              const toggle = document.createElement('button');
              toggle.type = 'button';
              toggle.className = 'decision-list-toggle';

              toggle.textContent = 'เปิดรายการ';
              toggle.setAttribute('aria-label', `เปิดรายการ${label} ${projects.length} โครงการ`);
              toggle.title = `เปิดรายการโครงการ${label}`;
              const buildGroupedLists = (targetDocument, onProjectClick) => {
                const showChanges = label === 'เห็นชอบ';
                const columnCount = showChanges ? 6 : 4;
                const grouped = targetDocument.createElement('div');
                grouped.className = 'decision-grouped-lists';
                const appendTotal = (section, caption, items, grand = false) => {
                  const totals = items.reduce((sum, project) =>
                    amounts(project).map((value, i) => sum[i] + Math.round(value * 1000)), [0, 0, 0, 0]);
                  const row = section.insertRow();
                  row.className = grand ? 'decision-grand-total' : 'decision-subtotal';
                  const heading = targetDocument.createElement('th');
                  heading.scope = 'row'; heading.colSpan = 2; heading.textContent = caption;
                  row.append(heading);
                  totals.forEach((total, i) => {
                    if (!showChanges && i % 2) return;
                    const value = total / 1000;
                    const cell = row.insertCell();
                    cell.className = 'decision-table-money';
                    cell.textContent = i % 2 ? signed(value) : money(value);
                    if (i % 2) {
                      cell.classList.add('decision-delta');
                      cell.classList.toggle('is-increase', value > 0);
                      cell.classList.toggle('is-decrease', value < 0);
                    }
                  });
                };
                const scroll = targetDocument.createElement('div');
                scroll.className = 'decision-project-table-scroll';
                scroll.tabIndex = 0;
                scroll.setAttribute('role', 'region');
                scroll.setAttribute('aria-label', 'รายการโครงการ หน่วย: ล้านบาท');
                const table = targetDocument.createElement('table');
                table.className = 'du-table decision-project-table';
                table.classList.toggle('decision-table-no-deltas', !showChanges);
                const header = table.createTHead().insertRow();
                ['ลำดับ', 'โครงการ', 'วงเงินดำเนินการ (ลงทุน)', 'เพิ่ม/ลด', 'เป้าหมายการเบิกจ่าย', 'เพิ่ม/ลด'].filter((_, i) => showChanges || ![3, 5].includes(i)).forEach(title => {
                  const th = targetDocument.createElement('th');
                  th.scope = 'col'; th.textContent = title; header.append(th);
                });
                for (const [groupName, isMatch] of [
                  ['โครงการต่อเนื่อง', project => project.summary_group !== 'new_project'],
                  ['โครงการใหม่', project => project.summary_group === 'new_project'],
                ]) {
                  const members = projects.filter(isMatch);
                  const body = table.createTBody();
                  const groupRow = body.insertRow();
                  groupRow.className = 'decision-table-group';
                  const groupHeading = targetDocument.createElement('th');
                  groupHeading.scope = 'rowgroup';
                  groupHeading.colSpan = columnCount;
                  groupHeading.textContent = groupName + ' (' + members.length + ' โครงการ)';
                  groupRow.append(groupHeading);
                  members.forEach((project, index) => {
                    const row = body.insertRow();
                    row.insertCell().textContent = index + 1;
                    const link = targetDocument.createElement('a');
                    link.textContent = project.name || project.code;
                    link.href = new URL('project_detail.html?id=' + encodeURIComponent(project.code) + '&meeting_year=' + MEETING_YEAR, location.href).href;
                    if (onProjectClick) link.addEventListener('click', event => onProjectClick(event, project));
                    row.insertCell().append(link);
                    amounts(project).forEach((amount, i) => {
                      if (!showChanges && i % 2) return;
                      const cell = row.insertCell();
                      cell.className = 'decision-table-money';
                      if (i % 2) {
                        const rounded = Math.round(amount * 1000) / 1000;
                        cell.textContent = signed(rounded);
                        cell.classList.add('decision-delta');
                        cell.classList.toggle('is-increase', rounded > 0);
                        cell.classList.toggle('is-decrease', rounded < 0);
                      } else cell.textContent = money(amount);
                    });
                  });
                  if (!members.length) {
                    const empty = body.insertRow().insertCell();
                    empty.colSpan = columnCount; empty.className = 'decision-table-empty';
                    empty.textContent = 'ยังไม่มีโครงการ';
                  }
                  appendTotal(body, 'รวม' + groupName, members);
                }
                appendTotal(table.createTFoot(), 'รวมทั้งหมด (' + projects.length + ' โครงการ)', projects, true);
                scroll.append(table);
                grouped.append(scroll);
                return grouped;
              };

              toggle.addEventListener('click', () => {
                if (document.fullscreenElement === summaryCard) {
                  const overlay = document.createElement('div');
                  overlay.className = 'decision-list-overlay';
                  overlay.setAttribute('role', 'dialog');
                  overlay.setAttribute('aria-modal', 'true');
                  const card = document.createElement('div');
                  card.className = 'decision-list-dialog';
                  const header = document.createElement('div');
                  header.className = 'decision-list-dialog-head';
                  const heading = document.createElement('h2');
                  heading.id = `decision-dialog-title-${field}-${tone}`;
                  heading.textContent = `${label} ${projects.length} โครงการ`;
                  overlay.setAttribute('aria-labelledby', heading.id);
                  const closeButton = document.createElement('button');
                  closeButton.type = 'button';
                  closeButton.className = 'decision-list-dialog-close';
                  closeButton.textContent = 'ปิด';
                  closeButton.setAttribute('aria-label', 'ปิดรายการโครงการ');
                  header.append(heading, closeButton);
                  const subtitle = document.createElement('p');
                  subtitle.textContent = title + ' · หน่วย: ล้านบาท';
                  let groupedList;
                  const close = () => {
                    overlay.remove();
                    document.removeEventListener('keydown', onKeydown);
                    document.removeEventListener('fullscreenchange', onFullscreenChange);
                    if (toggle.isConnected) toggle.focus();
                  };
                  const onKeydown = (event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      close();
                    } else if (event.key === 'Tab') {
                      const links = [...groupedList.querySelectorAll('a[href]')];
                      const first = closeButton;
                      const last = links.at(-1) || closeButton;
                      if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault();
                        last.focus();
                      } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault();
                        first.focus();
                      }
                    }
                  };
                  const onFullscreenChange = () => {
                    if (document.fullscreenElement !== summaryCard) close();
                  };
                  groupedList = buildGroupedLists(document, (event, project) => {
                    close();
                    openProjectFromSummary(event, project.code, project.name || '');
                  });
                  closeButton.addEventListener('click', close);
                  overlay.addEventListener('click', (event) => {
                    if (event.target === overlay) close();
                  });
                  document.addEventListener('keydown', onKeydown);
                  document.addEventListener('fullscreenchange', onFullscreenChange);
                  card.append(header, subtitle, groupedList);
                  overlay.append(card);
                  summaryCard.append(overlay);
                  closeButton.focus();
                  return;
                }
                const popup = window.open(
                  '',
                  `decision-projects-${field}-${tone}`,
                  'width=1150,height=800,resizable=yes,scrollbars=yes',
                );

                if (!popup) {
                  alert('กรุณาอนุญาต Pop-up สำหรับโปรแกรมนี้');
                  return;
                }

                popup.document.title = `${label} — ${title}`;
                const charset = popup.document.createElement('meta');
                charset.setAttribute('charset', 'UTF-8');
                popup.document.head.prepend(charset);

                popup.document.body.innerHTML = '';

                const style = popup.document.createElement('style');

                style.textContent = `
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 28px;
      font-family: Arial, "Noto Sans Thai", sans-serif;
      background: #f3eadf;
      color: #40352c;
    }

    .project-list-window {
      max-width: 1080px;
      max-height: calc(100vh - 56px);
      max-height: calc(100dvh - 56px);
      margin: 0 auto;
      padding: 28px 32px;
      overflow-y: auto;
      scrollbar-gutter: stable;

      background:
        linear-gradient(
          145deg,
          #fbf7f1 0%,
          #f3e8dc 65%,
          #ecddcd 100%
        );

      border: 1px solid #ccb79e;
      border-radius: 18px;

      box-shadow:
        0 16px 38px rgba(91, 67, 50, 0.18),
        inset 0 1px 0 rgba(255,255,255,0.75);
    }

    h1 {
      margin: 0;
      font-size: 27px;
      color: #59391f;
    }

    .subtitle {
      margin: 5px 0 24px;
      color: #80644d;
      font-size: 20px;
    }

    .decision-project-category + .decision-project-category {
      margin-top: 28px;
    }

    .decision-project-category h3 {
      margin: 0 0 8px;
      font-size: 21px;
      color: #59391f;
    }

    .decision-category-empty {
      margin: 8px 0 0;
      color: #80644d;
    }

    ol {
      margin: 0;
      padding-left: 42px;
    }

    li {
      padding: 9px 10px;
      border-bottom: 1px solid #ddcbb7;
      font-size: 18px;
      line-height: 1.4;
    }

    li:last-child {
      border-bottom: 0;
    }

    a {
      color: #493324;
      font-size: 18px;
      font-weight: 700;
      text-decoration: none;
    }

    a:hover {
      color: #9a5f2d;
      text-decoration: underline;
    }

    .decision-project-amount {
      margin: 2px 0 0;
      color: #80634b;
      font-size: 15px;
    }

    .decision-delta.is-increase {
      color: #168764;
      font-weight: 700;
    }

    .decision-delta.is-decrease {
      color: #c43113;
      font-weight: 700;
    }
  `;

                const card = popup.document.createElement('main');
                card.className = 'project-list-window';

                const heading = popup.document.createElement('h1');
                heading.textContent = `${label} ${projects.length} โครงการ`;

                const subtitle = popup.document.createElement('p');
                subtitle.className = 'subtitle';
                subtitle.textContent = title;

                const popupList = buildGroupedLists(popup.document);

                card.append(heading, subtitle, popupList);

                const tableStyles = document.querySelector('link[href*="decision-project-table.css"], style[data-offline-href*="decision-project-table.css"]');
                if (tableStyles) popup.document.head.append(popup.document.importNode(tableStyles, true));
                popup.document.head.append(style);
                popup.document.body.append(card);

                popup.focus();
              });

              groupHead.append(toggle);
            }
            groups.append(group);
          }
          section.append(groups);
          yearsGrid.append(section);
        }
        requestAnimationFrame(() => {
          if (!resultPanel.hidden) summaryCard.style.minHeight = '';
        });
      } catch (error) {
        if (ticket !== resultRequest) return;
        resultPanel.textContent = error.message;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'ลองใหม่';
        retry.onclick = refreshDecisionProjects;
        resultPanel.append(retry);
        requestAnimationFrame(() => {
          if (!resultPanel.hidden) summaryCard.style.minHeight = '';
        });
      }
    }
    const switchBudgetSummary = switchSummaryTable;
    switchSummaryTable = (tab) => {
      preserveTabHeight(summaryCard);
      const showResults = tab === 'decisions';
      futureOffset = /^future-(-2|-1|[0-4])$/.test(tab)
        ? Number(tab.slice(7))
        : null;
      switchBudgetSummary(
        showResults || futureOffset !== null ? ACTIVE_SUMMARY_TAB : tab,
      );
      futurePanel.hidden = futureOffset === null;
      futureTabs.forEach((button) =>
        button.classList.toggle(
          'active',
          Number(button.dataset.futureOffset) === futureOffset,
        ),
      );
      resultPanel.hidden = !showResults;
      resultTab.classList.toggle('active', showResults);
      summaryCard.querySelector('.table-toolbar').hidden =
        showResults || futureOffset !== null;
      if (showResults || futureOffset !== null) {
        for (const id of [
          'summary-tab-set',
          'summary-tab-change',
          'set-summary-panel',
          'change-summary-panel',
        ])
          document.getElementById(id)?.classList.remove('active');
        if (showResults) refreshDecisionProjects();
        else refreshFutureSummary();
      }
    };
    resultTab.onclick = () => switchSummaryTable('decisions');
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('meeting-budget-sync-' + ROUND_ID);
      channel.addEventListener('message', (e) => {
        if (e.data?.type === 'project-saved' && !resultPanel.hidden)
          refreshDecisionProjects();
      });
    }
    window.addEventListener('message', (e) => {
      if (
        e.origin === location.origin &&
        e.source ===
          document.getElementById('presentation-project-frame')
            ?.contentWindow &&
        e.data?.type === 'meeting-saved' &&
        !resultPanel.hidden
      )
        refreshDecisionProjects();
    });
    const originalClosePresentation = closePresentationProject;
    closePresentationProject = () => {
      const child = document.getElementById(
        'presentation-project-frame',
      )?.contentWindow;
      if (child?.meetingCanLeave && !child.meetingCanLeave()) return;
      originalClosePresentation();
    };
    changeMeetingYear = () => post('meeting-round-picker');

    /* =========================================================
   สถานะไฟล์
   ========================================================= */
    loadFileStatus = async () => {
      HAS_CURRENT_FILE = true;

      const badge = document.getElementById('current-file-name');
      if (badge) badge.remove();
    };

    /* =========================================================
   เปิดไฟล์ข้อมูลรอบประชุม .json
   ตอนนี้: อ่าน + ตรวจสอบไฟล์
   ยังไม่ import เข้าฐานข้อมูล
   ========================================================= */
    openWorkbook = () => {
      const input = document.createElement('input');

      input.type = 'file';
      input.accept = '.json,application/json';

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;

        try {
          const text = await file.text();
          const data = JSON.parse(text);

          /* ตรวจว่าเป็นไฟล์รอบประชุม P-Budget */
          if (
            data?.format !== 'p-budget-meeting' ||
            !Array.isArray(data?.projects)
          ) {
            throw new Error('ไฟล์นี้ไม่ใช่ไฟล์ข้อมูลรอบประชุม P-Budget');
          }

          const meetingYear = data.meeting?.year_be ?? data.meeting_year ?? '-';

          const projectCount = data.projects.length;

          showMeetingSaveNotice(
            `อ่านไฟล์สำเร็จ\n` +
              `ปีประชุม: ${meetingYear}\n` +
              `จำนวนโครงการ: ${projectCount}`,
          );

          console.log('Meeting JSON:', data);

          /*
           * หมายเหตุ:
           * ตรงนี้ยังไม่ได้เขียนข้อมูลกลับเข้า master.db
           * ขั้นต่อไปต้องเพิ่ม API import-json ฝั่ง meeting_workspace.py
           */
        } catch (e) {
          console.error('เปิดไฟล์ JSON ไม่สำเร็จ:', e);

          showMeetingSaveNotice(`เปิดไฟล์ไม่สำเร็จ\n${e.message}`, true);
        }
      };

      input.click();
    };

    /* =========================================================
   บันทึกสถานะ Dashboard
   ========================================================= */
    saveDashboardState = async () => {
      if (saving) return;

      saving = true;

      try {
        await saveFundSourceState();

        hasUnsavedDashboardChanges = false;
        setDirty(false);

        post('meeting-saved');
      } finally {
        saving = false;
      }
    };

    /* =========================================================
   บันทึก / บันทึกเป็น
   saveAs = false → บันทึกลงฐานข้อมูล
   saveAs = true  → ส่งออก JSON
   ========================================================= */
    saveWorkbook = async (saveAs = false) => {
      /* บันทึกเป็น JSON */
      if (saveAs) {
        exportRound();
        return;
      }

      /* บันทึกลงฐานข้อมูล */
      if (saving) return;

      try {
        await saveDashboardState();

        showMeetingSaveNotice('บันทึกสำเร็จ');
      } catch (e) {
        console.error('บันทึกข้อมูลไม่สำเร็จ:', e);

        showMeetingSaveNotice(e.message || 'บันทึกข้อมูลไม่สำเร็จ', true);
      }
    };

    const oldOpenForm = openProjectForm;
    openProjectForm = async (...args) => {
      if (!args[0]) {
        if (window.meetingCanLeave()) post('meeting-select-projects');
        return;
      }
      await oldOpenForm(...args);
      for (const id of [
        'master-name',
        'master-owner',
        'master-unit',
        'master-status',
      ]) {
        const e = document.getElementById(id);
        if (e) e.disabled = id === 'master-name' || closed || failed;
      }
    };
    let removingProject = false;
    window.removeProjectFromMeeting = async (code) => {
      if (removingProject || closed || failed) return;
      const project = masterProjects.find(
        (p) => String(p.code) === String(code),
      );
      if (!project) return;
      if (window.meetingIsDirty()) {
        alert('กรุณาบันทึกข้อมูลที่แก้ไขก่อนนำโครงการออก');
        return;
      }
      if (
        !confirm(
          `นำโครงการ “${project.name}” ออกจากรอบประชุมนี้หรือไม่?\n\nข้อมูลแผนงบประมาณ รายละเอียด Workflow และประวัติของโครงการในรอบนี้จะถูกลบ โครงการหลักและรอบประชุมอื่นยังคงอยู่ สามารถเพิ่มเข้ารอบนี้ใหม่ได้โดยเริ่มกรอกข้อมูลใหม่`,
        )
      )
        return;
      removingProject = true;
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/project-master/${encodeURIComponent(code)}`,
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
        );
        const result = await response.json();
        if (!response.ok || !result.success)
          throw new Error(result.message || 'นำโครงการออกไม่สำเร็จ');
        post('meeting-saved');
        await reloadMasterAndDashboard();
        renderProjectManager();
      } catch (e) {
        alert(e.message);
      } finally {
        removingProject = false;
      }
    };
    deleteAllProjectDatabase = () => {};
    const originalSwitchSummary = switchSummaryTable;
    switchSummaryTable = (tab) => {
      originalSwitchSummary(tab);
      const badge = document.getElementById('summary-year-badge');
      if (badge && !document.querySelector('.allocation-view-tabs')) badge.textContent = 'ภาพรวมตั้งงบปี ' + SET_YEAR;
    };
    // Inline summaries are projections of saved plans; they never save a second set of totals.
    const originalRender = renderTable;
    renderTable = () => {
      originalRender();
      enforce();
    };
    // CSV quotes and spreadsheet formula prefixes must survive user-entered names safely.
    exportCSV = () => {
      const quote = (v) =>
        '"' +
        String(v ?? '')
          .replace(/^[=+@\-]/, "'$&")
          .replace(/"/g, '""') +
        '"';
      const rows = [
        [
          'รหัส',
          'โครงการ',
          'งบก่อนประชุม',
          'เพิ่ม/ลด',
          'เป้าก่อนประชุม',
          'เปลี่ยนเป้า',
          'ผอ.โครงการ',
        ],
        ...projectData
          .filter((r) => r.type === 'item')
          .map((r) => [
            r.code,
            r.name,
            r.col1,
            r.col2,
            r.col4,
            r.col5,
            r.owner,
          ]),
      ];
      const blob = new Blob(
        ['\uFEFF' + rows.map((r) => r.map(quote).join(',')).join('\r\n')],
        { type: 'text/csv;charset=utf-8' },
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `meeting-${MEETING_YEAR}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
  } else {
    // An explicit zero after-meeting target is different from an empty proposal.
    const originalFill = fillBudget;
    fillBudget = (b) => {
      originalFill(b);
      for (const year of YEARS) {
        const value = b?.[year]?.disbursement_target_post;
        const input = document.querySelector(
          `[data-year="${year}"][data-field="disbursement_target_post"]`,
        );
        if (input && value === 0) input.value = '0.000';
      }
      calculateBudget();
    };
    const originalFormat = formatBudgetTableInput;
    formatBudgetTableInput = (input) => {
      if (
        ['disbursement_target_post', 'investment_set_post'].includes(
          input.dataset.field,
        ) &&
        String(input.value).trim() !== '' &&
        num(input.value) === 0
      ) {
        input.value = '0.000';
        calculateBudget();
        return;
      }
      originalFormat(input);
    };
    const originalStatus = setEditStatus;
    setEditStatus = (state) => {
      originalStatus(state);
      if (loaded && !closed) setDirty(state === 'dirty');
    };
    const originalSave = saveProjectData;
    saveProjectData = async () => {
      if (saving || !loaded || failed || closed) return false;
      saving = true;
      try {
        return await originalSave();
      } finally {
        saving = false;
      }
    };
    const originalLoad = loadProjectData;
    loadProjectData = async () => {
      await originalLoad();
      if (!loaded) fail('ไม่พบข้อมูลโครงการในรอบประชุม');
      enforce();
    };
    deleteCurrentProject = () => {};
  }
  function enforce() {
    document
      .querySelectorAll(
        'button[onclick*="deleteAllProjectDatabase"],button[onclick*="deleteCurrentProject"]',
      )
      .forEach((e) => (e.hidden = true));
    const input = document.getElementById('meeting-year-input');
    if (input) input.disabled = true;
    const removedStatuses = new Set([
      'อยู่ระหว่างขออนุมัติ',
      'ได้รับอนุมัติแล้ว',
      'ชะลอโครงการ',
    ]);
    for (const select of document.querySelectorAll(
      '#info-status, #master-status',
    )) {
      for (const option of [...select.options]) {
        if (!removedStatuses.has(option.value)) continue;
        if (option.selected) {
          option.disabled = true;
          const label = option.value + ' (สถานะเดิม)';
          if (option.textContent !== label) option.textContent = label;
        } else option.remove();
      }
    }

    document
      .querySelectorAll('#table-body input')
      .forEach((e) => (e.readOnly = true));
    if (detail) {
      for (const id of [
        'info-name',
        'info-short-name',
        'info-owner',
        'info-owner-division',
        'info-owner-department',
        'info-description',
        'info-area',
        'info-timeline',
        'info-approval-date',
        'info-loan-total',
        'info-revenue-total',
        'estimated-payback',
        'estimated-npv',
        'estimated-firr',
        'estimated-eirr',
      ]) {
        const e = document.getElementById(id);
        if (e) e.readOnly = id === 'info-name';
      }
    }
    if (closed || failed) {
      document
        .querySelectorAll('input,textarea,select')
        .forEach((e) => (e.disabled = true));
      document.querySelectorAll('button[onclick]').forEach((e) => {
        const code = e.getAttribute('onclick');
        if (
          !/Fullscreen|fullscreen|switchSummaryTable|closeModal|Presentation|toggleBudgetRowVisibilityMenu|setBudgetRowVisible|showAllBudgetRows|saveWorkbook\(true\)|exportCSV|exportMeetingExcel|back/i.test(
            code,
          )
        )
          e.disabled = true;
      });
      document
        .querySelectorAll('[draggable]')
        .forEach((e) => (e.draggable = false));
    }
  }
  document.addEventListener('input', (e) => {
    if (failed || closed || e.target.readOnly) return;
    if (detail && loaded) setEditStatus('dirty');
    else if (!detail && e.target.matches('[data-fund-key]')) setDirty(true);
  });
  document.addEventListener(
    'click',
    (e) => {
      if (!e.target.closest('a[href]')) return;
      if (!window.meetingCanLeave()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      } else {
        setDirty(false);
        if (!detail) hasUnsavedDashboardChanges = false;
      }
    },
    true,
  );
  new MutationObserver(() => enforce()).observe(document.body, {
    subtree: true,
    childList: true,
  });
  window.addEventListener('error', (e) => {
    if (!loaded && detail) fail('หน้าประชุมโหลดไม่สำเร็จ: ' + e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (!loaded)
      fail('โหลดรอบประชุมไม่สำเร็จ: ' + (e.reason?.message || e.reason));
  });
  enforce();
  window.meetingBridgeReady = true;
})();
