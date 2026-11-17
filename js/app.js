import * as db from './db.js';
import { tl, tl0, pct, esc, uid, hash, r2, bugunISO, ayAnahtar, ayAdi, ayKaydir, tarihGoster, gunFarki, AYLAR, norm } from './util.js';
import { CATEGORIES, CAT, catName, catIcon, catKind, classify, merchantKey, prettyMerchant, parseFast } from './categorize.js';
import { parseStatement } from './parsers.js';
import { pdfToPages } from './pdftext.js';
import { monthSummary, monthsWithData, trend, latestCards, cardPaymentStatus, installmentSchedule, subscriptions, budgetStatus, buildTips, fundPrices, assetValue, avgExpense, expectedIncome } from './analytics.js';
import { prepareImage, ocrImage, parseReceiptText } from './receipt.js';
import { encryptJSON, decryptJSON, blobToDataURL, dataURLToBlob } from './backup.js';

const VERSION = '1.0.0';
const DEFAULT_SETTINGS = {
  ownerNames: [], incomeSources: [], budgets: {}, rules: [], goals: [], assets: [], rates: {}, lastBackupAt: null,
};

const S = {
  txs: [], statements: [], receipts: [], settings: { ...DEFAULT_SETTINGS },
  tab: 'ozet', ym: bugunISO().slice(0, 7), q: '', kind: 'all', cat: '', planSeg: 'butce', trendSel: null, showAllBudgets: false,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ctx = (extraOwner) => ({
  ownerNames: extraOwner ? [...S.settings.ownerNames, extraOwner] : S.settings.ownerNames,
  rules: S.settings.rules,
  incomeSources: S.settings.incomeSources,
});

// ---------------------------------------------------------------------------
// Yükleme / kaydetme
// ---------------------------------------------------------------------------
async function load() {
  const [txs, statements, receipts, kv] = await Promise.all([db.all('txs'), db.all('statements'), db.all('receipts'), db.kvAll()]);
  S.txs = txs.sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  S.statements = statements.sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''));
  S.receipts = receipts;
  S.settings = { ...DEFAULT_SETTINGS, ...(kv.settings || {}) };
}
const saveSettings = () => db.put('kv', S.settings, 'settings');

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function parseAmount(s) {
  let t = String(s || '').replace(/[^\d.,-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}
const amountInput = (v) => (v == null || v === '' || Number.isNaN(v) ? '' : String(v).replace('.', ','));

function catOptions(selected, kinds = ['expense', 'income', 'transfer']) {
  const groups = { expense: 'Gider', income: 'Gelir', transfer: 'Transfer (gelir/gider sayılmaz)' };
  return kinds.map((k) => `<optgroup label="${groups[k]}">${CATEGORIES.filter((c) => c.kind === k)
    .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
}

// ---------------------------------------------------------------------------
// Alt sayfa (sheet)
// ---------------------------------------------------------------------------
let current = null;
function openSheet(html, onMount) {
  closeSheet(true);
  $('#toast').classList.remove('show');
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  const sh = document.createElement('div');
  sh.className = 'sheet';
  sh.setAttribute('role', 'dialog');
  sh.innerHTML = `<div class="grab"></div>${html}`;
  document.body.append(bd, sh);
  requestAnimationFrame(() => { bd.classList.add('show'); sh.classList.add('show'); });
  bd.addEventListener('click', () => closeSheet());
  $$('[data-close]', sh).forEach((b) => b.addEventListener('click', () => closeSheet()));
  current = { bd, sh, onClose: null };
  if (onMount) onMount(sh, current);
  return current;
}
function closeSheet(instant) {
  if (!current) return;
  const { bd, sh, onClose } = current;
  current = null;
  if (onClose) onClose();
  if (instant) { bd.remove(); sh.remove(); return; }
  bd.classList.remove('show'); sh.classList.remove('show');
  setTimeout(() => { bd.remove(); sh.remove(); }, 260);
}
const xBtn = '<button class="icon-btn x" data-close aria-label="Kapat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';

function confirmSheet(title, body, okText = 'Evet', danger = false) {
  return new Promise((res) => {
    let done = false;
    const c = openSheet(`<h3>${esc(title)}${xBtn}</h3><p class="muted">${body}</p>
      <div class="btns"><button class="btn" data-no>Vazgeç</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okText)}</button></div>`, (sh) => {
      $('[data-no]', sh).onclick = () => { done = true; closeSheet(); res(false); };
      $('[data-yes]', sh).onclick = () => { done = true; closeSheet(); res(true); };
    });
    c.onClose = () => { if (!done) res(false); };
  });
}

function promptSheet(title, body, { type = 'text', placeholder = '', okText = 'Tamam', value = '' } = {}) {
  return new Promise((res) => {
    let done = false;
    const c = openSheet(`<h3>${esc(title)}${xBtn}</h3>${body ? `<p class="muted">${body}</p>` : ''}
      <form><label class="f"><input type="${type}" name="v" placeholder="${esc(placeholder)}" value="${esc(value)}" ${type === 'text' ? 'inputmode="decimal"' : ''} autocomplete="off"></label>
      <div class="btns"><button type="button" class="btn" data-no>Vazgeç</button><button class="btn primary">${esc(okText)}</button></div></form>`, (sh) => {
      const f = $('form', sh);
      setTimeout(() => f.v.focus(), 300);
      $('[data-no]', sh).onclick = () => { done = true; closeSheet(); res(null); };
      f.onsubmit = (e) => { e.preventDefault(); done = true; closeSheet(); res(f.v.value); };
    });
    c.onClose = () => { if (!done) res(null); };
  });
}

// ---------------------------------------------------------------------------
// Ekranlar
// ---------------------------------------------------------------------------
const TITLES = { ozet: 'Özet', hareket: 'Hareketler', plan: 'Plan', tuyo: 'Tüyolar' };

function render() {
  $('#title').textContent = TITLES[S.tab];
  $('#month-label').textContent = ayAdi(S.ym);
  $$('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  const v = $('#view');
  if (S.tab === 'ozet') v.innerHTML = viewOzet();
  else if (S.tab === 'hareket') v.innerHTML = viewHareket();
  else if (S.tab === 'plan') v.innerHTML = viewPlan();
  else v.innerHTML = viewTuyo();
}

function tipHTML(t) {
  const lab = { critical: ['!', 'Kritik'], warning: ['!', 'Dikkat'], info: ['i', 'Bilgi'], good: ['✓', 'İyi'] }[t.level];
  return `<div class="tip ${t.level}"><div class="ic" aria-hidden="true">${lab[0]}</div><div><div class="lvl">${lab[1]}</div><div class="t">${esc(t.title)}</div><div class="b">${esc(t.body)}</div></div></div>`;
}

function welcome() {
  return `<div class="card empty">
    <div class="big">👋</div>
    <h2 style="justify-content:center;color:var(--text)">Finans Asistanına hoş geldin</h2>
    <p class="small">Tüm verilerin sadece bu telefonda saklanır. Hiçbir şey sunucuya gönderilmez.</p>
    <ol class="steps">
      <li><span>Yapı Kredi <b>kredi kartı ekstresi</b> ve <b>hesap hareketleri</b> PDF'lerini yükle.</span></li>
      <li><span>Plan › Gelir bölümünden <b>maaş ve kira</b> gelirlerini tanımla.</span></li>
      <li><span>Harcadıkça <b>fiş fotoğrafı</b> çek ya da elle gider ekle.</span></li>
    </ol>
    <div class="btns"><button class="btn primary" data-act="import-pdf">Ekstre yükle</button></div>
  </div>`;
}

function viewOzet() {
  if (!S.txs.length) return welcome();
  const sum = monthSummary(S.txs, S.ym);
  const budgets = Object.fromEntries(budgetStatus(sum, S.settings.budgets, S.ym).map((b) => [b.id, b]));
  const tips = buildTips(S, S.ym);
  let h = '';

  h += `<div class="kpis">
    <div class="kpi"><div class="k"><span class="dot" style="background:var(--series-1)"></span>Gelir</div><div class="v num">${tl0(sum.income)}</div><div class="s">${sum.incomes[0] ? esc(catName(sum.incomes[0].id)) : '—'}</div></div>
    <div class="kpi"><div class="k"><span class="dot" style="background:var(--series-2)"></span>Gider</div><div class="v num">${tl0(sum.expense)}</div><div class="s">${sum.cats.length} kategori</div></div>
    <div class="kpi"><div class="k">Net</div><div class="v num" style="color:${sum.net >= 0 ? 'var(--good)' : 'var(--critical)'}">${sum.net >= 0 ? '+' : ''}${tl0(sum.net)}</div><div class="s">${sum.savingsRate != null ? 'Tasarruf ' + pct(sum.savingsRate) : 'Gelir girilmedi'}</div></div>
  </div>`;

  for (const st of latestCards(S.statements)) {
    const ps = cardPaymentStatus(st, S.txs);
    if (ps.status === 'paid' && ps.daysLeft != null && ps.daysLeft < -20) continue;
    h += cardDueCard(st, ps, true);
  }

  if (tips.length) {
    h += `<div class="card"><h2>Öne çıkan tüyolar<span class="right"><button class="btn sm" data-act="tab" data-v="tuyo">Tümü (${tips.length})</button></span></h2>${tips.slice(0, 3).map(tipHTML).join('')}</div>`;
  }

  if (sum.cats.length) {
    const max = Math.max(...sum.cats.map((c) => Math.max(c.value, budgets[c.id]?.limit || 0)), 1);
    h += `<div class="card"><h2>Kategoriler<span class="right">${ayAdi(S.ym)}</span></h2><div class="bars">`;
    for (const c of sum.cats.slice(0, 10)) {
      const b = budgets[c.id];
      const cls = b ? (b.over ? 'over' : b.willOver ? 'warn' : '') : '';
      const w = Math.max(0, (c.value / max) * 100);
      h += `<button class="barrow" data-act="cat-filter" data-v="${c.id}" style="all:unset;display:block;cursor:pointer">
        <div class="top-line"><span>${catIcon(c.id)}</span><span class="name">${esc(catName(c.id))}${b ? ` <span class="badge ${b.over ? 'bad' : b.willOver ? 'warn' : 'ok'}">${b.over ? 'Aşıldı' : b.willOver ? 'Aşacak' : pct(b.ratio)}</span>` : ''}</span><span class="val num">${tl0(c.value)}</span>${b ? `<span class="muted small num">/ ${tl0(b.limit)}</span>` : ''}</div>
        <div class="track"><div class="fill ${cls}" style="width:${w}%"></div>${b ? `<div class="limit-mark" style="left:calc(${(b.limit / max) * 100}% - 1px)"></div>` : ''}</div>
      </button>`;
    }
    if (sum.cats.length > 10) h += `<div class="muted small">+${sum.cats.length - 10} kategori daha: ${tl0(sum.cats.slice(10).reduce((s, c) => s + c.value, 0))}</div>`;
    h += `</div>${sum.unexplainedCash > 0 ? `<p class="muted small" style="margin:12px 0 0">ATM'den ${tl0(sum.cashOut)} çekildi; ${tl0(sum.unexplainedCash)} kadarı fişle açıklanmadığı için "Nakit (detaysız)" sayıldı.</p>` : ''}</div>`;
  }

  // Trend: 6 ay gelir/gider
  const tr = trend(S.txs, S.ym, 6);
  const tmax = Math.max(1, ...tr.flatMap((m) => [m.income, m.expense]));
  const sel = tr.find((m) => m.ym === S.trendSel) || tr[tr.length - 1];
  h += `<div class="card"><h2>Son 6 ay</h2>
    <div class="trend" role="img" aria-label="Son 6 ayın gelir ve giderleri">${tr.map((m) => `<div class="col ${m.ym === sel.ym ? 'sel' : ''}" data-act="trend-sel" data-v="${m.ym}" title="${ayAdi(m.ym)}: gelir ${tl0(m.income)}, gider ${tl0(m.expense)}">
      <div class="b" style="height:${(m.income / tmax) * 100}%;background:var(--series-1)"></div>
      <div class="b" style="height:${(Math.max(0, m.expense) / tmax) * 100}%;background:var(--series-2)"></div></div>`).join('')}</div>
    <div class="trend-x">${tr.map((m) => `<div>${AYLAR[Number(m.ym.slice(5)) - 1].slice(0, 3)}</div>`).join('')}</div>
    <div class="trend-detail num"><b>${ayAdi(sel.ym)}</b> · Gelir ${tl0(sel.income)} · Gider ${tl0(sel.expense)} · Net ${tl0(sel.income - sel.expense)}</div>
    <div class="legend"><span><i class="dot" style="background:var(--series-1)"></i>Gelir</span><span><i class="dot" style="background:var(--series-2)"></i>Gider</span></div>
  </div>`;
  return h;
}

function cardDueCard(st, ps, compact) {
  const m = st.meta;
  const stText = { paid: 'Tamamı ödendi', open: ps.daysLeft >= 0 ? `${ps.daysLeft} gün kaldı` : 'Ödeme bekleniyor', partial: 'Kısmen ödendi', 'partial-late': 'Eksik ödendi', late: 'Gecikti', none: 'Borç yok' }[ps.status];
  const use = m.limit ? Math.min(1, (m.totalDue + (m.remainingInstallments || 0)) / m.limit) : null;
  return `<div class="card"><h2>💳 ${esc(st.bank)} •••• ${esc(m.cardLast4 || '')}<span class="right"><span class="status ${ps.status}">${stText}</span></span></h2>
    <div class="f-row" style="align-items:flex-end"><div><div class="muted small">Dönem borcu</div><div class="big-num num">${tl(m.totalDue)}</div></div>
    <div style="text-align:right"><div class="muted small">Son ödeme</div><div style="font-weight:600">${tarihGoster(m.dueDate)}</div></div></div>
    <hr class="sep"><div class="kv num">
      <div class="k">Ödenen</div><div class="v">${tl(ps.paid)}</div>
      ${ps.left > 0 ? `<div class="k">Kalan</div><div class="v" style="color:var(--warning)">${tl(ps.left)}</div>` : ''}
      <div class="k">Asgari tutar</div><div class="v">${tl(m.minDue)}</div>
      ${compact ? '' : `<div class="k">Hesap kesim</div><div class="v">${tarihGoster(m.cutDate)}</div>
      <div class="k">Sonraki kesim / son ödeme</div><div class="v">${tarihGoster(m.nextCutDate)} / ${tarihGoster(m.nextDueDate)}</div>
      <div class="k">Kalan taksitler</div><div class="v">${tl(m.remainingInstallments)}</div>
      <div class="k">Worldpuan</div><div class="v">${tl(m.pointsTL)}</div>
      <div class="k">Akdi faiz (aylık)</div><div class="v">%${((m.contractRate?.monthly || 0) * 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>`}
    </div>
    ${use != null ? `<div class="muted small" style="margin-top:12px">Limit kullanımı ${pct(use)} · ${tl0(m.limit)} limit</div><div class="track"><div class="fill ${use > 0.7 ? 'over' : use > 0.5 ? 'warn' : ''}" style="width:${use * 100}%"></div></div>` : ''}
  </div>`;
}

function txRow(t) {
  const kind = catKind(t.category);
  const cls = kind === 'income' ? 'in' : kind === 'transfer' ? 'tr' : t.amount > 0 ? 'in' : '';
  const sign = t.amount > 0 ? '+' : '−';
  const src = { card: 'Kart', account: 'Hesap', cash: 'Nakit', receipt: 'Fiş', manual: 'Elle' }[t.source] || '';
  const extras = [];
  if (t.installment) extras.push(`<span class="badge">${t.installment.k}/${t.installment.n} taksit</span>`);
  if (t.receiptId) extras.push('<span class="badge">🧾</span>');
  if (t.pendingMatch) extras.push('<span class="badge warn">ekstre bekleniyor</span>');
  return `<button class="row" data-act="tx" data-v="${t.id}">
    <div class="av">${catIcon(t.category)}</div>
    <div class="mid"><div class="t1">${esc(prettyMerchant(t.desc))}</div><div class="t2">${esc(catName(t.category))} · ${src}${extras.join('')}</div></div>
    <div class="amt num ${cls}">${sign}${tl(Math.abs(t.amount))}</div></button>`;
}

function viewHareket() {
  if (!S.txs.length) return welcome();
  const q = norm(S.q);
  let list = S.txs.filter((t) => t.date.startsWith(S.ym));
  if (S.kind !== 'all') list = list.filter((t) => catKind(t.category) === S.kind);
  if (S.cat) list = list.filter((t) => t.category === S.cat);
  if (q) list = list.filter((t) => norm(t.desc + ' ' + catName(t.category) + ' ' + (t.note || '')).includes(q));
  const chip = (k, l) => `<button class="chip ${S.kind === k ? 'on' : ''}" data-act="kind" data-v="${k}">${l}</button>`;
  let h = `<div class="search"><input type="search" id="q" placeholder="Ara: işyeri, kategori, not" value="${esc(S.q)}" autocomplete="off"></div>
    <div class="chips">${chip('all', 'Tümü')}${chip('expense', 'Gider')}${chip('income', 'Gelir')}${chip('transfer', 'Transfer')}
    ${S.cat ? `<button class="chip on" data-act="cat-clear">${catIcon(S.cat)} ${esc(catName(S.cat))} ✕</button>` : ''}</div>`;
  if (!list.length) return h + `<div class="card empty"><div class="big">🔍</div>${ayAdi(S.ym)} için gösterilecek hareket yok.</div>`;
  const byDay = {};
  for (const t of list) (byDay[t.date] = byDay[t.date] || []).push(t);
  for (const d of Object.keys(byDay).sort().reverse()) {
    const dayTotal = byDay[d].filter((t) => catKind(t.category) === 'expense').reduce((s, t) => s - t.amount, 0);
    h += `<div class="day-h"><span>${tarihGoster(d)}</span><span class="num">${dayTotal ? tl0(dayTotal) : ''}</span></div><div class="list">${byDay[d].map(txRow).join('')}</div>`;
  }
  return h;
}

function viewTuyo() {
  if (!S.txs.length) return welcome();
  const tips = buildTips(S, S.ym);
  if (!tips.length) return '<div class="card empty"><div class="big">✨</div>Bu ay için öne çıkan bir uyarı yok.</div>';
  return `<p class="muted small" style="margin:0 4px 10px">${ayAdi(S.ym)} verilerine göre, önem sırasıyla. Tüm hesaplamalar telefonda yapılır.</p>` + tips.map(tipHTML).join('');
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------
function viewPlan() {
  const segs = [['butce', 'Bütçe'], ['kart', 'Kart & Taksit'], ['abone', 'Abonelik'], ['gelir', 'Gelir'], ['hedef', 'Hedef'], ['varlik', 'Varlık']];
  let h = `<div class="seg scroll">${segs.map(([k, l]) => `<button class="${S.planSeg === k ? 'on' : ''}" data-act="seg" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (S.planSeg === 'butce') h += planButce();
  if (S.planSeg === 'kart') h += planKart();
  if (S.planSeg === 'abone') h += planAbone();
  if (S.planSeg === 'gelir') h += planGelir();
  if (S.planSeg === 'hedef') h += planHedef();
  if (S.planSeg === 'varlik') h += planVarlik();
  return h;
}

function planButce() {
  const sum = monthSummary(S.txs, S.ym);
  const spent = Object.fromEntries(sum.cats.map((c) => [c.id, c.value]));
  const avg3 = {};
  for (let i = 1; i <= 3; i++) for (const c of monthSummary(S.txs, ayKaydir(S.ym, -i)).cats) avg3[c.id] = (avg3[c.id] || 0) + c.value / 3;
  const cats = CATEGORIES.filter((c) => c.kind === 'expense' && c.id !== 'iade')
    .filter((c) => S.showAllBudgets || spent[c.id] || avg3[c.id] || S.settings.budgets[c.id]);
  const totalBudget = Object.values(S.settings.budgets).reduce((s, v) => s + (Number(v) || 0), 0);
  const inc = expectedIncome(S.settings);
  let h = `<div class="card"><h2>Aylık bütçe<span class="right">${ayAdi(S.ym)}</span></h2>
    <div class="kv num"><div class="k">Toplam bütçe</div><div class="v">${tl0(totalBudget)}</div>
    <div class="k">Bu ay harcanan</div><div class="v">${tl0(sum.expense)}</div>
    ${inc ? `<div class="k">Beklenen gelir</div><div class="v">${tl0(inc)}</div><div class="k">Bütçe sonrası kalan</div><div class="v" style="color:${inc - totalBudget >= 0 ? 'var(--good)' : 'var(--critical)'}">${tl0(inc - totalBudget)}</div>` : ''}</div>
    <p class="muted small" style="margin:10px 0 0">Limit yazıp klavyeyi kapatınca kaydedilir. Gri yazı son 3 ayın ortalamasıdır.</p></div><div class="list">`;
  for (const c of cats) {
    const lim = S.settings.budgets[c.id] || '';
    const s = spent[c.id] || 0;
    const ratio = lim ? s / lim : 0;
    h += `<div class="row" style="cursor:default"><div class="av">${c.icon}</div><div class="mid"><div class="t1">${esc(c.name)}</div>
      <div class="t2 num">${tl0(s)} harcandı${avg3[c.id] ? ` · ort. ${tl0(avg3[c.id])}` : ''}</div>
      ${lim ? `<div class="track" style="margin-top:6px"><div class="fill ${ratio > 1 ? 'over' : ratio > 0.85 ? 'warn' : ''}" style="width:${Math.min(100, ratio * 100)}%"></div></div>` : ''}</div>
      <input type="text" inputmode="decimal" data-budget="${c.id}" value="${lim ? amountInput(lim) : ''}" placeholder="${avg3[c.id] ? Math.round(avg3[c.id] / 100) * 100 : 'Limit'}" style="width:96px;text-align:right" aria-label="${esc(c.name)} limiti"></div>`;
  }
  h += `</div><div class="btns"><button class="btn" data-act="budget-all">${S.showAllBudgets ? 'Sadece kullanılanlar' : 'Tüm kategoriler'}</button><button class="btn" data-act="budget-suggest">Ortalamaya göre doldur</button></div>`;
  return h;
}

function planKart() {
  const cards = latestCards(S.statements);
  if (!cards.length) return `<div class="card empty"><div class="big">💳</div>Kart ekstresi yüklenince ödeme durumu ve taksit takvimi burada görünür.<div class="btns"><button class="btn primary" data-act="import-pdf">Ekstre yükle</button></div></div>`;
  let h = '';
  for (const st of cards) {
    h += cardDueCard(st, cardPaymentStatus(st, S.txs), false);
    const sch = installmentSchedule(st);
    if (sch.months.length) {
      const max = Math.max(...sch.months.map((m) => m.value));
      h += `<div class="card"><h2>Taksit takvimi<span class="right">•••• ${esc(st.meta.cardLast4)}</span></h2><div class="bars">
        ${sch.months.map((m) => `<div class="barrow"><div class="top-line"><span class="name">${ayAdi(m.ym)} ekstresi</span><span class="val num">${tl(m.value)}</span></div><div class="track"><div class="fill" style="width:${(m.value / max) * 100}%"></div></div></div>`).join('')}
        </div><hr class="sep"><div class="list" style="border:0">
        ${sch.items.map((i) => `<div class="row" style="cursor:default;padding-left:0;padding-right:0"><div class="mid"><div class="t1">${esc(i.name)}</div><div class="t2 num">${i.k}/${i.n} ödendi · ${i.count} taksit kaldı · aylık ${tl(i.per)}</div></div><div class="amt num">${tl(i.left)}</div></div>`).join('')}
        </div></div>`;
    }
  }
  return h;
}

function planAbone() {
  const subs = subscriptions(S.txs);
  if (!subs.length) return '<div class="card empty"><div class="big">🔁</div>Henüz düzenli ödeme bulunmadı. Birkaç aylık ekstre yükledikçe tekrar eden ödemeler otomatik bulunur.</div>';
  const total = subs.reduce((s, x) => s + x.monthly, 0);
  return `<div class="card"><h2>Düzenli ödemeler</h2><div class="f-row"><div><div class="muted small">Aylık</div><div class="big-num num">${tl0(total)}</div></div><div style="text-align:right"><div class="muted small">Yıllık</div><div class="big-num num">${tl0(total * 12)}</div></div></div></div>
    <div class="list">${subs.map((s) => `<div class="row" style="cursor:default"><div class="av">${catIcon(s.category)}</div><div class="mid"><div class="t1">${esc(s.name)}${s.increased ? ' <span class="badge bad">zamlandı</span>' : ''}</div>
    <div class="t2 num">Son: ${tarihGoster(s.lastDate)} · ${s.months} ayda görüldü${s.increased ? ` · +${tl(s.increased)}` : ''}</div></div><div style="text-align:right"><div class="amt num">${tl(s.monthly)}</div><div class="muted small num">${tl0(s.yearly)}/yıl</div></div></div>`).join('')}</div>
    <p class="muted small">Listeyi bilinen abonelik markaları ve en az iki ayda benzer tutarla tekrar eden ödemeler oluşturur.</p>`;
}

function incomeCandidates() {
  const m = {};
  for (const t of S.txs) {
    if (t.amount <= 0 || t.category !== 'diger_gelir') continue;
    const f = parseFast(t.desc);
    const name = f ? f.party : prettyMerchant(t.desc);
    const k = norm(name);
    if (!m[k]) m[k] = { name, total: 0, n: 0, last: t.amount };
    m[k].total += t.amount; m[k].n++;
  }
  return Object.values(m).filter((x) => x.total >= 1000).sort((a, b) => b.total - a.total).slice(0, 4);
}

function planGelir() {
  const srcs = S.settings.incomeSources;
  let h = '<div class="card"><h2>Gelir kaynakları</h2>';
  if (!srcs.length) h += '<p class="muted small" style="margin-top:0">Maaş ve kira gelirini tanımla. Anahtar kelime, hesap dökümünde gönderenin adında geçen kelimedir (ör. şirket adı ya da kiracının soyadı). Eşleşen girişler otomatik olarak bu gelire yazılır.</p>';
  h += '<div class="list" style="border:0">';
  for (const s of srcs) {
    const got = S.txs.filter((t) => t.incomeSourceId === s.id && t.date.startsWith(S.ym)).reduce((a, t) => a + t.amount, 0);
    h += `<button class="row" data-act="income-edit" data-v="${s.id}" style="padding-left:0;padding-right:0"><div class="av">${s.type === 'kira' ? '🔑' : '💼'}</div><div class="mid"><div class="t1">${esc(s.name)}</div>
      <div class="t2">${s.day ? `Her ayın ${s.day}. günü · ` : ''}${s.keyword ? `“${esc(s.keyword)}”` : 'anahtar kelime yok'}</div></div>
      <div style="text-align:right"><div class="amt num ${got > 0 ? 'in' : ''}">${tl0(got)}</div><div class="muted small num">beklenen ${tl0(s.amount)}</div></div></button>`;
  }
  h += `</div><div class="btns"><button class="btn primary" data-act="income-edit">Gelir kaynağı ekle</button><button class="btn" data-act="manual-income">Elle gelir gir</button></div></div>`;
  const cand = incomeCandidates();
  if (cand.length) {
    h += `<div class="card"><h2>Dökümde bulunan gelen paralar</h2><p class="muted small" style="margin-top:0">Bunlar şu an “Diğer Gelir” sayılıyor. Düzenli bir gelirse tek dokunuşla tanımla.</p><div class="list" style="border:0">
      ${cand.map((c, i) => `<div class="row" style="cursor:default;padding-left:0;padding-right:0"><div class="mid"><div class="t1">${esc(c.name)}</div><div class="t2 num">${c.n} giriş · toplam ${tl0(c.total)}</div></div>
      <button class="btn sm" data-act="cand" data-v="${i}" data-t="maas">Maaş</button><button class="btn sm" data-act="cand" data-v="${i}" data-t="kira">Kira</button></div>`).join('')}</div></div>`;
  }
  return h;
}

function planHedef() {
  const goals = S.settings.goals;
  let h = '';
  if (!goals.length) h += '<div class="card empty"><div class="big">🎯</div>Tatil, ev peşinatı ya da acil durum fonu gibi bir hedef ekle; aylık ne kadar ayırman gerektiğini hesaplayayım.</div>';
  for (const g of goals) {
    const r = g.target ? Math.min(1, g.saved / g.target) : 0;
    const monthsLeft = g.deadline ? Math.max(1, Math.round(gunFarki(bugunISO(), g.deadline) / 30.4)) : null;
    const need = monthsLeft ? Math.max(0, (g.target - g.saved) / monthsLeft) : null;
    h += `<div class="card"><h2>🎯 ${esc(g.name)}<span class="right"><button class="btn sm" data-act="goal-edit" data-v="${g.id}">Düzenle</button></span></h2>
      <div class="f-row" style="align-items:flex-end"><div><div class="big-num num">${tl0(g.saved)}</div><div class="muted small num">hedef ${tl0(g.target)}</div></div><div style="text-align:right"><b>${pct(r)}</b>${g.deadline ? `<div class="muted small">${tarihGoster(g.deadline)}</div>` : ''}</div></div>
      <div class="track" style="margin-top:10px"><div class="fill" style="width:${r * 100}%;background:var(--good)"></div></div>
      ${need != null && r < 1 ? `<p class="small" style="margin:10px 0 0">Hedefe ulaşmak için <b class="num">ayda ${tl0(need)}</b> ayırman gerek (${monthsLeft} ay).${S.settings.inflation ? ` Yıllık %${S.settings.inflation} enflasyonla hedefin o tarihteki karşılığı yaklaşık <b class="num">${tl0(g.target * Math.pow(1 + S.settings.inflation / 100, monthsLeft / 12))}</b>.` : ''}</p>` : ''}
      <div class="btns"><button class="btn sm" data-act="goal-add" data-v="${g.id}">+ Birikim ekle</button></div></div>`;
  }
  h += `<div class="btns"><button class="btn primary" data-act="goal-edit">Hedef ekle</button></div>
    <label class="f" style="margin-top:16px"><span>Yıllık enflasyon beklentisi (%) — hedeflerin gelecekteki karşılığı için</span><input type="text" inputmode="decimal" id="inflation" value="${S.settings.inflation || ''}" placeholder="ör. 30"></label>`;
  return h;
}

const ASSET_TYPES = { tl: 'TL (vadesiz/mevduat)', usd: 'Dolar (USD)', eur: 'Euro (EUR)', altin: 'Altın (gram)', fon: 'Yatırım fonu', diger: 'Diğer' };
function planVarlik() {
  const assets = S.settings.assets;
  const rates = S.settings.rates || {};
  const total = assets.reduce((s, a) => s + assetValue(a, rates), 0);
  const avg = avgExpense(S.txs, S.ym);
  let h = `<div class="card"><h2>Toplam varlık</h2><div class="big-num num">${tl0(total)}</div>
    ${avg ? `<p class="muted small" style="margin:6px 0 0">Ortalama aylık giderin ${tl0(avg)}; varlıkların yaklaşık <b>${(total / avg).toFixed(1)} ay</b> yetiyor.</p>` : ''}
    ${rates.USD ? `<p class="muted small" style="margin:6px 0 0">USD ${rates.USD.toFixed(4)} · EUR ${rates.EUR.toFixed(4)} (${tarihGoster(rates.date)})</p>` : ''}</div>`;
  if (assets.length) {
    h += `<div class="list">${assets.map((a) => `<button class="row" data-act="asset-edit" data-v="${a.id}"><div class="av">${{ tl: '₺', usd: '$', eur: '€', altin: '🥇', fon: '📊', diger: '•' }[a.type]}</div>
      <div class="mid"><div class="t1">${esc(a.name || ASSET_TYPES[a.type])}</div><div class="t2 num">${a.type === 'tl' ? '' : `${a.amount.toLocaleString('tr-TR')} ${a.type === 'altin' ? 'gr' : a.type === 'fon' ? 'pay' : a.type.toUpperCase()} · `}${ASSET_TYPES[a.type]}</div></div>
      <div class="amt num">${tl0(assetValue(a, rates))}</div></button>`).join('')}</div>`;
  }
  h += `<div class="btns"><button class="btn primary" data-act="asset-edit">Varlık ekle</button><button class="btn" data-act="rates">Kurları güncelle</button></div>
    <p class="muted small">Kurlar ücretsiz bir kaynaktan (Avrupa Merkez Bankası verisi) çekilir; sadece kur bilgisi istenir, senin verin gönderilmez. Fon fiyatları yüklediğin hesap dökümlerindeki son alım/satım fiyatından güncellenir. Altın gram fiyatını kendin girersin.</p>`;
  return h;
}

// ---------------------------------------------------------------------------
// Ekstre yükleme
// ---------------------------------------------------------------------------
async function handlePdfFiles(files) {
  for (const f of files) {
    let pages = null;
    try {
      toast(`${f.name} okunuyor…`);
      pages = await pdfToPages(f);
    } catch (e) {
      if (e && e.name === 'PasswordException') {
        const pw = await promptSheet('PDF parolası', `${esc(f.name)} parola korumalı. Bankanın gönderdiği parolayı gir (genelde T.C. kimlik numarasının bir kısmı). Parola kaydedilmez.`, { type: 'password', okText: 'Aç' });
        if (!pw) continue;
        try { pages = await pdfToPages(f, pw); } catch { toast('Parola yanlış.'); continue; }
      } else { toast('PDF okunamadı: ' + (e.message || e)); continue; }
    }
    const st = parseStatement(pages);
    if (st.type === 'invoice') { await openReceiptForm({ text: st.text, attachment: f }); continue; }
    await previewImport(st, f.name);
  }
}

function buildTxs(st, stmtId, extraOwner) {
  const occ = {};
  const source = st.type === 'card' ? 'card' : st.type === 'account' ? 'account' : 'other';
  return st.txs.map((t) => {
    let base;
    if (st.type === 'account') base = `acc|${st.meta.ibanLast4}|${t.date}|${t.time}|${t.amount}|${t.balance}`;
    else if (st.type === 'card') base = `card|${st.meta.cardLast4}|${t.origDate || t.date}|${t.desc}|${t.amount}|${t.installment ? t.installment.k : 0}`;
    else base = `gen|${t.date}|${t.desc}|${t.amount}`;
    occ[base] = (occ[base] || 0) + 1;
    const tx = {
      id: uid(), hash: hash(base + '|' + occ[base]), date: t.date, amount: t.amount, desc: t.desc, source, statementId: stmtId,
      merchantKey: merchantKey(t.desc),
    };
    for (const k of ['origDate', 'time', 'balance', 'op', 'installment', 'remaining', 'fx', 'extra']) if (t[k] != null && t[k] !== '') tx[k] = t[k];
    if (st.meta.cardLast4) tx.cardLast4 = st.meta.cardLast4;
    const c = classify(tx, ctx(extraOwner));
    tx.category = c.category; tx.by = c.by;
    if (c.incomeSourceId) tx.incomeSourceId = c.incomeSourceId;
    return tx;
  });
}

function previewImport(st, fileName) {
  return new Promise((resolve) => {
    const newOwner = st.owner && !S.settings.ownerNames.some((n) => norm(n) === norm(st.owner)) ? st.owner : null;
    const stmtId = uid();
    const txs = buildTxs(st, stmtId, newOwner);
    const existing = new Set(S.txs.map((t) => t.hash));
    const fresh = txs.filter((t) => !existing.has(t.hash));
    const dupStmt = st.type === 'card' && S.statements.some((s) => s.type === 'card' && s.meta.cardLast4 === st.meta.cardLast4 && s.meta.cutDate === st.meta.cutDate);
    const typeName = { card: 'Kredi kartı ekstresi', account: 'Hesap hareketleri', generic: 'Tanınmayan ekstre' }[st.type];
    const period = st.type === 'card' ? `Hesap kesim ${tarihGoster(st.meta.cutDate)}` : st.meta.from ? `${tarihGoster(st.meta.from)} – ${tarihGoster(st.meta.to)}` : '';
    const sumBy = {};
    for (const t of fresh) sumBy[t.category] = (sumBy[t.category] || 0) + t.amount;
    const top = Object.entries(sumBy).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
    let done = false;
    const c = openSheet(`<h3>${typeName}${xBtn}</h3>
      <p class="muted small" style="margin-top:-8px">${esc(st.bank)} · ${esc(fileName)}${period ? ' · ' + period : ''}</p>
      <div class="note ${st.check.ok ? 'ok' : 'bad'}">${st.check.ok ? '✓' : '⚠'} ${esc(st.check.message)}</div>
      ${dupStmt ? '<div class="note bad">Bu ekstre daha önce yüklenmiş. Tekrar eden işlemler atlanır.</div>' : ''}
      <div class="kv num" style="margin-bottom:12px"><div class="k">Okunan işlem</div><div class="v">${txs.length}</div><div class="k">Yeni</div><div class="v">${fresh.length}</div>
      ${txs.length - fresh.length ? `<div class="k">Zaten kayıtlı (atlanacak)</div><div class="v">${txs.length - fresh.length}</div>` : ''}</div>
      ${newOwner ? `<div class="note">Hesap sahibi: <b>${esc(newOwner)}</b>. Bu ada yapılan transferler “Kendi Hesaplarım Arası” sayılır, gelir/gider toplamını şişirmez.</div>` : ''}
      ${top.length ? `<table class="preview-table">${top.map(([id, v]) => `<tr><td>${catIcon(id)} ${esc(catName(id))}</td><td class="num">${v > 0 ? '+' : '−'}${tl(Math.abs(v))}</td></tr>`).join('')}</table>
      <p class="muted small">Kategoriler otomatik atandı; kaydettikten sonra Hareketler'den değiştirebilirsin, uygulama bir dahakine hatırlar.</p>` : ''}
      <div class="btns"><button class="btn" data-no>Vazgeç</button><button class="btn primary" data-yes ${fresh.length ? '' : 'disabled'}>${fresh.length} işlemi kaydet</button></div>`, (sh) => {
      $('[data-no]', sh).onclick = () => { done = true; closeSheet(); resolve(false); };
      $('[data-yes]', sh).onclick = async () => {
        done = true;
        closeSheet();
        await saveImport(st, stmtId, fresh, newOwner, fileName);
        resolve(true);
      };
    });
    c.onClose = () => { if (!done) resolve(false); };
  });
}

async function saveImport(st, stmtId, fresh, newOwner, fileName) {
  const rec = {
    id: stmtId, type: st.type, bank: st.bank, meta: st.meta, owner: st.owner, check: st.check, fileName,
    importedAt: new Date().toISOString(), count: fresh.length,
  };
  if (st.type === 'card') rec.installments = st.txs.filter((t) => t.remaining).map((t) => ({ desc: t.desc, remaining: t.remaining, installment: t.installment }));
  // Kartla ödenmiş fişleri ekstre satırlarıyla eşleştir
  let matched = 0;
  if (st.type === 'card') {
    const pend = S.txs.filter((t) => t.pendingMatch);
    for (const t of fresh) {
      if (t.amount >= 0) continue;
      const i = pend.findIndex((p) => Math.abs(p.amount - t.amount) < 0.01 && Math.abs(gunFarki(p.date, t.date)) <= 3);
      if (i < 0) continue;
      const p = pend.splice(i, 1)[0];
      Object.assign(t, { category: p.category, userEdited: true, receiptId: p.receiptId, note: p.note });
      await db.del('txs', p.id);
      const r = S.receipts.find((x) => x.id === p.receiptId);
      if (r) { r.txId = t.id; await db.put('receipts', r); }
      matched++;
    }
  }
  await db.put('statements', rec);
  await db.putMany('txs', fresh);
  if (newOwner) { S.settings.ownerNames.push(newOwner); await saveSettings(); }
  await load();
  if (newOwner) await recategorizeAll();
  try { await navigator.storage?.persist?.(); } catch { /* yoksay */ }
  // Ekstrenin ayına git
  const months = fresh.map((t) => t.date.slice(0, 7)).sort();
  if (months.length && !S.txs.some((t) => t.date.startsWith(S.ym) && t.statementId !== stmtId)) S.ym = months[months.length - 1];
  render();
  toast(`${fresh.length} işlem kaydedildi${matched ? `, ${matched} fiş eşleşti` : ''}.`);
}

async function recategorizeAll() {
  const changed = [];
  for (const t of S.txs) {
    if (t.userEdited || !['card', 'account', 'other'].includes(t.source)) continue;
    const c = classify(t, ctx());
    if (c.category !== t.category || (c.incomeSourceId || null) !== (t.incomeSourceId || null)) {
      t.category = c.category; t.by = c.by;
      if (c.incomeSourceId) t.incomeSourceId = c.incomeSourceId; else delete t.incomeSourceId;
      changed.push(t);
    }
  }
  if (changed.length) await db.putMany('txs', changed);
  return changed.length;
}

// ---------------------------------------------------------------------------
// Fiş / fatura / elle gider
// ---------------------------------------------------------------------------
function openReceiptForm({ file = null, text = null, attachment = null, manual = false } = {}) {
  return new Promise((resolve) => {
    const touched = new Set();
    let imageBlob = null, ocrText = text || '';
    const today = bugunISO();
    let done = false;
    const c = openSheet(`<h3>${manual ? 'Gider ekle' : file ? 'Fiş' : 'Fatura'}${xBtn}</h3>
      ${file ? '<img class="receipt-img" id="r-img" alt="Fiş fotoğrafı"><div id="r-status" class="muted small">Fotoğraf hazırlanıyor…</div><div class="progress"><div id="r-prog"></div></div>' : ''}
      <form id="r-form" autocomplete="off">
        <div class="f-row"><label class="f"><span>Tutar (TL)</span><input type="text" inputmode="decimal" name="amount" required placeholder="0,00"></label>
        <label class="f"><span>Tarih</span><input type="date" name="date" value="${today}" required></label></div>
        <label class="f"><span>İşyeri / açıklama</span><input type="text" name="merchant" placeholder="ör. Migros"></label>
        <label class="f"><span>Kategori</span><select name="category">${catOptions('market', ['expense'])}</select></label>
        <span class="muted small">Ödeme şekli</span>
        <div class="seg" id="pay" style="margin-top:5px"><button type="button" data-p="card" class="on">💳 Kredi kartı</button><button type="button" data-p="cash">💵 Nakit</button></div>
        <p class="muted small" id="pay-hint" style="margin-top:-4px">Kartla ödenen fiş, ekstre yüklenince aynı tutar ve tarihteki işlemle otomatik eşleşir; gider iki kez sayılmaz.</p>
        <label class="f"><span>Not</span><input type="text" name="note" placeholder="İsteğe bağlı"></label>
        <div class="btns"><button type="button" class="btn" data-no>Vazgeç</button><button class="btn primary">Kaydet</button></div>
      </form>`, async (sh) => {
      const f = $('#r-form', sh);
      let pay = 'card';
      $$('#pay button', sh).forEach((b) => b.onclick = () => {
        pay = b.dataset.p;
        $$('#pay button', sh).forEach((x) => x.classList.toggle('on', x === b));
        $('#pay-hint', sh).textContent = pay === 'card'
          ? 'Kartla ödenen fiş, ekstre yüklenince aynı tutar ve tarihteki işlemle otomatik eşleşir; gider iki kez sayılmaz.'
          : 'Nakit harcamalar ATM\'den çektiğin paradan düşülür; açıklanmayan kısım “Nakit (detaysız)” görünür.';
      });
      for (const el of f.elements) el.addEventListener('input', () => touched.add(el.name));
      f.merchant.addEventListener('change', () => {
        if (touched.has('category')) return;
        const g = classify({ desc: f.merchant.value, amount: -1, source: 'card' }, ctx());
        if (g.category && catKind(g.category) === 'expense' && g.category !== 'diger') f.category.value = g.category;
      });
      const fill = (p) => {
        if (p.total != null && !touched.has('amount')) f.amount.value = amountInput(p.total);
        if (p.date && !touched.has('date')) f.date.value = p.date;
        if (p.merchant && !touched.has('merchant')) { f.merchant.value = p.merchant; f.merchant.dispatchEvent(new Event('change')); }
      };
      $('[data-no]', sh).onclick = () => { done = true; closeSheet(); resolve(false); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const amount = parseAmount(f.amount.value);
        if (!(amount > 0)) { toast('Geçerli bir tutar gir.'); return; }
        done = true;
        closeSheet();
        await saveReceipt({ amount, date: f.date.value, merchant: f.merchant.value.trim(), category: f.category.value, pay, note: f.note.value.trim(), imageBlob, ocrText, attachment, manual });
        resolve(true);
      };
      if (text) fill(parseReceiptText(text));
      if (file) {
        try {
          const { stored, ocrBlob } = await prepareImage(file);
          imageBlob = stored;
          const img = $('#r-img', sh);
          if (img) img.src = URL.createObjectURL(stored);
          const st = $('#r-status', sh), pr = $('#r-prog', sh);
          if (st) st.textContent = 'Fiş okunuyor (ilk seferde okuma modülü yükleniyor)…';
          ocrText = await ocrImage(ocrBlob, (m) => {
            if (!pr || !st) return;
            if (m.status === 'recognizing text') { pr.style.width = Math.round(m.progress * 100) + '%'; st.textContent = 'Fiş okunuyor…'; }
            else if (/loading|initializ/.test(m.status)) st.textContent = 'Okuma modülü hazırlanıyor…';
          });
          const p = parseReceiptText(ocrText);
          fill(p);
          if (st) st.textContent = p.total != null ? 'Okundu. Bilgileri kontrol edip kaydet.' : 'Tutar okunamadı; elle yazabilirsin.';
          if (pr) pr.style.width = '100%';
        } catch (err) {
          const st = $('#r-status', sh);
          if (st) st.textContent = 'Otomatik okuma yapılamadı; bilgileri elle girebilirsin.';
          console.error(err);
        }
      }
    });
    c.onClose = () => { if (!done) resolve(false); };
  });
}

async function saveReceipt({ amount, date, merchant, category, pay, note, imageBlob, ocrText, attachment, manual }) {
  const hasDoc = imageBlob || attachment;
  const rid = hasDoc ? uid() : null;
  let txId = null, matchedTx = null;
  if (pay === 'card') {
    matchedTx = S.txs.find((t) => t.source === 'card' && !t.receiptId && Math.abs(-t.amount - amount) < 0.01 && Math.abs(gunFarki(t.date, date)) <= 3);
  }
  if (matchedTx) {
    Object.assign(matchedTx, { category, userEdited: true, note: note || matchedTx.note });
    if (rid) matchedTx.receiptId = rid;
    await db.put('txs', matchedTx);
    txId = matchedTx.id;
  } else {
    const tx = {
      id: uid(), date, amount: -r2(amount), desc: merchant || (manual ? 'Elle girilen gider' : 'Fiş'), source: pay === 'cash' ? 'cash' : manual ? 'manual' : 'receipt',
      category, userEdited: true, note, merchantKey: merchantKey(merchant || ''),
    };
    tx.hash = hash('rcpt|' + tx.id);
    if (pay === 'card') tx.pendingMatch = true;
    if (rid) tx.receiptId = rid;
    await db.put('txs', tx);
    txId = tx.id;
  }
  if (rid) {
    await db.put('receipts', { id: rid, txId, date, amount, merchant, category, pay, note, image: imageBlob || null, attachment: attachment || null, attachmentName: attachment?.name || null, ocrText: (ocrText || '').slice(0, 5000), createdAt: new Date().toISOString() });
  }
  await load();
  S.ym = date.slice(0, 7);
  render();
  toast(matchedTx ? 'Kart ekstresindeki işlemle eşleşti.' : 'Gider kaydedildi.');
}

function openIncomeForm() {
  const today = bugunISO();
  openSheet(`<h3>Gelir ekle${xBtn}</h3><form autocomplete="off">
    <div class="f-row"><label class="f"><span>Tutar (TL)</span><input type="text" inputmode="decimal" name="amount" required></label>
    <label class="f"><span>Tarih</span><input type="date" name="date" value="${today}" required></label></div>
    <label class="f"><span>Açıklama</span><input type="text" name="desc" placeholder="ör. Kasım kirası (elden)"></label>
    <label class="f"><span>Kategori</span><select name="category">${catOptions('kira_gelir', ['income'])}</select></label>
    ${S.settings.incomeSources.length ? `<label class="f"><span>Gelir kaynağı</span><select name="src"><option value="">—</option>${S.settings.incomeSources.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>` : ''}
    <div class="btns"><button type="button" class="btn" data-close>Vazgeç</button><button class="btn primary">Kaydet</button></div></form>`, (sh) => {
    const f = $('form', sh);
    $('[data-close]', sh).onclick = () => closeSheet();
    if (f.src) f.src.onchange = () => { const s = S.settings.incomeSources.find((x) => x.id === f.src.value); if (s) { f.category.value = s.type === 'kira' ? 'kira_gelir' : 'maas'; if (!f.amount.value) f.amount.value = amountInput(s.amount); } };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const amount = parseAmount(f.amount.value);
      if (!(amount > 0)) return toast('Geçerli bir tutar gir.');
      const tx = { id: uid(), date: f.date.value, amount: r2(amount), desc: f.desc.value.trim() || catName(f.category.value), source: 'manual', category: f.category.value, userEdited: true, merchantKey: '' };
      tx.hash = hash('man|' + tx.id);
      if (f.src && f.src.value) tx.incomeSourceId = f.src.value;
      await db.put('txs', tx);
      closeSheet();
      await load(); S.ym = tx.date.slice(0, 7); render();
      toast('Gelir kaydedildi.');
    };
  });
}

// ---------------------------------------------------------------------------
// Hareket düzenleme
// ---------------------------------------------------------------------------
async function openTx(id) {
  const t = S.txs.find((x) => x.id === id);
  if (!t) return;
  const rec = t.receiptId ? S.receipts.find((r) => r.id === t.receiptId) : null;
  const same = S.txs.filter((x) => x.id !== t.id && x.merchantKey && x.merchantKey === t.merchantKey && (x.amount > 0) === (t.amount > 0)).length;
  const src = { card: 'Kredi kartı ekstresi', account: 'Hesap hareketleri', cash: 'Nakit (elle)', receipt: 'Fiş (kart)', manual: 'Elle girildi', other: 'Ekstre' }[t.source] || '';
  openSheet(`<h3>${esc(prettyMerchant(t.desc))}${xBtn}</h3>
    ${rec && rec.image ? '<img class="receipt-img" id="tx-img" alt="Fiş">' : ''}
    <div class="big-num num" style="color:${t.amount > 0 ? 'var(--good)' : 'var(--text)'}">${t.amount > 0 ? '+' : '−'}${tl(Math.abs(t.amount))}</div>
    <p class="muted small">${tarihGoster(t.date)}${t.time ? ' ' + t.time.slice(0, 5) : ''} · ${src}${t.origDate ? ` · alışveriş ${tarihGoster(t.origDate)}` : ''}</p>
    <div class="note" style="word-break:break-word">${esc(t.desc)}${t.installment ? `<br>${tl(t.installment.total)} tutarındaki alışverişin ${t.installment.k}/${t.installment.n}. taksidi` : ''}${t.fx ? `<br>İşlem tutarı: ${t.fx.amount} ${esc(t.fx.currency)}` : ''}${t.balance != null ? `<br>İşlem sonrası bakiye: ${tl(t.balance)}` : ''}</div>
    ${t.pendingMatch ? '<div class="note bad">Kartla ödendi; kart ekstresi yüklenince eşleşecek.</div>' : ''}
    <form autocomplete="off">
      <label class="f"><span>Kategori</span><select name="category">${catOptions(t.category)}</select></label>
      ${t.merchantKey ? `<label class="check"><input type="checkbox" name="remember" checked><span>Bundan sonra <b>${esc(prettyMerchant(t.desc))}</b> işlemlerini hep bu kategoride say${same ? ` (${same} benzer işlem de güncellenir)` : ''}</span></label>` : ''}
      <label class="f"><span>Not</span><input type="text" name="note" value="${esc(t.note || '')}"></label>
      <div class="btns"><button type="button" class="btn danger" data-del>Sil</button><button class="btn primary">Kaydet</button></div>
    </form>`, (sh) => {
    if (rec && rec.image) $('#tx-img', sh).src = URL.createObjectURL(rec.image);
    const f = $('form', sh);
    $('[data-del]', sh).onclick = async () => {
      const fromStmt = ['card', 'account', 'other'].includes(t.source);
      if (!(await confirmSheet('İşlemi sil', fromStmt ? 'Bu işlem bir ekstreden geldi. Silersen aynı ekstreyi tekrar yüklediğinde geri gelir. Yine de silinsin mi?' : 'Bu kayıt silinsin mi?', 'Sil', true))) return;
      await db.del('txs', t.id);
      if (rec) await db.del('receipts', rec.id);
      await load(); render(); toast('Silindi.');
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const cat = f.category.value;
      t.note = f.note.value.trim();
      const changed = cat !== t.category;
      t.category = cat; t.userEdited = true;
      if (catKind(cat) !== 'income') delete t.incomeSourceId;
      const upd = [t];
      if (changed && f.remember && f.remember.checked && t.merchantKey) {
        const dir = t.amount > 0 ? 'in' : 'out';
        S.settings.rules = S.settings.rules.filter((r) => !(r.key === t.merchantKey && r.dir === dir));
        S.settings.rules.push({ key: t.merchantKey, dir, category: cat, label: prettyMerchant(t.desc) });
        await saveSettings();
        for (const x of S.txs) if (x !== t && x.merchantKey === t.merchantKey && (x.amount > 0 ? 'in' : 'out') === dir && !x.userEdited) { x.category = cat; upd.push(x); }
      }
      await db.putMany('txs', upd);
      closeSheet();
      await load(); render();
      toast(upd.length > 1 ? `${upd.length} işlem güncellendi; kural kaydedildi.` : 'Kaydedildi.');
    };
  });
}

// ---------------------------------------------------------------------------
// Ekle menüsü
// ---------------------------------------------------------------------------
function openAddMenu() {
  openSheet(`<h3>Ekle${xBtn}</h3><div class="action-list">
    <button class="action" data-a="photo"><span class="ai">📷</span><span><b>Fiş fotoğrafı çek</b><small>Tutar, tarih ve işyeri telefonda okunur</small></span></button>
    <button class="action" data-a="gallery"><span class="ai">🖼️</span><span><b>Galeriden fiş seç</b><small>Daha önce çektiğin fotoğraf</small></span></button>
    <button class="action" data-a="pdf"><span class="ai">📄</span><span><b>Ekstre yükle (PDF)</b><small>Kredi kartı ekstresi veya hesap hareketleri</small></span></button>
    <button class="action" data-a="invoice"><span class="ai">🧾</span><span><b>e-Fatura / e-Arşiv PDF</b><small>Elektrik, internet, online alışveriş faturası</small></span></button>
    <button class="action" data-a="expense"><span class="ai">➖</span><span><b>Elle gider</b><small>Nakit ya da kartla yapılan harcama</small></span></button>
    <button class="action" data-a="income"><span class="ai">➕</span><span><b>Elle gelir</b><small>Elden alınan kira, prim vb.</small></span></button>
  </div>`, (sh) => {
    $$('[data-a]', sh).forEach((b) => b.onclick = () => {
      const a = b.dataset.a;
      closeSheet(true);
      if (a === 'photo') $('#in-photo').click();
      if (a === 'gallery') $('#in-gallery').click();
      if (a === 'pdf') $('#in-pdf').click();
      if (a === 'invoice') $('#in-invoice').click();
      if (a === 'expense') openReceiptForm({ manual: true });
      if (a === 'income') openIncomeForm();
    });
  });
}

// ---------------------------------------------------------------------------
// Gelir kaynağı / hedef / varlık formları
// ---------------------------------------------------------------------------
function openIncomeSource(id, preset = {}) {
  const s = S.settings.incomeSources.find((x) => x.id === id) || { id: uid(), type: 'maas', name: '', amount: '', day: '', keyword: '', ...preset };
  const isNew = !S.settings.incomeSources.includes(s);
  openSheet(`<h3>${isNew ? 'Gelir kaynağı' : esc(s.name)}${xBtn}</h3><form autocomplete="off">
    <div class="seg" id="itype"><button type="button" data-t="maas" class="${s.type !== 'kira' ? 'on' : ''}">💼 Maaş</button><button type="button" data-t="kira" class="${s.type === 'kira' ? 'on' : ''}">🔑 Kira</button></div>
    <label class="f"><span>Ad</span><input type="text" name="name" value="${esc(s.name)}" placeholder="ör. Maaş / Kadıköy daire kirası" required></label>
    <div class="f-row"><label class="f"><span>Aylık tutar (TL)</span><input type="text" inputmode="decimal" name="amount" value="${amountInput(s.amount)}"></label>
    <label class="f"><span>Ayın kaçında?</span><input type="number" min="1" max="31" name="day" value="${s.day || ''}"></label></div>
    <label class="f"><span>Dökümde geçen anahtar kelime</span><input type="text" name="keyword" value="${esc(s.keyword)}" placeholder="ör. şirket adı ya da kiracı soyadı"></label>
    <p class="muted small" style="margin-top:-6px">Hesap hareketlerinde bu kelimeyi içeren gelen paralar bu gelire yazılır. Boş bırakırsan sadece elle girdiğin gelirler sayılır.</p>
    <div class="btns">${isNew ? '<button type="button" class="btn" data-close>Vazgeç</button>' : '<button type="button" class="btn danger" data-del>Sil</button>'}<button class="btn primary">Kaydet</button></div></form>`, (sh) => {
    const f = $('form', sh);
    let type = s.type === 'kira' ? 'kira' : 'maas';
    $$('#itype button', sh).forEach((b) => b.onclick = () => { type = b.dataset.t; $$('#itype button', sh).forEach((x) => x.classList.toggle('on', x === b)); });
    const del = $('[data-del]', sh);
    if (del) del.onclick = async () => {
      S.settings.incomeSources = S.settings.incomeSources.filter((x) => x.id !== s.id);
      await saveSettings(); await recategorizeAll(); closeSheet(); await load(); render();
    };
    $$('[data-close]', sh).forEach((b) => b.onclick = () => closeSheet());
    f.onsubmit = async (e) => {
      e.preventDefault();
      Object.assign(s, { type, name: f.name.value.trim(), amount: parseAmount(f.amount.value) || 0, day: Number(f.day.value) || null, keyword: f.keyword.value.trim() });
      if (isNew) S.settings.incomeSources.push(s);
      await saveSettings();
      const n = await recategorizeAll();
      closeSheet(); await load(); render();
      toast(n ? `Kaydedildi; ${n} işlem bu gelire yazıldı.` : 'Kaydedildi.');
    };
  });
}

function openGoal(id) {
  const g = S.settings.goals.find((x) => x.id === id) || { id: uid(), name: '', target: '', saved: 0, deadline: '' };
  const isNew = !S.settings.goals.includes(g);
  openSheet(`<h3>${isNew ? 'Yeni hedef' : esc(g.name)}${xBtn}</h3><form autocomplete="off">
    <label class="f"><span>Hedef adı</span><input type="text" name="name" value="${esc(g.name)}" placeholder="ör. Yaz tatili" required></label>
    <div class="f-row"><label class="f"><span>Hedef tutar</span><input type="text" inputmode="decimal" name="target" value="${amountInput(g.target)}" required></label>
    <label class="f"><span>Biriken</span><input type="text" inputmode="decimal" name="saved" value="${amountInput(g.saved)}"></label></div>
    <label class="f"><span>Hedef tarih</span><input type="date" name="deadline" value="${g.deadline || ''}"></label>
    <div class="btns">${isNew ? '<button type="button" class="btn" data-close>Vazgeç</button>' : '<button type="button" class="btn danger" data-del>Sil</button>'}<button class="btn primary">Kaydet</button></div></form>`, (sh) => {
    const f = $('form', sh);
    $$('[data-close]', sh).forEach((b) => b.onclick = () => closeSheet());
    const del = $('[data-del]', sh);
    if (del) del.onclick = async () => { S.settings.goals = S.settings.goals.filter((x) => x.id !== g.id); await saveSettings(); closeSheet(); render(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      Object.assign(g, { name: f.name.value.trim(), target: parseAmount(f.target.value) || 0, saved: parseAmount(f.saved.value) || 0, deadline: f.deadline.value || null });
      if (isNew) S.settings.goals.push(g);
      await saveSettings(); closeSheet(); render();
    };
  });
}

function openAsset(id) {
  const a = S.settings.assets.find((x) => x.id === id) || { id: uid(), type: 'tl', name: '', amount: '', price: '', code: '' };
  const isNew = !S.settings.assets.includes(a);
  const funds = fundPrices(S.txs);
  openSheet(`<h3>${isNew ? 'Varlık ekle' : esc(a.name || ASSET_TYPES[a.type])}${xBtn}</h3><form autocomplete="off">
    <label class="f"><span>Tür</span><select name="type">${Object.entries(ASSET_TYPES).map(([k, v]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="f"><span>Ad</span><input type="text" name="name" value="${esc(a.name)}" placeholder="ör. Vadeli hesap, Gram altın"></label>
    <label class="f" id="f-code"><span>Fon kodu</span><input type="text" name="code" value="${esc(a.code || '')}" placeholder="ör. ${Object.keys(funds)[0] || 'YFBL1'}" style="text-transform:uppercase"></label>
    <div class="f-row"><label class="f"><span id="l-amount">Tutar</span><input type="text" inputmode="decimal" name="amount" value="${amountInput(a.amount)}" required></label>
    <label class="f" id="f-price"><span>Birim fiyat (TL)</span><input type="text" inputmode="decimal" name="price" value="${amountInput(a.price)}"></label></div>
    ${Object.keys(funds).length ? `<p class="muted small">Dökümdeki son fon fiyatları: ${Object.values(funds).map((x) => `${x.code} ${String(x.price).replace('.', ',')} TL (${tarihGoster(x.date)})`).join(', ')}</p>` : ''}
    <div class="btns">${isNew ? '<button type="button" class="btn" data-close>Vazgeç</button>' : '<button type="button" class="btn danger" data-del>Sil</button>'}<button class="btn primary">Kaydet</button></div></form>`, (sh) => {
    const f = $('form', sh);
    const sync = () => {
      const t = f.type.value;
      $('#f-code', sh).style.display = t === 'fon' ? '' : 'none';
      $('#f-price', sh).style.display = ['altin', 'fon', 'diger'].includes(t) ? '' : 'none';
      $('#l-amount', sh).textContent = { tl: 'Tutar (TL)', usd: 'Miktar (USD)', eur: 'Miktar (EUR)', altin: 'Gram', fon: 'Pay adedi', diger: 'Adet' }[t];
    };
    f.type.onchange = sync; sync();
    f.code.oninput = () => { const fp = funds[f.code.value.toUpperCase()]; if (fp && !f.price.value) f.price.value = amountInput(fp.price); };
    $$('[data-close]', sh).forEach((b) => b.onclick = () => closeSheet());
    const del = $('[data-del]', sh);
    if (del) del.onclick = async () => { S.settings.assets = S.settings.assets.filter((x) => x.id !== a.id); await saveSettings(); closeSheet(); render(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      Object.assign(a, { type: f.type.value, name: f.name.value.trim(), amount: parseAmount(f.amount.value) || 0, price: parseAmount(f.price.value) || 0, code: f.code.value.trim().toUpperCase() });
      if (isNew) S.settings.assets.push(a);
      await saveSettings(); closeSheet(); render();
    };
  });
}

async function updateRates() {
  try {
    toast('Kurlar alınıyor…');
    const r = await fetch('https://api.frankfurter.app/latest?from=TRY&to=USD,EUR', { cache: 'no-store' });
    const j = await r.json();
    S.settings.rates = { USD: 1 / j.rates.USD, EUR: 1 / j.rates.EUR, date: j.date };
  } catch {
    toast('Kurlar alınamadı. İnternet bağlantını kontrol et.');
    return;
  }
  // Fon fiyatlarını dökümlerden güncelle
  const funds = fundPrices(S.txs);
  for (const a of S.settings.assets) if (a.type === 'fon' && funds[a.code]) a.price = funds[a.code].price;
  await saveSettings();
  render();
  toast('Kurlar güncellendi.');
}

// ---------------------------------------------------------------------------
// Ayarlar, yedek
// ---------------------------------------------------------------------------
function openSettings() {
  const stm = S.statements;
  const rules = S.settings.rules;
  openSheet(`<h3>Ayarlar${xBtn}</h3>
    <div class="card"><h2>Hesap sahibi</h2>
      <p class="muted small" style="margin-top:0">Bu adlara yapılan transferler kendi hesapların arası sayılır. Ekstreden otomatik alınır; eşin vb. hesaplarını da ekleyebilirsin (her satıra bir ad).</p>
      <textarea id="owners" rows="2">${esc(S.settings.ownerNames.join('\n'))}</textarea>
      <div class="btns"><button class="btn sm" id="save-owners">Kaydet</button></div></div>

    <div class="card"><h2>Yedek</h2>
      <p class="muted small" style="margin-top:0">Veriler sadece bu telefonda. Parolalı yedek dosyasını Drive, iCloud ya da e-postana kaydet. Parolayı unutursan yedek açılamaz.${S.settings.lastBackupAt ? `<br>Son yedek: ${tarihGoster(S.settings.lastBackupAt.slice(0, 10))}` : ''}</p>
      <div class="btns"><button class="btn primary" id="bk-out">Şifreli yedek al</button><button class="btn" id="bk-in">Yedekten yükle</button></div></div>

    <div class="card"><h2>Yüklenen ekstreler <span class="right">${stm.length}</span></h2>
      ${stm.length ? `<div class="list" style="border:0">${stm.map((s) => `<div class="row" style="cursor:default;padding-left:0;padding-right:0"><div class="mid"><div class="t1">${s.type === 'card' ? '💳' : '🏦'} ${esc(s.bank)} ${s.type === 'card' ? '•••• ' + esc(s.meta.cardLast4 || '') : 'hesap'} <span class="badge ${s.check?.ok ? 'ok' : 'warn'}">${s.check?.ok ? 'doğrulandı' : 'kontrol et'}</span></div>
        <div class="t2">${s.type === 'card' ? 'Kesim ' + tarihGoster(s.meta.cutDate) : (s.meta.from ? tarihGoster(s.meta.from) + ' – ' + tarihGoster(s.meta.to) : '')} · ${s.count} işlem</div></div>
        <button class="btn sm danger" data-del-stmt="${s.id}">Sil</button></div>`).join('')}</div>` : '<p class="muted small">Henüz ekstre yok.</p>'}</div>

    <div class="card"><h2>Öğrenilen kurallar <span class="right">${rules.length}</span></h2>
      ${rules.length ? `<div class="list" style="border:0">${rules.map((r, i) => `<div class="row" style="cursor:default;padding-left:0;padding-right:0"><div class="mid"><div class="t1">${esc(r.label || r.key)}</div><div class="t2">${r.dir === 'in' ? 'Gelen' : 'Giden'} → ${esc(catName(r.category))}</div></div><button class="btn sm" data-del-rule="${i}">Kaldır</button></div>`).join('')}</div>` : '<p class="muted small">Hareketlerde kategori değiştirdiğinde burada görünür.</p>'}</div>

    <div class="card"><h2>Gizlilik</h2><p class="small" style="margin:0">Ekstreler, fişler ve tüm hesaplamalar bu cihazda işlenir. Uygulama hiçbir sunucuya veri göndermez; tek ağ isteği, Varlık bölümünde kur güncellerken yapılan genel kur sorgusudur. Fiş okuma (OCR) da telefonda çalışır.</p></div>

    <div class="btns"><button class="btn danger block" id="wipe">Tüm verileri sil</button></div>
    <p class="muted small" style="text-align:center">Finans Asistanı ${VERSION}</p>`, (sh) => {
    $('#save-owners', sh).onclick = async () => {
      S.settings.ownerNames = $('#owners', sh).value.split('\n').map((x) => x.trim()).filter(Boolean);
      await saveSettings();
      const n = await recategorizeAll();
      await load(); render(); toast(`Kaydedildi${n ? `; ${n} işlem yeniden sınıflandı` : ''}.`);
    };
    $$('[data-del-stmt]', sh).forEach((b) => b.onclick = async () => {
      const id = b.dataset.delStmt;
      if (!(await confirmSheet('Ekstreyi sil', 'Bu ekstre ve ondan gelen tüm işlemler silinsin mi? Fiş eşleşmeleri de kalkar.', 'Sil', true))) return;
      const ids = S.txs.filter((t) => t.statementId === id).map((t) => t.id);
      await db.delMany('txs', ids);
      await db.del('statements', id);
      await load(); render(); toast(`${ids.length} işlem silindi.`);
    });
    $$('[data-del-rule]', sh).forEach((b) => b.onclick = async () => {
      S.settings.rules.splice(Number(b.dataset.delRule), 1);
      await saveSettings(); closeSheet(); openSettings();
    });
    $('#bk-out', sh).onclick = () => exportBackup();
    $('#bk-in', sh).onclick = () => { closeSheet(true); $('#in-backup').click(); };
    $('#wipe', sh).onclick = async () => {
      const v = await promptSheet('Tüm verileri sil', 'Bu işlem geri alınamaz. Onaylamak için SİL yaz.', { okText: 'Sil' });
      if (!v || norm(v) !== 'SIL') return;
      await db.clearAll();
      await load(); render(); toast('Tüm veriler silindi.');
    };
  });
}

async function exportBackup() {
  const p1 = await promptSheet('Yedek parolası', 'En az 8 karakter. Bu parola olmadan yedek açılamaz; güvenli bir yere not et.', { type: 'password', okText: 'Devam' });
  if (!p1) return;
  if (p1.length < 8) return toast('Parola en az 8 karakter olmalı.');
  const p2 = await promptSheet('Parolayı tekrar gir', '', { type: 'password', okText: 'Yedeği oluştur' });
  if (p1 !== p2) return toast('Parolalar aynı değil.');
  toast('Yedek hazırlanıyor…');
  const receipts = [];
  for (const r of await db.all('receipts')) {
    receipts.push({ ...r, image: r.image ? await blobToDataURL(r.image) : null, attachment: r.attachment ? await blobToDataURL(r.attachment) : null });
  }
  S.settings.lastBackupAt = new Date().toISOString();
  const payload = { version: VERSION, createdAt: S.settings.lastBackupAt, txs: await db.all('txs'), statements: await db.all('statements'), receipts, settings: S.settings };
  const text = await encryptJSON(payload, p1);
  const name = `finans-yedek-${bugunISO()}.fay`;
  const file = new File([text], name, { type: 'application/json' });
  let shared = false;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Finans Asistanı yedeği' }); shared = true; }
  } catch (e) { if (e.name === 'AbortError') return; }
  if (!shared) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  await saveSettings();
  render();
  toast('Yedek oluşturuldu.');
}

async function importBackup(file) {
  const text = await file.text();
  const pw = await promptSheet('Yedek parolası', `${esc(file.name)} dosyasını açmak için parolayı gir.`, { type: 'password', okText: 'Aç' });
  if (!pw) return;
  let data;
  try { data = await decryptJSON(text, pw); } catch (e) { return toast(e.message); }
  if (!(await confirmSheet('Yedeği yükle', `${data.txs.length} işlem, ${data.statements.length} ekstre ve ${data.receipts.length} fiş içeriyor (${tarihGoster(data.createdAt.slice(0, 10))}). Bu telefondaki mevcut verilerin yerini alacak.`, 'Yükle', true))) return;
  await db.clearAll();
  await db.putMany('txs', data.txs);
  await db.putMany('statements', data.statements);
  const recs = [];
  for (const r of data.receipts) recs.push({ ...r, image: r.image ? await dataURLToBlob(r.image) : null, attachment: r.attachment ? await dataURLToBlob(r.attachment) : null });
  await db.putMany('receipts', recs);
  await db.put('kv', { ...DEFAULT_SETTINGS, ...data.settings }, 'settings');
  await load(); render();
  toast('Yedek yüklendi.');
}

// ---------------------------------------------------------------------------
// Olaylar
// ---------------------------------------------------------------------------
document.addEventListener('click', async (e) => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { S.tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const v = a.dataset.v;
  switch (a.dataset.act) {
    case 'add': openAddMenu(); break;
    case 'import-pdf': $('#in-pdf').click(); break;
    case 'month-prev': S.ym = ayKaydir(S.ym, -1); S.trendSel = null; render(); break;
    case 'month-next': S.ym = ayKaydir(S.ym, 1); S.trendSel = null; render(); break;
    case 'tab': S.tab = v; render(); window.scrollTo(0, 0); break;
    case 'trend-sel': S.trendSel = v; render(); break;
    case 'cat-filter': S.cat = v; S.kind = 'all'; S.tab = 'hareket'; render(); window.scrollTo(0, 0); break;
    case 'cat-clear': S.cat = ''; render(); break;
    case 'kind': S.kind = v; render(); break;
    case 'tx': openTx(v); break;
    case 'seg': S.planSeg = v; render(); break;
    case 'budget-all': S.showAllBudgets = !S.showAllBudgets; render(); break;
    case 'budget-suggest': {
      const avg = {};
      for (let i = 1; i <= 3; i++) for (const c of monthSummary(S.txs, ayKaydir(S.ym, -i)).cats) avg[c.id] = (avg[c.id] || 0) + c.value / 3;
      for (let i = 0; i <= 0; i++) for (const c of monthSummary(S.txs, S.ym).cats) if (!avg[c.id]) avg[c.id] = c.value;
      let n = 0;
      for (const [id, val] of Object.entries(avg)) if (!S.settings.budgets[id] && val > 0 && catKind(id) === 'expense' && id !== 'iade') { S.settings.budgets[id] = Math.ceil(val / 100) * 100; n++; }
      await saveSettings(); render(); toast(n ? `${n} kategoriye bütçe önerildi. Dilediğin gibi düzenle.` : 'Önerilecek yeni kategori yok.');
      break;
    }
    case 'income-edit': openIncomeSource(v); break;
    case 'manual-income': openIncomeForm(); break;
    case 'cand': {
      const c = incomeCandidates()[Number(v)];
      const words = norm(c.name).split(' ').filter((w) => w.length > 2);
      openIncomeSource(null, { type: a.dataset.t, name: a.dataset.t === 'kira' ? 'Kira geliri' : 'Maaş', amount: c.last, keyword: words.slice(0, 2).join(' ') });
      break;
    }
    case 'goal-edit': openGoal(v); break;
    case 'goal-add': {
      const g = S.settings.goals.find((x) => x.id === v);
      const val = await promptSheet('Birikim ekle', `${esc(g.name)} hedefine eklenecek tutar`, { okText: 'Ekle' });
      const n = parseAmount(val);
      if (n > 0) { g.saved = r2((g.saved || 0) + n); await saveSettings(); render(); }
      break;
    }
    case 'asset-edit': openAsset(v); break;
    case 'rates': updateRates(); break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    S.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos);
  }
});
document.addEventListener('change', async (e) => {
  const b = e.target.dataset.budget;
  if (b) {
    const n = parseAmount(e.target.value);
    if (n > 0) S.settings.budgets[b] = n; else delete S.settings.budgets[b];
    await saveSettings(); render();
  }
  if (e.target.id === 'inflation') { S.settings.inflation = parseAmount(e.target.value) || null; await saveSettings(); render(); }
});

$('#btn-settings').onclick = openSettings;
$('#in-pdf').onchange = async (e) => { const f = [...e.target.files]; e.target.value = ''; await handlePdfFiles(f); };
$('#in-photo').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openReceiptForm({ file: f }); };
$('#in-gallery').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openReceiptForm({ file: f }); };
$('#in-invoice').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const pages = await pdfToPages(f);
    const { allText } = await import('./parsers.js');
    await openReceiptForm({ text: allText(pages), attachment: f });
  } catch (err) { toast('PDF okunamadı: ' + err.message); }
};
$('#in-backup').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackup(f); };

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Başlat
(async () => {
  await load();
  const months = monthsWithData(S.txs);
  if (months.length && !months.includes(S.ym)) S.ym = months[months.length - 1];
  render();
})();
