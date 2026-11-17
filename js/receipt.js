// Fiş / fatura okuma. OCR telefonda çalışır (Tesseract), internete veri gitmez.
import { parseDMY, parseTRDate, r2, norm } from './util.js';

let workerPromise = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error(src + ' yüklenemedi'));
    document.head.appendChild(s);
  });
}

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript('lib/tesseract/tesseract.min.js');
      const base = new URL('lib/tesseract/', location.href).href;
      const w = await window.Tesseract.createWorker('tur', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base + 'core/',
        langPath: base + 'lang/',
        gzip: true,
        logger: (m) => onProgress && onProgress(m),
      });
      return w;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

/** Görseli küçültür (OCR hızı ve depolama için) ve hafif kontrast uygular */
export async function prepareImage(file, maxSide = 1600) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const stored = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.72));
  // OCR için gri tonlama + kontrast
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const k = Math.max(0, Math.min(255, (v - 128) * 1.5 + 128));
    d[i] = d[i + 1] = d[i + 2] = k;
  }
  g.putImageData(img, 0, 0);
  const ocrBlob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return { stored, ocrBlob };
}

export async function ocrImage(blob, onProgress) {
  const w = await getWorker(onProgress);
  const { data } = await w.recognize(blob);
  return data.text || '';
}

// OCR'ın sık karıştırdığı karakterleri sayılarda düzeltir
function fixDigits(s) {
  return s.replace(/(?<=\d)[oO](?=\d)/g, '0').replace(/(?<=\d)[lI|](?=\d)/g, '1').replace(/(?<=\d)\s+(?=[.,]\d{2}\b)/g, '');
}

/** "1.234,56" "1234,56" "1234.56" "*123,45" -> sayı */
export function looseMoney(s) {
  let t = String(s).replace(/[*₺TLtl\s]/g, '');
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(t)) t = t.replace(/,/g, '');
  else if (/^\d+,\d{2}$/.test(t)) t = t.replace(',', '.');
  else if (!/^\d+\.\d{2}$/.test(t)) return NaN;
  return Number(t);
}

const MONEY_RE = /\*?\s?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})\b/g;

/** OCR / PDF metninden fiş bilgileri: işyeri, tarih, toplam, KDV */
export function parseReceiptText(text) {
  const raw = fixDigits(String(text || ''));
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const N = lines.map(norm);

  // Toplam: öncelikli anahtar kelimeler
  const keys = ['ODENECEK TUTAR', 'VERGILER DAHIL TOPLAM', 'GENEL TOPLAM', 'TOPLAM TUTAR', 'TOPLAM', 'TOP ', 'TUTAR'];
  let total = null;
  outer: for (const k of keys) {
    for (let i = 0; i < lines.length; i++) {
      if (!N[i].includes(k)) continue;
      if (/ARA ?TOPLAM|TOPKDV|TOPLAM KDV|KDV TOPLAM|KDV TUTARI|HESAPLANAN/.test(N[i])) continue;
      const cand = [...lines[i].matchAll(MONEY_RE)].map((m) => looseMoney(m[1])).filter((v) => v > 0);
      if (!cand.length && lines[i + 1]) cand.push(...[...lines[i + 1].matchAll(MONEY_RE)].map((m) => looseMoney(m[1])).filter((v) => v > 0));
      if (cand.length) { total = cand[cand.length - 1]; break outer; }
    }
  }
  if (total == null) {
    const all = [...raw.matchAll(MONEY_RE)].map((m) => looseMoney(m[1])).filter((v) => v > 0 && v < 1e6);
    if (all.length) total = Math.max(...all);
  }

  // KDV
  let kdv = null;
  for (let i = 0; i < lines.length; i++) {
    if (/TOPKDV|TOPLAM KDV|KDV TOPLAM|HESAPLANAN KDV/.test(N[i])) {
      const c = [...lines[i].matchAll(MONEY_RE)].map((m) => looseMoney(m[1])).filter((v) => v > 0);
      if (c.length) { kdv = c[c.length - 1]; break; }
    }
  }

  // Tarih
  let date = null;
  const dm = raw.match(/\b(\d{1,2}[./-]\d{1,2}[./-](?:20)?\d{2})\b/);
  if (dm) date = parseDMY(dm[1]);
  if (!date) { const tm = raw.match(/\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+\d{4}/); if (tm) date = parseTRDate(tm[0]); }

  // İşyeri: harf ağırlıklı ilk anlamlı satır
  let merchant = '';
  const skip = /^(E-ARSIV|E-FATURA|FATURA|FIS|TARIH|SAAT|VKN|TCKN|VERGI|V\.D|TEL|ADRES|MERSIS|TICARET|SAYIN|ETTN|BELGE|NO\b|KASIYER|\*+)/;
  const satici = N.findIndex((n) => /^SATICI|^DUZENLEYEN/.test(n));
  const start = satici >= 0 ? satici + 1 : 0;
  for (let i = start; i < Math.min(lines.length, start + 8); i++) {
    const letters = (lines[i].match(/\p{L}/gu) || []).length;
    if (letters >= 4 && letters / lines[i].length > 0.5 && !skip.test(N[i])) { merchant = lines[i].replace(/[^\p{L}\p{N}&.\s'-]/gu, '').trim(); break; }
  }

  return { merchant, date, total: total != null ? r2(total) : null, kdv: kdv != null ? r2(kdv) : null, text: raw };
}
