// Kategoriler, işyeri adı normalleştirme ve otomatik sınıflandırma.
import { norm } from './util.js';

// kind: expense (gider), income (gelir), transfer (gelir/gider sayılmaz)
export const CATEGORIES = [
  { id: 'market', name: 'Market', kind: 'expense', icon: '🛒' },
  { id: 'yemek', name: 'Yeme-İçme', kind: 'expense', icon: '🍽️' },
  { id: 'kafe', name: 'Kafe & Atıştırmalık', kind: 'expense', icon: '☕' },
  { id: 'tutun', name: 'Tütün & Alkol', kind: 'expense', icon: '🚬' },
  { id: 'ulasim', name: 'Ulaşım & Yakıt', kind: 'expense', icon: '⛽' },
  { id: 'fatura', name: 'Faturalar', kind: 'expense', icon: '💡' },
  { id: 'konut', name: 'Kira & Aidat', kind: 'expense', icon: '🏠' },
  { id: 'abonelik', name: 'Abonelikler', kind: 'expense', icon: '🔁' },
  { id: 'online', name: 'Online Alışveriş', kind: 'expense', icon: '📦' },
  { id: 'giyim', name: 'Giyim', kind: 'expense', icon: '👕' },
  { id: 'saglik', name: 'Sağlık', kind: 'expense', icon: '🩺' },
  { id: 'egitim', name: 'Eğitim', kind: 'expense', icon: '🎓' },
  { id: 'sigorta', name: 'Sigorta', kind: 'expense', icon: '🛡️' },
  { id: 'bakim', name: 'Kişisel Bakım', kind: 'expense', icon: '💄' },
  { id: 'ev', name: 'Ev & Elektronik', kind: 'expense', icon: '🛋️' },
  { id: 'eglence', name: 'Eğlence', kind: 'expense', icon: '🎟️' },
  { id: 'kisi', name: 'Kişilere Ödeme', kind: 'expense', icon: '👤' },
  { id: 'kredi', name: 'Kredi Taksiti', kind: 'expense', icon: '🏦' },
  { id: 'faiz', name: 'Faiz & Banka Ücreti', kind: 'expense', icon: '⚠️' },
  { id: 'vergi', name: 'Vergi & Stopaj', kind: 'expense', icon: '🧾' },
  { id: 'iade', name: 'İade & Kampanya', kind: 'expense', icon: '🎁' },
  { id: 'nakit', name: 'Nakit (detaysız)', kind: 'expense', icon: '💵' },
  { id: 'diger', name: 'Diğer Gider', kind: 'expense', icon: '•' },

  { id: 'maas', name: 'Maaş', kind: 'income', icon: '💼' },
  { id: 'kira_gelir', name: 'Kira Geliri', kind: 'income', icon: '🔑' },
  { id: 'getiri', name: 'Faiz & Yatırım Getirisi', kind: 'income', icon: '📈' },
  { id: 'diger_gelir', name: 'Diğer Gelir', kind: 'income', icon: '➕' },

  { id: 'kendi', name: 'Kendi Hesaplarım Arası', kind: 'transfer', icon: '↔️' },
  { id: 'kart_odeme', name: 'Kart Ödemesi', kind: 'transfer', icon: '💳' },
  { id: 'yatirim', name: 'Yatırım (Fon/Döviz/Mevduat)', kind: 'transfer', icon: '🏛️' },
  { id: 'nakit_cekim', name: 'Nakit Çekim', kind: 'transfer', icon: '🏧' },
  { id: 'kredi_giris', name: 'Kredi Kullanımı', kind: 'transfer', icon: '🏦' },
];
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const catName = (id) => (CAT[id] ? CAT[id].name : id);
export const catIcon = (id) => (CAT[id] ? CAT[id].icon : '•');
export const catKind = (id) => (CAT[id] ? CAT[id].kind : 'expense');

// Sıra önemli: ilk eşleşen kazanır. Anahtarlar norm() edilmiş metinde aranır.
const MERCHANT_RULES = [
  ['abonelik', ['NETFLIX', 'SPOTIFY', 'DISNEY', 'AMZNPRIME', 'PRIME VIDEO', 'YOUTUBE', 'APPLE.COM', 'ICLOUD', 'CHATGPT', 'OPENAI', 'CLAUDE', 'ANTHROPIC', 'EXXEN', 'BLUTV', 'GAIN MEDYA', 'MUBI', 'TOD TV', 'TABII', 'GOOGLE *', 'GOOGLE PLAY', 'DIGITURK', 'D-SMART']],
  ['fatura', ['TURKCELL', 'VODAFONE', 'TURK TELEKOM', 'TURKTELEKOM', 'SUPERONLINE', 'TURKNET', 'IGDAS', 'ISKI', 'ENERJISA', 'CK BOGAZICI', 'AYEDAS', 'BASKENTGAZ', 'IZMIRGAZ', 'ASKI ', 'IZSU', 'ELEKTRIK', 'DOGALGAZ']],
  ['iade', ['KAMPANYA', 'INDIRIMI', 'INDIRIM', 'IADE', 'CASHBACK', 'PUAN KULLANIM']],
  ['tutun', ['TUTUN', 'TEKEL', 'SARAP', 'WINE', 'BIRA ']],
  ['kafe', ['COFFEE', 'KAHVE', 'STARBUCKS', 'CAFE', 'KAFE', 'SIMIT', 'FIRIN', 'UNLU MAM', 'PASTANE', 'BOULANGERIE', 'BUFE', 'KUKIS', 'MAADO', 'KRUVASAN', 'DONDURMA', 'CIKOLATA']],
  ['yemek', ['RESTORAN', 'RESTAURANT', 'RESTAUANT', 'RESTORA', 'BURGER', 'MC DONALDS', 'MCDONALDS', 'KFC', 'POPEYES', 'SUSHI', 'YEMEKSEPETI', 'YEMEKPAY', 'TRENDYOL YEMEK', 'GETIR YEMEK', 'PIZZA', 'DONER', 'KEBAP', 'KOFTE', 'LOKANTA', 'MEYHANE', ' PUB', 'BAR ', 'DEVELI', ' ET ', 'OCAKBASI', 'BALIKCI', 'BALIK EVI', 'MANTI', 'PIDE', 'KOYLU', 'SAKLIBAHCE']],
  ['market', ['MIGROS', 'CARREFOUR', 'A101', 'BIM ', 'SOK MARKET', 'METRO ', 'MACROCENTER', 'FILE MARKET', 'HAPPY CENT', 'PAZAR', 'GIDA', 'SARKUTERI', 'KASAP', 'MANAV', 'BAKKAL', 'MARKET', 'GETIR', 'ISTEGELSIN', 'KURU GIDA']],
  ['ulasim', ['SHELL', 'OPET', ' BP ', 'PETROL OFISI', 'TOTALENERGIES', 'AYTEMIZ', 'UBER', 'BITAKSI', 'MARTI', 'ISTANBULKART', 'OTOPARK', 'VALE', 'HGS', 'OGS', 'PEGASUS', 'THY', 'TURK HAVA', 'AJET', 'PETROL', 'AKARYAKIT', 'TAKSI', 'IDO ', 'BOLU OTOBUS']],
  ['online', ['AMAZON', 'TRENDYOL', 'HEPSIBURADA', 'N11', 'CICEKSEPETI', 'ALIEXPRESS', 'TEMU', 'SHEIN']],
  ['giyim', ['LC WAIKIKI', 'LCWAIKIKI', 'H&M', 'HENNES', 'ZARA', 'IPEKYOL', 'MAVI', 'KOTON', 'DEFACTO', 'BOYNER', 'NETWORK', 'VAKKO', 'MANGO', 'BERSHKA', 'PULL&BEAR', 'COLINS', 'FLO ', 'NIKE', 'ADIDAS', 'DECATHLON', 'SPORTIVE']],
  ['saglik', ['ECZANE', 'HASTANE', 'MEMORIAL', 'ACIBADEM', 'MEDICAL', 'SAGLIK', 'KLINIK', 'DIS HEK', 'OPTIK', 'LABORATUVAR', 'TIP MERKEZI']],
  ['egitim', ['UNIVERSITE', 'UNI ', 'KOLEJ', 'OKUL', 'KURS', 'UDEMY', 'COURSERA', 'KITAP', 'D&R', 'KIRTASIYE']],
  ['sigorta', ['SIGORTA', 'ALLIANZ', 'AXA ', 'ANADOLU SIG', 'HYT.SIG', 'EMEKLILIK', 'HAYAT SIG']],
  ['bakim', ['KOZMETIK', 'KUAFOR', 'BERBER', 'GRATIS', 'WATSONS', 'ROSSMANN', 'SEPHORA', 'EVE ', 'GUZELLIK']],
  ['ev', ['KOCTAS', 'IKEA', 'ENGLISH HOME', 'MADAME COCO', 'INTEMA', 'MASKO', 'TEKNOSA', 'MEDIAMARKT', 'MEDIA MARKT', 'VATAN BILGISAYAR', 'TEKNOLOJI', 'ARCELIK', 'VESTEL', 'BAUHAUS', 'KARACA', 'PASABAHCE']],
  ['eglence', ['SINEMA', 'CINEMA', 'BILET', 'BILETIX', 'PASSO', 'FLYZONE', 'STEAM', 'PLAYSTATION', 'XBOX', 'MUZE', 'KONSER', 'TIYATRO']],
  ['konut', ['AIDAT', 'SITE YONETIM', 'SITESI YON', 'APARTMAN', 'EMLAK']],
  ['faiz', ['DONEM FAIZI', 'GECIKME FAIZ', 'FAIZ', 'KMV', 'BSMV', 'MASRAF', 'HIZMET UCRETI', 'KART UCRETI', 'YILLIK UYELIK', 'UCRET']],
  ['vergi', ['VERGI', 'GIB ', 'HARC', 'MTV', 'STOPAJ', 'TAHAKKUKU']],
];

const CITIES = ['ISTANBUL', 'ANKARA', 'IZMIR', 'BURSA', 'ANTALYA', 'YALOVA', 'DENIZLI', 'BALIKESIR', 'KOCAELI', 'ESKISEHIR', 'MUGLA', 'BODRUM', 'LONDON', 'DUBLIN', 'STOCKHOLM', 'AMSTERDAM', 'LUXEMBOURG'];
const TRV = { I: '[IİıiI]', S: '[SŞsş]', C: '[CÇcç]', G: '[GĞgğ]', O: '[OÖoö]', U: '[UÜuü]' };
const loose = (w) => w.split('').map((ch) => TRV[ch] || ch).join('');
const CITY_RE = new RegExp('(' + CITIES.map(loose).join('|') + ')(?![\\p{L}])', 'gu');

/** Açıklamadan şehir/ülke kuyruğunu atar; işyeri adına yapışık şehirleri de ayırır ("RESTORAISTANBUL TR"). */
export function stripCity(s) {
  const str = String(s).trim();
  for (const m of str.matchAll(CITY_RE)) {
    if (m.index === 0) continue;
    let head = str.slice(0, m.index).trim();
    // Kesik şehir parçası: "LCWAIKIKI ISTA" / "KİNG İST"
    const words = head.split(/\s+/);
    const last = norm(words[words.length - 1]);
    if (words.length > 1 && last.length >= 2 && CITIES.some((c) => c.startsWith(last))) words.pop();
    head = words.join(' ').trim();
    if (head) return head;
  }
  return str.replace(/\s+(TR|TU|GB|GBGB|SWSW|US|USUS|IE|NL)$/, '').trim();
}

/** İşyeri adını öğrenme anahtarına çevirir: "IYZICO/NETFLİX.COM ISTANBUL TR" -> "NETFLIX.COM" */
export function merchantKey(desc) {
  let s = norm(desc);
  const fast = parseFast(desc);
  if (fast) return 'KISI:' + norm(fast.party);
  s = s.replace(/^(IYZICO|PARATI|PAYFOUR|N KOLAY \d+|YEMEKPAY|CHIPPIN|PAYTR|PAPARA|SIPAY|PARAM)\s*[*/]\s*/, '');
  s = s.replace(/^(IYZICO|PAYFOUR|CHIPPIN)\s+/, '');
  s = stripCity(s);
  s = s.replace(/\b\d{3,}\b/g, ' ').replace(/[*]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Tekrarlanan marka adı: "MIGROS MIGROS BAGDAT" -> "MIGROS BAGDAT"
  const w = s.split(' ');
  if (w.length > 1 && w[0] === w[1]) w.shift();
  return w.slice(0, 3).join(' ') || norm(desc).slice(0, 24);
}

/** Ekranda gösterilecek sade işyeri adı */
export function prettyMerchant(desc) {
  const fast = parseFast(desc);
  if (fast) return (fast.dir === 'in' ? 'Gelen: ' : 'Giden: ') + titleCase(fast.party);
  let s = stripCity(String(desc).trim());
  s = s.replace(/^(IYZICO|PARATİ|PARATI|YEMEKPAY|CHIPPIN|PAYFOUR)\s*[*/]?\s*/i, '');
  return titleCase(s.trim() || desc);
}

export function titleCase(s) {
  // Türkçe harf içermeyen kelimeler (marka adları) İngilizce kurala göre küçültülür: WAIKIKI -> Waikiki
  return String(s).split(/(\s+)/).map((w) => {
    const tr = /[ÇĞİÖŞÜçğıöşü]/.test(w);
    const low = tr ? w.toLocaleLowerCase('tr-TR') : w.toLowerCase();
    return low.replace(/(^|[/(.&-])(\p{L})/gu, (m, a, b) => a + (tr ? b.toLocaleUpperCase('tr-TR') : b.toUpperCase()));
  }).join('');
}

/** "GİDEN FAST - ALICI - Açıklama" / "GELEN FAST - GÖNDEREN -" */
export function parseFast(desc) {
  const m = String(desc).match(/^(GİDEN|GELEN|GIDEN)\s+(FAST|EFT|HAVALE)\s*-\s*([^-]+?)\s*(?:-\s*(.*))?$/i);
  if (!m) return null;
  return { dir: /GELEN/i.test(m[1]) ? 'in' : 'out', party: m[3].trim(), note: (m[4] || '').trim() };
}

/** Sahibin adı metinde geçiyor mu? (soyad + en az bir isim) */
export function isOwner(text, ownerNames) {
  const t = norm(text);
  for (const full of ownerNames || []) {
    const parts = norm(full).split(' ').filter((p) => p.length > 1);
    if (parts.length < 2) continue;
    const last = parts[parts.length - 1];
    const firsts = parts.slice(0, -1);
    if (t.includes(last) && firsts.some((f) => new RegExp('\\b' + f + '\\b').test(t))) return true;
  }
  return false;
}

/**
 * Bir hareketin kategorisini bulur.
 * tx: { desc, amount, source: 'card'|'account'|..., op }
 * ctx: { ownerNames, rules: [{key, category}], incomeSources: [{id, type, keyword}] }
 */
export function classify(tx, ctx = {}) {
  const d = norm(tx.desc);
  const op = norm(tx.op || '');
  const inflow = tx.amount > 0;
  const key = merchantKey(tx.desc);

  // 1) Kullanıcının öğrettiği kurallar
  const rule = (ctx.rules || []).find((r) => r.key === key && (r.dir == null || r.dir === (inflow ? 'in' : 'out')));
  if (rule) return { category: rule.category, by: 'rule' };

  // 2) Gelir kaynakları (anahtar kelime)
  if (inflow) {
    for (const s of ctx.incomeSources || []) {
      if (s.keyword && d.includes(norm(s.keyword))) return { category: s.type === 'kira' ? 'kira_gelir' : 'maas', incomeSourceId: s.id, by: 'income' };
    }
  }

  if (tx.source === 'card') {
    if (/^ODEME[- ]|HESAPTAN ODEME|OTOMATIK ODEME/.test(d)) return { category: 'kart_odeme', by: 'auto' };
    if (/NAKIT AVANS|NAKIT CEKIM/.test(d)) return { category: 'nakit_cekim', by: 'auto' };
    if (inflow) return { category: 'iade', by: 'auto' };
    return { category: matchMerchant(norm(stripCity(tx.desc))) || 'diger', by: 'auto' };
  }

  // Vadesiz hesap hareketleri
  if (/^INT \d{6}\*+\d{4}|KREDI KARTI ODEME|KART BORCU ODEME|KK ODEME/.test(d)) return { category: 'kart_odeme', by: 'auto' };
  if (/STOPAJ|MENK\.?SERM|GV\.?$/.test(d)) return { category: 'vergi', by: 'auto' };
  if (op.includes('YATIRIM FONU') || /FON (ALIS|SATIS)/.test(d)) return { category: 'yatirim', by: 'auto' };
  if (op.includes('VADELI MEVDUAT') || /VADELI MEVDUAT/.test(d)) {
    if (/FAIZ/.test(d) && inflow) return { category: 'getiri', by: 'auto' };
    return { category: 'yatirim', by: 'auto' };
  }
  if (/KMV|BSMV|HIZMET UCRETI|MASRAF|UCRETI/.test(d)) return { category: 'faiz', by: 'auto' };
  if (op.includes('DOVIZ') || /DOVIZ (ALIS|SATIS)|ALTIN (ALIS|SATIS)/.test(d)) return { category: 'yatirim', by: 'auto' };
  if (/PARA CEKME|ATM/.test(d) && !inflow) return { category: 'nakit_cekim', by: 'auto' };
  if (op.includes('FATURA')) return { category: 'fatura', by: 'auto' };
  if (/KREDISI|KREDI KULLANDIR/.test(d) && inflow) return { category: 'kredi_giris', by: 'auto' };
  if (/KREDI TAKSIT|TAKSIT TAHSIL/.test(d) && !inflow) return { category: 'kredi', by: 'auto' };
  if (/MAAS|UCRET ODEMESI|PERSONEL/.test(d) && inflow) return { category: 'maas', by: 'auto' };
  if (/KIRA/.test(d)) return { category: inflow ? 'kira_gelir' : 'konut', by: 'auto' };
  if (/FAIZ|TEMETTU|KAR PAYI/.test(d) && inflow) return { category: 'getiri', by: 'auto' };

  const fast = parseFast(tx.desc);
  if (fast) {
    if (isOwner(fast.party, ctx.ownerNames)) return { category: 'kendi', by: 'auto' };
    return { category: inflow ? 'diger_gelir' : 'kisi', by: 'auto' };
  }
  if (isOwner(tx.desc, ctx.ownerNames) && /YKB\/|REF:|VIRMAN|HESAPLAR ARASI/.test(d)) return { category: 'kendi', by: 'auto' };
  if (/VIRMAN|HESAPLAR ARASI/.test(d)) return { category: 'kendi', by: 'auto' };

  const m = matchMerchant(norm(stripCity(tx.desc)));
  if (m && !inflow) return { category: m, by: 'auto' };
  return { category: inflow ? 'diger_gelir' : 'diger', by: 'auto' };
}

function matchMerchant(d) {
  const padded = ' ' + d + ' ';
  for (const [cat, keys] of MERCHANT_RULES) {
    if (keys.some((k) => padded.includes(k))) return cat;
  }
  return null;
}

/** Bilinen abonelik markaları (aylık tekrar bekleyenler) */
export const SUB_KEYS = ['NETFLIX', 'SPOTIFY', 'DISNEY', 'AMZNPRIME', 'PRIME VIDEO', 'YOUTUBE', 'APPLE.COM', 'ICLOUD', 'CHATGPT', 'OPENAI', 'CLAUDE', 'EXXEN', 'BLUTV', 'MUBI', 'TOD', 'TABII', 'DIGITURK', 'GOOGLE', 'TURKCELL', 'VODAFONE', 'TURK TELEKOM', 'SUPERONLINE', 'TURKNET', 'GAIN'];
