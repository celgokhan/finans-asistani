// Hesaplamalar ve kural tabanlı tüyolar. Saf fonksiyonlar; veritabanına dokunmaz.
import { r2, ayAnahtar, ayKaydir, tl, tl0, pct, gunFarki, bugunISO, tarihGoster, ayinGunSayisi, norm, ayAdi } from './util.js';
import { CAT, catKind, catName, merchantKey, prettyMerchant, SUB_KEYS } from './categorize.js';

const oran = (r) => ((r || 0) * 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inMonth = (t, ym) => t.date && t.date.startsWith(ym);

/** Bir ayın gelir/gider özeti */
export function monthSummary(txs, ym) {
  const byCat = {};
  let income = 0, expense = 0, cashOut = 0, cashLogged = 0;
  for (const t of txs) {
    if (!inMonth(t, ym) || t.pendingMatch) continue;
    const kind = catKind(t.category);
    if (t.category === 'nakit_cekim') cashOut += -t.amount;
    if (kind === 'transfer') continue;
    if (kind === 'income') { income += t.amount; byCat[t.category] = (byCat[t.category] || 0) + t.amount; continue; }
    const spent = -t.amount; // iade/kampanya pozitif gelir, gideri azaltır
    expense += spent;
    byCat[t.category] = (byCat[t.category] || 0) + spent;
    if (t.source === 'cash') cashLogged += spent;
  }
  // Fişle açıklanmayan nakit gider sayılır
  const unexplainedCash = Math.max(0, r2(cashOut - cashLogged));
  if (unexplainedCash > 0) { byCat.nakit = (byCat.nakit || 0) + unexplainedCash; expense += unexplainedCash; }
  const cats = Object.entries(byCat)
    .filter(([id]) => catKind(id) === 'expense')
    .map(([id, v]) => ({ id, value: r2(v) }))
    .filter((c) => Math.abs(c.value) >= 0.01)
    .sort((a, b) => b.value - a.value);
  const incomes = Object.entries(byCat).filter(([id]) => catKind(id) === 'income').map(([id, v]) => ({ id, value: r2(v) })).sort((a, b) => b.value - a.value);
  return {
    ym, income: r2(income), expense: r2(expense), net: r2(income - expense),
    savingsRate: income > 0 ? (income - expense) / income : null,
    cats, incomes, cashOut: r2(cashOut), cashLogged: r2(cashLogged), unexplainedCash,
  };
}

export function monthsWithData(txs) {
  const s = new Set(txs.filter((t) => t.date).map((t) => ayAnahtar(t.date)));
  return [...s].sort();
}

export function trend(txs, endYm, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ym = ayKaydir(endYm, -i);
    const s = monthSummary(txs, ym);
    out.push({ ym, income: s.income, expense: s.expense });
  }
  return out;
}

/** Her kart için en son ekstre */
export function latestCards(statements) {
  const by = {};
  for (const s of statements.filter((x) => x.type === 'card')) {
    const k = s.meta.cardLast4 || s.id;
    if (!by[k] || (s.meta.cutDate || '') > (by[k].meta.cutDate || '')) by[k] = s;
  }
  return Object.values(by);
}

/**
 * Seçili ay için her kartın ilgili ekstresi:
 * önce son ödemesi o aya düşen (o ay ödenecek borç), yoksa hesap kesimi o aya düşen.
 * Hiçbiri yoksa st = null; ay son ekstreden sonraysa beklenen son ödeme ve taksitler döner.
 */
export function cardsForMonth(statements, ym) {
  const by = {};
  for (const s of statements.filter((x) => x.type === 'card')) (by[s.meta.cardLast4 || s.id] = by[s.meta.cardLast4 || s.id] || []).push(s);
  return Object.entries(by).map(([last4, list]) => {
    list.sort((a, b) => (a.meta.cutDate || '').localeCompare(b.meta.cutDate || ''));
    const latest = list[list.length - 1];
    const st = list.find((s) => (s.meta.dueDate || '').startsWith(ym)) || list.find((s) => (s.meta.cutDate || '').startsWith(ym)) || null;
    let expected = null;
    if (!st && latest.meta.cutDate && ym > ayAnahtar(latest.meta.cutDate)) {
      // Bu ay ödenecek ekstre, bir önceki ay kesilen ekstredir
      const cutYm = ayKaydir(ym, -1);
      const inst = installmentSchedule(latest).months.find((m) => m.ym === cutYm);
      expected = {
        dueDate: (latest.meta.nextDueDate || '').startsWith(ym) ? latest.meta.nextDueDate : null,
        installments: inst ? inst.value : 0,
        cutYm,
      };
    }
    return { last4, bank: latest.bank, st, latest, expected, before: !st && ym < ayAnahtar(list[0].meta.cutDate || ym) };
  });
}

/** Son ekstrenin ödenme durumu */
export function cardPaymentStatus(stmt, txs, today = bugunISO()) {
  const m = stmt.meta;
  const last4 = m.cardLast4;
  const paid = r2(txs
    .filter((t) => t.category === 'kart_odeme' && t.date > m.cutDate && (!m.nextCutDate || t.date <= m.nextCutDate))
    .filter((t) => (t.source === 'card' ? t.cardLast4 === last4 : (!last4 || norm(t.desc).includes(last4))))
    .reduce((s, t) => s + Math.abs(t.amount), 0));
  const due = m.totalDue || 0;
  const left = r2(Math.max(0, due - paid));
  const daysLeft = m.dueDate ? gunFarki(today, m.dueDate) : null;
  let status;
  if (due <= 0) status = 'none';
  else if (left <= 0.01) status = 'paid';
  else if (paid >= (m.minDue || 0) && paid > 0) status = daysLeft != null && daysLeft < 0 ? 'partial-late' : 'partial';
  else status = daysLeft != null && daysLeft < 0 ? 'late' : 'open';
  return { paid, due, left, daysLeft, status };
}

/** Kalan taksitlerin aylara dağılımı (hesap kesim ayına göre) */
export function installmentSchedule(stmt) {
  const months = {};
  const items = [];
  for (const t of stmt.installments || []) {
    if (!t.remaining || !t.remaining.count) continue;
    const per = r2(t.remaining.amount / t.remaining.count);
    items.push({ name: prettyMerchant(t.desc), per, count: t.remaining.count, left: t.remaining.amount, k: t.installment?.k, n: t.installment?.n, total: t.installment?.total });
    for (let i = 1; i <= t.remaining.count; i++) {
      const ym = ayKaydir(ayAnahtar(stmt.meta.cutDate), i);
      months[ym] = r2((months[ym] || 0) + per);
    }
  }
  return { months: Object.entries(months).sort().map(([ym, v]) => ({ ym, value: v })), items: items.sort((a, b) => b.left - a.left) };
}

/** Düzenli ödemeler: bilinen abonelik markaları + birden çok ayda tekrar eden benzer tutarlar */
export function subscriptions(txs) {
  const groups = {};
  for (const t of txs) {
    if (catKind(t.category) !== 'expense' || t.amount >= 0 || t.installment) continue;
    const k = t.merchantKey || merchantKey(t.desc);
    (groups[k] = groups[k] || []).push(t);
  }
  const out = [];
  for (const [k, list] of Object.entries(groups)) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const months = [...new Set(list.map((t) => ayAnahtar(t.date)))];
    const amounts = list.map((t) => -t.amount);
    const known = SUB_KEYS.some((s) => k.includes(s)) || list.some((t) => t.category === 'abonelik');
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const similar = amounts.every((a) => Math.abs(a - avg) <= Math.max(5, avg * 0.15));
    const perMonth = list.length / months.length;
    const recurring = months.length >= 2 && similar && perMonth <= 1.5;
    if (!known && !recurring) continue;
    if (known && list.some((t) => t.category !== 'abonelik' && t.category !== 'fatura')) continue;
    const last = amounts[amounts.length - 1];
    const prev = amounts.length > 1 ? amounts[amounts.length - 2] : null;
    out.push({
      key: k, name: prettyMerchant(list[list.length - 1].desc), last, prev,
      increased: prev != null && last > prev * 1.03 ? r2(last - prev) : 0,
      months: months.length, lastDate: list[list.length - 1].date,
      monthly: r2(last), yearly: r2(last * 12), category: list[list.length - 1].category,
    });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

/** Vadesiz hesabın eksiye düştüğü durumlar (ek hesap / KMH kullanımı) */
export function overdraft(txs, ym) {
  const rows = txs.filter((t) => t.source === 'account' && typeof t.balance === 'number' && (!ym || inMonth(t, ym)));
  const neg = rows.filter((t) => t.balance < 0);
  const days = new Set(neg.map((t) => t.date));
  return { count: neg.length, days: days.size, min: neg.length ? Math.min(...neg.map((t) => t.balance)) : 0 };
}

/** Hesap hareketlerinden fon fiyatları: "FON ALIŞ - YFBL1 - PAY ADEDİ: 666 FİYAT: 1.973484" */
export function fundPrices(txs) {
  const out = {};
  for (const t of txs) {
    const m = norm(t.desc).match(/FON (ALIS|SATIS)\s*-?\s*([A-Z0-9]{2,6})\s*-?\s*PAY ADEDI:\s*(\d+)\s*FIYAT:\s*([\d.]+)/);
    if (!m) continue;
    const code = m[2], price = Number(m[4]);
    if (!out[code] || (t.date + (t.time || '')) > out[code].at) out[code] = { code, price, date: t.date, at: t.date + (t.time || '') };
  }
  return out;
}

/** Bütçe durumu: harcanan, limit, ay temposuna göre tahmin */
export function budgetStatus(summary, budgets, ym, today = bugunISO()) {
  const days = ayinGunSayisi(ym);
  const cur = today.startsWith(ym);
  const passed = cur ? Number(today.slice(8, 10)) : days;
  const spent = Object.fromEntries(summary.cats.map((c) => [c.id, c.value]));
  return Object.entries(budgets || {})
    .filter(([, lim]) => lim > 0)
    .map(([id, limit]) => {
      const s = spent[id] || 0;
      const forecast = cur && passed > 0 ? (s / passed) * days : s;
      return { id, limit, spent: r2(s), ratio: s / limit, forecast: r2(forecast), over: s > limit, willOver: !(s > limit) && forecast > limit * 1.05 };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** Varlıkların TL değeri */
export function assetValue(a, rates = {}) {
  if (a.type === 'tl') return a.amount;
  if (a.type === 'usd') return a.amount * (rates.USD || a.price || 0);
  if (a.type === 'eur') return a.amount * (rates.EUR || a.price || 0);
  return a.amount * (a.price || 0);
}

/** Ortalama aylık gider (son n dolu ay) */
export function avgExpense(txs, endYm, n = 3) {
  const vals = [];
  for (let i = 0; i < 12 && vals.length < n; i++) {
    const s = monthSummary(txs, ayKaydir(endYm, -i));
    if (s.expense > 0) vals.push(s.expense);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

// ---------------------------------------------------------------------------
// TÜYOLAR
// level: 'critical' | 'warning' | 'info' | 'good'
// ---------------------------------------------------------------------------
export function buildTips(state, ym, today = bugunISO()) {
  const { txs, statements, settings } = state;
  const tips = [];
  const add = (level, id, title, body) => tips.push({ level, id, title, body });
  const sum = monthSummary(txs, ym);
  const prev = monthSummary(txs, ayKaydir(ym, -1));
  const income = expectedIncome(settings) || sum.income;

  // 1-4: Kredi kartı
  for (const st of cardsForMonth(statements, ym).map((c) => c.st).filter(Boolean)) {
    const m = st.meta;
    const ps = cardPaymentStatus(st, txs, today);
    const cardLabel = `•••• ${m.cardLast4}`;
    const rate = m.contractRate?.monthly;
    if (ps.status === 'open' && ps.daysLeft != null && ps.daysLeft <= 7) {
      add(ps.daysLeft <= 2 ? 'critical' : 'warning', 'due-' + st.id, `Kart borcu: son ödemeye ${ps.daysLeft} gün kaldı`,
        `${cardLabel} kartının dönem borcu ${tl(ps.due)}, son ödeme tarihi ${tarihGoster(m.dueDate)}. Asgari tutar ${tl(m.minDue)}. Tamamını ödersen alışverişlere faiz işlemez.`);
    }
    if (ps.status === 'late') {
      add('critical', 'late-' + st.id, 'Kart ödemesi gecikmiş görünüyor',
        `${cardLabel} için ${tarihGoster(m.dueDate)} tarihli ödeme hesap hareketlerinde görünmüyor. Ödediysen hesap dökümünü yükle; ödemediysen gecikme faizi (aylık %${oran(m.lateRate?.monthly)}) işler.`);
    }
    if ((ps.status === 'partial' || ps.status === 'partial-late') && ps.left > 0) {
      const est = rate ? r2(ps.left * rate) : null;
      add('warning', 'partial-' + st.id, `Dönem borcunun ${tl(ps.left)} kısmı ödenmemiş`,
        `${cardLabel} için ${tl(ps.due)} borcun ${tl(ps.paid)} kısmı ödendi. Kalan tutara akdi faiz işler` +
        (est ? ` (yaklaşık ${tl(est)} + KKDF/BSMV)` : '') + '. Küçük bir fark bile bir sonraki ekstrede faiz olarak döner; son ödeme tarihinden önce kapatmak en ucuz yol.');
    }
    const interest = txs.filter((t) => t.statementId === st.id).filter((t) => /DONEM FAIZI|GECIKME FAIZI/.test(norm(t.desc))).reduce((s, t) => s - t.amount, 0);
    if (interest > 0) {
      add('critical', 'interest-' + st.id, `Bu ekstrede ${tl(interest)} kart faizi ödedin`,
        `${tarihGoster(m.cutDate)} ekstresinde dönem faizi var. Bu, önceki dönem borcunun tamamının ödenmediğini gösterir. Akdi faiz aylık %${oran(rate)} (yıllık %${Math.round((rate || 0) * 1200)}) ve üzerine vergi eklenir. Kartı her ay tam kapatırsan bu kalem sıfırlanır.`);
    }
    if (m.limit) {
      const use = (m.totalDue + (m.remainingInstallments || 0)) / m.limit;
      if (use > 0.5) add('warning', 'limit-' + st.id, `Kart limitinin ${pct(use)} kadarı dolu`,
        `Dönem borcu ve kalan taksitler birlikte ${tl0(m.totalDue + (m.remainingInstallments || 0))}. Limit kullanım oranının %30'un altında kalması kredi notunu olumlu etkiler.`);
    }
    if (m.pointsTL >= 100) {
      add('good', 'points-' + st.id, `${tl(m.pointsTL)} değerinde Worldpuan birikmiş`,
        `${m.points.toLocaleString('tr-TR')} Worldpuan duruyor. World üye işyerlerinde harcamana sayarak bunu nakde yakın bir indirime çevirebilirsin; bazı kampanya puanlarının son kullanım tarihi oluyor.`);
    }
    // Taksit yükü
    const sched = installmentSchedule(st);
    const nextMonth = sched.months[0];
    if (nextMonth && income > 0 && nextMonth.value / income > 0.15) {
      add('warning', 'inst-' + st.id, `Gelecek ay ${tl0(nextMonth.value)} taksit ödemesi var`,
        `Bu, beklenen aylık gelirinin ${pct(nextMonth.value / income)} kadarı. Yeni taksitli alışverişleri bu yük azalana kadar ertelemek nakit akışını rahatlatır.`);
    }
    // Tek seferlik fatura ödemesi ücreti / nakit avans
    const cashAdv = txs.filter((t) => t.statementId === st.id).filter((t) => /NAKIT AVANS|NAKIT CEKIM/.test(norm(t.desc)));
    if (cashAdv.length) add('warning', 'cashadv-' + st.id, 'Kredi kartından nakit çekim yapılmış',
      'Kredi kartından nakit çekimde faiz aynı gün başlar ve ayrıca nakit çekim ücreti alınır. Acil değilse banka kartı ya da vadesiz hesap kullan.');
  }

  // 5: Vadesiz hesap eksiye düşüyor (KMH)
  const od = overdraft(txs, ym);
  if (od.count > 0) {
    add('warning', 'kmh', `Vadesiz hesap bu ay ${od.days} gün eksiye düştü`,
      `En düşük bakiye ${tl(od.min)}. Hesap eksiye düştüğünde Kredili Mevduat (ek hesap) faizi işler. Ödemelerden önce fon satışını bir gün önce yapmak ya da küçük bir tampon bakiye bırakmak bunu önler.`);
  }

  // 6-7: Bütçeler
  for (const b of budgetStatus(sum, settings.budgets, ym, today)) {
    if (b.over) add('critical', 'bud-' + b.id, `${catName(b.id)} bütçesi aşıldı`, `${tl0(b.spent)} harcandı, limit ${tl0(b.limit)} (${pct(b.ratio)}).`);
    else if (b.willOver) add('warning', 'budf-' + b.id, `${catName(b.id)} bu hızla bütçeyi aşacak`, `Şu ana kadar ${tl0(b.spent)}; ay sonu tahmini ${tl0(b.forecast)}, limit ${tl0(b.limit)}.`);
  }

  // 8: Abonelikler
  const subs = subscriptions(txs);
  if (subs.length) {
    const total = subs.reduce((s, x) => s + x.monthly, 0);
    add('info', 'subs', `Düzenli ödemeler: aylık ${tl0(total)}, yıllık ${tl0(total * 12)}`,
      `${subs.length} abonelik ya da düzenli ödeme bulundu (${subs.slice(0, 4).map((s) => s.name).join(', ')}${subs.length > 4 ? '…' : ''}). Son 30 günde kullanmadığın varsa iptal etmek en kolay tasarruftur.`);
    for (const s of subs.filter((x) => x.increased > 0)) {
      add('warning', 'subup-' + s.key, `${s.name} ücreti arttı`, `Son ödeme ${tl(s.last)}, öncesi ${tl(s.prev)} (+${tl(s.increased)}). Yıllık etkisi ${tl0(s.increased * 12)}.`);
    }
  }

  // 9: En çok artan kategori
  if (prev.expense > 0) {
    const pm = Object.fromEntries(prev.cats.map((c) => [c.id, c.value]));
    const ups = sum.cats.filter((c) => pm[c.id] > 200 && c.value > pm[c.id] * 1.3 && c.value - pm[c.id] > 500 && c.id !== 'nakit')
      .sort((a, b) => (b.value - pm[b.id]) - (a.value - pm[a.id]));
    if (ups[0]) {
      const c = ups[0];
      add('info', 'up-' + c.id, `${catName(c.id)} harcaması geçen aya göre ${pct(c.value / pm[c.id] - 1)} arttı`, `${ayAdi(ym)}: ${tl0(c.value)}, önceki ay: ${tl0(pm[c.id])}.`);
    }
  }

  // 10: Küçük ve sık harcamalar
  const small = txs.filter((t) => inMonth(t, ym) && ['kafe', 'tutun'].includes(t.category) && t.amount < 0);
  const smallTotal = -small.reduce((s, t) => s + t.amount, 0);
  if (small.length >= 8) {
    add('info', 'small', `Kafe, fırın ve büfede ${small.length} harcama: ${tl0(smallTotal)}`,
      `Tek tek küçük görünen bu harcamalar yıllığa vurunca yaklaşık ${tl0(smallTotal * 12)} ediyor. Haftalık bir limit koymak bu kalemi kontrol etmenin en kolay yolu.`);
  }

  // 11: Tasarruf oranı
  if (sum.income > 0) {
    const sr = sum.savingsRate;
    if (sr < 0) add('critical', 'sr', `Bu ay giderler geliri ${tl0(-sum.net)} aştı`, 'Açık birikimden ya da kredi kartından finanse ediliyor demektir. En büyük üç kategoriye bak ve bütçe koy.');
    else if (sr < 0.1) add('warning', 'sr', `Tasarruf oranı ${pct(sr)}`, 'Gelirin en az %10-20 kadarını ay başında otomatik olarak birikime ayırmak, harcamaları kalan tutara göre şekillendirir.');
    else if (sr >= 0.2) add('good', 'sr', `Tasarruf oranı ${pct(sr)} — iyi gidiyor`, `Bu ay ${tl0(sum.net)} artıda. Bunu hedeflerine aktarmayı unutma.`);
  }

  // 12: Beklenen gelir gelmedi
  const curYm = today.slice(0, 7);
  if (ym === curYm) {
    for (const s of settings.incomeSources || []) {
      if (!s.day) continue;
      const got = txs.filter((t) => inMonth(t, ym) && (t.incomeSourceId === s.id)).reduce((a, t) => a + t.amount, 0);
      if (got <= 0 && Number(today.slice(8, 10)) > s.day + 3) {
        add('warning', 'inc-' + s.id, `${s.name} henüz görünmüyor`, `Her ayın ${s.day}. günü beklenen ${tl0(s.amount)} bu ay hesap hareketlerinde yok. Güncel dökümü yükle ya da elle gelir ekle.`);
      }
    }
  }

  // 13: Acil durum fonu
  const avg = avgExpense(txs, ym);
  const assets = (settings.assets || []).reduce((s, a) => s + assetValue(a, settings.rates), 0);
  if (avg > 0 && (settings.assets || []).length) {
    const monthsCovered = assets / avg;
    if (monthsCovered < 3) add('warning', 'emerg', `Birikimin ${monthsCovered.toFixed(1)} aylık gideri karşılıyor`, `Ortalama aylık gider ${tl0(avg)}. Kolay bozdurulabilir 3-6 aylık gider tutarında acil durum fonu önerilir (${tl0(avg * 3)} - ${tl0(avg * 6)}).`);
    else add('good', 'emerg', `Acil durum fonun ${monthsCovered.toFixed(1)} ay yetiyor`, 'Bu tutarın üzerindeki birikimi daha uzun vadeli hedeflere yönlendirebilirsin.');
  }

  // 14: Hedefler
  for (const g of settings.goals || []) {
    if (!g.deadline || g.saved >= g.target) continue;
    const monthsLeft = Math.max(1, Math.round(gunFarki(today, g.deadline) / 30.4));
    const need = (g.target - g.saved) / monthsLeft;
    add('info', 'goal-' + g.id, `"${g.name}" için ayda ${tl0(need)} ayırman gerek`, `${tl0(g.target - g.saved)} kaldı, ${monthsLeft} ay var.` + (sum.net > 0 ? ` Bu ayki artı ${tl0(sum.net)}.` : ''));
  }

  // 15: Kategorisiz harcamalar
  const other = sum.cats.find((c) => c.id === 'diger');
  if (other && sum.expense > 0 && other.value / sum.expense > 0.15) {
    add('info', 'other', `Harcamaların ${pct(other.value / sum.expense)} "Diğer" kategorisinde`, 'Hareketler sekmesinde bunlara kategori verirsen uygulama işyerini hatırlar ve bir dahakine otomatik sınıflar.');
  }

  // 16: Yedek
  const lb = settings.lastBackupAt;
  if (txs.length && (!lb || gunFarki(lb.slice(0, 10), today) > 30)) {
    add('info', 'backup', lb ? 'Son yedeğin üzerinden bir ay geçti' : 'Henüz yedek almadın', 'Veriler sadece bu telefonda. Ayarlar > Yedek bölümünden şifreli yedek alıp Drive veya iCloud\'a kaydet.');
  }

  const order = { critical: 0, warning: 1, info: 2, good: 3 };
  return tips.sort((a, b) => order[a.level] - order[b.level]);
}

export function expectedIncome(settings) {
  return (settings.incomeSources || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
}
