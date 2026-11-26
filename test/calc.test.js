const assert = require('assert');
const C = require('../src/calc');

// Sitedeki sayılar
assert.strictEqual(C.parseSiteNumber('50,7349'), 50.7349);
assert.strictEqual(C.parseSiteNumber('6.022,76'), 6022.76);
assert.strictEqual(C.parseSiteNumber('118.019,00'), 118019);
assert.ok(Number.isNaN(C.parseSiteNumber('')));
assert.ok(Number.isNaN(C.parseSiteNumber('-')));
assert.ok(Number.isNaN(C.parseSiteNumber('50,73,49')));

// Kullanıcı girişi
assert.strictEqual(C.parseAmount('240'), 240);
assert.strictEqual(C.parseAmount('240,5'), 240.5);
assert.strictEqual(C.parseAmount('240.50'), 240.5);
assert.strictEqual(C.parseAmount('1.240'), 1240);
assert.strictEqual(C.parseAmount('1.240,50'), 1240.5);
assert.strictEqual(C.parseAmount('1,240.50'), 1240.5);
assert.strictEqual(C.parseAmount('$ 240'), 240);
assert.ok(Number.isNaN(C.parseAmount('abc')));

// Ekran görüntüsündeki örnek değerler
const raw = {
  'USD/TL': { alis: '50,7349', satis: '50,7986' },
  'EUR/TL': { alis: '55,4238', satis: '55,6328' },
  'EUR/USD': { alis: '1,0941', satis: '1,0977' },
};
const v = C.validateRates(raw);
assert.ok(v.ok, v.error);
const s = { tlSide: 'alis', tlAdjust: 0, pariteSide: 'alis', pariteAdjust: -0.01 };
const c = C.convert(240, v.rates, s);
assert.strictEqual(c.parite, 1.0841);           // 1,0941 yerine 1,0841
assert.strictEqual(c.usdTl, 50.7349);
assert.strictEqual(c.tl, 12176.38);             // 240 × 50,7349 = 12.176,376
assert.strictEqual(c.eur, 221.38);              // 240 ÷ 1,0841 = 221,3818
assert.strictEqual(C.convert(240, v.rates, { ...s, tlSide: 'satis' }).tl, 12191.66);

// Üç yönlü çeviri (varsayılan: hepsi Alış, parite -0,0100)
const def = C.defaultRateSettings();
let eff = C.effectiveRates(v.rates, def);
assert.strictEqual(eff['USD/TL'].value, 50.7349);
assert.strictEqual(eff['EUR/TL'].value, 55.4238);
assert.strictEqual(eff['EUR/USD'].value, 1.0841);
assert.deepStrictEqual(C.convertFrom('USD', 240, eff), { USD: 240, TL: 12176.38, EUR: 221.38 });
assert.deepStrictEqual(C.convertFrom('EUR', 100, eff), { EUR: 100, TL: 5542.38, USD: 108.41 });
assert.deepStrictEqual(C.convertFrom('TL', 10000, eff), { TL: 10000, USD: 197.1, EUR: 180.43 });

// Manuel kur: 1,0941 yerine 1,0741
const man = { ...def, 'EUR/USD': { source: 'manual', adjust: -0.01, manual: 1.0741 } };
eff = C.effectiveRates(v.rates, man);
assert.strictEqual(eff['EUR/USD'].value, 1.0741);
assert.strictEqual(eff['EUR/USD'].manual, true);
assert.strictEqual(C.convertFrom('USD', 240, eff).EUR, 223.44);   // 240 ÷ 1,0741
// Canlı kur yokken manuel kur yine çalışır, canlıya bağlı olanlar null olur
eff = C.effectiveRates(null, man);
assert.strictEqual(eff['USD/TL'], null);
assert.deepStrictEqual(C.convertFrom('USD', 240, eff), { USD: 240, TL: null, EUR: 223.44 });
// Satış tarafı ve düzeltme
eff = C.effectiveRates(v.rates, { ...def, 'USD/TL': { source: 'satis', adjust: -0.05, manual: null } });
assert.strictEqual(eff['USD/TL'].value, 50.7486);

// Eski ayar biçimi yeni biçime çevrilir
const mig = C.normalizeRateSettings({ tlSide: 'satis', tlAdjust: 0.1, pariteSide: 'alis', pariteAdjust: -0.02 });
assert.deepStrictEqual(mig['USD/TL'], { source: 'satis', adjust: 0.1, manual: null });
assert.strictEqual(mig['EUR/USD'].adjust, -0.02);
// Değeri olmayan manuel ayar canlıya düşer
assert.strictEqual(C.normalizeRateSettings({ rates: { 'EUR/USD': { source: 'manual', manual: null } } })['EUR/USD'].source, 'alis');

// Hatalı / eksik veri reddedilmeli
assert.ok(!C.validateRates({ ...raw, 'EUR/USD': undefined }).ok);
assert.ok(!C.validateRates({ ...raw, 'USD/TL': { alis: '', satis: '' } }).ok);
assert.ok(!C.validateRates({ ...raw, 'EUR/USD': { alis: '1,5941', satis: '1,5977' } }).ok); // tutarsız
assert.ok(!C.validateRates({ ...raw, 'USD/TL': { alis: '50,80', satis: '50,70' } }).ok);
assert.ok(!C.validateRates(null).ok);

console.log('Tüm testler geçti.');
