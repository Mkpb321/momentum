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
  setEnv,
  toggleEnv,
  checkIsAdmin,
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

let isAdmin = false; // resolved after login via Firestore (/admins/{uid})

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
  envPill: document.getElementById("envPill"),
  envLabel: document.getElementById("envLabel"),
  chipUser: document.getElementById("chipUser"),
  userAvatar: document.getElementById("userAvatar"),
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
  kpiCurrentStreakHint: document.getElementById("kpiCurrentStreakHint"),
  kpiAvgPerActiveDayTop: document.getElementById("kpiAvgPerActiveDayTop"),
  kpiWeekPages: document.getElementById("kpiWeekPages"),
  kpiWeekHint: document.getElementById("kpiWeekHint"),
  kpiTodayPages: document.getElementById("kpiTodayPages"),
  kpiMonthPages: document.getElementById("kpiMonthPages"),

  // KPIs (Mehr)
  kpiYearPages: document.getElementById("kpiYearPages"),
  kpiYesterdayPages: document.getElementById("kpiYesterdayPages"),
  kpiLast7DaysPages: document.getElementById("kpiLast7DaysPages"),
  kpiLast30DaysPages: document.getElementById("kpiLast30DaysPages"),

  kpiAvgPerActiveDay: document.getElementById("kpiAvgPerActiveDay"),
  kpiAvgPerActiveMonth: document.getElementById("kpiAvgPerActiveMonth"),
  kpiAvgPerActiveYear: document.getElementById("kpiAvgPerActiveYear"),
  kpiAvgLast7Days: document.getElementById("kpiAvgLast7Days"),
  kpiAvgLast30Days: document.getElementById("kpiAvgLast30Days"),

  kpiTotalPages: document.getElementById("kpiTotalPages"),
  kpiActiveDays: document.getElementById("kpiActiveDays"),
  kpiActiveWeeks: document.getElementById("kpiActiveWeeks"),
  kpiActiveMonths: document.getElementById("kpiActiveMonths"),

  kpiBestDay: document.getElementById("kpiBestDay"),
  kpiBestDayDate: document.getElementById("kpiBestDayDate"),
  kpiBestWeek: document.getElementById("kpiBestWeek"),
  kpiBestMonth: document.getElementById("kpiBestMonth"),
  kpiLastActiveDate: document.getElementById("kpiLastActiveDate"),
  kpiLastActivePages: document.getElementById("kpiLastActivePages"),

  kpiBooksTotal: document.getElementById("kpiBooksTotal"),
  kpiBooksFinished: document.getElementById("kpiBooksFinished"),
  kpiBooksInProgress: document.getElementById("kpiBooksInProgress"),
  kpiBooksNotStarted: document.getElementById("kpiBooksNotStarted"),
  kpiLibraryTotalPages: document.getElementById("kpiLibraryTotalPages"),
  kpiLibraryCurrentPages: document.getElementById("kpiLibraryCurrentPages"),
  kpiLibraryRemainingPages: document.getElementById("kpiLibraryRemainingPages"),
  kpiLibraryProgressPct: document.getElementById("kpiLibraryProgressPct"),

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
  chartWeekparts: document.getElementById("chartWeekparts"),
  chartCumulMonths: document.getElementById("chartCumulMonths"),
  chartYears5: document.getElementById("chartYears5"),
  chartAvg7: document.getElementById("chartAvg7"),
  chartActiveDaysWk: document.getElementById("chartActiveDaysWk"),
  chartIntensityWk: document.getElementById("chartIntensityWk"),
  chartHeatmap36: document.getElementById("chartHeatmap36"),


  // Chart info dialog
  infoDialog: document.getElementById("infoDialog"),
  infoTitle: document.getElementById("infoTitle"),
  infoSub: document.getElementById("infoSub"),
  infoBody: document.getElementById("infoBody"),
  infoPreview: document.getElementById("infoPreview"),
  btnCloseInfo: document.getElementById("btnCloseInfo"),
  btnInfoOk: document.getElementById("btnInfoOk"),

  subDays: document.getElementById("subDays"),
  subWeeks: document.getElementById("subWeeks"),
  subMonths: document.getElementById("subMonths"),
  subDays30: document.getElementById("subDays30"),
  subWeekdays: document.getElementById("subWeekdays"),
  subWeekparts: document.getElementById("subWeekparts"),
  subCumulMonths: document.getElementById("subCumulMonths"),
  subYears5: document.getElementById("subYears5"),
  subAvg7: document.getElementById("subAvg7"),
  subActiveDaysWk: document.getElementById("subActiveDaysWk"),
  subIntensityWk: document.getElementById("subIntensityWk"),
  subHeatmap36: document.getElementById("subHeatmap36"),
  subHeatmap36: document.getElementById("subHeatmap36"),

  sumDays: document.getElementById("sumDays"),
  sumWeeks: document.getElementById("sumWeeks"),
  sumMonths: document.getElementById("sumMonths"),
  sumDays30: document.getElementById("sumDays30"),
  sumWeekdays: document.getElementById("sumWeekdays"),
  sumWeekparts: document.getElementById("sumWeekparts"),
  sumCumulMonths: document.getElementById("sumCumulMonths"),
  sumYears5: document.getElementById("sumYears5"),
  sumAvg7: document.getElementById("sumAvg7"),
  sumActiveDaysWk: document.getElementById("sumActiveDaysWk"),
  sumIntensityWk: document.getElementById("sumIntensityWk"),
  sumHeatmap36: document.getElementById("sumHeatmap36"),
  sumHeatmap36: document.getElementById("sumHeatmap36"),
  sumHeatmap36: document.getElementById("sumHeatmap36"),

  toast: document.getElementById("toast"),

  // Heatmap inline info (above heatmap)
  heatmapInfoPanel: document.getElementById("heatmapInfoPanel"),
  heatmapInfoClose: document.getElementById("heatmapInfoClose"),
  heatmapInfoText: document.getElementById("heatmapInfoText"),

  btnExport: document.getElementById("btnExport"),
  btnImport: document.getElementById("btnImport"),
  fileImport: document.getElementById("fileImport"),
};

/* ------------------ modal scroll lock ------------------ */

// Prevent the page behind dialogs from scrolling (avoids double scrollbars
// when a dialog content itself is scrollable).
let _modalOpenCount = 0;
let _prevBodyOverflow = "";
let _prevBodyPaddingRight = "";

function lockBodyScroll() {
  if (_modalOpenCount === 0) {
    _prevBodyOverflow = document.body.style.overflow || "";
    _prevBodyPaddingRight = document.body.style.paddingRight || "";
    // Compensate for the disappearing scrollbar to avoid layout shift.
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
  }
  _modalOpenCount += 1;
}

function unlockBodyScroll() {
  _modalOpenCount = Math.max(0, _modalOpenCount - 1);
  if (_modalOpenCount === 0) {
    document.body.style.overflow = _prevBodyOverflow;
    document.body.style.paddingRight = _prevBodyPaddingRight;
  }
}

function openDialog(dlg) {
  if (!dlg || dlg.open) return;
  lockBodyScroll();
  try {
    dlg.showModal();
  } catch {
    // Fallback (older browsers): emulate open state.
    dlg.open = true;
  }
}

function closeDialog(dlg) {
  if (!dlg || !dlg.open) return;
  const canClose = typeof dlg.close === "function";
  if (canClose) dlg.close();
  else {
    dlg.open = false;
    // No close event in fallback path; unlock immediately.
    unlockBodyScroll();
  }
}

/* ------------------ info (charts + numbers) ------------------ */
/**
 * For every metric (chart or number): what it is, how it is calculated, and why it matters.
 * Keys correspond to data-info-key attributes in index.html (charts + numbers).
 */
const INFO = {
  days12: {
    title: "Letzte 12 Tage",
    subtitle: "Tageswerte inkl. 0-Tage",
    what: "Zeigt, wie viele Seiten du an jedem der letzten 12 Kalendertage erfasst hast.",
    how: "Pro Datum wird die eingetragene Seitenzahl summiert (wenn kein Eintrag vorhanden ist, zählt 0).",
    why: "Du erkennst sofort Momentum, Pausen und ob dein aktueller Rhythmus zur Gewohnheit wird.",
  },
  weeks12: {
    title: "Letzte 12 Wochen",
    subtitle: "Wochenstart Montag",
    what: "Summiert deine Seiten pro Kalenderwoche (jeweils Montag bis Sonntag) für die letzten 12 Wochen.",
    how: "Alle Tageswerte werden pro ISO-ähnlicher Woche mit Wochenstart am Montag aggregiert (Tage ohne Eintrag zählen 0).",
    why: "Ideal, um Schwankungen zu glätten und zu sehen, ob du über Wochen hinweg konstant bleibst.",
  },
  months12: {
    title: "Letzte 12 Monate",
    subtitle: "Kalendermonate",
    what: "Summiert deine Seiten pro Kalendermonat für die letzten 12 Monate.",
    how: "Alle Tageswerte werden nach Jahr/Monat gruppiert und pro Monat addiert (Tage ohne Eintrag zählen 0).",
    why: "Guter Blick auf langfristige Entwicklung, Saisonalität und ‚starke‘ Monate.",
  },
  cumulMonths: {
    title: "Gesamt (kumuliert)",
    subtitle: "Kumuliert über die letzten 24 Monate",
    what: "Zeigt deinen kumulierten Seitenfortschritt als ansteigende Kurve über die letzten 24 Monate.",
    how: "Wir nehmen die Monatssummen der letzten 24 Monate und addieren sie auf eine Vor-Summe (alles, was davor gelesen wurde). So entspricht der letzte Punkt dem Gesamtstand.",
    why: "Sehr motivierend, weil Fortschritt als Wachstum sichtbar wird – auch wenn einzelne Monate schwächer sind.",
  },
  years5: {
    title: "Letzte 5 Jahre",
    subtitle: "Kalenderjahre",
    what: "Summiert deine Seiten pro Jahr für die letzten 5 Kalenderjahre.",
    how: "Alle Tageswerte werden nach Jahr gruppiert und pro Jahr addiert.",
    why: "Perfekt, um ‚große‘ Zeiträume zu vergleichen und deinen langfristigen Trend zu sehen.",
  },
  days30: {
    title: "Letzte 30 Tage",
    subtitle: "Tageswerte inkl. 0-Tage",
    what: "Zeigt deine täglichen Seiten über die letzten 30 Kalendertage.",
    how: "Pro Datum wird die eingetragene Seitenzahl verwendet; fehlt ein Eintrag, zählt 0.",
    why: "Hilft beim Fein-Tuning: du siehst, ob du gerade in einer guten Phase bist und welche Tage typischerweise ausfallen.",
  },
  trend7: {
    title: "Trend (Ø 7 Tage)",
    subtitle: "Gleitender 7‑Tage‑Durchschnitt (60 Tage)",
    what: "Glättet deine Tageswerte mit einem 7‑Tage‑Durchschnitt, um den Trend klarer zu zeigen.",
    how: "Für jeden Tag wird der Durchschnitt aus den letzten bis zu 7 Tagen berechnet (am Anfang der Periode mit kürzerem Fenster). Basis sind die letzten 60 Tage inkl. 0‑Tage.",
    why: "Du siehst ‚echtes‘ Momentum ohne Ausreißer – ideal, um Fortschritt realistisch einzuschätzen.",
  },
  activeDaysWk: {
    title: "Aktive Tage pro Woche",
    subtitle: "Letzte 12 Wochen",
    what: "Zeigt, an wie vielen Tagen pro Woche du mindestens 1 Seite erfasst hast.",
    how: "Pro Woche (Mo–So) zählen wir die Anzahl Tage mit Seiten > 0.",
    why: "Konstanz ist der Hebel für Gewohnheiten. Diese Grafik zeigt, ob du ‚dran bleibst‘ – unabhängig von der Seitenmenge.",
  },
  intensityWk: {
    title: "Ø Seiten pro aktivem Tag",
    subtitle: "Letzte 12 Wochen",
    what: "Zeigt pro Woche die durchschnittlichen Seiten pro aktivem Tag (Tage mit Seiten > 0).",
    how: "Pro Woche berechnen wir: (Seiten in der Woche) / (aktive Tage in der Woche). Wenn es keine aktiven Tage gibt, ist der Wert 0.",
    why: "Ergänzt die Konstanz: du erkennst, ob du bei wenigen Tagen sehr intensiv liest oder eher konstant kleinere Einheiten machst.",
  },
  weekdays: {
    title: "Wochentage",
    subtitle: "Ø Seiten pro Wochentag (nur aktive Tage)",
    what: "Vergleicht deine durchschnittliche Seitenzahl je Wochentag, nur an Tagen, an denen du gelesen hast.",
    how: "Für jeden Wochentag (Mo–So) summieren wir Seiten an aktiven Tagen (Seiten > 0) und teilen durch die Anzahl aktiver Tage dieses Wochentags.",
    why: "Du erkennst Muster (z.B. ‚Sonntag ist stark‘) und kannst bewusst Routinen auf deine besten Tage legen.",
  },

  weekparts: {
    title: "Werktage vs Wochenende",
    subtitle: "Ø Seiten pro Tag (nur aktive Tage)",
    what: "Vergleicht dein durchschnittliches Lesepensum an Werktagen (Mo–Fr) mit dem am Wochenende (Sa/So).",
    how: "Für jeden Tag mit >0 Seiten wird der Tageswert nach Werktag oder Wochenende gruppiert. Anschließend wird der Durchschnitt pro Gruppe berechnet (Summe ÷ Anzahl aktiver Tage).",
    why: "Du erkennst auf einen Blick, ob dein Lesen eher im Alltag oder am Wochenende stattfindet – hilfreich, um bewusst Zeitfenster zu stärken.",
  },

  heatmap36: {
    title: "Heatmap (36 Monate)",
    subtitle: "Monat (Zeile) × Tag (Spalte)",
    what: "Zeigt für die letzten 36 Monate jeden Kalendertag als Feld: je mehr Seiten, desto dunkler.",
    how: "Für jeden Tag wird die Tages-Summe über alle Bücher berechnet. Das dunkelste Feld entspricht dem höchsten Tageswert innerhalb der gesamten Heatmap (über alle 36 Monate). Nicht existierende Tage (z.B. 31. im April) werden als 0 dargestellt.",
    why: "Du siehst sofort Muster, Routinen und ‚Peak-Tage‘. Gerade über 36 Monate erkennt man Gewohnheiten, Saisonalität und wie konstant du wirklich bist.",
  },

  /* ------------------ numbers (KPIs) ------------------ */
  kpiCurrentStreak: {
    title: "Aktueller Streak",
    subtitle: "Tage in Folge bis heute",
    what: "Zählt, wie viele Kalendertage in Folge du bis heute mindestens 1 Seite erfasst hast.",
    how: "Wir prüfen ab heute rückwärts Tag für Tag: solange die Tages-Summe > 0 ist, läuft die Serie weiter. Der erste 0‑Tag beendet den Streak.",
    why: "Streaks sind ein Konstanz‑Signal. Du siehst sofort, ob du gerade ‚drin‘ bist – und was es zu schützen gilt.",
  },
  kpiAvgPerActiveDayTop: {
    title: "Ø pro aktivem Tag",
    subtitle: "nur aktive Tage",
    what: "Zeigt deine durchschnittlichen Seiten pro Tag – aber nur für Tage, an denen du wirklich gelesen hast.",
    how: "Gesamtseiten (über alle Zeit) geteilt durch Anzahl aktiver Tage (Tage mit Tages‑Summe > 0).",
    why: "Gibt ein realistisches Bild deiner ‚typischen‘ Lese-Intensität, ohne dass Pausentage den Schnitt verwässern.",
  },
  kpiWeekPages: {
    title: "Seiten diese Woche",
    subtitle: "Mo–So (Kalenderwoche)",
    what: "Summiert deine Seiten in der aktuellen Woche.",
    how: "Alle Tageswerte werden pro Woche (Wochenstart Montag) aggregiert. Angezeigt wird die Summe für die Woche, in der heute liegt.",
    why: "Sehr motivierend als Wochenziel: du siehst schnell, ob du ‚on track‘ bist – und ob am Wochenende noch ein Push möglich ist.",
  },

  kpiTodayPages: {
    title: "Seiten heute",
    subtitle: "Heute",
    what: "Zeigt, wie viele Seiten du heute erfasst hast.",
    how: "Aus den Einträgen aller Bücher wird pro Datum die gelesene Seitenzahl berechnet (positive Seiten‑Deltas). Für heute wird die Tages‑Summe angezeigt.",
    why: "Das ist dein Tages‑Check‑in: klein anfangen reicht – ein Eintrag hält die Gewohnheit aktiv.",
  },
  kpiYesterdayPages: {
    title: "Seiten gestern",
    subtitle: "Gestern",
    what: "Zeigt, wie viele Seiten du gestern erfasst hast.",
    how: "Wie ‚Seiten heute‘, aber für das gestrige Datum (Kalendertag).",
    why: "Hilft beim Rückblick: du siehst, ob du gerade eine Serie aufbaust oder wo Pausen entstehen.",
  },
  kpiLast7DaysPages: {
    title: "Seiten letzte 7 Tage",
    subtitle: "rollierend, inkl. heute",
    what: "Summiert deine Seiten über die letzten 7 Kalendertage (inklusive heute).",
    how: "Wir addieren die Tageswerte der letzten 7 Tage; Tage ohne Eintrag zählen als 0.",
    why: "Guter ‚Kurzfrist‑KPI‘: stabiler als ein einzelner Tag und schnell genug, um Veränderungen zu merken.",
  },
  kpiLast30DaysPages: {
    title: "Seiten letzte 30 Tage",
    subtitle: "rollierend, inkl. heute",
    what: "Summiert deine Seiten über die letzten 30 Kalendertage (inklusive heute).",
    how: "Wir addieren die Tageswerte der letzten 30 Tage; Tage ohne Eintrag zählen als 0.",
    why: "Zeigt, ob dein Monats‑Rhythmus stimmt – und ob du über mehrere Wochen dranbleibst.",
  },
  kpiMonthPages: {
    title: "Seiten diesen Monat",
    subtitle: "Kalendermonat",
    what: "Summiert deine Seiten im aktuellen Kalendermonat.",
    how: "Alle Tageswerte werden nach Monat gruppiert und aufsummiert; angezeigt wird der aktuelle Monat.",
    why: "Perfekt als Monatsziel: du siehst deinen Fortschritt im laufenden Monat auf einen Blick.",
  },
  kpiYearPages: {
    title: "Seiten dieses Jahr",
    subtitle: "Kalenderjahr",
    what: "Summiert deine Seiten im aktuellen Kalenderjahr.",
    how: "Alle Tageswerte werden nach Jahr gruppiert und aufsummiert; angezeigt wird das aktuelle Jahr.",
    why: "Hilft beim Jahresziel: du siehst deinen langfristigen Pace und ob du im Plan bist.",
  },
  kpiTotalPages: {
    title: "Gesamtseiten",
    subtitle: "über alle Zeit",
    what: "Zeigt die Summe aller erfassten gelesenen Seiten seit Beginn deiner Einträge.",
    how: "Summe aller Tageswerte über alle Bücher und alle Daten (berechnet aus positiven Seiten‑Deltas pro Buch).",
    why: "Der ‚Lifetime‑Counter‘: maximal motivierend, weil er deinen gesamten Fortschritt sichtbar macht.",
  },

  kpiActiveDays: {
    title: "Aktive Tage",
    subtitle: "Tage mit > 0 Seiten",
    what: "Zählt, an wie vielen Kalendertagen du mindestens 1 Seite erfasst hast.",
    how: "Wir zählen alle Daten, deren Tages‑Summe > 0 ist.",
    why: "Konstanz schlägt Spitzen. Viele aktive Tage bedeuten eine starke, stabile Gewohnheit.",
  },
  kpiActiveWeeks: {
    title: "Aktive Wochen",
    subtitle: "Wochen mit > 0 Seiten",
    what: "Zählt, in wie vielen Wochen du mindestens 1 Seite erfasst hast.",
    how: "Wir aggregieren Tageswerte zu Wochen (Mo–So) und zählen Wochen mit Wochen‑Summe > 0.",
    why: "Zeigt, ob du über längere Zeiträume regelmäßig liest – unabhängig davon, wie stark einzelne Wochen waren.",
  },
  kpiActiveMonths: {
    title: "Aktive Monate",
    subtitle: "Monate mit > 0 Seiten",
    what: "Zählt, in wie vielen Monaten du mindestens 1 Seite erfasst hast.",
    how: "Wir aggregieren Tageswerte zu Monaten und zählen Monate mit Monats‑Summe > 0.",
    why: "Gute Langzeit‑Konstanz‑Metrik: zeigt, ob Lesen über Monate hinweg ‚Teil deines Lebens‘ ist.",
  },

  kpiAvgPerActiveDay: {
    title: "Ø pro aktivem Tag",
    subtitle: "nur aktive Tage",
    what: "Durchschnittliche Seiten pro aktivem Tag (nur Tage mit Eintrag).",
    how: "Gesamtseiten geteilt durch Anzahl aktiver Tage (Tages‑Summe > 0).",
    why: "Hilft dir, realistische Ziele abzuleiten (z.B. ‚wenn ich an 4 Tagen lese, komme ich auf ~X Seiten/Woche‘).",
  },
  kpiAvgPerActiveMonth: {
    title: "Ø pro aktivem Monat",
    subtitle: "nur aktive Monate",
    what: "Durchschnittliche Seiten pro aktivem Monat.",
    how: "Gesamtseiten geteilt durch Anzahl aktiver Monate (Monats‑Summe > 0).",
    why: "Gibt dir eine ‚Monats‑Pace‘, die nicht durch komplett leere Monate verzerrt wird.",
  },
  kpiAvgPerActiveYear: {
    title: "Ø pro aktivem Jahr",
    subtitle: "Jahre mit > 1 Seite",
    what: "Durchschnittliche Seiten pro aktivem Jahr.",
    how: "Wir zählen Jahre als ‚aktiv‘, wenn die Jahres‑Summe > 1 ist, und bilden dann: Summe der Seiten in aktiven Jahren geteilt durch Anzahl aktiver Jahre.",
    why: "Zeigt deine langfristige Jahres‑Pace (und ignoriert Jahre mit nur minimalen Test-/Einträge).",
  },

  kpiAvgLast7Days: {
    title: "Ø pro Tag (7 Tage)",
    subtitle: "inkl. 0‑Tage",
    what: "Durchschnittliche Seiten pro Tag über die letzten 7 Tage.",
    how: "Seiten der letzten 7 Tage geteilt durch 7 (Tage ohne Eintrag zählen als 0).",
    why: "Sehr gut als Tempo‑Indikator: du siehst schnell, ob du gerade beschleunigst oder nachlässt.",
  },
  kpiAvgLast30Days: {
    title: "Ø pro Tag (30 Tage)",
    subtitle: "inkl. 0‑Tage",
    what: "Durchschnittliche Seiten pro Tag über die letzten 30 Tage.",
    how: "Seiten der letzten 30 Tage geteilt durch 30 (Tage ohne Eintrag zählen als 0).",
    why: "Robuster als 7 Tage: zeigt dein ‚Basis‑Tempo‘ und glättet einzelne Ausreißer.",
  },

  kpiBestDay: {
    title: "Bester Tag",
    subtitle: "max. Seiten an einem Tag",
    what: "Der höchste Tageswert, den du je erreicht hast.",
    how: "Wir suchen das Maximum der Tageswerte. Bei Gleichstand wird der jüngere Tag angezeigt (Datum in der Zeile daneben).",
    why: "Ein Motivationsanker: du siehst, wozu du fähig bist – und kannst versuchen, neue Bestwerte zu setzen.",
  },
  kpiBestWeek: {
    title: "Beste Woche",
    subtitle: "max. Seiten in 1 Woche",
    what: "Die Woche (Mo–So) mit den meisten erfassten Seiten.",
    how: "Wir aggregieren alle Tageswerte zu Wochen und nehmen die maximale Wochen‑Summe.",
    why: "Wiederholbare Performance: Wochen sind realistische Einheiten für Ziele und Routinen.",
  },
  kpiBestMonth: {
    title: "Bester Monat",
    subtitle: "max. Seiten in 1 Monat",
    what: "Der Monat mit den meisten erfassten Seiten.",
    how: "Wir aggregieren alle Tageswerte zu Monaten und nehmen die maximale Monats‑Summe.",
    why: "Zeigt, was möglich ist, wenn du einen Monat richtig gut triffst – ideal als Benchmark für deine nächsten Monate.",
  },

  kpiLastActiveDate: {
    title: "Letzter aktiver Tag",
    subtitle: "letztes Datum mit Seiten > 0",
    what: "Das letzte Datum, an dem du mindestens 1 Seite erfasst hast.",
    how: "Wir suchen das jüngste Datum mit Tages‑Summe > 0. In der Zeile daneben steht die Seitenzahl dieses Tages.",
    why: "Ein schneller Reality‑Check: wie frisch ist deine Gewohnheit gerade?",
  },

  kpiBooksTotal: {
    title: "Bücher gesamt",
    subtitle: "Bibliothek",
    what: "Anzahl Bücher in deiner Bibliothek.",
    how: "Zählt alle Bücher im aktuellen Account.",
    why: "Gibt Kontext: Fortschritt macht mehr Sinn, wenn du auch die Größe deiner ‚Pipeline‘ kennst.",
  },
  kpiBooksFinished: {
    title: "Abgeschlossen",
    subtitle: "fertig gelesen",
    what: "Anzahl Bücher, die als abgeschlossen gelten.",
    how: "Ein Buch gilt als abgeschlossen, wenn totalPages > 0 und der aktuelle Stand (letzte Seite) ≥ totalPages ist.",
    why: "Abschlüsse sind starke Motivationspunkte – du siehst, wie oft du wirklich ‚durchgezogen‘ hast.",
  },
  kpiBooksInProgress: {
    title: "In Arbeit",
    subtitle: "mit Einträgen",
    what: "Anzahl Bücher, die begonnen wurden, aber noch nicht abgeschlossen sind.",
    how: "Zählt Bücher, die nicht abgeschlossen sind und mindestens einen Verlaufseintrag haben.",
    why: "Zeigt deinen aktuellen ‚Work‑in‑Progress‘ – gut, um Fokus zu halten statt zu viel parallel zu starten.",
  },
  kpiBooksNotStarted: {
    title: "Nicht gestartet",
    subtitle: "ohne Einträge",
    what: "Anzahl Bücher, die (noch) nicht begonnen wurden.",
    how: "Zählt Bücher, die nicht abgeschlossen sind und keinen Verlaufseintrag haben.",
    why: "Hilft beim Priorisieren: welche Bücher warten – und welche willst du als nächstes starten?",
  },

  kpiLibraryTotalPages: {
    title: "Seitenumfang gesamt",
    subtitle: "Summe totalPages",
    what: "Gesamter Seitenumfang deiner Bibliothek (Summe der totalPages‑Werte).",
    how: "Summe aller totalPages über alle Bücher (fehlende/0‑Werte zählen als 0).",
    why: "Gibt eine greifbare ‚Gesamtstrecke‘ – damit fühlt sich Fortschritt messbar an.",
  },
  kpiLibraryCurrentPages: {
    title: "Seiten aktueller Stand",
    subtitle: "Summe letzter Stand",
    what: "Summe deiner aktuellen Stände über alle Bücher.",
    how: "Für jedes Buch (mit totalPages > 0) nehmen wir den aktuellen Stand (min. letzter Stand, totalPages) und summieren.",
    why: "Das ist dein kumulierter Fortschritt über die gesamte Bibliothek – sehr motivierend.",
  },
  kpiLibraryRemainingPages: {
    title: "Seiten verbleibend",
    subtitle: "bis Ende",
    what: "Wie viele Seiten in deiner Bibliothek noch bis zum Ende offen sind.",
    how: "Für jedes Buch: max(0, totalPages − aktueller Stand). Dann Summe über alle Bücher.",
    why: "Hilft beim Planen: du siehst, wie groß die Reststrecke ist und kannst realistische Ziele setzen.",
  },
  kpiLibraryProgressPct: {
    title: "Gesamtfortschritt",
    subtitle: "in Prozent",
    what: "Prozentualer Fortschritt über die gesamte Bibliothek.",
    how: "Seiten aktueller Stand / Seitenumfang gesamt × 100 (falls Gesamtumfang 0 ist, dann 0%).",
    why: "Eine einzige, intuitive Zahl für den Gesamtfortschritt – perfekt, um Fortschritt schnell zu verstehen.",
  },

};

/* ------------------ previews for info dialog ------------------ */
const CHART_PREVIEW = {
  days12: { sourceId: "chartDays", summaryId: "sumDays" },
  weeks12: { sourceId: "chartWeeks", summaryId: "sumWeeks" },
  months12: { sourceId: "chartMonths", summaryId: "sumMonths" },
  cumulMonths: { sourceId: "chartCumulMonths", summaryId: "sumCumulMonths" },
  years5: { sourceId: "chartYears5", summaryId: "sumYears5" },
  days30: { sourceId: "chartDays30", summaryId: "sumDays30" },
  trend7: { sourceId: "chartAvg7" },
  activeDaysWk: { sourceId: "chartActiveDaysWk", summaryId: "sumActiveDaysWk" },
  intensityWk: { sourceId: "chartIntensityWk", summaryId: "sumIntensityWk" },
  weekdays: { sourceId: "chartWeekdays", summaryId: "sumWeekdays" },
  weekparts: { sourceId: "chartWeekparts", summaryId: "sumWeekparts" },
  heatmap36: { sourceId: "chartHeatmap36", summaryId: "sumHeatmap36" },
};

function cleanText(s) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t === "—" ? "" : t;
}

function parsePercent(text) {
  const m = String(text ?? "").match(/(-?\d+(?:[\.,]\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function nearbyMetaText(valueEl) {
  if (!valueEl) return "";
  const li = valueEl.closest?.(".moreitem");
  if (li) return cleanText(li.querySelector(".moreitem__meta")?.textContent);
  const kpi = valueEl.closest?.(".kpi");
  if (kpi) return cleanText(kpi.querySelector(".kpi__hint")?.textContent);
  return "";
}

function buildNumberPreview(key) {
  const valueEl = document.getElementById(key);
  const valueText = cleanText(valueEl?.textContent) || "—";
  const metaText = nearbyMetaText(valueEl);

  const card = document.createElement("div");
  card.className = "info__previewcard";

  const metric = document.createElement("div");
  metric.className = "info__metric";

  const row = document.createElement("div");
  row.className = "info__metricrow";

  const label = document.createElement("div");
  label.className = "info__metriclabel";
  label.textContent = "Aktuell";

  const value = document.createElement("div");
  value.className = "info__metricvalue";
  value.textContent = valueText;

  row.appendChild(label);
  row.appendChild(value);
  metric.appendChild(row);

  if (metaText) {
    const meta = document.createElement("div");
    meta.className = "info__metricmeta";
    meta.textContent = metaText;
    metric.appendChild(meta);
  }

  const pct = parsePercent(valueText);
  if (pct !== null) {
    const bar = document.createElement("div");
    bar.className = "progressbar";
    const fill = document.createElement("div");
    fill.className = "progressbar__fill";
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    metric.appendChild(bar);
  }

  card.appendChild(metric);
  return card;
}

function buildChartPreview(chartSpec) {
  const card = document.createElement("div");
  card.className = "info__previewcard";

  const src = document.getElementById(chartSpec.sourceId);
  const svg = src?.querySelector?.("svg");
  if (svg) {
    const clone = svg.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    card.appendChild(clone);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "info__metricmeta";
    fallback.textContent = "Grafik ist noch nicht gerendert.";
    card.appendChild(fallback);
  }

  if (chartSpec.summaryId) {
    const sumEl = document.getElementById(chartSpec.summaryId);
    const sumText = cleanText(sumEl?.textContent);
    if (sumText) {
      const meta = document.createElement("div");
      meta.className = "info__metricmeta";
      meta.textContent = `Summe: ${sumText}`;
      card.appendChild(meta);
    }
  }

  return card;
}

function buildPreviewNode(key, info) {
  // explicit preview config wins
  if (info?.preview?.kind === "chart" && info.preview.sourceId) {
    return buildChartPreview(info.preview);
  }
  if (info?.preview?.kind === "number") {
    return buildNumberPreview(info.preview.valueId || key);
  }

  // known chart keys
  if (CHART_PREVIEW[key]) return buildChartPreview(CHART_PREVIEW[key]);

  // fall back to number if element exists
  if (document.getElementById(key)) return buildNumberPreview(key);

  return null;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildInfoHtml(info) {
  return `
    <div class="info__section">
      <div class="info__h">Was ist das?</div>
      <div class="info__p">${escapeHtml(info.what)}</div>
    </div>
    <div class="info__section">
      <div class="info__h">Wie wird es gerechnet?</div>
      <div class="info__p">${escapeHtml(info.how)}</div>
    </div>
    <div class="info__section">
      <div class="info__h">Warum ist das interessant?</div>
      <div class="info__p">${escapeHtml(info.why)}</div>
    </div>
  `.trim();
}

function openInfo(key) {
  const info = INFO[key];
  if (!info || !el.infoDialog) return;

  if (el.infoTitle) el.infoTitle.textContent = info.title || "Info";
  if (el.infoSub) el.infoSub.textContent = info.subtitle || "";
  if (el.infoBody) el.infoBody.innerHTML = buildInfoHtml(info);

  // preview (chart or number)
  if (el.infoPreview) {
    el.infoPreview.innerHTML = "";
    const preview = buildPreviewNode(key, info);
    if (preview) {
      el.infoPreview.hidden = false;
      el.infoPreview.appendChild(preview);
    } else {
      el.infoPreview.hidden = true;
    }
  }


  openDialog(el.infoDialog);
}

function closeInfo() {
  if (!el.infoDialog) return;
  closeDialog(el.infoDialog);
}

function wireInfoUI() {
  // Open via event delegation (covers all charts)
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".info-btn[data-info-key]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    openInfo(btn.dataset.infoKey);
  });

  el.btnCloseInfo?.addEventListener("click", closeInfo);
  el.btnInfoOk?.addEventListener("click", closeInfo);

  // Close on backdrop click
  el.infoDialog?.addEventListener("click", (e) => {
    if (e.target === el.infoDialog) closeInfo();
  });

  // Prevent dialog 'cancel' from throwing in some browsers
  el.infoDialog?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeInfo();
  });
}


/* ------------------ bootstrap ------------------ */

bootstrap();

/* ------------------ bootstrap helpers ------------------ */

function bootstrap() {
  try {
    ctx = { ...getServices(), user: null };
  } catch (e) {
    // Config missing => show error on login screen.
    isAdmin = false;
  if (ctx) ctx.isAdmin = false;
  updateAdminUi();

  showAuthOnly();
    setAuthError(String(e?.message || e));
    return;
  }

  updateEnvUi();
  updateAdminUi();

  wireAuthEvents();
  wireAppEvents();
  wireInfoUI();

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
  if (el.envPill) el.envPill.textContent = env;
  else if (el.btnSwitchEnv) el.btnSwitchEnv.textContent = env;
  if (el.authEnvMeta) el.authEnvMeta.textContent = `Umgebung: ${env}`;

  if (el.btnSwitchEnvAuth) {
    const next = getEnv() === "prod" ? "dev" : "prod";
    el.btnSwitchEnvAuth.textContent = `Zu ${next.toUpperCase()} wechseln`;
  }
}

function updateAdminUi() {
  // Environment switching is an admin-only capability.
  const canSwitch = !!isAdmin;

  if (el.btnSwitchEnv) {
    el.btnSwitchEnv.hidden = !canSwitch;
    el.btnSwitchEnv.disabled = !canSwitch;
    el.btnSwitchEnv.title = canSwitch ? "Umgebung wechseln" : "Nur Admins dürfen die Umgebung wechseln.";
  }

  // On the login screen we never allow switching (no reliable admin check possible before login).
  if (el.btnSwitchEnvAuth) {
    el.btnSwitchEnvAuth.hidden = true;
    el.btnSwitchEnvAuth.disabled = true;
    el.btnSwitchEnvAuth.title = "Umgebung wechseln ist nur nach Login als Admin möglich.";
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

  if (el.userAvatar) {
    const email = String(user.email || "");
    const ch = (email.trim()[0] || "•").toUpperCase();
    el.userAvatar.textContent = ch;
  }
  if (el.btnLogout) el.btnLogout.hidden = false;

  // Resolve admin flag first (controls DEV/PROD switching)
  try {
    isAdmin = await checkIsAdmin(ctx.db, user.uid);
  } catch {
    isAdmin = false;
  }
  ctx.isAdmin = isAdmin;
  updateAdminUi();

  // If a non-admin somehow ends up in DEV, force redirect back to PROD.
  if (!isAdmin && getEnv() === "dev") {
    alert("DEV ist nur für Admins. Du wirst zu PROD umgeleitet.");
    setEnv("prod");
    window.location.reload();
    return;
  }

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
  if (el.userAvatar) el.userAvatar.textContent = '•';
  if (el.btnLogout) el.btnLogout.hidden = true;

  // Keep env UI visible on login screen
  updateEnvUi();
  updateAdminUi();
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
    if (!isAdmin) {
      toast("Nur Admins dürfen zwischen DEV/PROD wechseln.");
      return;
    }

    if (ctx?.user) {
      const ok = confirm("Umgebung wechseln? Du wirst neu laden (DEV/PROD) und ggf. neu einloggen müssen.");
      if (!ok) return;
    }
    toggleEnv({ isAdmin: true });
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

  el.btnCloseAddBook?.addEventListener("click", () => closeDialog(el.dlgAddBook));
  el.btnCancelAddBook?.addEventListener("click", () => closeDialog(el.dlgAddBook));

  el.btnCloseBookX?.addEventListener("click", () => closeDialog(el.dlgBook));

  // On close: unlock background scroll and ensure the toast is not trapped in a closed dialog.
  const onDialogClosed = () => {
    unlockBodyScroll();
    if (el.toast && el.toast.parentElement !== document.body) document.body.appendChild(el.toast);
  };
  el.dlgAddBook?.addEventListener("close", onDialogClosed);
  el.dlgBook?.addEventListener("close", onDialogClosed);
  el.infoDialog?.addEventListener("close", onDialogClosed);

  // Heatmap inline info close
  el.heatmapInfoClose?.addEventListener("click", hideHeatmapInfoPanel);

  el.formAddBook?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!requireAuth()) return;

    const fd = new FormData(el.formAddBook);
    const title = String(fd.get("title") || "").trim();
    const author = String(fd.get("author") || "").trim();
    const totalPages = clampInt(fd.get("totalPages"), 1, 100000);
    const initialRaw = clampInt(fd.get("initialPages"), 0, 100000);

    if (initialRaw > totalPages) {
      toast("Bereits gelesen darf nicht höher sein als die Gesamtseiten.");
      const inp = el.formAddBook.querySelector("input[name='initialPages']");
      inp?.focus();
      return;
    }

    const initialPage = initialRaw;

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

  openDialog(el.dlgBook);
  el.inpPage.focus();
  el.inpPage.select();
}

function openAddBook() {
  if (!requireAuth()) {
    toast("Bitte einloggen.");
    return;
  }
  openDialog(el.dlgAddBook);
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
  if (!el.toast) return;

  // When a <dialog> is open, its backdrop lives in the top layer and would blur/dim anything behind it.
  // To keep toasts crisp and readable, temporarily move the toast element into the open dialog.
  const host = (el.dlgBook?.open ? el.dlgBook : (el.dlgAddBook?.open ? el.dlgAddBook : null));
  if (host) {
    if (!host.contains(el.toast)) host.appendChild(el.toast);
  } else {
    if (el.toast.parentElement !== document.body) document.body.appendChild(el.toast);
  }

  el.toast.textContent = msg;
  el.toast.classList.add("toast--show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.toast.classList.remove("toast--show");
    // If no dialog is open anymore, ensure the toast lives in the normal document flow.
    if (!el.dlgBook?.open && !el.dlgAddBook?.open && el.toast.parentElement !== document.body) {
      document.body.appendChild(el.toast);
    }
  }, 3800);
}

// Heatmap: Detailfeld (unter der Heatmap) + Auswahlrahmen (doppelter Rahmen)
let _heatmapSelectionOverlay = null;

function clearHeatmapSelectionOverlay() {
  if (_heatmapSelectionOverlay && _heatmapSelectionOverlay.parentNode) {
    _heatmapSelectionOverlay.parentNode.removeChild(_heatmapSelectionOverlay);
  }
  _heatmapSelectionOverlay = null;
}

function setHeatmapSelection(rect) {
  clearHeatmapSelectionOverlay();
  if (!rect) return;

  const svg = rect.ownerSVGElement;
  if (!svg) return;

  const svgNS = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(svgNS, "g");
  g.setAttribute("class", "heatmapselect");
  g.style.pointerEvents = "none";

  const x0 = Number(rect.getAttribute("x") || 0);
  const y0 = Number(rect.getAttribute("y") || 0);
  const w0 = Number(rect.getAttribute("width") || 0);
  const h0 = Number(rect.getAttribute("height") || 0);
  const rx0 = Number(rect.getAttribute("rx") || 0);
  const ry0 = Number(rect.getAttribute("ry") || 0);

  const mkRect = (cls, insetPx) => {
    const r = document.createElementNS(svgNS, "rect");
    const inset = Number.isFinite(insetPx) ? insetPx : 0;
    const x = x0 + inset;
    const y = y0 + inset;
    const w = Math.max(0, w0 - inset * 2);
    const h = Math.max(0, h0 - inset * 2);
    const rx = Math.max(0, rx0 - inset);
    const ry = Math.max(0, ry0 - inset);

    r.setAttribute("x", String(x));
    r.setAttribute("y", String(y));
    r.setAttribute("width", String(w));
    r.setAttribute("height", String(h));
    r.setAttribute("rx", String(rx));
    r.setAttribute("ry", String(ry));
    r.setAttribute("class", cls);
    return r;
  };

  // Outer white frame, inner black frame — visible on both bright and dark fills.
  g.appendChild(mkRect("heatmapselect__outer", 0));
  g.appendChild(mkRect("heatmapselect__inner", 1));

  svg.appendChild(g);
  _heatmapSelectionOverlay = g;
}

function showHeatmapInfoPanel(text, rect) {
  if (!el.heatmapInfoPanel || !el.heatmapInfoText) return;
  el.heatmapInfoText.textContent = String(text ?? "");
  el.heatmapInfoPanel.hidden = false;
  setHeatmapSelection(rect);
}

function hideHeatmapInfoPanel() {
  if (!el.heatmapInfoPanel || !el.heatmapInfoText) return;
  el.heatmapInfoPanel.hidden = true;
  el.heatmapInfoText.textContent = "";
  setHeatmapSelection(null);
}

// Allow charts.js (SVG click handlers) to trigger the heatmap panel without tight coupling.
try {
  window.showHeatmapInfoPanel = showHeatmapInfoPanel;
  window.hideHeatmapInfoPanel = hideHeatmapInfoPanel;
} catch (_) {
  // ignore (non-browser env)
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
