/*
 * Hesaplama ve sayı ayrıştırma yardımcıları.
 * Hem arayüzde (window.Calc) hem ana süreçte / testlerde (require) kullanılır.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Sitedeki Türkçe biçimli sayıyı çevirir: "50,7349" -> 50.7349, "6.022,76" -> 6022.76
  // Biçim beklenenden farklıysa NaN döner (yanlış sayı göstermektense hiç göstermemek için).
  function parseSiteNumber(text) {
    if (typeof text !== 'string') return NaN;
    const s = text.replace(/[\s ]/g, '');
    if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(s)) return NaN;
    return Number(s.replace(/\./g, '').replace(',', '.'));
  }

  // Kullanıcının yazdığı tutarı çevirir: "240", "240,5", "1.240,50", "240.50", "1,240.50"
  function parseAmount(text) {
    if (typeof text === 'number') return text;
    if (typeof text !== 'string') return NaN;
    let s = text.replace(/[\s $€₺]/g, '');
    if (s === '') return NaN;
    const hasDot = s.includes('.');
    const hasComma = s.includes(',');
    if (hasDot && hasComma) {
      // Sonda hangisi varsa ondalık ayracı odur
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (hasComma) {
      // Tek virgül her zaman ondalıktır (TR alışkanlığı): "240,5" -> 240.5
      const parts = s.split(',');
      s = parts.length === 2 ? parts.join('.') : parts.join('');
    } else if (hasDot) {
      const parts = s.split('.');
      // "1.250" veya "1.250.000" -> binlik ayraç; "240.5" / "240.50" -> ondalık
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) s = parts.join('');
    }
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
  }

  function round(value, digits) {
    const f = Math.pow(10, digits);
    return Math.round((value + Number.EPSILON) * f) / f;
  }

  const PAIRS = ['USD/TL', 'EUR/TL', 'EUR/USD'];

  /*
   * Varsayılan kur ayarları. Her kur için:
   *   source: 'alis' | 'satis' (canlı kur) veya 'manual' (elle girilen)
   *   adjust: canlı kura eklenecek düzeltme (ör. -0.01)
   *   manual: elle girilen kur (source 'manual' iken kullanılır)
   */
  function defaultRateSettings() {
    return {
      'USD/TL': { source: 'alis', adjust: 0, manual: null },
      'EUR/TL': { source: 'alis', adjust: 0, manual: null },
      'EUR/USD': { source: 'alis', adjust: -0.01, manual: null },
    };
  }

  // Eski ayar biçimini (tlSide/tlAdjust/pariteSide/pariteAdjust) yenisine çevirir
  function normalizeRateSettings(settings) {
    const def = defaultRateSettings();
    const s = settings || {};
    if (!s.rates) {
      if (s.tlSide) def['USD/TL'].source = s.tlSide;
      if (s.tlAdjust != null) def['USD/TL'].adjust = Number(s.tlAdjust) || 0;
      if (s.pariteSide) def['EUR/USD'].source = s.pariteSide;
      if (s.pariteAdjust != null) def['EUR/USD'].adjust = Number(s.pariteAdjust) || 0;
      return def;
    }
    for (const p of PAIRS) {
      const r = s.rates[p] || {};
      const source = ['alis', 'satis', 'manual'].includes(r.source) ? r.source : def[p].source;
      const manual = Number(r.manual);
      def[p] = {
        source: source === 'manual' && !(manual > 0) ? 'alis' : source,
        adjust: Number.isFinite(Number(r.adjust)) ? Number(r.adjust) : def[p].adjust,
        manual: manual > 0 ? manual : null,
      };
    }
    return def;
  }

  /*
   * Hesapta kullanılacak kurları belirler.
   * live: { 'USD/TL': {alis, satis}, ... } veya null (canlı kur yok / eski)
   * Dönen: { 'USD/TL': { value, manual } | null, ... }
   */
  function effectiveRates(live, rateSettings) {
    const rs = normalizeRateSettings({ rates: rateSettings });
    const out = {};
    for (const p of PAIRS) {
      const r = rs[p];
      if (r.source === 'manual') {
        out[p] = { value: round(r.manual, 4), manual: true };
      } else if (live && live[p] && Number.isFinite(live[p][r.source])) {
        const v = live[p][r.source] + r.adjust;
        out[p] = v > 0 ? { value: round(v, 4), manual: false } : null;
      } else {
        out[p] = null;
      }
    }
    return out;
  }

  /*
   * Hangi para birimine yazıldıysa diğer ikisini hesaplar.
   * from: 'USD' | 'EUR' | 'TL'. Kuru olmayan sonuç null döner.
   *   USD -> TL : × USD/TL      USD -> EUR : ÷ EUR/USD
   *   EUR -> TL : × EUR/TL      EUR -> USD : × EUR/USD
   *   TL  -> USD: ÷ USD/TL      TL  -> EUR : ÷ EUR/TL
   */
  function convertFrom(from, amount, eff) {
    const v = (p) => (eff[p] ? eff[p].value : null);
    const usdTl = v('USD/TL'), eurTl = v('EUR/TL'), parite = v('EUR/USD');
    const r2 = (x) => (x == null || !Number.isFinite(x) ? null : round(x, 2));
    const res = { USD: null, EUR: null, TL: null };
    res[from] = amount;
    if (from === 'USD') {
      res.TL = usdTl ? r2(amount * usdTl) : null;
      res.EUR = parite ? r2(amount / parite) : null;
    } else if (from === 'EUR') {
      res.TL = eurTl ? r2(amount * eurTl) : null;
      res.USD = parite ? r2(amount * parite) : null;
    } else if (from === 'TL') {
      res.USD = usdTl ? r2(amount / usdTl) : null;
      res.EUR = eurTl ? r2(amount / eurTl) : null;
    } else {
      throw new Error('Bilinmeyen para birimi: ' + from);
    }
    return res;
  }

  // Eski arayüzle uyumluluk: USD tutarından TL ve EUR
  function convert(usd, rates, settings) {
    const eff = effectiveRates(rates, normalizeRateSettings(settings));
    if (!eff['USD/TL'] || !eff['EUR/USD']) throw new Error('Geçersiz kur');
    const c = convertFrom('USD', usd, eff);
    return { usdTl: eff['USD/TL'].value, parite: eff['EUR/USD'].value, tl: c.TL, eur: c.EUR };
  }

  /*
   * Siteden okunan ham değerleri doğrular. Hata varsa açıklamasını döner.
   */
  function validateRates(raw) {
    const names = ['USD/TL', 'EUR/TL', 'EUR/USD'];
    const ranges = { 'USD/TL': [1, 10000], 'EUR/TL': [1, 10000], 'EUR/USD': [0.5, 2] };
    const rates = {};
    for (const n of names) {
      const r = raw && raw[n];
      if (!r) return { ok: false, error: `${n} sayfada bulunamadı` };
      const alis = parseSiteNumber(r.alis);
      const satis = parseSiteNumber(r.satis);
      if (!Number.isFinite(alis) || !Number.isFinite(satis)) {
        return { ok: false, error: `${n} değeri okunamadı ("${r.alis}" / "${r.satis}")` };
      }
      const [min, max] = ranges[n];
      if (alis < min || alis > max || satis < min || satis > max) {
        return { ok: false, error: `${n} değeri olağan dışı (${alis} / ${satis})` };
      }
      if (satis < alis) return { ok: false, error: `${n} satış alıştan küçük görünüyor` };
      rates[n] = { alis, satis };
    }
    // Çapraz kontrol: EUR/TL ÷ USD/TL ≈ EUR/USD olmalı (sayfa yarım yüklenmişse yakalar)
    const cross = rates['EUR/TL'].alis / rates['USD/TL'].alis;
    const diff = Math.abs(cross - rates['EUR/USD'].alis) / rates['EUR/USD'].alis;
    if (diff > 0.03) return { ok: false, error: 'Kurlar birbiriyle tutarsız, tekrar okunuyor' };
    return { ok: true, rates };
  }

  return {
    PAIRS, parseSiteNumber, parseAmount, round, convert, convertFrom,
    effectiveRates, defaultRateSettings, normalizeRateSettings, validateRates,
  };
});
