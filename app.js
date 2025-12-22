// app.js
// Entry point: auth-gated UI + state + Firestore persistence.

import {
  defaultState,
  exportState,
  importState,
  loadState,
  upsertBook,
  deleteBook,
  replaceAllBooks,
} from "./storage.js";

import {
  getServices,
  getEnv,
  toggleEnv,
  watchAuth,
  loginWithEmailPassword,
  logout,
} from "./firebase.js";

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

let state = defaultState();

let showFinished = false;
let searchQuery = "";
let activeBookId = null;

/* ------------------ topbar menu ------------------ */

function setMenuOpen(open) {
  if (!el.menuPanel || !el.btnMenu) return;
  el.menuPanel.hidden = !open;
  el.btnMenu.setAttribute("aria-expanded", open ? "true" : "false");
}

function toggleMenu() {
  if (!el.menuPanel) return;
  setMenuOpen(el.menuPanel.hidden);
}

function closeMenu() {
  setMenuOpen(false);
}

/* ===================== DEMO-DATEN (optional) =====================
   Für Probe-Daten (mehrere Bücher + Leseverlauf):
   1) ENABLE_DEMO_DATA auf true setzen und Seite neu laden (in DEV).
   2) Danach wieder auf false setzen, damit es nicht jedes Mal überschreibt.
   Hinweis: Standardmäßig werden Demo-Daten nur geladen, wenn noch keine Bücher existieren.
   Wenn du vorhandene Daten bewusst überschreiben willst: DEMO_OVERWRITE_EXISTING = true.
================================================================== */
const ENABLE_DEMO_DATA = false;
const DEMO_OVERWRITE_EXISTING = false;
const DEMO_ONLY_IN_DEV = true;
/* =================== Ende DEMO-DATEN =================== */

/* ------------------ Firebase ctx ------------------ */

let ctx = null; // { env, app, auth, db, user }

/* ------------------ DOM ------------------ */

const el = {
  // auth UI
  authScreen: document.getElementById("authScreen"),
  formLogin: document.getElementById("formLogin"),
  btnLogin: document.getElementById("btnLogin"),
  authError: document.getElementById("authError"),
  authEnvMeta: document.getElementById("authEnvMeta"),
  btnSwitchEnvAuth: document.getElementById("btnSwitchEnvAuth"),

  // topbar
  signedInActions: document.getElementById("signedInActions"),
  btnMenu: document.getElementById("btnMenu"),
  menuPanel: document.getElementById("menuPanel"),
  btnSwitchEnv: document.getElementById("btnSwitchEnv"),
  envLabel: document.getElementById("envLabel"),
  chipUser: document.getElementById("chipUser"),
  btnLogout: document.getElementById("btnLogout"),

  // app shell
  appMain: document.getElementById("appMain"),

  // existing app elements
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
  kpiTodayPages: document.getElementById("kpiTodayPages"),
  kpiMonthPages: document.getElementById("kpiMonthPages"),

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

bootstrap();

/* ------------------ bootstrap helpers ------------------ */

function bootstrap() {
  try {
    ctx = { ...getServices(), user: null };
  } catch (e) {
    // Config missing => show error on login screen.
    showAuthOnly();
    setAuthError(String(e?.message || e));
    return;
  }

  updateEnvUi();

  wireAuthEvents();
  wireAppEvents();

  watchAuth(ctx.auth, async (user) => {
    if (user) {
      ctx.user = user;
      await onSignedIn(user);
    } else {
      ctx.user = null;
      onSignedOut();
    }
  });
}

function updateEnvUi() {
  const env = getEnv().toUpperCase();
  if (el.envLabel) {
    el.envLabel.hidden = false;
    el.envLabel.textContent = env;
  }
  if (el.btnSwitchEnv) el.btnSwitchEnv.textContent = env;
  if (el.authEnvMeta) el.authEnvMeta.textContent = `Umgebung: ${env}`;

  if (el.btnSwitchEnvAuth) {
    const next = getEnv() === "prod" ? "dev" : "prod";
    el.btnSwitchEnvAuth.textContent = `Zu ${next.toUpperCase()} wechseln`;
  }
}

function showAuthOnly() {
  closeMenu();
  if (el.authScreen) el.authScreen.hidden = false;
  if (el.appMain) el.appMain.hidden = true;
  if (el.signedInActions) el.signedInActions.hidden = true;
}

function showAppOnly() {
  if (el.authScreen) el.authScreen.hidden = true;
  if (el.appMain) el.appMain.hidden = false;
  if (el.signedInActions) el.signedInActions.hidden = false;
}

function setAuthError(msg) {
  if (!el.authError) return;
  el.authError.hidden = !msg;
  el.authError.textContent = msg || "";
}

async function onSignedIn(user) {
  setAuthError("");
  showAppOnly();

  if (el.chipUser) {
    el.chipUser.hidden = false;
    el.chipUser.textContent = user.email || "angemeldet";
  }
  if (el.btnLogout) el.btnLogout.hidden = false;

  // Load state from Firestore
  try {
    state = await loadState(ctx.db, user.uid);

    // Optional: Seed demo data only in DEV
    const isDev = getEnv() === "dev";
    const allowDemo = ENABLE_DEMO_DATA && (!DEMO_ONLY_IN_DEV || isDev);
    if (allowDemo && (DEMO_OVERWRITE_EXISTING || state.books.length === 0)) {
      state = createDemoState();
      await replaceAllBooks(ctx.db, user.uid, state.books);
    }

    // Reset UI filters
    showFinished = false;
    searchQuery = "";
    if (el.bookSearch) el.bookSearch.value = "";

    rerenderAll();
  } catch (e) {
    toast("Konnte Daten nicht laden.");
    console.error(e);
  }
}

function onSignedOut() {
  state = defaultState();
  activeBookId = null;
  showFinished = false;
  searchQuery = "";

  showAuthOnly();

  if (el.chipUser) el.chipUser.hidden = true;
  if (el.btnLogout) el.btnLogout.hidden = true;

  // Keep env UI visible on login screen
  updateEnvUi();
}

/* ------------------ events: auth ------------------ */

function wireAuthEvents() {
  el.formLogin?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    setAuthError("");

    const fd = new FormData(el.formLogin);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");

    if (!email || !password) {
      setAuthError("Email und Passwort erforderlich.");
      return;
    }

    try {
      await loginWithEmailPassword(ctx.auth, email, password);
      // onAuthStateChanged will take over
    } catch (e) {
      const msg = friendlyAuthError(e);
      setAuthError(msg);
    }
  });

  el.btnLogout?.addEventListener("click", async () => {
    try {
      await logout(ctx.auth);
    } catch {
      toast("Logout fehlgeschlagen.");
    }
  });

  const onEnvToggle = () => {
    if (ctx?.user) {
      const ok = confirm("Umgebung wechseln? Du wirst neu laden (DEV/PROD) und ggf. neu einloggen müssen.");
      if (!ok) return;
    }
    toggleEnv();
  };

  el.btnSwitchEnv?.addEventListener("click", onEnvToggle);
  el.btnSwitchEnvAuth?.addEventListener("click", onEnvToggle);
}

/* ------------------ events: app ------------------ */

function wireAppEvents() {
  // Burger menu
  el.btnMenu?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    toggleMenu();
  });

  // Close menu when clicking outside
  document.addEventListener("click", (ev) => {
    if (!el.menuPanel || el.menuPanel.hidden) return;
    const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
    if (path.includes(el.menuPanel) || path.includes(el.btnMenu)) return;
    closeMenu();
  });

  // Close menu on Escape
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeMenu();
  });

  // Close menu after an action inside it
  const closeAfter = () => closeMenu();
  el.btnSwitchEnv?.addEventListener("click", closeAfter);
  el.btnLogout?.addEventListener("click", closeAfter);
  el.btnExport?.addEventListener("click", closeAfter);
  el.btnImport?.addEventListener("click", closeAfter);

  el.btnAddBook?.addEventListener("click", openAddBook);
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

  el.formAddBook?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!requireAuth()) return;

    const fd = new FormData(el.formAddBook);
    const title = String(fd.get("title") || "").trim();
    const author = String(fd.get("author") || "").trim();
    const totalPages = clampInt(fd.get("totalPages"), 1, 100000);
    const initialPage = clampInt(fd.get("initialPages"), 0, totalPages);

    if (!title) {
      toast("Titel fehlt.");
      return;
    }

    await addBook({ title, author, totalPages, initialPage });
    el.formAddBook.reset();
    el.dlgAddBook.close();
  });

  // Save page
  el.formBook?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!requireAuth()) return;

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

    try {
      await upsertBook(ctx.db, ctx.user.uid, book);
      toast("Gespeichert.");
      rerenderAll();
      el.dlgBook.close();
    } catch (e) {
      console.error(e);
      toast("Speichern fehlgeschlagen.");
    }
  });

  // Update page input when date changes
  el.inpDate?.addEventListener("change", () => {
    syncPageInputForDate();
  });

  // Delete book
  el.btnDeleteBook?.addEventListener("click", async (ev) => {
    ev.preventDefault();
    if (!requireAuth()) return;

    const book = getActiveBook();
    if (!book) return;

    const ok = confirm(`Buch löschen: "${book.title}"?\nAlle Einträge gehen verloren.`);
    if (!ok) return;

    state.books = state.books.filter(b => b.id !== book.id);
    try {
      await deleteBook(ctx.db, ctx.user.uid, book.id);
      el.dlgBook.close();
      toast("Buch gelöscht.");
      rerenderAll();
    } catch (e) {
      console.error(e);
      toast("Löschen fehlgeschlagen.");
      // Restore in-memory if delete failed
      state.books.unshift(book);
      rerenderAll();
    }
  });

  // Export / Import
  el.btnExport?.addEventListener("click", () => {
    const json = exportState(state);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const env = getEnv();
    a.download = `momentum-${env}-export-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Export erstellt.");
  });

  el.btnImport?.addEventListener("click", () => el.fileImport.click());
  el.fileImport?.addEventListener("change", async () => {
    if (!requireAuth()) return;

    const file = el.fileImport.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = importState(text);
      state = imported;

      await replaceAllBooks(ctx.db, ctx.user.uid, state.books);

      rerenderAll();
      toast("Import erfolgreich.");
    } catch (e) {
      console.error(e);
      toast("Import fehlgeschlagen (ungültige JSON-Datei oder Schreibfehler).");
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

/* ------------------ render ------------------ */

function rerenderAll() {
  if (!ctx?.user) return;
  renderAll(el, state, showFinished, searchQuery, openBook);
}

/* ------------------ actions ------------------ */

async function addBook({ title, author, totalPages, initialPage }) {
  const book = {
    id: crypto.randomUUID(),
    title,
    author,
    totalPages,
    initialPage: clampInt(initialPage, 0, totalPages),
    createdAt: new Date().toISOString(),
    history: []
  };

  state.books.unshift(book);

  try {
    await upsertBook(ctx.db, ctx.user.uid, book);
    toast("Buch hinzugefügt.");
    rerenderAll();
  } catch (e) {
    console.error(e);
    toast("Speichern fehlgeschlagen.");
    state.books = state.books.filter(b => b.id !== book.id);
    rerenderAll();
  }
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

function openAddBook() {
  if (!requireAuth()) {
    toast("Bitte einloggen.");
    return;
  }
  el.dlgAddBook.showModal();
  const first = el.formAddBook.querySelector("input[name='title']");
  first?.focus();
}

function getActiveBook() {
  return state.books.find(b => b.id === activeBookId) || null;
}

function requireAuth() {
  return !!ctx?.user;
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

function friendlyAuthError(e) {
  const code = String(e?.code || "");
  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) return "Falsche Email oder Passwort.";
  if (code.includes("auth/user-not-found")) return "User existiert nicht (in Firebase Console anlegen).";
  if (code.includes("auth/invalid-email")) return "Ungültige Email-Adresse.";
  if (code.includes("auth/too-many-requests")) return "Zu viele Versuche. Bitte später erneut probieren.";
  return String(e?.message || "Login fehlgeschlagen.");
}
