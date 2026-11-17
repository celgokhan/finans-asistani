// PDF metninden ekstre okuyucuları. Saf fonksiyonlar: tarayıcıda ve Node testlerinde aynı kod çalışır.
// Girdi: pages = [{ items: [{ str, x, y, w }] }]  (pdf.js getTextContent çıktısından üretilir)

import { norm, parseTL, parseDMY, parseTRDate, r2 } from './util.js';

const MONEY = /^[+-]?\d{1,3}(?:\.\d{3})*,\d{2}$/;

/** Aynı satırdaki parçaları birleştirir; satırlar yukarıdan aşağı, parçalar soldan sağa. */
export function itemsToLines(items, tol = 2.5) {
  const rows = [];
  const sorted = items.filter((i) => i.str && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  for (const it of sorted) {
    let row = rows.find((r) => Math.abs(r.y - it.y) <= tol);
    if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
    row.items.push({ ...it, str: it.str.trim() });
  }
  rows.sort((a, b) => b.y - a.y);
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    r.text = r.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
  }
  return rows;
}

export function pagesToLines(pages) {
  return pages.map((p) => itemsToLines(p.items));
}

export function allText(pages) {
  return pagesToLines(pages).map((ls) => ls.map((l) => l.text).join('\n')).join('\n');
}

/** Dosya türünü tanır ve uygun okuyucuyu çalıştırır. */
export function parseStatement(pages) {
  const text = allText(pages);
  const n = norm(text);
  if (n.includes('HESAP KESIM TARIHI') && n.includes('DONEM BORCU')) return parseYKBCard(pages);
  if (n.includes('HESAP HAREKETLERI') && n.includes('IBAN')) return parseYKBAccount(pages);
  if (/E-ARSIV|E-FATURA|ETTN/.test(n)) return { type: 'invoice', text };
  return parseGeneric(pages);
}

// ---------------------------------------------------------------------------
// Yapı Kredi vadesiz hesap "Hesap Hareketleri"
// ---------------------------------------------------------------------------
export function parseYKBAccount(pages) {
  const meta = {};
  const txs = [];
  const labels = {
    'MUSTERI ADI SOYADI': 'owner', 'IBAN/HESAP NO': 'iban', 'HESAP ADI': 'accountName',
    'KULLANILABILIR BAKIYE': 'available', 'TARIH ARALIGI': 'range', 'SUBE': 'branch',
  };
  let descX = null, amtX = null;

  for (const lines of pagesToLines(pages)) {
    let buf = [];
    let inTable = false;
    for (const line of lines) {
      const t = line.text;
      const nt = norm(t);
      // Üst bilgi: "Etiket : Değer"
      const lm = t.match(/^(.+?)\s*:\s*(.+)$/);
      if (!inTable && lm && labels[norm(lm[1])]) {
        meta[labels[norm(lm[1])]] = lm[2].trim();
        continue;
      }
      // Tablo başlığı
      if (/^TARIH SAAT ISLEM KANAL ACIKLAMA/.test(nt)) {
        const a = line.items.find((i) => norm(i.str) === 'ACIKLAMA');
        const tutar = line.items.find((i, k) => norm(i.str) === 'ISLEM' && line.items[k + 1] && norm(line.items[k + 1].str) === 'TUTARI');
        descX = a ? a.x : 270;
        amtX = tutar ? tutar.x : 440;
        inTable = true; buf = [];
        continue;
      }
      if (!inTable) continue;
      const first = line.items[0];
      const date = /^\d{2}\/\d{2}\/\d{4}$/.test(first.str) ? parseDMY(first.str) : null;
      if (!date) {
        if (first.str === '-') { buf = []; continue; } // "Diğer Bekleyen İşlemler"
        const part = line.items.filter((i) => i.x >= descX - 3 && i.x < amtX - 45);
        if (part.length && part.length === line.items.length) buf.push(part.map((i) => i.str).join(' '));
        else buf = [];
        continue;
      }
      const time = (line.items[1] && /^\d{2}:\d{2}:\d{2}$/.test(line.items[1].str)) ? line.items[1].str : '';
      const mid = line.items.filter((i) => i.x >= 135 && i.x < descX - 3).map((i) => i.str).join(' ');
      const rest = line.items.filter((i) => i.x >= descX - 3).map((i) => i.str).join(' ');
      const mm = rest.match(/^(.*?)\s*([+-]?[\d.]+,\d{2})\s*TL\s+([+-]?[\d.]+,\d{2})\s*TL\s*$/);
      if (!mm) { buf = []; continue; }
      const desc = [...buf, mm[1]].join(' ').replace(/\s+/g, ' ').trim();
      buf = [];
      txs.push({
        date, time,
        amount: parseTL(mm[2]),
        balance: parseTL(mm[3]),
        desc,
        op: splitOpChannel(mid).op,
        channel: splitOpChannel(mid).channel,
      });
    }
  }

  // Bakiye zinciri kontrolü (liste yeniden eskiye sıralı)
  let bad = 0;
  for (let i = 0; i < txs.length - 1; i++) {
    if (Math.abs(r2(txs[i + 1].balance + txs[i].amount) - txs[i].balance) > 0.011) bad++;
  }
  const ibanLast4 = (meta.iban || '').replace(/\s/g, '').slice(-4);
  const range = (meta.range || '').split('-').map((s) => parseDMY(s.trim()));
  return {
    type: 'account',
    bank: 'Yapı Kredi',
    meta: { ...meta, ibanLast4, from: range[0] || null, to: range[1] || null, lastBalance: txs.length ? txs[0].balance : null },
    owner: meta.owner || '',
    txs,
    check: {
      ok: txs.length > 0 && bad === 0,
      message: txs.length === 0 ? 'Hiç hareket okunamadı.'
        : bad === 0 ? `${txs.length} hareket okundu, bakiye zinciri tutarlı.`
          : `${txs.length} hareket okundu ama ${bad} satırda bakiye tutmuyor. Lütfen kontrol et.`,
    },
  };
}

function splitOpChannel(s) {
  const kanallar = ['Internet - Mobil', 'Diğer', 'Şube', 'ATM', 'Telefon', 'Mobil'];
  for (const k of kanallar) {
    if (s.endsWith(' ' + k)) return { op: s.slice(0, -k.length - 1).trim(), channel: k };
  }
  return { op: s.trim(), channel: '' };
}

// ---------------------------------------------------------------------------
// Yapı Kredi (World) kredi kartı hesap özeti
// ---------------------------------------------------------------------------
export function parseYKBCard(pages) {
  const meta = {};
  const txs = [];
  const metaLabels = [
    ['HESAP KESIM TARIHI', 'cutDate', 'date'],
    ['BIR SONRAKI AY HESAP KESIM TARIHI', 'nextCutDate', 'date'],
    ['BIR SONRAKI AY SON ODEME TARIHI', 'nextDueDate', 'date'],
    ['SON ODEME TARIHI', 'dueDate', 'date'],
    ['DONEM BORCU', 'totalDue', 'tl'],
    ['ODENMESI GEREKEN ASGARI TUTAR/ORAN', 'minDue', 'tl'],
    ['ONCEKI DONEM HESAP OZETI BORCU', 'prevDebt', 'tl'],
    ['DONEM ICI HARCAMALAR', 'spending', 'tl'],
    ['DONEM ICI ODEMELER', 'payments', 'tl'],
    ['KALAN TOPLAM TAKSIT TUTARI', 'remainingInstallments', 'tl'],
    ['KULLANILABILIR TOPLAM WORLDPUAN/TL KARSILIGI', 'points', 'points'],
    ['MUSTERI LIMITI', 'customerLimit', 'tl'],
    ['KART LIMITI', 'limit', 'tl'],
    ['NAKIT CEKIM LIMITI', 'cashLimit', 'tl'],
    ['KART NUMARASI', 'cardNo', 'str'],
  ];
  let col = null; // tablo sütun konumları
  let prevBalance = null, total = null;
  let owner = '';

  for (const lines of pagesToLines(pages)) {
    let inTable = false;
    for (const line of lines) {
      const left = line.items.filter((i) => i.x < 330);
      const leftText = left.map((i) => i.str).join(' ');
      const nl = norm(leftText);

      // Adres bloğundaki "Sn. AD SOYAD"
      const sn = line.items.find((i) => /^Sn\.\s+/.test(i.str));
      if (sn && !owner) owner = sn.str.replace(/^Sn\.\s+/, '').trim();

      if (!inTable && !col) {
        const lm = leftText.match(/^(.+?)\s*:\s*(.+)$/);
        if (lm) {
          const key = norm(lm[1]);
          const def = metaLabels.find((d) => d[0] === key);
          if (def && meta[def[1]] == null) {
            const v = lm[2].trim();
            if (def[2] === 'date') meta[def[1]] = parseTRDate(v);
            else if (def[2] === 'tl') meta[def[1]] = Math.abs(parseTL((v.match(/[+-]?[\d.]+,\d{2}/) || [''])[0]));
            else if (def[2] === 'points') {
              const pm = v.match(/([\d.]+)\s*\/\s*([\d.]+,\d{2})/);
              if (pm) { meta.points = Number(pm[1].replace(/\./g, '')); meta.pointsTL = parseTL(pm[2]); }
            } else meta[def[1]] = v;
            if (def[1] === 'minDue') { const om = v.match(/\/\s*(\d+)\s*%/); if (om) meta.minRate = Number(om[1]) / 100; }
            continue;
          }
        }
        // Faiz oranları: "Akdi Faiz Oranı %3,75 / %45,00 %4,25 / %51,00"
        const fm = line.text.match(/^(Akdi|Gecikme) Faiz Oranı\s+%([\d,]+)\s*\/\s*%([\d,]+)\s+%([\d,]+)\s*\/\s*%([\d,]+)/);
        if (fm) {
          const k = fm[1] === 'Akdi' ? 'contractRate' : 'lateRate';
          meta[k] = { monthly: num(fm[2]) / 100, cashMonthly: num(fm[4]) / 100 };
          continue;
        }
      }

      const nt = norm(line.text);
      if (/^ISLEM TARIHI ISLEMLER TUTAR\(TL\)/.test(nt)) {
        const f = (re) => { const it = line.items.find((i) => re.test(norm(i.str))); return it ? it.x : null; };
        col = { tutar: f(/^TUTAR\(TL\)$/), kalan: f(/^KALAN/), puan: f(/^PUAN$/) };
        inTable = true;
        continue;
      }
      if (/^KART NUMARASI/.test(nt) && line.items.length >= 2) {
        const nameIt = line.items[line.items.length - 1];
        if (!owner && nameIt.x > 300) owner = nameIt.str;
        continue;
      }
      if (!inTable) continue;

      const first = line.items[0];
      if (norm(first.str) === 'TOPLAM') {
        const m = line.items.find((i) => MONEY.test(i.str));
        if (m) total = parseTL(m.str);
        inTable = false;
        continue;
      }
      if (/^ONCEKI DONEM HESAP OZETI BORCU/.test(nt)) {
        const m = line.items.find((i) => MONEY.test(i.str));
        if (m) prevBalance = parseTL(m.str);
        continue;
      }

      const date = parseTRDate(first.str);
      if (date && /^\d{1,2}\s+\S+\s+\d{4}$/.test(first.str)) {
        const tutarX = col.tutar ?? 380;
        let amountStr = null, kalan = null, puan = null;
        const descParts = [];
        for (const it of line.items.slice(1)) {
          const km = it.str.match(/^([\d.]+,\d{2})\s*\/\s*(\d+)$/);
          if (km && it.x >= tutarX) { kalan = { amount: parseTL(km[1]), count: Number(km[2]) }; continue; }
          if (MONEY.test(it.str) && it.x >= tutarX - 45 && amountStr == null) { amountStr = it.str; continue; }
          if (/^\d+$/.test(it.str) && col.puan != null && it.x >= col.puan - 30) { puan = Number(it.str); continue; }
          if (it.x < tutarX - 45) descParts.push(it.str);
        }
        if (amountStr == null) continue;
        const v = parseTL(amountStr);
        const credit = amountStr.startsWith('+');
        txs.push({
          date,
          desc: descParts.join(' ').replace(/\s+/g, ' ').trim(),
          amount: credit ? Math.abs(v) : -Math.abs(v),
          credit,
          points: puan,
          remaining: kalan,
        });
        continue;
      }

      // Önceki işleme ait ek satırlar
      const last = txs[txs.length - 1];
      if (!last) continue;
      const tk = line.text.match(/([\d.]+,\d{2})\s*TL'lik işlemin\s+(\d+)\s*\/\s*(\d+)\s*taksidi/i);
      if (tk) {
        last.installment = { total: parseTL(tk[1]), k: Number(tk[2]), n: Number(tk[3]) };
        continue;
      }
      const fx = line.text.match(/İşlem Tutarı:\s*([\d.,]+)\s*([A-Z]{3})/);
      if (fx) { last.fx = { amount: parseTL(fx[1]), currency: fx[2] }; continue; }
      if (/^(ABNO|FTNO)/.test(line.text)) { last.extra = line.text; continue; }
    }
  }

  // Taksitli işlemlerde 2. ve sonraki taksitleri hesap kesim tarihine yaz (bütçe bu ay etkileniyor)
  for (const t of txs) {
    if (t.installment && t.installment.k > 1 && meta.cutDate) { t.origDate = t.date; t.date = meta.cutDate; }
  }

  const sum = r2(txs.reduce((s, t) => s + t.amount, 0));
  const checks = [];
  let ok = txs.length > 0;
  if (prevBalance != null && total != null) {
    const calc = r2(prevBalance - sum);
    const diff = r2(calc - total);
    if (Math.abs(diff) > 0.011) { ok = false; checks.push(`Toplam tutmuyor (fark ${diff.toFixed(2)} TL).`); }
    else checks.push('işlem toplamı ekstre TOPLAM satırıyla birebir tutuyor');
  } else { ok = false; checks.push('TOPLAM satırı bulunamadı.'); }
  if (meta.remainingInstallments != null) {
    const kalanSum = r2(txs.reduce((s, t) => s + (t.remaining ? t.remaining.amount : 0), 0));
    if (Math.abs(kalanSum - meta.remainingInstallments) > 0.011) { ok = false; checks.push(`Kalan taksit toplamı tutmuyor (${kalanSum}).`); }
    else checks.push('kalan taksitler tutuyor');
  }
  meta.cardLast4 = (meta.cardNo || '').replace(/\D/g, '').slice(-4);
  meta.prevBalance = prevBalance;
  meta.total = total;

  return {
    type: 'card',
    bank: 'Yapı Kredi',
    meta,
    owner,
    txs,
    check: { ok, message: `${txs.length} işlem okundu; ` + checks.join(', ') + '.' },
  };
}

function num(s) { return Number(String(s).replace(/\./g, '').replace(',', '.')); }

// ---------------------------------------------------------------------------
// Tanınmayan bankalar için genel okuyucu: tarih ile başlayıp tutarla biten satırlar
// ---------------------------------------------------------------------------
export function parseGeneric(pages) {
  const txs = [];
  let anySign = false;
  for (const lines of pagesToLines(pages)) {
    for (const line of lines) {
      const t = line.text;
      const dm = t.match(/^(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+\d{4})\s+(.*)$/);
      if (!dm) continue;
      const date = parseDMY(dm[1]) || parseTRDate(dm[1]);
      if (!date) continue;
      const monies = [...dm[2].matchAll(/([+-]?\d{1,3}(?:\.\d{3})*,\d{2})(?:\s*TL)?/g)];
      if (!monies.length) continue;
      const first = monies[0];
      const desc = dm[2].slice(0, first.index).replace(/\d{2}:\d{2}(:\d{2})?/, '').trim();
      if (/^[+-]/.test(first[1])) anySign = true;
      txs.push({ date, desc, amountRaw: first[1], amount: parseTL(first[1]) });
    }
  }
  // İşaret yoksa (kart ekstresi gibi) tutarlar harcamadır
  if (!anySign) for (const t of txs) t.amount = -Math.abs(t.amount);
  return {
    type: 'generic',
    bank: 'Bilinmeyen',
    meta: {},
    owner: '',
    txs,
    check: {
      ok: false,
      message: txs.length ? `Bu ekstre düzeni tanınmadı; ${txs.length} satır tahminle okundu. Kaydetmeden önce kontrol et.` : 'Bu dosyada okunabilir hareket bulunamadı.',
    },
  };
}
