/* Bind each page to its loaded database generation, including embedded pages. */
(() => {
  if (window.pBudgetDatabaseSession) return;
  const originalFetch = window.fetch.bind(window);
  const session = originalFetch('/api/database-transfer', {cache:'no-store'})
    .then(async response => {
      if (!response.ok) throw new Error('โหลดสถานะฐานข้อมูลไม่สำเร็จ กรุณาโหลดหน้าใหม่');
      return response.json();
    });
  // Avoid an unhandled rejection while preserving the failure for an attempted write.
  session.catch(() => {});
  window.pBudgetDatabaseSession = session;
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.origin === location.origin && url.pathname.startsWith('/api/') && !['GET','HEAD','OPTIONS'].includes(method)) {
      const current = await session;
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('X-PBudget-Database', current.token);
      return originalFetch(input, {...init, headers});
    }
    return originalFetch(input, init);
  };
})();
