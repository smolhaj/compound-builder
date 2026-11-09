/**
 * The photo vault: the pixels of the album (sim/photos.ts), kept apart from the game state (the state is cloned every tick) in memory and in
 * their own IndexedDB database, so a save stays small and the autosave never rewrites them. Bounded by the album (16 photos, 60 KB each).
 * `exportVault` / `importVault` carry them in a JSON export; everything imported is checked by `cleanPhotoData`.
 */
import { MAX_PHOTOS, validPhotoData } from '../photos';

const DB = 'compound_builder_photos', STORE = 'photos';
const mem = new Map<string, string>();
const subs = new Set<() => void>();
let version = 0;
const bump = () => { version++; for (const f of subs) f(); };

export const vaultSubscribe = (f: () => void): (() => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const vaultVersion = (): number => version;
export const photoData = (id: string): string | undefined => mem.get(id);
export const vaultSize = (): number => mem.size;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const idb = typeof indexedDB !== 'undefined';
async function write(fn: (st: IDBObjectStore) => void): Promise<void> {
  if (!idb) return;
  try {
    const db = await open(), tx = db.transaction(STORE, 'readwrite');
    fn(tx.objectStore(STORE));
    await new Promise<void>((ok, bad) => { tx.oncomplete = () => ok(); tx.onerror = () => bad(tx.error); tx.onabort = () => bad(tx.error); });
    db.close();
  } catch (e) { console.error('Photo vault write failed', e); }
}

/** Keep the pixels of a photo (memory now, IndexedDB in the background). False when they are not a small JPEG or the vault is full. */
export function putPhoto(id: string, data: string): boolean {
  if (!validPhotoData(data) || (!mem.has(id) && mem.size >= MAX_PHOTOS + 4)) return false;
  mem.set(id, data); bump();
  void write(st => { st.put(data, id); });
  return true;
}

export function removePhotos(ids: readonly string[]): void {
  if (!ids.length) return;
  for (const id of ids) mem.delete(id);
  bump();
  void write(st => { for (const id of ids) st.delete(id); });
}

/** After a load or a new game: keep exactly the pixels the state's album names. Pixels not named are let go, in memory and on disk. */
export async function syncVault(keep: readonly string[]): Promise<void> {
  const want = new Set(keep.slice(-MAX_PHOTOS));
  for (const id of [...mem.keys()]) if (!want.has(id)) mem.delete(id);
  if (idb) {
    try {
      const db = await open(), tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
      const keys = await new Promise<IDBValidKey[]>((ok, bad) => { const r = st.getAllKeys(); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
      for (const k of keys) if (typeof k !== 'string' || !want.has(k)) st.delete(k);
      for (const id of want) {
        if (mem.has(id)) continue;
        const v = await new Promise<unknown>((ok, bad) => { const r = st.get(id); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
        if (validPhotoData(v)) mem.set(id, v);
      }
      await new Promise<void>((ok, bad) => { tx.oncomplete = () => ok(); tx.onerror = () => bad(tx.error); tx.onabort = () => bad(tx.error); });
      db.close();
    } catch (e) { console.error('Photo vault sync failed', e); }
  }
  bump();
}

/** QA / tests: forget the in-memory copies (the disk keeps them) so a reload from IndexedDB can be checked. */
export function forgetMemory(): void { mem.clear(); bump(); }

/** The pixels of the named photos, for a JSON export. */
export function exportVault(ids: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ids) { const d = mem.get(id); if (d) out[id] = d; }
  return out;
}

/** Take imported (already cleaned) pixels into the vault and drop everything else. */
export async function importVault(data: Record<string, string>): Promise<void> {
  mem.clear();
  for (const [id, d] of Object.entries(data)) if (validPhotoData(d)) mem.set(id, d);
  if (idb) await write(st => { st.clear(); for (const [id, d] of mem) st.put(d, id); });
  bump();
}
