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
const ENABLE_DEMO_DATA = true;
const DEMO_OVERWRITE_EXISTING = true;

if (ENABLE_DEMO_DATA && (DEMO_OVERWRITE_EXISTING || state.books.length === 0)) {
  state = createDemoState();
  saveState(state);
}
/* =================== Ende DEMO-DATEN =================== */

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
  btnCloseBook: document.getElementById("btnCloseBook"),

  bookList: document.getElementById("bookList"),
  emptyState: document.getElementById("emptyState"),
  booksMeta: document.getElementById("booksMeta"),

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

  el.btnCloseAddBook?.addEventListener("click", () => el.dlgAddBook.close());
  el.btnCancelAddBook?.addEventListener("click", () => el.dlgAddBook.close());

  el.btnCloseBookX?.addEventListener("click", () => el.dlgBook.close());
  el.btnCloseBook?.addEventListener("click", () => el.dlgBook.close());

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
    openBook(book.id); // refresh modal content
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
  renderBooks();
  renderStatsAndKpis();
  renderCharts();
}

function renderBooks() {
  const books = state.books;

  el.booksMeta.textContent = books.length
    ? `${books.length} Buch${books.length === 1 ? "" : "er"}`
    : "—";

  el.emptyState.hidden = books.length !== 0;
  el.bookList.innerHTML = "";

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
  return `${dd}.${mm}.`;
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
  const now = new Date();
  const fiveYearsAgo = addDays(now, -Math.round(365.25 * 5));

  const books = [
    // Finished long ago
    mkBook("Krieg und Frieden", "Leo Tolstoi", 1400, fiveYearsAgo, addDays(fiveYearsAgo, 210), 1400, 3, 25, 70, 101),
    // Finished ~3.8 years ago
    mkBook("Sapiens", "Yuval Noah Harari", 560, addDays(fiveYearsAgo, 330), addDays(fiveYearsAgo, 420), 560, 4, 20, 55, 202),
    // Ongoing, high volume, recent activity
    mkBook("Der Mann ohne Eigenschaften", "Robert Musil", 1800, addDays(fiveYearsAgo, 950), now, 920, 5, 15, 60, 303),
    // Finished within last year
    mkBook("Atomic Habits", "James Clear", 320, addDays(now, -420), addDays(now, -340), 320, 5, 10, 45, 404),
    // Started, paused months ago
    mkBook("Ulysses", "James Joyce", 900, addDays(now, -520), addDays(now, -220), 160, 3, 8, 35, 505),
    // Ongoing, very recent start
    mkBook("The Pragmatic Programmer", "Andrew Hunt & David Thomas", 352, addDays(now, -75), now, 210, 6, 8, 40, 606),
    // Not started
    { id: crypto.randomUUID(), title: "Gedichte", author: "Rainer Maria Rilke", totalPages: 200, createdAt: new Date().toISOString(), history: [] },
    // Finished recently, short
    mkBook("Die Verwandlung", "Franz Kafka", 90, addDays(now, -120), addDays(now, -105), 90, 6, 6, 18, 707),
  ];

  return { version: 1, books };
}

function mkBook(title, author, totalPages, startDate, endDate, targetEndPage, sessionsPerWeek, minPages, maxPages, seed) {
  const history = generateHistory({
    startDate,
    endDate,
    totalPages,
    targetEndPage,
    sessionsPerWeek,
    minPages,
    maxPages,
    seed
  });

  return {
    id: crypto.randomUUID(),
    title,
    author,
    totalPages,
    createdAt: new Date().toISOString(),
    history
  };
}

function generateHistory({ startDate, endDate, totalPages, targetEndPage, sessionsPerWeek, minPages, maxPages, seed }) {
  const rng = mulberry32(seed);
  const startKey = dateKey(startDate);
  const endKey = dateKey(endDate);

  // Convert to dates at midnight
  let cursor = parseDate(startKey);
  const end = parseDate(endKey);

  let page = 0;
  const history = [];

  // reading probability per day
  // sessionsPerWeek ~ 0..7 -> convert to probability
  const p = Math.min(0.95, Math.max(0.05, sessionsPerWeek / 7));

  // occasional breaks: create "quiet weeks" every few months
  let quietUntil = null;

  while (cursor <= end && page < Math.min(totalPages, targetEndPage)) {
    const key = dateKey(cursor);

    // quiet streak logic
    if (!quietUntil && rng() < 0.003) {
      // pause 7-21 days
      quietUntil = addDays(cursor, randInt(rng, 7, 21));
    }
    if (quietUntil && cursor <= quietUntil) {
      cursor = addDays(cursor, 1);
      continue;
    }
    if (quietUntil && cursor > quietUntil) quietUntil = null;

    // read today?
    const readToday = rng() < p;

    if (readToday) {
      const delta = randInt(rng, minPages, maxPages);
      page = Math.min(Math.min(totalPages, targetEndPage), page + delta);
      history.push({ date: key, page });
    } else {
      // sometimes still create an "entry" without progress? no; we keep history sparse.
    }

    cursor = addDays(cursor, 1);
  }

  // Guarantee at least one entry close to today for ongoing books
  // (only if the book is not finished and endDate is ~now)
  const isOngoing = targetEndPage < totalPages && daysBetween(parseDate(dateKey(endDate)), parseDate(dateKey(new Date()))) <= 2;
  if (isOngoing) {
    // ensure at least 4 reading days in last 12 days
    const today = new Date();
    let ensured = 0;
    for (let i = 0; i < 12; i++) {
      const d = addDays(today, -i);
      const k = dateKey(d);
      const already = history.find(h => h.date === k);
      if (already) continue;
      if (ensured >= 4) break;
      if (rng() < 0.6) {
        const delta = randInt(rng, Math.max(4, Math.floor(minPages / 2)), Math.max(10, Math.floor(maxPages / 2)));
        page = Math.min(Math.min(totalPages, targetEndPage), page + delta);
        history.push({ date: k, page });
        ensured += 1;
      }
    }
    history.sort((a, b) => a.date.localeCompare(b.date));
  }

  return history.sort((a, b) => a.date.localeCompare(b.date));
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
