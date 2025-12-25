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

function addGridLines(svg, svgNS, padL, w, yBottom, yMid) {
  [yBottom, yMid].forEach((yy) => {
    const grid = document.createElementNS(svgNS, "line");
    grid.setAttribute("x1", String(padL));
    grid.setAttribute("x2", String(w - 6));
    grid.setAttribute("y1", String(yy));
    grid.setAttribute("y2", String(yy));
    grid.setAttribute("class", "chartgrid");
    svg.appendChild(grid);
  });
}

function labelEveryFor(n) {
  if (n <= 8) return 1;
  if (n <= 12) return 2;
  if (n <= 16) return 3;
  return Math.ceil(n / 6);
}

export function renderLineChart(containerEl, labels, values, opts = {}) {
  const height = opts.height ?? 110;
  const padL = 6, padR = 6, padT = 12, padB = 24;

  const { svg, svgNS, w } = makeChartSvg(containerEl, height, padL, padR);

  const innerW = Math.max(10, w - padL - padR);
  const innerH = Math.max(10, height - padT - padB);

  const maxV = Math.max(1, ...values);
  const n = Math.max(1, values.length);

  const xFor = (i) => padL + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const yFor = (v) => padT + (innerH - (v / maxV) * innerH);

  // grid lines (subtle)
  const yBottom = padT + innerH;
  const yMid = padT + innerH * 0.5;
  addGridLines(svg, svgNS, padL, w, yBottom, yMid);

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

  // x labels (sparse)
  const labelEvery = labelEveryFor(labels.length);
  labels.forEach((lab, i) => {
    if (i % labelEvery !== 0 && i !== labels.length - 1) return;

    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", String(xFor(i)));
    t.setAttribute("y", String(padT + innerH + 16));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("class", "chartlabel");
    t.textContent = lab;
    svg.appendChild(t);
  });

  containerEl.innerHTML = "";
  containerEl.appendChild(svg);
}

export function renderBarChart(containerEl, labels, values, opts = {}) {
  const height = opts.height ?? 110;
  const padL = 6, padR = 6, padT = 12, padB = 24;

  const { svg, svgNS, w } = makeChartSvg(containerEl, height, padL, padR);

  const innerW = Math.max(10, w - padL - padR);
  const innerH = Math.max(10, height - padT - padB);

  const maxV = Math.max(1, ...values);
  const n = Math.max(1, values.length);

  const yFor = (v) => padT + (innerH - (v / maxV) * innerH);
  const yBottom = padT + innerH;
  const yMid = padT + innerH * 0.5;

  addGridLines(svg, svgNS, padL, w, yBottom, yMid);

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

  // x labels (sparse)
  const labelEvery = labelEveryFor(labels.length);
  labels.forEach((lab, i) => {
    if (i % labelEvery !== 0 && i !== labels.length - 1) return;

    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", String(padL + i * step + step / 2));
    t.setAttribute("y", String(padT + innerH + 16));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("class", "chartlabel");
    t.textContent = lab;
    svg.appendChild(t);
  });

  containerEl.innerHTML = "";
  containerEl.appendChild(svg);
}
