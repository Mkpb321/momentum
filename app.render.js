// app.render.js
// Rendering + UI composition (no persistence, minimal state).

import { renderLineChart } from "./charts.js";
import {
  addDays,
  addMonths,
  computeDailyPages,
  computeMonthTotals,
  computeStreaks,
  computeWeekTotals,
  computeYearTotals,
  dateKey,
  formatDateShort,
  formatDayLabel,
  formatMonthLabel,
  formatNumber,
  formatWeekLabel,
  isFinished,
  lastEntryDateKey,
  latestPage,
  monthKey,
  parseDate,
  startOfWeek,
} from "./app.logic.js";

export function renderAll(el, state, showFinished, searchQuery, onOpenBook) {
  updateBooksControls(el, showFinished);
  renderBooks(el, state, showFinished, searchQuery, onOpenBook);
  renderStatsAndKpis(el, state);
  renderCharts(el, state);
}

export function updateBooksControls(el, showFinished) {
  if (el.btnToggleFinished) {
    // Compact toggle for mobile: show current filter state.
    // showFinished=true  => all books (incl. finished)
    // showFinished=false => active only
    el.btnToggleFinished.textContent = showFinished ? "Zeige aktive" : "Zeige alle";
    el.btnToggleFinished.title = showFinished
      ? "Zeige nur aktive Bücher)"
      : "Zeige alle Bücher (inkl. fertige)";
  }
}

export function renderBooks(el, state, showFinished, searchQuery, onOpenBook) {
  let books = [...(state?.books || [])];

  // Sort: zuletzt gelesen zuerst (nach letztem History-Datum), sonst nach Erstellungsdatum
  books.sort((a, b) => {
    const ad = lastEntryDateKey(a);
    const bd = lastEntryDateKey(b);
    if (ad !== bd) return bd.localeCompare(ad);
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });

  const totalCount = books.length;
  const finishedCount = books.filter(isFinished).length;
  void finishedCount; // kept for future UI usage

  if (!showFinished) {
    books = books.filter(b => !isFinished(b));
  }

  if (searchQuery) {
    const q = String(searchQuery).trim().toLowerCase();
    books = books.filter(b => {
      const t = `${b.title || ""} ${b.author || ""}`.toLowerCase();
      return t.includes(q);
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

    card.addEventListener("click", () => onOpenBook(book.id));
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        onOpenBook(book.id);
      }
    });

    el.bookList.appendChild(card);
  }
}

export function renderStatsAndKpis(el, state) {
  const daily = computeDailyPages(state.books);
  const now = new Date();

  const today = dateKey(now);
  const todayPages = daily.get(today) ?? 0;

  const { currentStreak, longestStreak } = computeStreaks(daily);

  // Top KPIs
  setText(el.kpiCurrentStreak, String(currentStreak));
  if (el.kpiCurrentStreakHint) {
    if (longestStreak > 0) {
      el.kpiCurrentStreakHint.textContent =
        (currentStreak > 0 && currentStreak === longestStreak)
          ? `Längster Streak: ${longestStreak} (aktuell)`
          : `Längster Streak: ${longestStreak}`;
    } else {
      el.kpiCurrentStreakHint.textContent = "Noch keine Serie.";
    }
  }

  const weekTotals = computeWeekTotals(daily);
  const wkStart = startOfWeek(now);
  const wkKey = dateKey(wkStart);
  const weekPages = weekTotals.get(wkKey) ?? 0;
  setText(el.kpiWeekPages, String(weekPages));
  if (el.kpiWeekHint) {
    const wkEnd = addDays(wkStart, 6);
    el.kpiWeekHint.textContent = `${formatDateShort(dateKey(wkStart))} – ${formatDateShort(dateKey(wkEnd))}`;
  }

  // More KPIs
  const monthTotals = computeMonthTotals(daily);
  const monthK = monthKey(now);
  const monthPages = monthTotals.get(monthK) ?? 0;

  const yearTotals = computeYearTotals(daily);
  const yearK = String(now.getFullYear());
  const yearPages = yearTotals.get(yearK) ?? 0;

  setText(el.kpiTodayPages, String(todayPages));
  setText(el.kpiMonthPages, String(monthPages));
  setText(el.kpiYearPages, String(yearPages));

  // Additional time windows (rollierend)
  const yesterdayKey = dateKey(addDays(now, -1));
  const yesterdayPages = daily.get(yesterdayKey) ?? 0;
  setText(el.kpiYesterdayPages, String(yesterdayPages));

  const sumLastNDays = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const k = dateKey(addDays(now, -i));
      s += daily.get(k) ?? 0;
    }
    return s;
  };

  const last7DaysPages = sumLastNDays(7);
  const last30DaysPages = sumLastNDays(30);

  setText(el.kpiLast7DaysPages, String(last7DaysPages));
  setText(el.kpiLast30DaysPages, String(last30DaysPages));

  setText(el.kpiAvgLast7Days, formatNumber(last7DaysPages / 7, 1));
  setText(el.kpiAvgLast30Days, formatNumber(last30DaysPages / 30, 1));

  const totalPages = sumMapValues(daily);
  const activeDays = [...daily.values()].filter(v => v > 0).length;

  setText(el.kpiTotalPages, String(totalPages));
  setText(el.kpiActiveDays, String(activeDays));

  const activeWeeks = [...weekTotals.values()].filter(v => v > 0).length;
  setText(el.kpiActiveWeeks, String(activeWeeks));

  const activeMonths = [...monthTotals.values()].filter(v => v > 0).length;
  setText(el.kpiActiveMonths, String(activeMonths));
  const activeYearsEntries = [...yearTotals.entries()].filter(([, v]) => v > 1);
  const activeYears = activeYearsEntries.length;
  const pagesInActiveYears = activeYearsEntries.reduce((a, [, v]) => a + v, 0);

  const avgPerActiveDay = activeDays ? totalPages / activeDays : 0;
  const avgPerActiveMonth = activeMonths ? totalPages / activeMonths : 0;
  const avgPerActiveYear = activeYears ? pagesInActiveYears / activeYears : 0;

  setText(el.kpiAvgPerActiveDay, formatNumber(avgPerActiveDay, 1));
  setText(el.kpiAvgPerActiveDayTop, formatNumber(avgPerActiveDay, 1));
  setText(el.kpiAvgPerActiveMonth, formatNumber(avgPerActiveMonth, 1));
  setText(el.kpiAvgPerActiveYear, formatNumber(avgPerActiveYear, 1));

  setText(el.kpiBestWeek, String(maxMapValue(weekTotals)));
  setText(el.kpiBestMonth, String(maxMapValue(monthTotals)));


  // Best day + last active day
  let bestDayPages = 0;
  let bestDayKey = null;
  let lastActiveKey = null;
  let lastActivePages = 0;

  for (const [k, v] of daily.entries()) {
    if (v <= 0) continue;

    if (!lastActiveKey || k > lastActiveKey) {
      lastActiveKey = k;
      lastActivePages = v;
    }

    if (v > bestDayPages) {
      bestDayPages = v;
      bestDayKey = k;
    } else if (v === bestDayPages) {
      // Tie-breaker: pick the most recent date
      if (!bestDayKey || k > bestDayKey) bestDayKey = k;
    }
  }

  setText(el.kpiBestDay, String(bestDayPages));
  setText(el.kpiBestDayDate, bestDayKey ? formatDateShort(bestDayKey) : "—");
  setText(el.kpiLastActiveDate, lastActiveKey ? formatDateShort(lastActiveKey) : "—");
  setText(el.kpiLastActivePages, lastActiveKey ? `${lastActivePages} Seiten` : "—");

  // Library metrics
  const books = state.books || [];
  const booksTotal = books.length;
  const booksFinished = books.filter(isFinished).length;
  const booksInProgress = books.filter(b => !isFinished(b) && (b.history?.length ?? 0) > 0).length;
  const booksNotStarted = books.filter(b => !isFinished(b) && (b.history?.length ?? 0) === 0).length;

  setText(el.kpiBooksTotal, String(booksTotal));
  setText(el.kpiBooksFinished, String(booksFinished));
  setText(el.kpiBooksInProgress, String(booksInProgress));
  setText(el.kpiBooksNotStarted, String(booksNotStarted));

  const libraryTotalPages = books.reduce((a, b) => a + (Number(b.totalPages) || 0), 0);
  const libraryCurrentPages = books.reduce((a, b) => {
    const tp = Number(b.totalPages) || 0;
    if (tp <= 0) return a;
    return a + Math.min(latestPage(b), tp);
  }, 0);
  const libraryRemainingPages = books.reduce((a, b) => {
    const tp = Number(b.totalPages) || 0;
    if (tp <= 0) return a;
    const cur = Math.min(latestPage(b), tp);
    return a + Math.max(0, tp - cur);
  }, 0);

  setText(el.kpiLibraryTotalPages, String(libraryTotalPages));
  setText(el.kpiLibraryCurrentPages, String(libraryCurrentPages));
  setText(el.kpiLibraryRemainingPages, String(libraryRemainingPages));

  const libraryProgressPct = libraryTotalPages ? (libraryCurrentPages / libraryTotalPages) * 100 : 0;
  setText(el.kpiLibraryProgressPct, `${formatNumber(libraryProgressPct, 1)}%`);

  el.streakMeta.textContent =
    todayPages > 0 ? "Heute: eingetragen." : "Heute: noch nichts eingetragen.";
}

export function renderCharts(el, state) {
  const daily = computeDailyPages(state.books);
  const today = new Date();

  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  // last 12 days (inclusive)
  const days12 = [];
  for (let i = 11; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = dateKey(d);
    days12.push({ key, label: formatDayLabel(d), val: daily.get(key) ?? 0 });
  }

  const days12Range = `${formatDateShort(days12[0].key)} – ${formatDateShort(days12[days12.length - 1].key)}`;
  setText(el.subDays, days12Range);
  setText(el.sumDays, `${sum(days12.map(x => x.val))} Seiten`);

  if (el.chartDays) {
    renderLineChart(el.chartDays, days12.map(d => d.label), days12.map(d => d.val));
  }

  // Only render the additional charts when the section is visible.
  if (el.moreCharts?.hidden) return;

  // last 12 weeks (inclusive): Monday-start
  const weekTotals = computeWeekTotals(daily);
  const weekLabels = [];
  const weekValues = [];
  for (let i = 11; i >= 0; i--) {
    const wkStart = startOfWeek(addDays(today, -7 * i));
    const wkKey = dateKey(wkStart);
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

  setText(el.subWeeks, "Wochenstart (Mo) – letzte 12");
  setText(el.subMonths, "Kalendermonate – letzte 12");

  setText(el.sumWeeks, `${sum(weekValues)} Seiten`);
  setText(el.sumMonths, `${sum(monthValues)} Seiten`);

  if (el.chartWeeks) renderLineChart(el.chartWeeks, weekLabels, weekValues);
  if (el.chartMonths) renderLineChart(el.chartMonths, monthLabels, monthValues);

  // last 30 days
  const days30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = dateKey(d);
    days30.push({ key, label: formatDayLabel(d), val: daily.get(key) ?? 0 });
  }
  const days30Range = `${formatDateShort(days30[0].key)} – ${formatDateShort(days30[days30.length - 1].key)}`;
  setText(el.subDays30, days30Range);
  setText(el.sumDays30, `${sum(days30.map(x => x.val))} Seiten`);
  if (el.chartDays30) renderLineChart(el.chartDays30, days30.map(d => d.label), days30.map(d => d.val));

  // Weekdays (average pages on active days per weekday)
  const names = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const sumsByDay = Array(7).fill(0);
  const cntByDay = Array(7).fill(0);

  for (const [date, pages] of daily.entries()) {
    if (pages <= 0) continue;
    const d = parseDate(date);
    const idx = (d.getDay() + 6) % 7; // Monday=0
    sumsByDay[idx] += pages;
    cntByDay[idx] += 1;
  }

  const weekdayValues = sumsByDay.map((s, i) => cntByDay[i] ? s / cntByDay[i] : 0);
  const totalPages = sumMapValues(daily);
  const activeDays = [...daily.values()].filter(v => v > 0).length;
  const avgPerActiveDay = activeDays ? totalPages / activeDays : 0;

  setText(el.subWeekdays, "Ø Seiten pro Wochentag (nur aktive Tage)");
  setText(el.sumWeekdays, `Ø/Tag: ${formatNumber(avgPerActiveDay, 1)}`);
  if (el.chartWeekdays) renderLineChart(el.chartWeekdays, names, weekdayValues);
}

/* ------------------ internal render helpers ------------------ */

function setText(node, text) {
  if (node) node.textContent = text;
}

function sumMapValues(map) {
  let s = 0;
  for (const v of map.values()) s += v;
  return s;
}

function maxMapValue(map) {
  let m = 0;
  for (const v of map.values()) m = Math.max(m, v);
  return m;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
