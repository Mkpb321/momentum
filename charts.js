// charts.js
export function renderLineChart(containerEl, labels, values, opts = {}) {
  const height = opts.height ?? 110;
  const padL = 6, padR = 6, padT = 12, padB = 24;

  const w = containerEl.clientWidth || 640;
  const innerW = Math.max(10, w - padL - padR);
  const innerH = Math.max(10, height - padT - padB);

  const maxV = Math.max(1, ...values);
  const n = Math.max(1, values.length);

  const xFor = (i) => padL + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const yFor = (v) => padT + (innerH - (v / maxV) * innerH);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "chartsvg");
  svg.setAttribute("viewBox", `0 0 ${w} ${height}`);

  // grid lines
  const yBottom = padT + innerH;
  const yMid = padT + innerH * 0.5;

  [yBottom, yMid].forEach((yy) => {
    const grid = document.createElementNS(svgNS, "line");
    grid.setAttribute("x1", String(padL));
    grid.setAttribute("x2", String(w - padR));
    grid.setAttribute("y1", String(yy));
    grid.setAttribute("y2", String(yy));
    grid.setAttribute("class", "chartgrid");
    svg.appendChild(grid);
  });

  // polyline points
  const pts = values.map((v, i) => `${xFor(i).toFixed(2)},${yFor(v).toFixed(2)}`).join(" ");
  const pl = document.createElementNS(svgNS, "polyline");
  pl.setAttribute("points", pts);
  pl.setAttribute("class", "chartline");
  pl.setAttribute("stroke-linecap", "round");
  pl.setAttribute("stroke-linejoin", "round");
  svg.appendChild(pl);

  // dots + tooltips
  values.forEach((v, i) => {
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", String(xFor(i)));
    c.setAttribute("cy", String(yFor(v)));
    c.setAttribute("r", "3.2");
    c.setAttribute("class", v === 0 ? "chartdot chartdot--zero" : "chartdot");

    const title = document.createElementNS(svgNS, "title");
    title.textContent = `${labels[i]}: ${v} Seiten`;
    c.appendChild(title);

    svg.appendChild(c);
  });

  // x labels (sparse)
  const labelEvery = labels.length <= 12 ? 3 : Math.ceil(labels.length / 6);
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
