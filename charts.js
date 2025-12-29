// charts.js
// Minimal, dependency-free SVG charts.
// Smooth line: Catmull–Rom spline converted to cubic Bezier segments.

function catmullRomToBezier(points) {
  if (points.length < 2) return "";
  const p = points;

  const d = [];
  d.push(`M ${p[0].x.toFixed(2)} ${p[0].y.toFixed(2)}`);

  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(p.length - 1, i + 2)];

    // Catmull–Rom to Bezier conversion
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d.push(
      `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
    );
  }

  return d.join(" ");
}

function formatDateKey(yyyy_mm_dd) {
  // yyyy-mm-dd -> dd.mm.yyyy
  const s = String(yyyy_mm_dd || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

function defaultValueFormatter(v) {
  const n = Number.isFinite(v) ? v : 0;
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 10) / 10);
}

function makeChartSvg(containerEl, height, padL, padR) {
  const w = containerEl.clientWidth || 640;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "chartsvg");
  svg.setAttribute("viewBox", `0 0 ${w} ${height}`);

  return { svg, svgNS, w };
}

function niceNum(range, round) {
  if (range <= 0) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);

  let niceFraction;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

function buildNiceTicks(minV, maxV, tickCount = 5) {
  const min = Number.isFinite(minV) ? minV : 0;
  const max = Number.isFinite(maxV) ? maxV : 1;
  const range = niceNum(max - min, false);
  const step = niceNum(range / Math.max(1, tickCount - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const out = [];
  // Include end with small epsilon to avoid floating issues.
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    // Avoid -0
    out.push(Object.is(v, -0) ? 0 : v);
  }
  return { ticks: out, niceMin, niceMax, step };
}

function chooseXLabelEvery(n, innerW, minPx = 18) {
  if (n <= 1) return 1;
  const maxTicks = Math.max(2, Math.floor(innerW / minPx));
  if (n <= maxTicks) return 1;
  return Math.ceil(n / maxTicks);
}

function estimateTextWidthPx(text, fontPx = 10) {
  // Heuristic: average glyph width ~0.62em for common UI fonts.
  const s = String(text ?? "");
  return s.length * fontPx * 0.62;
}

function computeEveryForHorizontalLabels(labels, innerW, stepPx, fontPx = 10) {
  const n = labels.length;
  if (n <= 1) return 1;

  // For line charts, the distance is (innerW/(n-1)); for bars it's (innerW/n).
  const perPoint = stepPx;
  const maxLabelW = Math.max(
    1,
    ...labels.map((l) => estimateTextWidthPx(l, fontPx))
  );
  const needed = Math.ceil((maxLabelW + 10) / Math.max(1, perPoint));
  return Math.max(1, needed);
}

function addXAxisLabelsHorizontal(svg, svgNS, labels, xFor, yBottom, every) {
  const n = labels.length;
  for (let i = 0; i < n; i++) {
    if (i !== 0 && i !== n - 1 && (i % every) !== 0) continue;

    const x = xFor(i);

    const tick = document.createElementNS(svgNS, "line");
    tick.setAttribute("x1", String(x));
    tick.setAttribute("x2", String(x));
    tick.setAttribute("y1", String(yBottom));
    tick.setAttribute("y2", String(yBottom + 4));
    tick.setAttribute("class", "chartxtick");
    svg.appendChild(tick);

    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(yBottom + 14));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "middle");
    t.setAttribute("class", "chartxlabel");
    t.textContent = labels[i];
    svg.appendChild(t);
  }
}

function addXAxisLabelsAuto(svg, svgNS, labels, xFor, yAxis, innerW, modeHint = "auto") {
  const n = labels.length;
  if (n <= 0) return;

  // Always render vertical x-axis labels.
  // Label every point when possible; reduce density only when the chart is too crowded to avoid overlap.
  // With vertical labels, the effective x-width is roughly the font size, so we can allow tighter spacing.
  const everyV = chooseXLabelEvery(n, innerW, 12);

  // Draw labels BELOW the plot area.
  // Important: When rotating -90°, using text-anchor="end" makes the label extend DOWNWARDS
  // from the anchor point (so it never overlaps the plot). This requires enough bottom padding.
  addXAxisLabelsVertical(svg, svgNS, labels, xFor, yAxis, everyV);
}

function addYAxis(svg, svgNS, padL, padT, w, yBottom, ticks, yFor, yLabelFormatter) {
  // Grid lines + labels
  for (const v of ticks) {
    const y = yFor(v);

    const grid = document.createElementNS(svgNS, "line");
    grid.setAttribute("x1", String(padL));
    grid.setAttribute("x2", String(w - 6));
    grid.setAttribute("y1", String(y));
    grid.setAttribute("y2", String(y));
    grid.setAttribute("class", "chartgrid");
    svg.appendChild(grid);

    const t = document.createElementNS(svgNS, "text");
    // Place labels clearly left of the y-axis (never overlapping it).
    t.setAttribute("x", String(padL - 14));
    t.setAttribute("y", String(y));
    t.setAttribute("text-anchor", "end");
    t.setAttribute("dominant-baseline", "middle");
    t.setAttribute("class", "chartylabel");
    t.textContent = yLabelFormatter(v);
    svg.appendChild(t);
  }

  // y-axis line (subtle)
  const axis = document.createElementNS(svgNS, "line");
  axis.setAttribute("x1", String(padL));
  axis.setAttribute("x2", String(padL));
  axis.setAttribute("y1", String(padT));
  axis.setAttribute("y2", String(yBottom));
  axis.setAttribute("class", "chartyaxis");
  svg.appendChild(axis);
}

function addXAxisLabelsVertical(svg, svgNS, labels, xFor, yAxis, every) {
  const n = labels.length;
  const tickLen = 6;
  // Distance from axis to the label anchor. Keep it compact but always outside the plot area.
  const labelPad = 18;
  for (let i = 0; i < n; i++) {
    if (i !== 0 && i !== n - 1 && (i % every) !== 0) continue;

    const x = xFor(i);

    // small tick
    const tick = document.createElementNS(svgNS, "line");
    tick.setAttribute("x1", String(x));
    tick.setAttribute("x2", String(x));
    tick.setAttribute("y1", String(yAxis));
    tick.setAttribute("y2", String(yAxis + tickLen));
    tick.setAttribute("class", "chartxtick");
    svg.appendChild(tick);

    const t = document.createElementNS(svgNS, "text");
    // Place the anchor below the axis; with text-anchor="end" and rotate(-90), the text extends downward.
    t.setAttribute("transform", `translate(${x} ${yAxis + labelPad}) rotate(-90)`);
    t.setAttribute("text-anchor", "end");
    t.setAttribute("dominant-baseline", "middle");
    t.setAttribute("class", "chartxlabel");
    t.textContent = labels[i];
    svg.appendChild(t);
  }
}

export function renderLineChart(containerEl, labels, values, opts = {}) {
  const height = opts.height ?? 170;
  const padLBase = opts.padL ?? 42;
  const padR = opts.padR ?? 8;
  const padT = opts.padT ?? 12;
  const padBBase = opts.padB ?? 44;

  // Vertical x labels need enough bottom padding to avoid clipping.
  // With rotate(-90), the needed vertical space roughly equals the max text width.
  const maxXLabelW = Math.max(1, ...labels.map((l) => estimateTextWidthPx(l, 10)));
  const xLabelPad = 18;
  const padB = Math.max(padBBase, xLabelPad + maxXLabelW + 10);

  const rawMaxV = Math.max(0, ...values);
  const yLabelFormatter = opts.yLabelFormatter ?? opts.valueFormatter ?? defaultValueFormatter;
  const tickData = buildNiceTicks(0, Math.max(1, rawMaxV), opts.yTickCount ?? 5);
  const maxYLabelW = Math.max(1, ...tickData.ticks.map((v) => estimateTextWidthPx(yLabelFormatter(v), 10)));
  // Ensure y-labels are always outside the plot and never touch the axis.
  const padL = Math.max(padLBase, Math.ceil(maxYLabelW + 14 + 10));

  const { svg, svgNS, w } = makeChartSvg(containerEl, height, padL, padR);

  const innerW = Math.max(10, w - padL - padR);
  const innerH = Math.max(10, height - padT - padB);

  const n = Math.max(1, values.length);

  const xFor = (i) => padL + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const { ticks, niceMax } = tickData;
  const yFor = (v) => padT + (innerH - (Math.max(0, v) / Math.max(1e-9, niceMax)) * innerH);

  // y-axis gridlines + tick labels
  const yBottom = padT + innerH;
  addYAxis(svg, svgNS, padL, padT, w, yBottom, ticks, yFor, yLabelFormatter);

  const valueFormatter = opts.valueFormatter ?? defaultValueFormatter;
  const suffix = opts.suffix ?? " Seiten";

  // Build points
  const pts = values.map((v, i) => ({ x: xFor(i), y: yFor(v), v, label: labels[i] }));
  const pathD = catmullRomToBezier(pts);

  // Line path
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", pathD || "");
  path.setAttribute("class", "chartline");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);

  // Dots + tooltips
  pts.forEach((p) => {
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", String(p.x));
    c.setAttribute("cy", String(p.y));
    c.setAttribute("r", "3.2");
    c.setAttribute("class", p.v === 0 ? "chartdot chartdot--zero" : "chartdot");

    const title = document.createElementNS(svgNS, "title");
    title.textContent = `${p.label}: ${valueFormatter(p.v)}${suffix}`;
    c.appendChild(title);

    svg.appendChild(c);
  });

  // x labels: vertical; label every point when possible, thin out when crowded (never overlap)
  addXAxisLabelsAuto(svg, svgNS, labels, xFor, yBottom, innerW, opts.xLabelMode ?? "auto");

  containerEl.innerHTML = "";
  containerEl.appendChild(svg);
}

export function renderBarChart(containerEl, labels, values, opts = {}) {
  const height = opts.height ?? 170;
  const padLBase = opts.padL ?? 42;
  const padR = opts.padR ?? 8;
  const padT = opts.padT ?? 12;
  const padBBase = opts.padB ?? 44;

  // Vertical x labels need enough bottom padding to avoid clipping.
  const maxXLabelW = Math.max(1, ...labels.map((l) => estimateTextWidthPx(l, 10)));
  const xLabelPad = 18;
  const padB = Math.max(padBBase, xLabelPad + maxXLabelW + 10);

  const rawMaxV = Math.max(0, ...values);
  const yLabelFormatter = opts.yLabelFormatter ?? opts.valueFormatter ?? defaultValueFormatter;
  const tickData = buildNiceTicks(0, Math.max(1, rawMaxV), opts.yTickCount ?? 5);
  const maxYLabelW = Math.max(1, ...tickData.ticks.map((v) => estimateTextWidthPx(yLabelFormatter(v), 10)));
  const padL = Math.max(padLBase, Math.ceil(maxYLabelW + 14 + 10));

  const { svg, svgNS, w } = makeChartSvg(containerEl, height, padL, padR);

  const innerW = Math.max(10, w - padL - padR);
  const innerH = Math.max(10, height - padT - padB);

  const n = Math.max(1, values.length);

  const { ticks, niceMax } = tickData;
  const yFor = (v) => padT + (innerH - (Math.max(0, v) / Math.max(1e-9, niceMax)) * innerH);
  const yBottom = padT + innerH;
  addYAxis(svg, svgNS, padL, padT, w, yBottom, ticks, yFor, yLabelFormatter);

  const valueFormatter = opts.valueFormatter ?? defaultValueFormatter;
  const suffix = opts.suffix ?? " Seiten";

  const step = n === 0 ? innerW : innerW / n;
  const barW = Math.max(2, Math.min(28, step * 0.64));

  for (let i = 0; i < n; i++) {
    const v = values[i] ?? 0;
    const x = padL + i * step + (step - barW) / 2;
    const y = yFor(v);
    const h = Math.max(0, yBottom - y);

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(barW));
    rect.setAttribute("height", String(h));
    rect.setAttribute("rx", "4");
    rect.setAttribute("ry", "4");
    rect.setAttribute("class", v === 0 ? "chartbar chartbar--zero" : "chartbar");

    const title = document.createElementNS(svgNS, "title");
    title.textContent = `${labels[i]}: ${valueFormatter(v)}${suffix}`;
    rect.appendChild(title);

    svg.appendChild(rect);
  }

  // x labels: vertical; label every point when possible, thin out when crowded (never overlap)
  const xFor = (i) => padL + i * step + step / 2;
  addXAxisLabelsAuto(svg, svgNS, labels, xFor, yBottom, innerW, opts.xLabelMode ?? "auto");

  containerEl.innerHTML = "";
  containerEl.appendChild(svg);
}

export function renderMonthDayHeatmap(containerEl, rows, opts = {}) {
  // rows: [{ label: string, cells: Array<{valid:boolean,total:number,byBook:Array<{title:string,pages:number}>}> }], oldest -> newest
  const svgNS = "http://www.w3.org/2000/svg";
  const cell = opts.cellSize ?? 12;
  const gap = opts.gap ?? 2;
  const padT = 18;
  const padL = opts.padL ?? 64;
  const padR = 10;
  const padB = 10;

  const cols = 31;
  const w = padL + cols * (cell + gap) - gap + padR;
  const h = padT + rows.length * (cell + gap) - gap + padB;

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "heatmapsvg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  let max = 0;
  for (const r of rows) {
    for (const c of (r.cells || [])) {
      const v = Number.isFinite(c?.total) ? c.total : 0;
      if (c?.valid) max = Math.max(max, v);
    }
  }

  const fillFor = (v) => {
    const val = Number.isFinite(v) ? v : 0;
    if (max <= 0 || val <= 0) return "rgb(255,255,255)";
    const t = Math.max(0, Math.min(1, val / max));
    const g = Math.round(255 * (1 - t));
    return `rgb(${g},${g},${g})`;
  };

  // Column labels: 1..31
  for (let c = 1; c <= cols; c++) {
    const tx = padL + (c - 1) * (cell + gap) + cell / 2;
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", String(tx));
    t.setAttribute("y", String(12));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "middle");
    t.setAttribute("class", "heatmaplabel");
    t.textContent = String(c);
    svg.appendChild(t);
  }

  // Rows
  rows.forEach((row, r) => {
    const y = padT + r * (cell + gap);

    const lt = document.createElementNS(svgNS, "text");
    lt.setAttribute("x", String(padL - 8));
    lt.setAttribute("y", String(y + cell / 2));
    lt.setAttribute("text-anchor", "end");
    lt.setAttribute("dominant-baseline", "middle");
    lt.setAttribute("class", "heatmaplabel");
    lt.textContent = row.label;
    svg.appendChild(lt);

    for (let c = 0; c < cols; c++) {
      const cellData = row.cells?.[c] ?? { valid: true, total: 0, byBook: [] };
      const v = Number.isFinite(cellData.total) ? cellData.total : 0;
      const x = padL + c * (cell + gap);

      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(cell));
      rect.setAttribute("height", String(cell));
      rect.setAttribute("rx", "2");
      rect.setAttribute("ry", "2");
      rect.setAttribute("class", cellData.valid ? "heatmapcell" : "heatmapcell heatmapcell--invalid");
      rect.setAttribute("fill", cellData.valid ? fillFor(v) : "rgb(255,255,255)");
      // Days that don't exist in the month (or are in the future) should not have a border.
      const baseStroke = cellData.valid ? "#e8e2db" : "none";
      const baseStrokeW = cellData.valid ? "1" : "0";
      rect.setAttribute("stroke", baseStroke);
      rect.setAttribute("stroke-width", baseStrokeW);
      // Persist base style for selection toggling.
      rect.dataset.baseStroke = baseStroke;
      rect.dataset.baseStrokeWidth = baseStrokeW;

      // Tooltip: date, total, blank line, per-book breakdown.
      let tooltipText = "";
      if (cellData.valid) {
        const lines = [];
        const dateStr = cellData.date ? formatDateKey(cellData.date) : "";
        if (dateStr) lines.push(dateStr);

        const totalRounded = Math.round(v);
        lines.push(`${totalRounded} S.`);

        const byBook = Array.isArray(cellData.byBook) ? cellData.byBook : [];
        const bookLines = [];
        for (const b of byBook) {
          const name = String(b.title ?? "").trim() || "(Ohne Titel)";
          const p = Number.isFinite(b.pages) ? Math.round(b.pages) : 0;
          if (p > 0) bookLines.push(`${name}: ${p} S.`);
        }
        if (bookLines.length) {
          lines.push(""); // Leerzeile zwischen Total und Büchern
          lines.push(...bookLines);
        }
        tooltipText = lines.join("\n");
      }

      if (tooltipText) {
        const title = document.createElementNS(svgNS, "title");
        title.textContent = tooltipText;
        rect.appendChild(title);

        // Click: show details in the inline heatmap info panel (unter der Heatmap).
        rect.style.cursor = "pointer";
        rect.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (typeof window?.showHeatmapInfoPanel === "function") window.showHeatmapInfoPanel(tooltipText, rect, cellData.date);
        });
      }

      svg.appendChild(rect);
    }
  });

  containerEl.innerHTML = "";
  containerEl.appendChild(svg);
}
