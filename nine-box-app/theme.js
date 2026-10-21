(() => {
  let source;
  try { source=window.top.document.body; } catch (_) {}
  if (!source) return;
  const sync=()=>document.documentElement.classList.toggle('nine-dark',!source.classList.contains('light'));
  sync();
  new MutationObserver(sync).observe(source,{attributes:true,attributeFilter:['class']});
})();
