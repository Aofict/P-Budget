// Presentation only: follow the active class managed by the existing tab handlers.
(() => {
  const init = () => {
    document.querySelectorAll('#projectTab, #summary-table-fullscreen > .summary-table-tabs').forEach(container => {
      let pending = false;
      let lastTheme = null;
      const update = () => {
        pending = false;
        const active = container.querySelector('button.active');
        if (!active || !active.getClientRects().length) return;
        const currentTheme = document.documentElement.className;
        if (lastTheme !== currentTheme) {
          container.classList.remove('meeting-animated-tabs');
          const theme = getComputedStyle(active);
          container.style.setProperty('--tab-active-bg', theme.backgroundColor);
          container.style.setProperty('--tab-active-color', theme.color);
          container.classList.add('meeting-animated-tabs');
          lastTheme = currentTheme;
        }
        const box = active.getBoundingClientRect(), parent = container.getBoundingClientRect();
        container.style.setProperty('--tab-x', `${box.left-parent.left-container.clientLeft+container.scrollLeft}px`);
        container.style.setProperty('--tab-y', `${box.top-parent.top-container.clientTop+container.scrollTop}px`);
        container.style.setProperty('--tab-width', `${box.width}px`);
        container.style.setProperty('--tab-height', `${box.height}px`);
      };
      const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
      new MutationObserver(records => {
        if (records.some(record => record.type === 'childList' || record.target !== container)) schedule();
      }).observe(container, {subtree:true,childList:true,attributes:true,attributeFilter:['class']});
      new MutationObserver(schedule).observe(document.documentElement, {attributes:true,attributeFilter:['class']});
      new ResizeObserver(schedule).observe(container);
      window.addEventListener('resize', schedule);
      document.fonts?.ready.then(schedule);
      schedule();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
