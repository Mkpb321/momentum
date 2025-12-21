// charts.js
export function renderBarChart(containerEl, labels, values, opts = {}) {
  const height = opts.height ?? 110;
  const padL = 6, padR = 6, padT = 10, padB = 22;
  const w = containerEl.clientWidth || 640;
  const innerW = Math.max(10, w - padL - padR);
  const innerH = Math.max(10, height - padT - padB);

  const maxV = Math.max(1, ...values);
  const barGap = 3;
  const barW = Math.max(2, (innerW - barGap * (values.length - 1)) / values.length);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "chartsvg");
  svg.setAttribute("viewBox", `0 0 ${w} ${height}`);

  // grid line at bottom
  const grid = document.createElementNS(svgNS, "line");
  grid.setAttribute("x1", String(padL));
  grid.setAttribute("x2", String(w - padR));
  grid.setAttribute("y1", String(padT + innerH));
  grid.setAttribute("y2", String(padT + innerH));
  grid.setAttribute("class", "chartgrid");
  svg.appendChild(grid);

  // bars
  values.forEach((v, i) => {
    const x = padL + i * (barW + barGap);
    const h = Math.round((v / maxV) * innerH);
    const y = padT + (innerH - h);

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(barW));
    rect.setAttribute("height", String(h));
    rect.setAttribute("rx", "3");
    rect.setAttribute("class", v === 0 ? "chartbar chartbar--zero" : "chartbar");

    // tooltip
    const title = document.createElementNS(svgNS, "title");
    title.textContent = `${labels[i]}: ${v} Seiten`;
    rect.appendChild(title);

    svg.appendChild(rect);
  });

  // sparse x labels: show 4-6 labels depending on length
  const labelEvery = labels.length <= 12 ? 3 : Math.ceil(labels.length / 6);
  labels.forEach((lab, i) => {
    if (i % labelEvery !== 0 && i !== labels.length - 1) return;
    const x = padL + i * (barW + barGap) + barW / 2;
    const y = padT + innerH + 14;

    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("class", "chartlabel");
    t.textContent = lab;
    svg.appendChild(t);
  });

  containerEl.innerHTML = "";
  containerEl.appendChild(svg);
}
