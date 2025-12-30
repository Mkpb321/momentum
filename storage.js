// storage.js
// Firestore-backed persistence + JSON import/export.
// Data model: /users/{uid}/books/{bookId}
//
// Notes:
// - This module keeps the same in-memory "state" shape as before ({version, books: []}),
//   so rendering + logic stays unchanged.
// - Firestore write strategy: write per book document (no global "state" doc).

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

export function exportState(state) {
  return JSON.stringify(state, null, 2);
}

export function importState(jsonText) {
  const parsed = JSON.parse(jsonText);
  return normalizeState(parsed);
}

export function defaultState() {
  return { version: 1, books: [] };
}

/* ------------------ Firestore API ------------------ */

function booksCollection(db, uid) {
  return collection(db, "users", uid, "books");
}

function bookDoc(db, uid, bookId) {
  return doc(db, "users", uid, "books", bookId);
}

export async function loadState(db, uid) {
  if (!db || !uid) return defaultState();

  const snap = await getDocs(booksCollection(db, uid));
  const books = snap.docs.map(d => ({
    id: d.id,
    ...(d.data() || {})
  }));

  return normalizeState({ version: 1, books });
}

export async function upsertBook(db, uid, book) {
  const b = normalizeBook(book);
  const ref = bookDoc(db, uid, b.id);

  // Keep Firestore docs lean and predictable.
  const payload = {
    title: b.title,
    author: b.author,
    totalPages: b.totalPages,
    initialPage: b.initialPage,
    createdAt: b.createdAt,
    history: b.history,
    updatedAt: serverTimestamp()
  };

  await setDoc(ref, payload, { merge: true });
}

export async function deleteBook(db, uid, bookId) {
  await deleteDoc(bookDoc(db, uid, String(bookId)));
}

export async function replaceAllBooks(db, uid, books) {
  // Replace all books for a user. Used for import or seeding demo data.
  // Client-side "recursive delete" is not available; we delete existing book docs explicitly.
  const existing = await getDocs(booksCollection(db, uid));
  const existingIds = existing.docs.map(d => d.id);

  // Chunk writes/deletes in batches (Firestore batch limit: 500 ops).
  const ops = [];

  for (const id of existingIds) {
    ops.push({ type: "del", id });
  }
  for (const book of books) {
    const b = normalizeBook(book);
    ops.push({ type: "set", book: b });
  }

  let i = 0;
  while (i < ops.length) {
    const batch = writeBatch(db);
    let n = 0;
    while (i < ops.length && n < 450) { // keep margin
      const op = ops[i++];
      n += 1;
      if (op.type === "del") {
        batch.delete(bookDoc(db, uid, op.id));
      } else {
        batch.set(bookDoc(db, uid, op.book.id), {
          title: op.book.title,
          author: op.book.author,
          totalPages: op.book.totalPages,
          initialPage: op.book.initialPage,
          createdAt: op.book.createdAt,
          history: op.book.history,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    }
    await batch.commit();
  }
}

/* ------------------ normalization (normalization helpers) ------------------ */

function normalizeState(s) {
  const state = s && typeof s === "object" ? s : defaultState();
  state.version = 1;

  if (!Array.isArray(state.books)) state.books = [];
  state.books = state.books
    .filter(b => b && typeof b === "object")
    .map(normalizeBook);

  return state;
}

function normalizeBook(b) {
  const totalPages = clampInt(b.totalPages, 1, 100000);
  const id = String(b.id || crypto.randomUUID());
  const createdAt = String(b.createdAt || new Date().toISOString());
  const initialPage = clampInt(b.initialPage ?? b.initialPages ?? 0, 0, totalPages);

  return {
    id,
    title: String(b.title || "Ohne Titel"),
    author: String(b.author || ""),
    totalPages,
    initialPage,
    createdAt,
    history: normalizeHistory(b.history, totalPages)
  };
}

function normalizeHistory(h, totalPages = 100000) {
  if (!Array.isArray(h)) return [];
  const map = new Map();
  for (const x of h) {
    if (!x || typeof x !== "object") continue;
    const date = String(x.date || "").slice(0, 10);
    const page = clampInt(x.page, 0, totalPages);

    // Accept a few legacy keys on import.
    const rawInsight = (x.insight ?? x.erkenntnis ?? x.note ?? x.notiz ?? "");
    const insight = String(rawInsight || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    map.set(date, { page, insight: insight || null }); // last wins
  }

  return [...map.entries()]
    .map(([date, v]) => {
      const out = { date, page: v.page };
      if (v.insight) out.insight = v.insight;
      return out;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function clampInt(v, min, max) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
