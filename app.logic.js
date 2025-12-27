// app.logic.js
// Domain logic: computations, date helpers, book helpers, demo-data generator.

/* ------------------ utils ------------------ */

export function clampInt(v, min, max) {
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/* ------------------ computation ------------------ */

export function computeDailyPages(books) {
  // Aggregates "pages read" per date by computing positive deltas between successive entries per book.
  const daily = new Map();

  for (const book of books) {
    const hist = [...(book.history || [])].sort((a, b) => a.date.localeCompare(b.date));
    let prev = clampInt(book.initialPage ?? 0, 0, book.totalPages);
    for (const entry of hist) {
      const page = clampInt(entry.page, 0, book.totalPages);
      const delta = page - prev;
      if (delta > 0) {
        daily.set(entry.date, (daily.get(entry.date) ?? 0) + delta);
      }
      prev = Math.max(prev, page);
    }
  }
  return daily;
}

export function computeDailyPagesByBook(books) {
  // Map dateKey -> Map bookTitle -> pagesReadDelta
  // Uses the same delta logic as computeDailyPages, but keeps a per-book breakdown.
  const out = new Map();

  for (const book of books) {
    const title = String(book.title || "(Ohne Titel)");
    const hist = [...(book.history || [])].sort((a, b) => a.date.localeCompare(b.date));
    let prev = clampInt(book.initialPage ?? 0, 0, book.totalPages);

    for (const entry of hist) {
      const page = clampInt(entry.page, 0, book.totalPages);
      const delta = page - prev;
      if (delta > 0) {
        if (!out.has(entry.date)) out.set(entry.date, new Map());
        const m = out.get(entry.date);
        m.set(title, (m.get(title) ?? 0) + delta);
      }
      prev = Math.max(prev, page);
    }
  }

  return out;
}

export function computeStreaks(dailyMap) {
  // Current streak ends today and counts days with pages>0.
  const today = todayKey();
  let current = 0;
  let cursor = parseDate(today);

  while (true) {
    const k = dateKey(cursor);
    const v = dailyMap.get(k) ?? 0;
    if (v <= 0) break;
    current += 1;
    cursor = addDays(cursor, -1);
  }

  // Longest streak across all history.
  const daysWithReading = [...dailyMap.entries()]
    .filter(([, v]) => v > 0)
    .map(([d]) => d)
    .sort();

  let longest = 0;
  let run = 0;
  let prevDate = null;

  for (const d of daysWithReading) {
    if (!prevDate) {
      run = 1;
    } else {
      const diff = daysBetween(parseDate(prevDate), parseDate(d));
      run = (diff === 1) ? run + 1 : 1;
    }
    longest = Math.max(longest, run);
    prevDate = d;
  }

  return { currentStreak: current, longestStreak: longest };
}

export function computeWeekTotals(dailyMap) {
  // key: weekStartDate(YYYY-MM-DD)
  const out = new Map();
  for (const [date, pages] of dailyMap.entries()) {
    if (pages <= 0) continue;
    const d = parseDate(date);
    const wk = startOfWeek(d);
    const k = dateKey(wk);
    out.set(k, (out.get(k) ?? 0) + pages);
  }
  return out;
}

export function computeMonthTotals(dailyMap) {
  // key: YYYY-MM
  const out = new Map();
  for (const [date, pages] of dailyMap.entries()) {
    if (pages <= 0) continue;
    const d = parseDate(date);
    const k = monthKey(d);
    out.set(k, (out.get(k) ?? 0) + pages);
  }
  return out;
}

export function computeYearTotals(dailyMap) {
  // key: YYYY
  const out = new Map();
  for (const [date, pages] of dailyMap.entries()) {
    if (pages <= 0) continue;
    const d = parseDate(date);
    const k = String(d.getFullYear());
    out.set(k, (out.get(k) ?? 0) + pages);
  }
  return out;
}

/* ------------------ book helpers ------------------ */

export function isFinished(book) {
  const cur = latestPage(book);
  return book.totalPages > 0 && cur >= book.totalPages;
}

export function lastEntryDateKey(book) {
  if (!book.history?.length) return "0000-00-00";
  return [...book.history].map(h => h.date).sort().at(-1) || "0000-00-00";
}

export function latestPage(book) {
  const base = clampInt(book.initialPage ?? 0, 0, book.totalPages);
  if (!book.history?.length) return base;
  return Math.max(base, ...book.history.map(h => clampInt(h.page, 0, book.totalPages)));
}

export function latestPageBefore(book, dateKeyStr) {
  const base = clampInt(book.initialPage ?? 0, 0, book.totalPages);
  const hist = [...(book.history || [])]
    .filter(h => h.date < dateKeyStr)
    .sort((a, b) => b.date.localeCompare(a.date));
  return hist.length ? Math.max(base, clampInt(hist[0].page, 0, book.totalPages)) : base;
}

export function earliestPageAfter(book, dateKeyStr) {
  const hist = [...(book.history || [])]
    .filter(h => h.date > dateKeyStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  return hist.length ? clampInt(hist[0].page, 0, book.totalPages) : null;
}

export function upsertHistory(book, date, page) {
  const i = (book.history || []).findIndex(h => h.date === date);
  if (i >= 0) {
    book.history[i].page = page;
  } else {
    book.history = book.history || [];
    book.history.push({ date, page });
    book.history.sort((a, b) => a.date.localeCompare(b.date));
  }
}

/* ------------------ date helpers ------------------ */

export function todayKey() {
  return dateKey(new Date());
}

export function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function monthKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function parseDate(yyyy_mm_dd) {
  // Local date (avoid timezone shifts)
  const [y, m, d] = yyyy_mm_dd.split("-").map(x => Number.parseInt(x, 10));
  return new Date(y, (m - 1), d);
}

export function addDays(date, delta) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + delta);
  return d;
}

export function addMonths(date, delta) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + delta);
  return d;
}

export function startOfWeek(date) {
  // Monday as week start
  const d = new Date(date.getTime());
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diffToMon = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diffToMon);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bb - aa) / ms);
}

/* ------------------ formatting ------------------ */

export function formatDateShort(yyyy_mm_dd) {
  const d = parseDate(yyyy_mm_dd);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
}

export function formatDateCompact(yyyy_mm_dd) {
  const d = parseDate(yyyy_mm_dd);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

export function formatDayLabel(d) {
  // show day of month
  return String(d.getDate());
}

export function formatWeekLabel(weekStartDate) {
  const d = weekStartDate;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

export function formatMonthLabel(d) {
  const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
}

export function formatNumber(n, maxFractionDigits = 0) {
  const val = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("de-CH", { maximumFractionDigits: maxFractionDigits }).format(val);
}

/* ------------------ demo data ------------------ */

export function createDemoState() {
  // Demo generator (reliable + slightly random):
  // - creates 24 books (order randomized)
  // - generates reading for the last 24 months up to *today*
  // - almost every day has pages read; only very few isolated 0-days
  // - every non-zero day reads at least one book, often 2–3 (overlaps)
  // - daily totals are fairly stable with mild variance and rare, non-extreme outliers

  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const addMonthsClamped = (date, delta) => {
    const y = date.getFullYear();
    const m0 = date.getMonth();
    const d0 = date.getDate();
    const first = new Date(y, m0 + delta, 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    first.setDate(Math.min(d0, lastDay));
    first.setHours(0, 0, 0, 0);
    return first;
  };

  const start = addMonthsClamped(end, -24);

  // Seed derived from today's date for stable output per day.
  const seed = Number.parseInt(todayKey().replace(/-/g, ""), 10) ^ 0xA5A51337;
  const rng = mulberry32(seed >>> 0);

  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const pickOne = (arr) => arr[Math.floor(rng() * arr.length)];

  // A small, bounded "normal-ish" noise (triangular) for stable day totals.
  const tri = () => (rng() + rng() + rng()) / 3; // ~bell-ish in [0,1]

  // Build 24 books (mix of lengths), randomized order.
  const titlePool = [
    "Das stille Kapitel", "Die lange Reise", "Nordlicht", "Stadt der Wörter", "Zwischen den Zeilen",
    "Zeitfenster", "Der zweite Blick", "Kleine Gewohnheiten", "Echo im Wald", "Denkpfade",
    "Sternenkarte", "Der rote Faden", "Wellenbrecher", "Späte Notizen", "Papier & Schatten",
    "Klarer Kopf", "Morgenroutine", "Die letzte Seite", "Ruhige Tage", "Grenzgang",
    "Feine Linien", "Der Pfad", "Kurzschluss", "Wörtermeer"
  ];

  const authorPool = [
    "A. Keller", "M. Steiner", "L. Baumann", "S. Meier", "N. Frei", "T. Schmid",
    "P. Graf", "E. Huber", "J. Vogel", "R. Hartmann"
  ];

  const totals = [];
  // Mix of lengths, but enough overall pages so that not everything finishes too early.
  // 7 shorter, 10 medium, 7 long
  for (let i = 0; i < 7; i += 1) totals.push(randInt(rng, 220, 380));
  for (let i = 0; i < 10; i += 1) totals.push(randInt(rng, 380, 700));
  for (let i = 0; i < 7; i += 1) totals.push(randInt(rng, 700, 1400));
  shuffleInPlace(totals);
  // Ensure at least one long "anchor" book remains unfinished across the range.
  totals[0] = randInt(rng, 1800, 2600);

  const titles = shuffleInPlace([...titlePool]);

  const books = Array.from({ length: 24 }, (_, i) => {
    const title = titles[i] || `Demo Buch ${String(i + 1).padStart(2, "0")}`;
    const author = pickOne(authorPool);
    return mkBookShell(title, author, totals[i] ?? randInt(rng, 320, 950));
  });
  shuffleInPlace(books);

  const byId = new Map(books.map(b => [b.id, b]));
  const currentPage = new Map(books.map(b => [b.id, 0]));

  const remaining = (id) => {
    const b = byId.get(id);
    return Math.max(0, (b?.totalPages ?? 0) - (currentPage.get(id) ?? 0));
  };

  const unfinishedIds = () => books.map(b => b.id).filter(id => remaining(id) > 0);

  // Active reading set to encourage overlaps and continuity.
  const active = [];
  const ensureActive = (min) => {
    const pool = unfinishedIds().filter(id => !active.includes(id));
    while (active.length < min && pool.length) {
      const id = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      active.push(id);
    }
  };
  ensureActive(3);

  // Choose a few isolated 0-days across the whole range.
  const totalDays = daysBetween(start, end) + 1;
  const zeroTarget = Math.max(3, Math.min(8, Math.round(totalDays * 0.006)));
  const zeroDays = new Set();
  let tries = 0;
  while (zeroDays.size < zeroTarget && tries < 10_000) {
    tries += 1;
    const offset = randInt(rng, 0, totalDays - 1);
    const d = addDays(start, offset);
    const k = dateKey(d);
    // avoid clusters: keep distance >= 10 days
    const ok = [...zeroDays].every(z => Math.abs(daysBetween(parseDate(z), d)) >= 10);
    if (ok) zeroDays.add(k);
  }

  // Main timeline loop (daily entries)
  for (let d = new Date(start.getTime()); d <= end; d = addDays(d, 1)) {
    const key = dateKey(d);
    if (zeroDays.has(key)) continue;

    // Stable daily total with mild variance and rare, non-extreme outliers.
    const weekday = d.getDay();
    const weekendBoost = (weekday === 0 || weekday === 6) ? 2 : 0;
    let dailyTotal = 16 + weekendBoost + Math.round((tri() - 0.5) * 10); // ~11..21 typical
    if (rng() < 0.03) dailyTotal += randInt(rng, 5, 10); // small outlier up
    if (rng() < 0.02) dailyTotal -= randInt(rng, 3, 6);  // small outlier down
    dailyTotal = clampInt(dailyTotal, 6, 32);

    // Ensure we always have enough active unfinished books.
    for (let i = active.length - 1; i >= 0; i -= 1) {
      if (remaining(active[i]) <= 0) active.splice(i, 1);
    }
    ensureActive(2);

    // How many books today? (overlaps common)
    const r = rng();
    const booksToday = (r < 0.55) ? 1 : (r < 0.90) ? 2 : (r < 0.99) ? 3 : 4;

    // Pick candidates: mostly from active, sometimes add a new one.
    const chosen = new Set();
    const addFromActive = () => {
      if (!active.length) return;
      chosen.add(active[Math.floor(rng() * active.length)]);
    };
    const addNew = () => {
      const pool = unfinishedIds().filter(id => !chosen.has(id));
      if (!pool.length) return;
      const id = pool[Math.floor(rng() * pool.length)];
      chosen.add(id);
      if (!active.includes(id)) active.push(id);
    };

    // Guarantee at least 1 book
    addFromActive();
    while (chosen.size < booksToday) {
      if (rng() < 0.78) addFromActive();
      else addNew();
      if (chosen.size >= unfinishedIds().length) break;
    }

    const ids = [...chosen].filter(id => remaining(id) > 0);
    if (!ids.length) continue;

    // Allocate pages across chosen books with mild randomness, at least 1 each (if possible).
    const weights = ids.map(() => 0.4 + rng());
    const sumW = weights.reduce((a, b) => a + b, 0);

    let allocation = weights.map(w => Math.max(1, Math.round((w / sumW) * dailyTotal)));
    // Adjust allocation to match dailyTotal exactly
    let diff = allocation.reduce((a, b) => a + b, 0) - dailyTotal;
    while (diff !== 0) {
      const i = Math.floor(rng() * allocation.length);
      if (diff > 0 && allocation[i] > 1) {
        allocation[i] -= 1;
        diff -= 1;
      } else if (diff < 0) {
        allocation[i] += 1;
        diff += 1;
      } else {
        // fallback: if all are 1 and we need to reduce, just reduce dailyTotal (rare)
        if (diff > 0) {
          dailyTotal = Math.max(1, dailyTotal - 1);
          diff = allocation.reduce((a, b) => a + b, 0) - dailyTotal;
        }
      }
    }

    // Apply allocations, respecting remaining pages; redistribute overflow.
    const deltas = new Map(ids.map((id, i) => [id, allocation[i]]));

    const redistribute = () => {
      let overflow = 0;
      for (const id of ids) {
        const rem = remaining(id);
        const want = deltas.get(id) ?? 0;
        if (want > rem) {
          overflow += (want - rem);
          deltas.set(id, rem);
        }
      }
      if (overflow <= 0) return;
      const targets = ids.filter(id => remaining(id) > (deltas.get(id) ?? 0));
      let guard = 0;
      while (overflow > 0 && targets.length && guard < 10_000) {
        guard += 1;
        const id = targets[Math.floor(rng() * targets.length)];
        const canAdd = remaining(id) - (deltas.get(id) ?? 0);
        if (canAdd <= 0) {
          targets.splice(targets.indexOf(id), 1);
          continue;
        }
        const add = Math.min(canAdd, 1 + (rng() < 0.15 ? 1 : 0));
        deltas.set(id, (deltas.get(id) ?? 0) + add);
        overflow -= add;
      }
    };
    redistribute();

    // Record one entry per chosen book for this day.
    for (const id of ids) {
      const delta = clampInt(deltas.get(id) ?? 0, 0, 10_000);
      if (delta <= 0) continue;
      const b = byId.get(id);
      const cur = currentPage.get(id) ?? 0;
      const next = Math.min(b.totalPages, cur + delta);
      currentPage.set(id, next);
      b.history.push({ date: key, page: next });
    }

    // Keep active set small and rotating, but with continuity.
    // Occasionally introduce a new book to create overlaps.
    if (rng() < 0.22) ensureActive(Math.min(4, 2 + randInt(rng, 0, 2)));
    // If too many active, drop one that wasn't chosen today.
    if (active.length > 4) {
      const dropCandidates = active.filter(id => !chosen.has(id));
      if (dropCandidates.length) {
        const drop = dropCandidates[Math.floor(rng() * dropCandidates.length)];
        active.splice(active.indexOf(drop), 1);
      } else {
        active.splice(Math.floor(rng() * active.length), 1);
      }
    }
  }

  // Final normalize: unique by date per book (last wins), sorted.
  for (const b of books) {
    const map = new Map();
    for (const e of b.history) map.set(e.date, clampInt(e.page, 0, b.totalPages));
    b.history = [...map.entries()]
      .map(([date, page]) => ({ date, page }))
      .sort((a, c) => a.date.localeCompare(c.date));
  }

  return { version: 1, books };
}

export function mkBookShell(title, author, totalPages) {
  return {
    id: crypto.randomUUID(),
    title,
    author,
    totalPages,
    initialPage: 0,
    createdAt: new Date().toISOString(),
    history: []
  };
}

export function addProgress(book, date, delta) {
  if (!book) return;
  const cur = latestPage(book);
  if (cur >= book.totalPages) return;
  const next = Math.min(book.totalPages, cur + clampInt(delta, 0, 1000));
  // Always record a daily "read up to" entry
  book.history.push({ date, page: next });
}

export function mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng, min, max) {
  const r = rng();
  return Math.floor(r * (max - min + 1)) + min;
}
