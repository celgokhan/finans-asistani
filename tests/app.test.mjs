// Çalıştır: node --test tests/
// Tüm veriler sentetiktir; depoya gerçek ekstre/müşteri verisi eklenmez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatement, itemsToLines } from '../js/parsers.js';
import { classify, merchantKey, prettyMerchant, stripCity, isOwner } from '../js/categorize.js';
import { parseReceiptText, looseMoney } from '../js/receipt.js';
import { monthSummary, cardPaymentStatus, installmentSchedule, subscriptions } from '../js/analytics.js';
import { parseTL, parseTRDate, norm } from '../js/util.js';

// Satır satır sentetik PDF parçası üretir: [[x, metin], ...]
function page(rows) {
  const items = [];
  rows.forEach(([y, cells]) => cells.forEach(([x, str]) => items.push({ str, x, y, w: str.length * 4 })));
  return { items };
}

const ACCOUNT = [page([
  [797, [[295, 'Hesap Hareketleri']]],
  [727, [[28, 'Müşteri Adı Soyadı'], [213, ':'], [220, 'AYŞE DENEME YILMAZ']]],
  [677, [[28, 'IBAN/Hesap No'], [213, ':'], [220, 'TR000000000000000000001234']]],
  [652, [[28, 'Tarih Aralığı'], [213, ':'], [220, '01/10/2026 - 31/10/2026']]],
  [614, [[28, 'Tarih'], [85, 'Saat'], [142, 'İşlem'], [205, 'Kanal'], [276, 'Açıklama'], [452, 'İşlem'], [474, 'Tutarı'], [542, 'Bakiye']]],
  [587, [[276, 'GİDEN FAST - ALİ VELİ -']]],
  [573, [[28, '15/10/2026'], [85, '20:00:30'], [142, 'Para Gönder'], [205, 'Internet - Mobil'], [276, 'Kira Ekim'], [451, '-4.000,00'], [488, 'TL'], [541, '1.000,00'], [559, 'TL']]],
  [559, [[28, '10/10/2026'], [85, '09:00:00'], [142, 'Para Gönder'], [205, 'Diğer'], [276, 'GELEN FAST - ÖRNEK A.Ş. -'], [451, '5.000,00'], [488, 'TL'], [525, '5.000,00'], [559, 'TL']]],
  [18, [[30, 'Yapı ve Kredi Bankası A.Ş.'], [305, 'Merkezi:']]],
])];

const CARD = [page([
  [737, [[28, 'Hesap Kesim Tarihi'], [198, ':'], [202, '28 Ekim 2026']]],
  [727, [[28, 'Son Ödeme Tarihi'], [198, ': 9 Kasım 2026']]],
  [716, [[28, 'Dönem Borcu'], [198, ': 1.000,00 TL']]],
  [705, [[28, 'Ödenmesi Gereken Asgari Tutar/Oran'], [198, ': 400,00 TL / 40%'], [337, 'Sn. AYŞE DENEME YILMAZ']]],
  [651, [[28, 'Kalan Toplam Taksit Tutarı'], [198, ': 600,00 TL']]],
  [597, [[28, 'Kart Limiti'], [198, ': 10.000,00 TL']]],
  [575, [[28, 'Kart Numarası'], [198, ': 5555 55** **** 9999']]],
  [487, [[29, 'Akdi Faiz Oranı'], [300, '%3,75 / %45,00'], [400, '%4,25 / %51,00']]],
  [424, [[40, 'İşlem Tarihi'], [104, 'İşlemler'], [387, 'Tutar(TL)'], [442, 'Kalan Tutar/Taksit'], [545, 'Puan']]],
  [415, [[104, 'ÖNCEKİ DÖNEM HESAP ÖZETİ BORCU'], [389, '1.000,00']]],
  [405, [[40, '08 Ekim 2026'], [105, 'ÖDEME-İNTERNET BANKACILIĞI'], [392, '+1.000,00']]],
  [392, [[40, '10 Ekim 2026'], [105, 'MIGROS MIGROS KADIKOY'], [218, 'TR'], [405, '700,00'], [557, '7']]],
  [382, [[40, '11 Ekim 2026'], [105, 'IYZICO/NETFLİX.COM ISTANBUL'], [246, 'TR'], [405, '189,99']]],
  [372, [[40, '12 Ekim 2026'], [105, 'KAMPANYA İADESİ'], [405, '+189,99']]],
  [363, [[40, '16 Temmuz 2026'], [105, 'LC WAIKIKI LCWAIKIKI ISTAISTANBUL TR'], [405, '300,00'], [483, '600,00 / 2']]],
  [353, [[105, "1.500,00 TL'lik işlemin 3 / 5 taksidi"]]],
  [343, [[40, 'TOPLAM'], [382, '1.000,00']]],
])];

test('vadesiz hesap: çok satırlı açıklama ve bakiye zinciri', () => {
  const st = parseStatement(ACCOUNT);
  assert.equal(st.type, 'account');
  assert.equal(st.owner, 'AYŞE DENEME YILMAZ');
  assert.equal(st.txs.length, 2);
  assert.equal(st.txs[0].desc, 'GİDEN FAST - ALİ VELİ - Kira Ekim');
  assert.equal(st.txs[0].amount, -4000);
  assert.equal(st.meta.ibanLast4, '1234');
  assert.ok(st.check.ok, st.check.message);
});

test('kart ekstresi: toplam, taksit ve meta doğrulaması', () => {
  const st = parseStatement(CARD);
  assert.equal(st.type, 'card');
  assert.equal(st.meta.totalDue, 1000);
  assert.equal(st.meta.minDue, 400);
  assert.equal(st.meta.cutDate, '2026-10-28');
  assert.equal(st.meta.cardLast4, '9999');
  assert.equal(st.meta.contractRate.monthly, 0.0375);
  assert.equal(st.owner, 'AYŞE DENEME YILMAZ');
  assert.equal(st.txs.length, 5);
  assert.ok(st.check.ok, st.check.message);
  const inst = st.txs[4];
  assert.deepEqual(inst.installment, { total: 1500, k: 3, n: 5 });
  assert.deepEqual(inst.remaining, { amount: 600, count: 2 });
  assert.equal(inst.date, '2026-10-28'); // 2+. taksit kesim tarihine yazılır
  assert.equal(inst.origDate, '2026-07-16');
  assert.equal(st.txs[1].points, 7);
});

test('kart ekstresi: toplam tutmazsa uyarır', () => {
  const bad = structuredClone(CARD);
  bad[0].items.find((i) => i.str === '700,00').str = '710,00';
  assert.equal(parseStatement(bad).check.ok, false);
});

test('sınıflandırma', () => {
  const owner = { ownerNames: ['Ayşe Deneme Yılmaz'] };
  const c = (desc, amount, source = 'card', op = '') => classify({ desc, amount, source, op }, owner).category;
  assert.equal(c('MIGROS MIGROS KADIKOY TR', -10), 'market');
  assert.equal(c('IYZICO/NETFLİX.COM ISTANBUL TR', -10), 'abonelik');
  assert.equal(c('İPEKYOL AYVALIK KIRLANGIÇBALIKESİR TR', -10), 'giyim');
  assert.equal(c('GEREK GIDA TURIZM RESTORAISTANBUL TR', -10), 'yemek');
  assert.equal(c('DÖNEM FAİZİ', -10), 'faiz');
  assert.equal(c('ÖDEME-İNTERNET BANKACILIĞI', 10), 'kart_odeme');
  assert.equal(c('KAMPANYA İADESİ', 10), 'iade');
  assert.equal(c('INT 555555******9999 0911', -10, 'account'), 'kart_odeme');
  assert.equal(c('GİDEN FAST - AYŞE DENEME YILMAZ', -10, 'account'), 'kendi');
  assert.equal(c('GİDEN FAST - ALİ VELİ - Ayşe Yılmaz', -10, 'account'), 'kisi');
  assert.equal(c('FON ALIŞ - ABC1 - PAY ADEDİ: 10 FİYAT: 1.5', -15, 'account', 'Yatırım Fonu'), 'yatirim');
  assert.equal(c('Para Çekme ATM 1 2', -100, 'account'), 'nakit_cekim');
  assert.equal(c('30398966 ISKI SU', -100, 'account', 'Fatura Ödemesi'), 'fatura');
  // Gelir kaynağı anahtar kelimesi
  const inc = classify({ desc: 'GELEN FAST - ÖRNEK A.Ş. -', amount: 5000, source: 'account' }, { incomeSources: [{ id: 's1', type: 'maas', keyword: 'örnek' }] });
  assert.equal(inc.category, 'maas');
  assert.equal(inc.incomeSourceId, 's1');
  // Öğrenilmiş kural önceliklidir
  const r = classify({ desc: 'TEMA WORLD İSTANBUL TR', amount: -50, source: 'card' }, { rules: [{ key: merchantKey('TEMA WORLD İSTANBUL TR'), dir: 'out', category: 'eglence' }] });
  assert.equal(r.category, 'eglence');
});

test('işyeri adı', () => {
  assert.equal(prettyMerchant('LC WAIKIKI LCWAIKIKI ISTAISTANBUL TR'), 'Lc Waikiki Lcwaikiki');
  assert.equal(prettyMerchant('DELF TEKNOLOJI ISTANBUL TR'), 'Delf Teknoloji');
  assert.equal(stripCity('ISTANBUL LOUNGE IKI SITISTANBUL TU'), 'ISTANBUL LOUNGE IKI SIT');
  assert.equal(merchantKey('IYZICO/NETFLİX.COM ISTANBUL TR'), 'NETFLIX.COM');
  assert.ok(isOwner('ZEYNEP AYŞE YILMAZ', ['Ayşe Yılmaz']));
  assert.ok(!isOwner('ALİ YILMAZ', ['Ayşe Yılmaz']));
});

test('fiş metni okuma', () => {
  const r = parseReceiptText(`ÖRNEK MARKET A.Ş.\nKADIKÖY / İSTANBUL\nTARİH: 17.11.2026 SAAT: 18:42\nEKMEK *15,00\nSÜT *42,50\nTOPKDV *4,75\nTOPLAM *57,50\nKREDİ KARTI *57,50`);
  assert.equal(r.total, 57.5);
  assert.equal(r.kdv, 4.75);
  assert.equal(r.date, '2026-11-17');
  assert.equal(r.merchant, 'ÖRNEK MARKET A.Ş.');
  const f = parseReceiptText('e-Arşiv Fatura\nSATICI\nÖrnek Elektrik Dağıtım A.Ş.\nFatura Tarihi: 05-11-2026\nMal Hizmet Toplam Tutarı 1.000,00\nVergiler Dahil Toplam Tutar 1.200,00\nÖdenecek Tutar 1.200,00 TL');
  assert.equal(f.total, 1200);
  assert.equal(f.date, '2026-11-05');
  assert.equal(f.merchant, 'Örnek Elektrik Dağıtım A.Ş.');
  assert.equal(looseMoney('1.234,56'), 1234.56);
  assert.equal(looseMoney('1234.56'), 1234.56);
});

test('analiz: aylık özet, kart ödemesi, taksit takvimi', () => {
  const txs = [
    { date: '2026-10-05', amount: 10000, category: 'maas', source: 'account' },
    { date: '2026-10-06', amount: -1000, category: 'market', source: 'card' },
    { date: '2026-10-07', amount: 100, category: 'iade', source: 'card' },
    { date: '2026-10-08', amount: -500, category: 'nakit_cekim', source: 'account' },
    { date: '2026-10-09', amount: -200, category: 'yemek', source: 'cash' },
    { date: '2026-10-10', amount: -3000, category: 'kendi', source: 'account' },
    { date: '2026-11-09', amount: -900, category: 'kart_odeme', source: 'account', desc: 'INT 555555******9999' },
  ];
  const s = monthSummary(txs, '2026-10');
  assert.equal(s.income, 10000);
  assert.equal(s.unexplainedCash, 300);
  assert.equal(s.expense, 1000 - 100 + 200 + 300);
  const st = parseStatement(CARD);
  const stmt = { id: 'x', ...st, installments: st.txs.filter((t) => t.remaining) };
  const ps = cardPaymentStatus(stmt, txs, '2026-11-10');
  assert.equal(ps.paid, 900);
  assert.equal(ps.left, 100);
  assert.equal(ps.status, 'partial-late');
  const sch = installmentSchedule(stmt);
  assert.deepEqual(sch.months, [{ ym: '2026-11', value: 300 }, { ym: '2026-12', value: 300 }]);
});

test('abonelik tespiti ve zam', () => {
  const t = (date, amount, desc = 'SPOTIFY P1 STOCKHOLM SWSW') => ({ date, amount, desc, category: 'abonelik', source: 'card' });
  const subs = subscriptions([t('2026-09-06', -99), t('2026-10-06', -135)]);
  assert.equal(subs.length, 1);
  assert.equal(subs[0].increased, 36);
});

test('yardımcılar', () => {
  assert.equal(parseTL('-148.836,29 TL'), -148836.29);
  assert.equal(parseTL('+32.638,64'), 32638.64);
  assert.equal(parseTRDate('9 Kasım 2026'), '2026-11-09');
  assert.equal(norm('Çağlayan İŞ'), 'CAGLAYAN IS');
  assert.equal(itemsToLines([{ str: 'b', x: 50, y: 10 }, { str: 'a', x: 10, y: 11 }])[0].text, 'a b');
});

test('kart bilgisi seçili aya göre değişir', async () => {
  const { cardsForMonth } = await import('../js/analytics.js');
  const mk = (id, cut, due, nextDue, extra = {}) => ({ id, type: 'card', bank: 'Banka', meta: { cardLast4: '9999', cutDate: cut, dueDate: due, nextDueDate: nextDue, totalDue: 100 }, installments: [], ...extra });
  const sep = mk('eyl', '2026-09-28', '2026-10-09', '2026-11-09');
  const oct = mk('eki', '2026-10-28', '2026-11-09', '2026-12-09', { installments: [{ desc: 'X', remaining: { amount: 600, count: 2 }, installment: { k: 1, n: 3 } }] });
  const pick = (ym) => cardsForMonth([oct, sep], ym)[0];
  assert.equal(pick('2026-10').st.id, 'eyl');   // Ekim'de ödenecek: Eylül ekstresi
  assert.equal(pick('2026-11').st.id, 'eki');   // Kasım'da ödenecek: Ekim ekstresi
  assert.equal(pick('2026-09').st.id, 'eyl');   // Eylül'de kesilen
  const dec = pick('2026-12');
  assert.equal(dec.st, null);
  assert.equal(dec.expected.dueDate, '2026-12-09');
  assert.equal(dec.expected.installments, 300);
  assert.equal(pick('2026-08').st, null);
  assert.equal(pick('2026-08').expected, null);
});
