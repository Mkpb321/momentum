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
    t.setAttribute("x", String(padL - 8));
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

function addXAxisLabelsVertical(svg, svgNS, labels, xFor, yBase, every) {
  const n = labels.length;
  for (let i = 0; i < n; i++) {
    if (i !== 0 && i !== n - 1 && (i % every) !== 0) continue;

    const x = xFor(i);

    // small tick
    const tick = document.createElementNS(svgNS, "line");
    tick.setAttribute("x1", String(x));
    tick.setAttribute("x2", String(x));
    tick.setAttribute("y1", String(yBase - 6));
    tick.setAttribute("y2", String(yBase - 2));
    tick.setAttribute("class", "chartxtick");
    svg.appendChild(tick);

    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("transform", `translate(${x} ${yBase}) rotate(-90)`);
    t.setAttribute("text-anchor", "end");
    t.setAttribute("dominant-baseline", "middle");
    t.setAttribute("class", "chartxlabel");
    t.textContent = labels[i];
    svg.appendChild(t);
  }
}

export function renderLineChart(containerEl, labels, values, opts = {}) {
  const height = opts.height ?? 130;
  const padLBase = opts.padL ?? 42;
  const padR = opts.padR ?? 8;
  const padT = opts.padT ?? 12;
  const padB = opts.padB ?? 44;

  const rawMaxV = Math.max(0, ...values);
  const yLabelFormatter = opts.yLabelFormatter ?? opts.valueFormatter ?? defaultValueFormatter;
  const tickData = buildNiceTicks(0, Math.max(1, rawMaxV), opts.yTickCount ?? 5);
  const maxYLabelLen = Math.max(1, ...tickData.ticks.map(v => String(yLabelFormatter(v)).length));
  // Rough text width estimate to prevent y-label clipping.
  const padL = Math.max(padLBase, 16 + maxYLabelLen * 6);

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

  // x labels (try each point; reduce only if too dense)
  const every = chooseXLabelEvery(labels.length, innerW, opts.minXLabelPx ?? 18);
  addXAxisLabelsVertical(svg, svgNS, labels, xFor, height - 6, every);

  containerEl.innerHTML = "";
  containerEl.appendChild(svg);
}

export function renderBarChart(containerEl, labels, values, opts = {}) {
  const height = opts.height ?? 130;
  const padLBase = opts.padL ?? 42;
  const padR = opts.padR ?? 8;
  const padT = opts.padT ?? 12;
  const padB = opts.padB ?? 44;

  const rawMaxV = Math.max(0, ...values);
  const yLabelFormatter = opts.yLabelFormatter ?? opts.valueFormatter ?? defaultValueFormatter;
  const tickData = buildNiceTicks(0, Math.max(1, rawMaxV), opts.yTickCount ?? 5);
  const maxYLabelLen = Math.max(1, ...tickData.ticks.map(v => String(yLabelFormatter(v)).length));
  const padL = Math.max(padLBase, 16 + maxYLabelLen * 6);

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

  // x labels (try each bar; reduce only if too dense)
  const xFor = (i) => padL + i * step + step / 2;
  const every = chooseXLabelEvery(labels.length, innerW, opts.minXLabelPx ?? 18);
  addXAxisLabelsVertical(svg, svgNS, labels, xFor, height - 6, every);

  containerEl.innerHTML = "";
  containerEl.appendChild(svg);
}
