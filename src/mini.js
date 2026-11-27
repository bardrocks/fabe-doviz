(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fmt = (v) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v);
  let last = null;

  window.api.onMini((d) => {
    $('box').classList.toggle('dark', !!d.dark);
    const val = $('val');
    val.textContent = d.value == null ? '–' : fmt(d.value);
    val.classList.toggle('manual', !!d.manual);
    $('lbl').textContent = d.manual ? 'USD/TL M' : 'USD/TL';
    const arrow = $('arrow');
    if (d.value != null && last != null && d.value !== last) {
      arrow.textContent = d.value > last ? '▲' : '▼';
      arrow.className = 'arrow ' + (d.value > last ? 'up' : 'down');
    }
    if (d.value != null) last = d.value;
  });

  // Tıkla: uygulamayı aç/kapat · sürükle: yatay taşı · sağ tık: menü
  let down = null;
  const box = $('box');
  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    box.setPointerCapture(e.pointerId);
    down = { x: e.screenX, lastX: e.screenX, dragging: false };
  });
  box.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (!down.dragging && Math.abs(e.screenX - down.x) > 4) down.dragging = true;
    if (down.dragging) {
      window.api.miniDrag(e.screenX - down.lastX);
      down.lastX = e.screenX;
    }
  });
  box.addEventListener('pointerup', (e) => {
    if (!down || e.button !== 0) return;
    if (down.dragging) window.api.miniDragEnd(); else window.api.miniClick();
    down = null;
  });
  box.addEventListener('pointercancel', () => { if (down && down.dragging) window.api.miniDragEnd(); down = null; });
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); window.api.miniMenu(); });
})();
