(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fmt = (v, d) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const STALE_WARN_MS = 30000;  // 30 sn güncellenmezse uyar
  const STALE_BLOCK_MS = 90000; // 90 sn güncellenmezse canlı kurla hesap yapma
  const CURS = ['USD', 'EUR', 'TL'];
  const PAIRS = Calc.PAIRS;
  const NEXT_COPY = { USD: 'TL', EUR: 'TL', TL: 'USD' }; // Enter ile kopyalanacak sonuç

  let settings = null;
  let state = null;
  let activeCur = 'USD';  // en son hangi alana yazıldı
  let results = { USD: null, EUR: null, TL: null };

  const ageMs = () => (state && state.lastOkAt ? Date.now() - state.lastOkAt : Infinity);
  const liveRates = () => (state && state.rates && ageMs() < STALE_BLOCK_MS ? state.rates : null);
  const manualPairs = () => PAIRS.filter((p) => settings && settings.rates[p].source === 'manual');

  // ---------- Kurlar ----------
  function renderRates() {
    const r = state && state.rates;
    const eff = settings ? Calc.effectiveRates(liveRates(), settings.rates) : {};
    for (const p of PAIRS) {
      for (const side of ['alis', 'satis']) {
        const td = $(`${p}-${side}`);
        td.textContent = r ? fmt(r[p][side], 4) : '…';
        td.classList.toggle('used', !!settings && settings.rates[p].source === side);
      }
      const e = eff[p];
      const td = $(`${p}-eff`);
      td.textContent = e ? fmt(e.value, 4) : '–';
      td.classList.toggle('manual', !!(e && e.manual));
      td.title = e && e.manual ? 'Manuel girilen kur' : '';
    }
    const m = manualPairs();
    $('manualBar').classList.toggle('hidden', m.length === 0);
    if (m.length) {
      $('manualText').textContent = 'Manuel kur: ' + m.map((p) => `${p} ${fmt(settings.rates[p].manual, 4)}`).join(' · ');
    }
    renderStatus();
    compute();
    fit();
  }

  // ---------- Pencere boyu: içerik kadar ----------
  let lastFit = 0;
  function fit() {
    const view = $('viewMain').classList.contains('hidden') ? $('viewSettings') : $('viewMain');
    const h = document.querySelector('.titlebar').offsetHeight + view.scrollHeight;
    if (h && h !== lastFit) { lastFit = h; window.api.fitHeight(h); }
  }

  function renderStatus() {
    const age = ageMs();
    const dot = $('dot');
    const warn = $('warn');
    dot.className = 'dot';
    warn.classList.add('hidden');
    if (!state || !state.lastOkAt) {
      dot.classList.add(state && !state.ok ? 'bad' : 'wait');
      $('status').textContent = state && !state.ok ? state.error : 'Kurlar yükleniyor…';
      return;
    }
    const t = new Date(state.lastOkAt).toLocaleTimeString('tr-TR');
    if (age < STALE_WARN_MS) {
      dot.classList.add('ok');
      $('status').textContent = `Canlı · son okuma ${t}`;
    } else {
      dot.classList.add(age < STALE_BLOCK_MS ? 'wait' : 'bad');
      $('status').textContent = `Son okuma ${t}`;
      const err = state.ok ? '' : state.error || '';
      warn.textContent = age < STALE_BLOCK_MS
        ? `Kurlar ${Math.round(age / 1000)} sn'dir güncellenmedi. ${err}`
        : `Canlı kurlar güncel değil, canlı kurla hesap gösterilmiyor. ${err} "Yenile"ye basın.`;
      warn.classList.remove('hidden');
    }
    fit();
  }

  // ---------- Hesap ----------
  function compute() {
    const input = $('in' + activeCur);
    const amount = Calc.parseAmount(input.value);
    for (const c of CURS) $('f' + c).classList.toggle('active', c === activeCur);
    results = { USD: null, EUR: null, TL: null };
    if (!settings || !Number.isFinite(amount) || amount <= 0) {
      for (const c of CURS) if (c !== activeCur) $('in' + c).value = '';
      return;
    }
    const eff = Calc.effectiveRates(liveRates(), settings.rates);
    results = Calc.convertFrom(activeCur, amount, eff);
    for (const c of CURS) {
      if (c === activeCur) continue;
      $('in' + c).value = results[c] == null ? '' : fmt(results[c], 2);
      $('in' + c).placeholder = results[c] == null ? 'kur yok' : '0';
    }
  }

  let toastTimer = null;
  function copyCur(cur) {
    const v = results[cur];
    if (v == null || !(v > 0)) return;
    const text = fmt(v, 2);
    window.api.copy(text);
    const t = $('toast');
    t.textContent = `Kopyalandı: ${text} ${cur}`;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 1400);
  }

  // ---------- Ayarlar ----------
  const numToField = (n, d = 4) => (n == null || !Number.isFinite(Number(n)) ? '' : fmt(Number(n), d));
  function parseSigned(text) {
    const s = String(text).trim();
    const neg = /^[-−]/.test(s);
    const v = Calc.parseAmount(s.replace(/^[-+−]/, '') || '0');
    return Number.isFinite(v) ? (neg ? -v : v) : NaN;
  }
  const RATE_HELP = {
    'USD/TL': 'USD ↔ TL çevirisinde kullanılır',
    'EUR/TL': 'EUR ↔ TL çevirisinde kullanılır',
    'EUR/USD': 'USD ↔ EUR çevirisinde kullanılır (ör. 1,0941 yerine 1,0741)',
  };
  const safeId = (p) => p.replace('/', '');

  function buildRateForms() {
    const box = $('rateForms');
    box.innerHTML = '';
    for (const p of PAIRS) {
      const id = safeId(p);
      const div = document.createElement('div');
      div.className = 'rate-form';
      div.innerHTML = `
        <div class="rf-head"><b>${p}</b><span class="rf-live" id="live-${id}"></span></div>
        <div class="rf-help">${RATE_HELP[p]}</div>
        <div class="rf-row">
          <select id="src-${id}">
            <option value="alis">Canlı · Alış</option>
            <option value="satis">Canlı · Satış</option>
            <option value="manual">Manuel</option>
          </select>
          <input id="man-${id}" inputmode="decimal" placeholder="Kur, ör. 1,0741">
          <input id="adj-${id}" inputmode="decimal" placeholder="Düzeltme ±" title="Canlı kura eklenecek düzeltme (ör. -0,0100)">
          <button class="link" id="reset-${id}" title="Bu kuru canlı Alış'a döndür">Canlı</button>
        </div>`;
      box.appendChild(div);
      $(`src-${id}`).addEventListener('change', () => { syncRateForm(p, true); fit(); });
      $(`reset-${id}`).addEventListener('click', () => { $(`src-${id}`).value = 'alis'; syncRateForm(p); });
    }
  }

  function syncRateForm(p, focusManual) {
    const id = safeId(p);
    const manual = $(`src-${id}`).value === 'manual';
    $(`man-${id}`).classList.toggle('hidden', !manual);
    $(`adj-${id}`).classList.toggle('hidden', manual);
    $(`reset-${id}`).classList.toggle('hidden', !manual);
    if (manual && !$(`man-${id}`).value) {
      // Kolaylık: o anki canlı kurla doldur, kullanıcı sadece düzeltsin
      const r = state && state.rates && state.rates[p];
      if (r) $(`man-${id}`).value = numToField(r.alis);
    }
    if (manual && focusManual) { $(`man-${id}`).focus(); $(`man-${id}`).select(); }
  }

  async function openSettings() {
    settings = (await window.api.getInitial()).settings; // tepsi menüsünden değişmiş olabilir
    for (const p of PAIRS) {
      const id = safeId(p);
      const rs = settings.rates[p];
      $(`src-${id}`).value = rs.source;
      $(`man-${id}`).value = numToField(rs.manual);
      $(`adj-${id}`).value = rs.adjust ? numToField(rs.adjust) : '';
      const r = state && state.rates && state.rates[p];
      $(`live-${id}`).textContent = r ? `canlı ${fmt(r.alis, 4)} / ${fmt(r.satis, 4)}` : '';
      syncRateForm(p);
    }
    $('alwaysOnTop').checked = !!settings.alwaysOnTop;
    $('openAtLogin').checked = !!settings.openAtLogin;
    $('taskbarRate').checked = !!settings.taskbarRate;
    $('settingsErr').classList.add('hidden');
    $('viewMain').classList.add('hidden');
    $('viewSettings').classList.remove('hidden');
    fit();
  }
  function closeSettings() {
    $('viewSettings').classList.add('hidden');
    $('viewMain').classList.remove('hidden');
    fit();
    $('in' + activeCur).focus();
  }
  function settingsError(msg) {
    $('settingsErr').textContent = msg;
    $('settingsErr').classList.remove('hidden');
    fit();
  }

  const RANGES = { 'USD/TL': [1, 10000], 'EUR/TL': [1, 10000], 'EUR/USD': [0.5, 2] };
  async function saveSettings() {
    const rates = {};
    for (const p of PAIRS) {
      const id = safeId(p);
      const source = $(`src-${id}`).value;
      const adjust = parseSigned($(`adj-${id}`).value || '0');
      const manualText = $(`man-${id}`).value.trim();
      const manual = manualText ? Calc.parseAmount(manualText) : null;
      if (source === 'manual') {
        const [min, max] = RANGES[p];
        if (!(manual >= min && manual <= max)) return settingsError(`${p} için geçerli bir manuel kur girin (${min} – ${max}).`);
      }
      if (!Number.isFinite(adjust) || Math.abs(adjust) >= (p === 'EUR/USD' ? 0.5 : 10)) {
        return settingsError(`${p} düzeltme değeri geçersiz.`);
      }
      rates[p] = { source, adjust, manual: Number.isFinite(manual) && manual > 0 ? manual : settings.rates[p].manual };
    }
    settings = await window.api.saveSettings({
      rates,
      alwaysOnTop: $('alwaysOnTop').checked,
      openAtLogin: $('openAtLogin').checked,
      taskbarRate: $('taskbarRate').checked,
    });
    closeSettings();
    renderRates();
  }

  async function allLive() {
    const rates = {};
    for (const p of PAIRS) rates[p] = { ...settings.rates[p], source: settings.rates[p].source === 'manual' ? 'alis' : settings.rates[p].source };
    settings = await window.api.saveSettings({ rates });
    renderRates();
  }

  // ---------- Başlat ----------
  async function init() {
    const data = await window.api.getInitial();
    settings = data.settings;
    state = data.state;
    $('shortcut').textContent = data.shortcut;
    buildRateForms();
    const op = $('opacity');
    op.value = Math.round((settings.opacity || 1) * 100);
    op.addEventListener('input', () => window.api.setOpacity(op.value / 100));
    renderRates();
    new ResizeObserver(fit).observe($('viewMain'));
    new ResizeObserver(fit).observe($('viewSettings'));

    window.api.onRates((s) => {
      // Hata durumunda son geçerli kurları koru, sadece durumu güncelle
      state = { ...s, rates: s.rates || (state && state.rates) };
      renderRates();
    });
    window.api.onFocusInput(() => {
      if (!$('viewMain').classList.contains('hidden')) { $('in' + activeCur).focus(); $('in' + activeCur).select(); }
    });

    for (const c of CURS) {
      const el = $('in' + c);
      el.addEventListener('input', () => { activeCur = c; compute(); });
      el.addEventListener('focus', () => el.select());
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { for (const x of CURS) $('in' + x).value = ''; activeCur = c; compute(); }
        if (e.key === 'Enter') copyCur(c === activeCur ? NEXT_COPY[c] : c);
      });
    }
    document.querySelectorAll('button.copy').forEach((b) => b.addEventListener('click', () => copyCur(b.dataset.cur)));
    $('btnClose').addEventListener('click', () => window.api.hide());
    $('btnMin').addEventListener('click', () => window.api.minimize());
    $('btnRefresh').addEventListener('click', () => { window.api.refresh(); $('status').textContent = 'Yenileniyor…'; });
    $('btnSettings').addEventListener('click', () => ($('viewSettings').classList.contains('hidden') ? openSettings() : closeSettings()));
    $('btnCancel').addEventListener('click', closeSettings);
    $('btnSave').addEventListener('click', saveSettings);
    $('btnAllLive').addEventListener('click', allLive);
    $('btnFormAllLive').addEventListener('click', () => {
      for (const p of PAIRS) { const sel = $(`src-${safeId(p)}`); if (sel.value === 'manual') sel.value = 'alis'; syncRateForm(p); }
    });
    setInterval(() => { renderStatus(); if (!state || ageMs() >= STALE_BLOCK_MS - 1000) renderRates(); }, 1000);
    $('inUSD').focus();
  }
  init();
})();
