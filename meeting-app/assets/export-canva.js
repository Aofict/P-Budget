/* Local PNG export only: no save handlers, API writes, or live form changes. */
(() => {
  const button = document.getElementById('budget-canva-export');
  if (!button) return;
  let renderer;
  function loadRenderer() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (!renderer)
      renderer = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timeout = setTimeout(
          () =>
            finish(new Error('โหลดเครื่องมือสร้างภาพไม่สำเร็จ กรุณาลองใหม่')),
          15000,
        );
        function finish(error) {
          clearTimeout(timeout);
          if (error) {
            script.remove();
            renderer = null;
            reject(error);
          } else resolve(window.html2canvas);
        }
        script.src = '/meeting-app/assets/vendor/html2canvas.min.js';
        script.onload = () =>
          finish(
            window.html2canvas ? null : new Error('เครื่องมือสร้างภาพไม่พร้อม'),
          );
        script.onerror = () =>
          finish(new Error('โหลดเครื่องมือสร้างภาพไม่สำเร็จ'));
        document.head.append(script);
      });
    return renderer;
  }
  function frameCanvas16by9(source, fallbackColor) {
    // Expand the canvas rather than stretching or cropping project content.
    const unit = Math.ceil(Math.max(source.width / 16, source.height / 9));
    const framed = document.createElement('canvas');
    framed.width = unit * 16;
    framed.height = unit * 9;
    const context = framed.getContext('2d');
    if (!context) throw new Error('สร้างภาพ 16:9 ไม่สำเร็จ');
    let background = fallbackColor;
    try {
      const pixel = source.getContext('2d').getImageData(0, 0, 1, 1).data;
      background = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
    } catch (_) {
      // A rendered cross-origin image can prevent pixel sampling.
    }
    context.fillStyle = background;
    context.fillRect(0, 0, framed.width, framed.height);
    const topInset = Math.min(24, framed.height - source.height);
    context.drawImage(
      source,
      Math.floor((framed.width - source.width) / 2),
      topInset,
    );
    return framed;
  }
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const original = button.innerHTML;
    const pane = document.getElementById('budget-pane');
    button.disabled = true;
    button.textContent = 'กำลังสร้าง PNG…';
    let status = document.getElementById('canva-export-status');
    if (!status) {
      status = document.createElement('span');
      status.id = 'canva-export-status';
      status.setAttribute('role', 'status');
      status.style.cssText = 'font-size:14px;margin:0 8px';
      button.after(status);
    }
    status.textContent = '';
    try {
      const render = await loadRenderer();
      await document.fonts.ready;
      const table = pane.querySelector('.budget-wrapper .budget-table');
      const width = Math.ceil(
        Math.max(document.documentElement.clientWidth, table?.scrollWidth || 0),
      );
      const title =
        document.getElementById('display-project-name')?.textContent?.trim() ||
        'แผนงบประมาณ';
      const backgroundColor = document.documentElement.classList.contains(
        'meeting-dark',
      )
        ? '#161616'
        : '#fcfbfb';
      const canvas = await render(pane, {
        scale: 3,
        useCORS: true,
        logging: false,
        windowWidth: Math.max(document.documentElement.clientWidth, width),
        backgroundColor,
        onclone: (cloned) => {
          const target = cloned.getElementById('budget-pane');
          target.classList.add('budget-fullscreen-mode');
          const budgetHeader = target.querySelector('.budget-header')?.cloneNode(true);
          const overview = target
            .querySelector('#budget-project-overview')
            ?.cloneNode(true);
          const tableWrapper = target
            .querySelector('.budget-wrapper')
            ?.cloneNode(true);
          const sheet = cloned.createElement('div');
          sheet.id = 'canva-export-sheet';
          sheet.style.cssText =
            'box-sizing:border-box;width:100%;padding:12px 14px 10px;';
          if (budgetHeader) {
            budgetHeader.querySelector('.budget-view-tools')?.remove();
            sheet.append(budgetHeader);
          }
          if (overview) sheet.append(overview);
          if (tableWrapper) sheet.append(tableWrapper);
          target.replaceChildren(sheet);
          target.style.cssText = `display:block!important;position:static!important;box-sizing:border-box!important;width:${width}px!important;max-width:none!important;height:auto!important;max-height:none!important;overflow:visible!important;padding:0!important;margin:0!important;`;
          for (
            let ancestor = target.parentElement;
            ancestor;
            ancestor = ancestor.parentElement
          ) {
            ancestor.style.setProperty('overflow', 'visible', 'important');
            ancestor.style.setProperty('max-height', 'none', 'important');
            ancestor.style.setProperty('max-width', 'none', 'important');
          }
          target
            .querySelectorAll(
              '.budget-actions,#canva-export-status,button,.dropdown-menu',
            )
            .forEach((node) => node.remove());
          target
            .querySelectorAll('.budget-wrapper,.table-responsive')
            .forEach((node) => {
              node.style.cssText =
                'height:auto!important;max-height:none!important;overflow:visible!important;width:100%!important;';
            });
          target.querySelectorAll('input,textarea,select').forEach((input) => {
            const source = input.id ? document.getElementById(input.id) : null;
            // html2canvas copies live input properties; preserve them as ordinary text.
            const value = source ? source.value : input.value;
            const text = cloned.createElement('div');
            const style = cloned.defaultView.getComputedStyle(input);
            text.style.cssText = `font:${style.font};color:${style.color};text-align:${style.textAlign};padding:${style.padding};white-space:pre-wrap;min-height:${style.height};`;
            text.textContent = value || '';
            input.replaceWith(text);
          });
          target.querySelectorAll('th,td').forEach((cell) => {
            cell.style.position = 'static';
          });
        },
      });
      const framedCanvas = frameCanvas16by9(canvas, backgroundColor);
      const blob = await new Promise((resolve) =>
        framedCanvas.toBlob(resolve, 'image/png'),
      );
      if (!blob) throw new Error('สร้างภาพไม่สำเร็จ ตารางอาจมีขนาดใหญ่เกินไป');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Canva-${title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 100)}-16x9-3x.png`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      status.textContent = error.message || 'ส่งออกภาพไม่สำเร็จ กรุณาลองใหม่';
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  });
})();
