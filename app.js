// app.js
// Entry point: state + DOM wiring + persistence hooks.

import { loadState, saveState, exportState, importState } from "./storage.js";
import {
  clampInt,
  createDemoState,
  earliestPageAfter,
  formatDateShort,
  latestPage,
  latestPageBefore,
  todayKey,
  upsertHistory,
} from "./app.logic.js";
import {
  renderAll,
  renderBooks,
  renderCharts,
  updateBooksControls,
} from "./app.render.js";

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
  inpDate: document.getElementById("inpDate"),
  inpPage: document.getElementById("inpPage"),
  historyList: document.getElementById("historyList"),
  btnDeleteBook: document.getElementById("btnDeleteBook"),
  btnCloseBookX: document.getElementById("btnCloseBookX"),

  bookList: document.getElementById("bookList"),
  emptyState: document.getElementById("emptyState"),
  booksMeta: document.getElementById("booksMeta"),

  bookSearch: document.getElementById("bookSearch"),
  btnToggleFinished: document.getElementById("btnToggleFinished"),

  // KPIs (Top)
  kpiCurrentStreak: document.getElementById("kpiCurrentStreak"),
  kpiLongestStreak: document.getElementById("kpiLongestStreak"),
  kpiLongestHint: document.getElementById("kpiLongestHint"),
  kpiWeekPages: document.getElementById("kpiWeekPages"),
  kpiWeekHint: document.getElementById("kpiWeekHint"),

  // KPIs (More)
  kpiTodayPages: document.getElementById("kpiTodayPages"),
  kpiMonthPages: document.getElementById("kpiMonthPages"),
  kpiYearPages: document.getElementById("kpiYearPages"),
  kpiAvgPerActiveDay: document.getElementById("kpiAvgPerActiveDay"),
  kpiAvgPerActiveMonth: document.getElementById("kpiAvgPerActiveMonth"),
  kpiAvgPerActiveYear: document.getElementById("kpiAvgPerActiveYear"),
  kpiTotalPages: document.getElementById("kpiTotalPages"),
  kpiActiveDays: document.getElementById("kpiActiveDays"),
  kpiBestWeek: document.getElementById("kpiBestWeek"),
  kpiBestMonth: document.getElementById("kpiBestMonth"),

  // Toggles
  toggleMoreStats: document.getElementById("toggleMoreStats"),
  moreStats: document.getElementById("moreStats"),
  toggleMoreCharts: document.getElementById("toggleMoreCharts"),
  moreCharts: document.getElementById("moreCharts"),

  streakMeta: document.getElementById("streakMeta"),

  // Charts
  chartDays: document.getElementById("chartDays"),
  chartWeeks: document.getElementById("chartWeeks"),
  chartMonths: document.getElementById("chartMonths"),
  chartDays30: document.getElementById("chartDays30"),
  chartWeekdays: document.getElementById("chartWeekdays"),

  subDays: document.getElementById("subDays"),
  subWeeks: document.getElementById("subWeeks"),
  subMonths: document.getElementById("subMonths"),
  subDays30: document.getElementById("subDays30"),
  subWeekdays: document.getElementById("subWeekdays"),

  sumDays: document.getElementById("sumDays"),
  sumWeeks: document.getElementById("sumWeeks"),
  sumMonths: document.getElementById("sumMonths"),
  sumDays30: document.getElementById("sumDays30"),
  sumWeekdays: document.getElementById("sumWeekdays"),

  toast: document.getElementById("toast"),

  btnExport: document.getElementById("btnExport"),
  btnImport: document.getElementById("btnImport"),
  fileImport: document.getElementById("fileImport"),
};

/* ------------------ bootstrap ------------------ */

wireEvents();
rerenderAll();

function rerenderAll() {
  renderAll(el, state, showFinished, searchQuery, openBook);
}

/* ------------------ events ------------------ */

function wireEvents() {
  el.btnAddBook.addEventListener("click", openAddBook);
  el.btnAddBookEmpty?.addEventListener("click", openAddBook);

  // Books controls
  el.bookSearch?.addEventListener("input", () => {
    searchQuery = String(el.bookSearch.value || "").trim().toLowerCase();
    renderBooks(el, state, showFinished, searchQuery, openBook);
  });

  el.btnToggleFinished?.addEventListener("click", () => {
    showFinished = !showFinished;
    renderBooks(el, state, showFinished, searchQuery, openBook);
    updateBooksControls(el, showFinished);
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
    const initialPage = clampInt(fd.get("initialPages"), 0, totalPages);

    if (!title) {
      toast("Titel fehlt.");
      return;
    }
    addBook({ title, author, totalPages, initialPage });
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
    const date = selectedLogDate();

    // Disallow future dates
    const today = todayKey();
    if (date > today) {
      setLogDate(today);
      toast("Datum darf nicht in der Zukunft liegen.");
      return;
    }

    const prev = latestPageBefore(book, date);
    const next = earliestPageAfter(book, date);
    if (newPage < prev) {
      el.inpPage.value = String(prev);
      toast("Seitenzahl kann nicht kleiner als der letzte Stand sein.");
      return;
    }

    if (next !== null && newPage > next) {
      el.inpPage.value = String(next);
      toast("Seitenzahl kann nicht größer als ein späterer Eintrag sein.");
      return;
    }

    upsertHistory(book, date, newPage);
    save();
    toast("Gespeichert.");
    rerenderAll();
    el.dlgBook.close();
  });

  // Update page input when date changes
  el.inpDate?.addEventListener("change", () => {
    syncPageInputForDate();
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
    rerenderAll();
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
      rerenderAll();
      toast("Import erfolgreich.");
    } catch {
      toast("Import fehlgeschlagen (ungültige JSON-Datei).");
    } finally {
      el.fileImport.value = "";
    }
  });

  // Overview toggles
  el.toggleMoreStats?.addEventListener("click", () => {
    toggleSection(el.toggleMoreStats, el.moreStats);
  });

  el.toggleMoreCharts?.addEventListener("click", () => {
    const wasHidden = el.moreCharts?.hidden ?? true;
    toggleSection(el.toggleMoreCharts, el.moreCharts);
    if (wasHidden) renderCharts(el, state);
  });

  // Re-render charts on resize
  window.addEventListener("resize", debounce(() => renderCharts(el, state), 120));
}

function openAddBook() {
  el.dlgAddBook.showModal();
  const first = el.formAddBook.querySelector("input[name='title']");
  first?.focus();
}

/* ------------------ actions ------------------ */

function addBook({ title, author, totalPages, initialPage }) {
  state.books.unshift({
    id: crypto.randomUUID(),
    title,
    author,
    totalPages,
    initialPage: clampInt(initialPage, 0, totalPages),
    createdAt: new Date().toISOString(),
    history: []
  });
  save();
  toast("Buch hinzugefügt.");
  rerenderAll();
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

  // Default logging date: today (can be changed to backfill)
  const today = todayKey();
  setLogDate(today);
  el.inpPage.max = String(book.totalPages);
  if (el.inpDate) el.inpDate.max = today;
  syncPageInputForDate();

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

function getActiveBook() {
  return state.books.find(b => b.id === activeBookId) || null;
}

/* ------------------ ui helpers ------------------ */

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("toast--show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove("toast--show"), 1800);
}

function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function toggleSection(buttonEl, sectionEl, labels = { more: "Mehr", less: "Weniger" }) {
  if (!buttonEl || !sectionEl) return;
  const willOpen = sectionEl.hidden === true;
  sectionEl.hidden = !willOpen;
  const expanded = willOpen;
  buttonEl.setAttribute("aria-expanded", expanded ? "true" : "false");
  buttonEl.textContent = expanded ? labels.less : labels.more;
}

function selectedLogDate() {
  const v = String(el.inpDate?.value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayKey();
}

function setLogDate(dateKeyStr) {
  if (!el.inpDate) return;
  el.inpDate.value = dateKeyStr;
}

function syncPageInputForDate() {
  const book = getActiveBook();
  if (!book) return;

  const date = selectedLogDate();
  const entry = book.history.find(h => h.date === date);

  // If there is an entry on that date, show it; otherwise prefill with last known value before that date.
  const base = (date === todayKey()) ? latestPage(book) : latestPageBefore(book, date);
  el.inpPage.value = String(entry?.page ?? base);
}
