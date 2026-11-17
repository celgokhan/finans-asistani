// IndexedDB: tüm veri sadece bu cihazda tutulur.
const DB_NAME = 'finans-asistani';
const VERSION = 1;
export const STORES = ['txs', 'statements', 'receipts', 'kv'];

let dbp = null;
function open() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('txs')) {
          const s = db.createObjectStore('txs', { keyPath: 'id' });
          s.createIndex('hash', 'hash', { unique: false });
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('statements')) db.createObjectStore('statements', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('receipts')) db.createObjectStore('receipts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function all(store) {
  const db = await open();
  return wrap(db.transaction(store).objectStore(store).getAll());
}
export async function get(store, key) {
  const db = await open();
  return wrap(db.transaction(store).objectStore(store).get(key));
}
export async function put(store, value, key) {
  const db = await open();
  return wrap(db.transaction(store, 'readwrite').objectStore(store).put(value, key));
}
export async function putMany(store, values) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  for (const v of values) s.put(v);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
export async function del(store, key) {
  const db = await open();
  return wrap(db.transaction(store, 'readwrite').objectStore(store).delete(key));
}
export async function delMany(store, keys) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  for (const k of keys) tx.objectStore(store).delete(k);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
export async function clearAll() {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) tx.objectStore(s).clear();
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
export async function kvAll() {
  const db = await open();
  const s = db.transaction('kv').objectStore('kv');
  const [keys, vals] = await Promise.all([wrap(s.getAllKeys()), wrap(s.getAll())]);
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
}
