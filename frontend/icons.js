// Shared SVG icon registry. Keep each icon definition in this file only.
(() => {
function uiIcon(name) {
  if (name === 'meeting') {
    return `<svg class="ui-icon ui-icon-meeting" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M15.5 3a12 12 0 1 1-5.2 22.8" />
      <path d="M15.5 3v12l10.4-6" />
      <path d="M15.5 15l6 10.4" />
      <circle cx="5.5" cy="13.5" r="3.25" />
      <path d="M2.25 30V20.25A3.25 3.25 0 0 1 5.5 17h3l4.1-2.35 1.8 3.05-5.15 3H8V30" />
      <path d="M5.1 22v8" />
    </svg>`;
  }
  const paths = {
    home:'M3 10 12 3l9 7M5 9v12h14V9M9 21v-8h6v8',
    grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    chart:'M4 20V4M4 20h17M8 16v-5M13 16V7M18 16V4',
    lineChart:'M3 3v18h18M6 16l5-6 4 3 6-8M16 6l5-1-1 5',
    pie:'M12 3v9h9M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z',
    list:'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1',
    paper:'M14 3H5v18h14V8l-5-5zM14 3v5h5M8 12h8M8 16h8',
    edit:'m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z',
    search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',
    sun:'M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
    gear:'M9.5 2h5l.5 3 2 1 2.8-1 2.5 4.3-2.3 2v1.4l2.3 2-2.5 4.3-2.8-1-2 1-.5 3h-5l-.5-3-2-1-2.8 1-2.5-4.3 2.3-2v-1.4l-2.3-2L4.2 5 7 6l2-1 .5-3 M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
    clock:'M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    gauge:'M4 19a9 9 0 1 1 16 0H4ZM12 14l5-7M7 10l-1-1M12 6V5M18 10l1-1M13 14a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
    wallet:'M3 5h17v15H3zM3 9h17M15 13h5v4h-5z',
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.grid}"/></svg>`;
}
window.PBudgetIcons = {render: uiIcon};
})();
