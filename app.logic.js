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
  // Fixed demo timeline:
  // - last 2 years ending on 20.12.2025
  // - every day has reading (continuous streak)
  // - overlaps: typically 2–3 books read in parallel
  // - mix: short/medium/long, some finished, some ongoing, at least one not started

  const end = new Date(2025, 11, 20); // 20.12.2025 (month is 0-based)
  const start = addDays(end, -Math.round(365.25 * 2)); // ~2 years back from end

  const books = [
    mkBookShell("Der Mann ohne Eigenschaften", "Robert Musil", 1800), // ongoing anchor (daily)
    mkBookShell("Gödel, Escher, Bach", "Douglas Hofstadter", 777),    // long, slow, overlapping
    mkBookShell("Sapiens", "Yuval Noah Harari", 560),
    mkBookShell("Thinking, Fast and Slow", "Daniel Kahneman", 499),
    mkBookShell("The Pragmatic Programmer", "Andrew Hunt & David Thomas", 352),
    mkBookShell("Atomic Habits", "James Clear", 320),
    mkBookShell("Der Prozess", "Franz Kafka", 260),
    mkBookShell("1984", "George Orwell", 328),
    mkBookShell("On Writing", "Stephen King", 288),
    mkBookShell("Meditations", "Marcus Aurelius", 256),
    mkBookShell("Siddhartha", "Hermann Hesse", 160),
    mkBookShell("Die Verwandlung", "Franz Kafka", 90),
    mkBookShell("Gedichte", "Rainer Maria Rilke", 200), // intentionally not started
    mkBookShell("Ulysses", "James Joyce", 900), // ongoing/slow (optional overlap)
  ];

  const byTitle = new Map(books.map(b => [b.title, b]));

  // Deterministic RNG for repeatable demo
  const rng = mulberry32(20251220);

  // Reading configuration
  const anchor = byTitle.get("Der Mann ohne Eigenschaften"); // always read daily (2–6 pages)
  const longSlow = byTitle.get("Gödel, Escher, Bach");        // often read (1–4 pages)
  const optionalOngoing = byTitle.get("Ulysses");             // sometimes read (0–6 pages)

  // Primary rotation queue (books that get finished sequentially)
  const rotation = books
    .filter(b => !["Der Mann ohne Eigenschaften", "Gödel, Escher, Bach", "Ulysses", "Gedichte"].includes(b.title));

  let primaryIdx = 0;
  let secondaryIdx = 1;

  for (let d = new Date(start.getTime()); d <= end; d = addDays(d, 1)) {
    const key = dateKey(d);

    // Daily total pages (high reader). Weekends slightly higher.
    const weekday = d.getDay();
    const base = (weekday === 0 || weekday === 6) ? 85 : 65;
    // Keep this variable (even if currently unused) to stay close to original intent.
    const total = clampInt(Math.round(base + (rng() - 0.5) * 28), 40, 125);
    void total;

    // 1) Anchor progress: always 2–6 pages
    addProgress(anchor, key, randInt(rng, 2, 6));

    // 2) Long slow: most days 1–4 pages (keeps overlap, likely ongoing)
    if (rng() < 0.88) addProgress(longSlow, key, randInt(rng, 1, 4));

    // 3) Primary (finish sequentially), 25–90 pages/day
    let primary = rotation[primaryIdx % rotation.length];
    // If primary finished, advance until unfinished (or loop)
    let guard = 0;
    while (primary && latestPage(primary) >= primary.totalPages && guard < rotation.length) {
      primaryIdx += 1;
      primary = rotation[primaryIdx % rotation.length];
      guard += 1;
    }
    if (primary && latestPage(primary) < primary.totalPages) {
      addProgress(primary, key, randInt(rng, 25, 90));
    }

    // 4) Secondary overlap: on many days read a second rotating book 10–40 pages
    if (rng() < 0.72) {
      let secondary = rotation[secondaryIdx % rotation.length];
      guard = 0;
      while (secondary && (secondary === primary || latestPage(secondary) >= secondary.totalPages) && guard < rotation.length) {
        secondaryIdx += 1;
        secondary = rotation[secondaryIdx % rotation.length];
        guard += 1;
      }
      if (secondary && latestPage(secondary) < secondary.totalPages) {
        addProgress(secondary, key, randInt(rng, 10, 40));
      }
    }

    // 5) Occasionally add a third overlap (short burst) 6–18 pages
    if (rng() < 0.22) {
      const pick = rotation[Math.floor(rng() * rotation.length)];
      if (pick && pick !== primary && latestPage(pick) < pick.totalPages) {
        addProgress(pick, key, randInt(rng, 6, 18));
      }
    }

    // 6) Optional ongoing book (Ulysses): sometimes read 1–6 pages
    if (rng() < 0.35) addProgress(optionalOngoing, key, randInt(rng, 1, 6));

    // Ensure "Gedichte" stays not started (no entries)
    byTitle.get("Gedichte").history.length = 0;
  }

  // Final normalize: unique by date per book (last wins), sorted
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
