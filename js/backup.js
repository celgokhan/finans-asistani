// Parolalı yedek: PBKDF2 (SHA-256, 310.000 tur) + AES-GCM 256.
const ITER = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await key(password, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(obj)));
  return JSON.stringify({ app: 'finans-asistani', v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) });
}

export async function decryptJSON(text, password) {
  const f = JSON.parse(text);
  if (f.app !== 'finans-asistani') throw new Error('Bu dosya bir Finans Asistanı yedeği değil.');
  const k = await key(password, unb64(f.salt));
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, k, unb64(f.data));
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new Error('Parola yanlış ya da dosya bozuk.');
  }
}

export async function blobToDataURL(blob) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}
export async function dataURLToBlob(url) {
  return (await fetch(url)).blob();
}
