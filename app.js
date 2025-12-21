// app.js
import { loadState, saveState, exportState, importState } from "./storage.js";
import { renderLineChart } from "./charts.js";

/* ------------------ state ------------------ */
let state = loadState();

/* ===================== DEMO-DATEN (optional) =====================
   Für Probe-Daten (mehrere Bücher + Leseverlauf über ~5 Jahre):
   1) ENABLE_DEMO_DATA auf true setzen und Seite neu laden.
   2) Danach wieder auf false setzen, damit es nicht jedes Mal überschreibt.
   Hinweis: Standardmäßig werden Demo-Daten nur geladen, wenn noch keine Bücher existieren.
   Wenn du vorhandene Daten bewusst überschreiben willst: DEMO_OVERWRITE_EXISTING = true.
================================================================== */
const ENABLE_DEMO_DATA = false;
const DEMO_OVERWRITE_EXISTING = false;

if (ENABLE_DEMO_DATA && (DEMO_OVERWRITE_EXISTING || state.books.length === 0)) {
  state = createDemoState();
  saveState(state);
}
/* =================== Ende DEMO-DATEN =================== */

let showFinished = false;
let searchQuery = "";

let activeBookId = null;

/* ------------------ DOM ------------------ */
const el = {
  btnAddBook: document.getElementById("btnAddBook"),
  btnAddBookEmpty: document.getElementById("btnAddBookEmpty"),
  dlgAddBook: document.getElementById("dlgAddBook"),
  formAddBook: document.getElementById("formAddBook"),
  btnCloseAddBook: document.getElementById("btnCloseAddBook"),
  btnCancelAddBook: document.getElementById("btnCancelAddBook"),

  dlgBook: document.getElementById("dlgBook"),
  formBook: document.getElementById("formBook"),
  bookTitle: document.getElementById("bookTitle"),
  bookSub: document.getElementById("bookSub"),
  bookProgBar: document.getElementById("bookProgBar"),
  bookProgText: document.getElementById("bookProgText"),
  bookProgPct: document.getElementById("bookProgPct"),
  inpPage: document.getElementById("inpPage"),
  historyList: document.getElementById("historyList"),
  btnDeleteBook: document.getElementById("btnDeleteBook"),
  btnCloseBookX: document.getElementById("btnCloseBookX"),

  bookList: document.getElementById("bookList"),
  emptyState: document.getElementById("emptyState"),
  booksMeta: document.getElementById("booksMeta"),

  bookSearch: document.getElementById("bookSearch"),
  btnToggleFinished: document.getElementById("btnToggleFinished"),

  kpiCurrentStreak: document.getElementById("kpiCurrentStreak"),
  kpiLongestStreak: document.getElementById("kpiLongestStreak"),
  kpiLongestHint: document.getElementById("kpiLongestHint"),
  kpiTodayPages: document.getElementById("kpiTodayPages"),
  streakMeta: document.getElementById("streakMeta"),

  chartDays: document.getElementById("chartDays"),
  chartWeeks: document.getElementById("chartWeeks"),
  chartMonths: document.getElementById("chartMonths"),
  subDays: document.getElementById("subDays"),
  subWeeks: document.getElementById("subWeeks"),
  subMonths: document.getElementById("subMonths"),
  sumDays: document.getElementById("sumDays"),
  sumWeeks: document.getElementById("sumWeeks"),
  sumMonths: document.getElementById("sumMonths"),

  toast: document.getElementById("toast"),

  btnExport: document.getElementById("btnExport"),
  btnImport: document.getElementById("btnImport"),
  fileImport: document.getElementById("fileImport"),
};

wireEvents();
renderAll();

/* ------------------ events ------------------ */

function wireEvents() {
  el.btnAddBook.addEventListener("click", openAddBook);
  el.btnAddBookEmpty?.addEventListener("click", openAddBook);

  // Books controls
  el.bookSearch?.addEventListener("input", () => {
    searchQuery = String(el.bookSearch.value || "").trim().toLowerCase();
    renderBooks();
  });

  el.btnToggleFinished?.addEventListener("click", () => {
    showFinished = !showFinished;
    renderBooks();
    updateBooksControls();
  });

  el.btnCloseAddBook?.addEventListener("click", () => el.dlgAddBook.close());
  el.btnCancelAddBook?.addEventListener("click", () => el.dlgAddBook.close());

  el.btnCloseBookX?.addEventListener("click", () => el.dlgBook.close());
  el.formAddBook.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(el.formAddBook);
    const title = String(fd.get("title") || "").trim();
    const author = String(fd.get("author") || "").trim();
    const totalPages = clampInt(fd.get("totalPages"), 1, 100000);

    if (!title) {
      toast("Titel fehlt.");
      return;
    }
    addBook({ title, author, totalPages });
    el.formAddBook.reset();
    el.dlgAddBook.close();
  });

  // Save page
  el.formBook.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const book = getActiveBook();
    if (!book) return;

    const raw = el.inpPage.value;
    const newPage = clampInt(raw, 0, book.totalPages);
    const today = todayKey();

    const prev = latestPageBefore(book, today);
    if (newPage < prev) {
      el.inpPage.value = String(prev);
      toast("Seitenzahl kann nicht kleiner als der letzte Stand sein.");
      return;
    }

    upsertHistory(book, today, newPage);
    save();
    toast("Gespeichert.");
    renderAll();
    el.dlgBook.close();
  });

  // Delete book
  el.btnDeleteBook.addEventListener("click", (ev) => {
    ev.preventDefault();
    const book = getActiveBook();
    if (!book) return;

    const ok = confirm(`Buch löschen: "${book.title}"?\nAlle Einträge gehen verloren.`);
    if (!ok) return;

    state.books = state.books.filter(b => b.id !== book.id);
    save();
    el.dlgBook.close();
    toast("Buch gelöscht.");
    renderAll();
  });

  // Export / Import
  el.btnExport.addEventListener("click", () => {
    const json = exportState(state);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reading-tracker-export-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Export erstellt.");
  });

  el.btnImport.addEventListener("click", () => el.fileImport.click());
  el.fileImport.addEventListener("change", async () => {
    const file = el.fileImport.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = importState(text);
      state = imported;
      save();
      renderAll();
      toast("Import erfolgreich.");
    } catch {
      toast("Import fehlgeschlagen (ungültige JSON-Datei).");
    } finally {
      el.fileImport.value = "";
    }
  });

  // Re-render charts on resize
  window.addEventListener("resize", debounce(() => renderCharts(), 120));
}

function openAddBook() {
  el.dlgAddBook.showModal();
  const first = el.formAddBook.querySelector("input[name='title']");
  first?.focus();
}

/* ------------------ actions ------------------ */

function addBook({ title, author, totalPages }) {
  state.books.unshift({
    id: crypto.randomUUID(),
    title,
    author,
    totalPages,
    createdAt: new Date().toISOString(),
    history: []
  });
  save();
  toast("Buch hinzugefügt.");
  renderAll();
}

function openBook(bookId) {
  activeBookId = bookId;
  const book = getActiveBook();
  if (!book) return;

  el.bookTitle.textContent = book.title;
  el.bookSub.textContent = book.author ? book.author : "—";

  const cur = latestPage(book);
  const pct = Math.min(100, Math.round((cur / book.totalPages) * 100));
  el.bookProgBar.style.width = pct + "%";
  el.bookProgText.textContent = `${cur} / ${book.totalPages}`;
  el.bookProgPct.textContent = `${pct}%`;

  // input defaults to today's value if present, else current
  const today = todayKey();
  const todayEntry = book.history.find(h => h.date === today);
  el.inpPage.value = String(todayEntry?.page ?? cur);
  el.inpPage.max = String(book.totalPages);

  // history list (latest first)
  const rows = [...book.history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  el.historyList.innerHTML = rows.length
    ? rows.map(r => `
        <div class="histrow">
          <div class="histrow__date">${formatDateShort(r.date)}</div>
          <div class="histrow__val">bis ${r.page}</div>
        </div>
      `).join("")
    : `<div class="muted" style="padding:6px;">Noch keine Einträge.</div>`;

  el.dlgBook.showModal();
  el.inpPage.focus();
  el.inpPage.select();
}

function save() {
  saveState(state);
}

/* ------------------ rendering ------------------ */

function renderAll() {
  updateBooksControls();
  renderBooks();
  renderStatsAndKpis();
  renderCharts();
}


function updateBooksControls() {
  if (el.btnToggleFinished) {
    el.btnToggleFinished.textContent = showFinished ? "Fertige ausblenden" : "Fertige anzeigen";
  }
}

function renderBooks() {
  let books = [...state.books];

  // Sort: zuletzt gelesen zuerst (nach letztem History-Datum), sonst nach Erstellungsdatum
  books.sort((a, b) => {
    const ad = lastEntryDateKey(a);
    const bd = lastEntryDateKey(b);
    if (ad !== bd) return bd.localeCompare(ad);
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });

  const totalCount = books.length;
  const finishedCount = books.filter(isFinished).length;

  if (!showFinished) {
    books = books.filter(b => !isFinished(b));
  }

  if (searchQuery) {
    books = books.filter(b => {
      const t = `${b.title || ""} ${b.author || ""}`.toLowerCase();
      return t.includes(searchQuery);
    });
  }

  el.booksMeta.textContent = books.length
    ? `${books.length} Buch${books.length === 1 ? "" : "er"}`
    : "—";

  el.emptyState.hidden = totalCount !== 0;
  el.bookList.innerHTML = "";

  if (totalCount > 0 && books.length === 0) {
    el.bookList.innerHTML = `<div class="muted" style="padding:6px 4px;">Keine Treffer.</div>`;
    return;
  }

  for (const book of books) {
    const cur = latestPage(book);
    const pct = Math.min(100, Math.round((cur / book.totalPages) * 100));

    const card = document.createElement("div");
    card.className = "book";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Buch öffnen: ${book.title}`);

    card.innerHTML = `
      <div class="book__left">
        <div class="book__title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</div>
        <div class="book__author" title="${escapeHtml(book.author || "—")}">${escapeHtml(book.author || "—")}</div>
      </div>
      <div class="book__right">
        <div class="progress"><div class="progress__bar" style="width:${pct}%"></div></div>
        <div class="progress__meta">
          <span>${cur} / ${book.totalPages}</span>
          <span>${pct}%</span>
        </div>
      </div>
    `;

    card.addEventListener("click", () => openBook(book.id));
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        openBook(book.id);
      }
    });

    el.bookList.appendChild(card);
  }
}

function renderStatsAndKpis() {
  const daily = computeDailyPages(state.books);

  const today = todayKey();
  const todayPages = daily.get(today) ?? 0;

  const { currentStreak, longestStreak } = computeStreaks(daily);

  el.kpiTodayPages.textContent = String(todayPages);
  el.kpiCurrentStreak.textContent = String(currentStreak);
  el.kpiLongestStreak.textContent = String(longestStreak);

  el.kpiLongestHint.textContent =
    currentStreak > 0 && currentStreak === longestStreak
      ? "Du bist gerade am längsten Streak."
      : (longestStreak > 0 ? "Bestleistung bisher." : "Noch keine Serie.");

  el.streakMeta.textContent =
    todayPages > 0 ? "Heute: eingetragen." : "Heute: noch nichts eingetragen.";
}

function renderCharts() {
  const daily = computeDailyPages(state.books);
  const today = new Date();

  // last 12 days (inclusive)
  const days = [];
  for (let i = 11; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = dateKey(d);
    days.push({ key, label: formatDayLabel(d), val: daily.get(key) ?? 0 });
  }

  // last 12 weeks (inclusive): Monday-start
  const weekTotals = computeWeekTotals(daily);
  const weekLabels = [];
  const weekValues = [];
  for (let i = 11; i >= 0; i--) {
    const wkStart = startOfWeek(addDays(today, -7 * i)); // Monday
    const wkKey = dateKey(wkStart); // use start date as key
    weekLabels.push(formatWeekLabel(wkStart));
    weekValues.push(weekTotals.get(wkKey) ?? 0);
  }

  // last 12 months (inclusive)
  const monthTotals = computeMonthTotals(daily);
  const monthLabels = [];
  const monthValues = [];
  for (let i = 11; i >= 0; i--) {
    const m = addMonths(today, -i);
    const mk = monthKey(m);
    monthLabels.push(formatMonthLabel(m));
    monthValues.push(monthTotals.get(mk) ?? 0);
  }

  // captions and sums
  el.subDays.textContent = `${formatDateShort(days[0].key)} – ${formatDateShort(days[days.length - 1].key)}`;
  el.subWeeks.textContent = `Wochenstart (Mo) – letzte 12`;
  el.subMonths.textContent = `Kalendermonate – letzte 12`;

  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  el.sumDays.textContent = `${sum(days.map(x => x.val))} Seiten`;
  el.sumWeeks.textContent = `${sum(weekValues)} Seiten`;
  el.sumMonths.textContent = `${sum(monthValues)} Seiten`;

  renderLineChart(el.chartDays, days.map(d => d.label), days.map(d => d.val));
  renderLineChart(el.chartWeeks, weekLabels, weekValues);
  renderLineChart(el.chartMonths, monthLabels, monthValues);
}

/* ------------------ computation ------------------ */

function computeDailyPages(books) {
  // Aggregates "pages read" per date by computing positive deltas between successive entries per book.
  const daily = new Map();

  for (const book of books) {
    const hist = [...book.history].sort((a, b) => a.date.localeCompare(b.date));
    let prev = 0;
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

function computeStreaks(dailyMap) {
  // current streak ends today and counts days with pages>0
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

  // longest streak across all history
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

function computeWeekTotals(dailyMap) {
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

function computeMonthTotals(dailyMap) {
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

/* ------------------ book helpers ------------------ */

function isFinished(book) {
  const cur = latestPage(book);
  return book.totalPages > 0 && cur >= book.totalPages;
}

function lastEntryDateKey(book) {
  if (!book.history?.length) return "0000-00-00";
  return [...book.history].map(h => h.date).sort().at(-1) || "0000-00-00";
}

function getActiveBook() {
  return state.books.find(b => b.id === activeBookId) || null;
}

function latestPage(book) {
  if (!book.history?.length) return 0;
  return Math.max(...book.history.map(h => clampInt(h.page, 0, book.totalPages)));
}

function latestPageBefore(book, dateKeyStr) {
  const hist = [...book.history].filter(h => h.date < dateKeyStr).sort((a, b) => b.date.localeCompare(a.date));
  return hist.length ? clampInt(hist[0].page, 0, book.totalPages) : 0;
}

function upsertHistory(book, date, page) {
  const i = book.history.findIndex(h => h.date === date);
  if (i >= 0) {
    book.history[i].page = page;
  } else {
    book.history.push({ date, page });
    book.history.sort((a, b) => a.date.localeCompare(b.date));
  }
}

/* ------------------ date helpers ------------------ */

function todayKey() {
  return dateKey(new Date());
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function monthKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseDate(yyyy_mm_dd) {
  // Local date (avoid timezone shifts)
  const [y, m, d] = yyyy_mm_dd.split("-").map(x => Number.parseInt(x, 10));
  return new Date(y, (m - 1), d);
}

function addDays(date, delta) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + delta);
  return d;
}

function addMonths(date, delta) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + delta);
  return d;
}

function startOfWeek(date) {
  // Monday as week start
  const d = new Date(date.getTime());
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diffToMon = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diffToMon);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bb - aa) / ms);
}

/* ------------------ formatting ------------------ */

function formatDateShort(yyyy_mm_dd) {
  const d = parseDate(yyyy_mm_dd);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
}

function formatDayLabel(d) {
  // show day of month
  return String(d.getDate());
}

function formatWeekLabel(weekStartDate) {
  const d = weekStartDate;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

function formatMonthLabel(d) {
  const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("toast--show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove("toast--show"), 1800);
}

/* ------------------ utils ------------------ */

function clampInt(v, min, max) {
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}


/* ------------------ demo data ------------------ */

function createDemoState() {
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
    const total = clampInt(Math.round(base + (rng() - 0.5) * 28), 40, 125);

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

function mkBookShell(title, author, totalPages) {
  return {
    id: crypto.randomUUID(),
    title,
    author,
    totalPages,
    createdAt: new Date().toISOString(),
    history: []
  };
}

function addProgress(book, date, delta) {
  if (!book) return;
  const cur = latestPage(book);
  if (cur >= book.totalPages) return;
  const next = Math.min(book.totalPages, cur + clampInt(delta, 0, 1000));
  // Always record a daily "read up to" entry
  book.history.push({ date, page: next });
}

function mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  const r = rng();
  return Math.floor(r * (max - min + 1)) + min;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
