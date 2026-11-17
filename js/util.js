// Ortak yardımcılar: para, tarih, Türkçe metin normalleştirme.

export const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const AY_ANAHTAR = AYLAR.map((a) => norm(a));

/** Türkçe büyük harfe çevirir ve aksanları atar: "Çağlayan" -> "CAGLAYAN" */
export function norm(s) {
  return String(s || '')
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
    .replace(/Â/g, 'A').replace(/Î/g, 'I').replace(/Û/g, 'U')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "1.234,56" / "-4.000,00" / "+32.638,64" -> sayı. Geçersizse NaN. */
export function parseTL(s) {
  if (s == null) return NaN;
  let t = String(s).replace(/TL|TRY|₺/gi, '').replace(/\s/g, '');
  if (!t) return NaN;
  const neg = /^-/.test(t);
  t = t.replace(/^[+-]/, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return NaN;
  const v = Number(t.replace(/\./g, '').replace(',', '.'));
  return neg ? -v : v;
}

/** Kuruş hassasiyetinde yuvarlama */
export const r2 = (v) => Math.round(v * 100) / 100;

const fmtTL = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTL0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
export const tl = (v) => fmtTL.format(v || 0);
export const tl0 = (v) => fmtTL0.format(Math.round(v || 0));
export const pct = (v) => '%' + Math.round((v || 0) * 100);

/** "15/11/2026" veya "15.11.2026" -> "2026-11-15" */
export function parseDMY(s) {
  const m = String(s).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const mo = Number(m[2]), d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "28 Ekim 2026" -> "2026-10-28" */
export function parseTRDate(s) {
  const m = String(s).match(/(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})/);
  if (!m) return null;
  const ai = AY_ANAHTAR.indexOf(norm(m[2]));
  if (ai < 0) return null;
  return `${m[3]}-${String(ai + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

export const ayAnahtar = (iso) => iso.slice(0, 7); // "2026-11"
export function ayAdi(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${AYLAR[m - 1]} ${y}`;
}
export function ayKaydir(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function bugunISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function gunFarki(isoA, isoB) {
  return Math.round((Date.parse(isoB) - Date.parse(isoA)) / 86400000);
}
export function tarihGoster(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${AYLAR[m - 1]} ${y}`;
}
export function ayinGunSayisi(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Küçük, deterministik özet (tekrar yüklemeyi yakalamak için) */
export function hash(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
