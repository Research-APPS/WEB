/**
 * IndexedDB persistence for H−2.
 * Stores: sessions, game_frames, game_states, review_events
 * localStorage is NOT used for dataset (UI prefs only, elsewhere).
 */
(function (global) {
  "use strict";

  const DB_NAME = "airam-h2";
  const DB_VERSION = 1;
  const STORES = ["sessions", "game_frames", "game_states", "review_events"];

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: "id" });
            if (name !== "sessions") {
              store.createIndex("session_id", "session_id", { unique: false });
            }
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("aborted"));
    });
  }

  async function put(storeName, obj) {
    const db = await openDb();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(obj);
    await txDone(tx);
    db.close();
    return obj;
  }

  async function get(storeName, id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(id);
      req.onsuccess = () => {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  }

  async function getAllBySession(storeName, sessionId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const idx = tx.objectStore(storeName).index("session_id");
      const req = idx.getAll(sessionId);
      req.onsuccess = () => {
        db.close();
        resolve(req.result || []);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  }

  async function getAll(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => {
        db.close();
        resolve(req.result || []);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  }

  async function clearAll() {
    const db = await openDb();
    const tx = db.transaction(STORES, "readwrite");
    for (const name of STORES) tx.objectStore(name).clear();
    await txDone(tx);
    db.close();
  }

  async function saveSessionBundle(session, frames, states, reviews) {
    const db = await openDb();
    const tx = db.transaction(STORES, "readwrite");
    tx.objectStore("sessions").put(session);
    for (const f of frames) tx.objectStore("game_frames").put(f);
    for (const s of states) tx.objectStore("game_states").put(s);
    for (const r of reviews) tx.objectStore("review_events").put(r);
    await txDone(tx);
    db.close();
  }

  async function loadSessionBundle(sessionId) {
    const session = await get("sessions", sessionId);
    if (!session) return null;
    const frames = (await getAllBySession("game_frames", sessionId)).sort(
      (a, b) => a.ply - b.ply
    );
    const states = (await getAllBySession("game_states", sessionId)).sort(
      (a, b) => a.ply - b.ply
    );
    const reviews = await getAllBySession("review_events", sessionId);
    return { session, frames, states, reviews };
  }

  function exportBundle(bundle) {
    return JSON.stringify(
      {
        format: "airam-h2-session",
        schema_version: global.AiramH2.SCHEMA_VERSION,
        exported_at: new Date().toISOString(),
        ...bundle,
      },
      null,
      2
    );
  }

  function parseImport(text) {
    const data = JSON.parse(text);
    if (!data.session || !Array.isArray(data.frames) || !Array.isArray(data.states)) {
      throw new Error("JSON inválido: falta session/frames/states");
    }
    data.reviews = data.reviews || [];
    return data;
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.Store = {
    put,
    get,
    getAll,
    getAllBySession,
    clearAll,
    saveSessionBundle,
    loadSessionBundle,
    exportBundle,
    parseImport,
    listSessions: () => getAll("sessions"),
  };
})(typeof window !== "undefined" ? window : globalThis);
