/* Preserve native fullscreen on desktop; expand inside tablet viewers otherwise. */
(() => {
  if (window.__pBudgetFullscreenCompat) return;
  window.__pBudgetFullscreenCompat = true;
  const request = Element.prototype.requestFullscreen;
  const exit = document.exitFullscreen?.bind(document);
  let owner = document;
  while (owner && !Object.getOwnPropertyDescriptor(owner, 'fullscreenElement')) owner = Object.getPrototypeOf(owner);
  const nativeElement = owner && Object.getOwnPropertyDescriptor(owner, 'fullscreenElement')?.get;
  let active = null, restore = null;
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => active || (nativeElement ? nativeElement.call(document) : null)
  });
  const notify = () => {
    document.dispatchEvent(new Event('fullscreenchange'));
    window.dispatchEvent(new Event('resize'));
  };
  function expand(target) {
    if (active === target) return;
    if (restore) restore();
    const saved = [];
    const save = node => { const css = node.style.cssText; saved.push(() => { node.style.cssText = css; }); };
    const attribute = target.getAttribute('data-pbudget-fullscreen');
    save(target);
    target.setAttribute('data-pbudget-fullscreen', '');
    target.style.cssText += ';position:fixed!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;box-sizing:border-box!important;z-index:2147483646!important;overflow:auto;background:var(--bg,#f3f6fa);';
    let view = window;
    while (view) {
      try {
        const body = view.document.body;
        if (body) { save(body); body.style.overflow = 'hidden'; }
        const frame = view.frameElement;
        if (!frame) break;
        save(frame);
        frame.style.cssText += ';position:fixed!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;z-index:2147483646!important;border:0!important;';
        view = view.parent;
      } catch (_) { break; }
    }
    active = target;
    restore = () => {
      saved.reverse().forEach(fn => fn());
      if (attribute === null) target.removeAttribute('data-pbudget-fullscreen');
      else target.setAttribute('data-pbudget-fullscreen', attribute);
      active = null; restore = null;
    };
    notify();
  }
  Element.prototype.requestFullscreen = function (...args) {
    if (!this.isConnected) return Promise.reject(new Error('Fullscreen target is detached'));
    try {
      if (request) return Promise.resolve(request.apply(this, args)).catch(() => expand(this));
    } catch (_) { /* Fall back to the same document and iframe chain. */ }
    expand(this);
    return Promise.resolve();
  };
  document.exitFullscreen = () => {
    if (restore) { restore(); notify(); return Promise.resolve(); }
    return exit ? exit() : Promise.resolve();
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) { event.preventDefault(); document.exitFullscreen(); }
  });
  window.addEventListener('pagehide', () => { if (restore) restore(); });
})();
