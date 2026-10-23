/**
 * IndexedDB saves (UE SaveSystem pattern): one autosave slot plus manual
 * slots, each storing the whole GameState. Loading always goes through
 * migrate() so old saves upgrade.
 */
import type { GameState } from '../state';
import { migrate } from './migrations';

const DB_NAME = 'compound_builder_saves';
const STORE = 'saves';
export const AUTOSAVE = 'autosave';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}

export async function saveGame(slot: string, s: GameState): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ savedAt: Date.now(), state: s }, slot);
    await done(tx);
    db.close();
    return true;
  } catch (e) {
    console.error('Save failed', e);
    return false;
  }
}

export async function loadGame(slot: string): Promise<GameState | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const rec = await new Promise<{ state?: unknown } | undefined>((res, rej) => {
      const r = tx.objectStore(STORE).get(slot);
      r.onsuccess = () => res(r.result as { state?: unknown } | undefined);
      r.onerror = () => rej(r.error);
    });
    db.close();
    return rec?.state ? migrate(rec.state) : null;
  } catch (e) {
    console.error('Load failed', e);
    return null;
  }
}

export async function deleteSave(slot: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(slot);
  await done(tx);
  db.close();
}
