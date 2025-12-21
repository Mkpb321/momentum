// storage.js
// Designed so you can later swap the provider (e.g., Firestore) without touching UI logic.

const STORAGE_KEY = "readingTracker.v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportState(state) {
  return JSON.stringify(state, null, 2);
}

export function importState(jsonText) {
  const parsed = JSON.parse(jsonText);
  return normalizeState(parsed);
}

/* ------------------ internals ------------------ */

function defaultState() {
  return {
    version: 1,
    books: []
  };
}

function normalizeState(s) {
  const state = s && typeof s === "object" ? s : defaultState();
  state.version = 1;

  if (!Array.isArray(state.books)) state.books = [];
  state.books = state.books
    .filter(b => b && typeof b === "object")
    .map(b => ({
      id: String(b.id || crypto.randomUUID()),
      title: String(b.title || "Ohne Titel"),
      author: String(b.author || ""),
      totalPages: clampInt(b.totalPages, 1, 100000),
      createdAt: String(b.createdAt || new Date().toISOString()),
      history: normalizeHistory(b.history)
    }));

  return state;
}

function normalizeHistory(h) {
  if (!Array.isArray(h)) return [];
  // Only keep {date, page} items.
  const map = new Map();
  for (const x of h) {
    if (!x || typeof x !== "object") continue;
    const date = String(x.date || "").slice(0, 10);
    const page = clampInt(x.page, 0, 100000);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    map.set(date, page); // last wins
  }
  const out = [...map.entries()]
    .map(([date, page]) => ({ date, page }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function clampInt(v, min, max) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

