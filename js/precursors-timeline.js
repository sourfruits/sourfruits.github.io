// ─────────────────────────────────────────────────────────────────────────────
// Timeline view for the Precursors page.
//
// A third view beside Graph and List: time runs down the page (newest at the
// top), one column per kind of thing, and a faint curved line for every
// "discovered via" link. Hovering an entry previews its whole chain (what led
// to it and everything it led to); clicking opens its card in the docked side
// panel and keeps the chain lit until the card closes. Years fold.
//
// Loaded after js/precursors.js and uses its globals: rawData, nodeById,
// discoveredVia, nodeFirstDate, MONTH_NAMES, detailNodeId, openDetail,
// closeDetail, simulation.
// ─────────────────────────────────────────────────────────────────────────────

// Columns, left to right. Each lists the `kind` values it holds; any kind not
// listed lands in the last column ("Other"). Edit freely.
const TL_LANES = [
  { name: "People", kinds: ["person", "writer", "director", "philosopher", "musician"] },
  { name: "Books", kinds: ["book"] },
  { name: "Films", kinds: ["film"] },
  { name: "Other", kinds: [] },   // school, class, platform, album, …
];
const TL_ROW_H = 22;          // px per entry line
const TL_PAD = 10;            // px above/below each period's entries
const TL_GUTTER = 84;         // px for the date column on the left
const TL_PHONE = 560;         // below this width, one column instead of four

const tlState = { hover: null, showAll: false, folded: new Set(), built: false };

function tlLaneOf(kind) {
  const k = String(kind || "").toLowerCase();
  const i = TL_LANES.findIndex((l) => l.kinds.includes(k));
  return i === -1 ? TL_LANES.length - 1 : i;
}

// Period key for an entry: "2026-05" for a month date, "2024" for year-only,
// "undated" when there's no date at all.
function tlPeriod(dateStr) {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(dateStr || "");
  if (!m) return "undated";
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
}
function tlPeriodLabel(p) {
  if (p === "undated") return "Undated";
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(p);
  return m[2] ? MONTH_NAMES[parseInt(m[2], 10) - 1].slice(0, 3) : "Year unknown";
}

// Entries, links and the up/down maps used for chains.
function tlData() {
  const nodes = rawData.nodes.map((n) => ({
    id: n.id, label: n.label, kind: n.kind, lane: tlLaneOf(n.kind),
    date: nodeFirstDate(n) || "",
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const links = [];
  rawData.nodes.forEach((n) => {
    discoveredVia(n).forEach((d) => {
      if (d.source && ids.has(d.source) && d.source !== n.id) links.push({ s: d.source, t: n.id });
    });
  });
  const up = {}, down = {};
  links.forEach((l) => { (up[l.t] = up[l.t] || []).push(l.s); (down[l.s] = down[l.s] || []).push(l.t); });
  return { nodes, links, up, down };
}

function tlWalk(id, map, seen) {
  (map[id] || []).forEach((n) => { if (!seen.has(n)) { seen.add(n); tlWalk(n, map, seen); } });
  return seen;
}

let tlCache = null;   // { data, entryEls, linkEls, focusEl } of the current render

function renderTimeline() {
  const view = document.getElementById("timeline-view");
  if (!view || view.hidden || !rawData) return;
  const canvas = document.getElementById("tl-canvas");
  const width = canvas.clientWidth;
  if (!width) return;
  const data = tlData();
  const phone = width < TL_PHONE;
  const lanes = phone ? 1 : TL_LANES.length;
  const laneW = (width - TL_GUTTER) / lanes;

  // Group by year, then by period inside the year, newest first.
  const byYear = new Map();
  data.nodes.forEach((n) => {
    const p = tlPeriod(n.date);
    const y = p === "undated" ? "Undated" : p.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, new Map());
    const periods = byYear.get(y);
    if (!periods.has(p)) periods.set(p, []);
    periods.get(p).push(n);
  });
  const years = [...byYear.keys()].sort((a, b) => (a === "Undated" ? 1 : b === "Undated" ? -1 : b.localeCompare(a)));

  // Lay out. pos[id] = { x, y } of the entry's dot (a folded year's entries
  // all sit on that year's header line, so their links still have an end).
  const pos = {};
  const html = [];
  let y = 0;
  const YEAR_H = 34;
  years.forEach((yr) => {
    const periods = byYear.get(yr);
    const count = [...periods.values()].reduce((s, a) => s + a.length, 0);
    const folded = tlState.folded.has(yr);
    html.push(`<button type="button" class="tl-year" data-year="${escapeHTML(yr)}" style="top:${y}px" aria-expanded="${!folded}">
      <span class="tl-year-caret" aria-hidden="true">${folded ? "▸" : "▾"}</span>${escapeHTML(yr)}
      <span class="tl-year-count">${count} ${count === 1 ? "entry" : "entries"}</span></button>`);
    const headerY = y + YEAR_H / 2;
    y += YEAR_H;
    const keys = [...periods.keys()].sort((a, b) => b.localeCompare(a));
    keys.forEach((p, pi) => {
      const items = periods.get(p).sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label));
      if (folded) { items.forEach((n) => { pos[n.id] = { x: TL_GUTTER + (phone ? 0 : n.lane) * laneW + 14, y: headerY, folded: true }; }); return; }
      const perLane = Array.from({ length: lanes }, () => []);
      items.forEach((n) => perLane[phone ? 0 : n.lane].push(n));
      const rows = Math.max(...perLane.map((a) => a.length));
      const h = rows * TL_ROW_H + TL_PAD * 2;
      html.push(`<div class="tl-period${pi % 2 ? "" : " is-alt"}" style="top:${y}px;height:${h}px">
        <span class="tl-period-label">${escapeHTML(tlPeriodLabel(p))}</span></div>`);
      perLane.forEach((list, li) => list.forEach((n, i) => {
        const x = TL_GUTTER + li * laneW + 14, cy = y + TL_PAD + i * TL_ROW_H + TL_ROW_H / 2;
        pos[n.id] = { x, y: cy };
        html.push(`<button type="button" class="tl-entry lane-${n.lane}" data-node-id="${escapeHTML(n.id)}"
          style="left:${x - 6}px;top:${cy - TL_ROW_H / 2}px;max-width:${laneW - 14}px" title="${escapeHTML(n.label)}">
          <span class="tl-dot" aria-hidden="true"></span><span class="tl-label">${escapeHTML(n.label)}</span></button>`);
      }));
      y += h;
    });
  });
  const totalH = y + 8;

  // Column headings (sticky strip above the canvas).
  const heads = document.getElementById("tl-heads");
  heads.style.gridTemplateColumns = `${TL_GUTTER}px repeat(${lanes}, 1fr)`;
  heads.innerHTML = `<span></span>` + (phone
    ? `<span>Everything <span class="tl-key">${TL_LANES.map((l, i) => `<i class="tl-dot lane-${i}"></i>${escapeHTML(l.name)}`).join(" ")}</span></span>`
    : TL_LANES.map((l, i) => `<span><i class="tl-dot lane-${i}"></i>${escapeHTML(l.name)}</span>`).join(""));

  // Lines: an SVG behind the entries. Newest is at the top, so a link runs
  // from its (older, lower) source up to the entry it led to.
  const paths = data.links.map((l) => {
    const a = pos[l.s], b = pos[l.t];
    if (!a || !b || (a.folded && b.folded && a.y === b.y)) return "";
    const midY = (a.y + b.y) / 2;
    const d = a.x === b.x
      ? `M${a.x},${a.y} C${a.x - 40},${midY} ${b.x - 40},${midY} ${b.x},${b.y}`
      : `M${a.x},${a.y} C${a.x},${midY} ${b.x},${midY} ${b.x},${b.y}`;
    return `<path class="tl-link" data-s="${escapeHTML(l.s)}" data-t="${escapeHTML(l.t)}" d="${d}"/>`;
  }).join("");

  canvas.style.height = totalH + "px";
  canvas.innerHTML = `<svg class="tl-lines" width="${width}" height="${totalH}" aria-hidden="true">${paths}</svg>` + html.join("");

  tlCache = {
    data,
    entryEls: [...canvas.querySelectorAll(".tl-entry")],
    linkEls: [...canvas.querySelectorAll(".tl-link")],
  };
  tlState.built = true;
  timelinePaint();
}

// Apply the highlight for the hovered entry, else the one whose card is open.
function timelinePaint() {
  if (!tlCache) return;
  const view = document.getElementById("timeline-view");
  if (!view || view.hidden) return;
  const id = tlState.hover || detailNodeId;
  const { up, down } = tlCache.data;
  const keep = id ? new Set([id, ...tlWalk(id, up, new Set()), ...tlWalk(id, down, new Set())]) : null;
  view.classList.toggle("has-focus", !!keep);
  view.classList.toggle("show-all", tlState.showAll);
  tlCache.entryEls.forEach((el) => {
    const nid = el.dataset.nodeId;
    el.classList.toggle("is-lit", !!keep && keep.has(nid));
    el.classList.toggle("is-current", nid === id);
  });
  tlCache.linkEls.forEach((p) => p.classList.toggle("is-lit", !!keep && keep.has(p.dataset.s) && keep.has(p.dataset.t)));

  // Trail strip: the chain back to its origin (first source each step), then
  // what it led to.
  const trail = document.getElementById("tl-trail");
  if (!id) {
    trail.innerHTML = `<span class="tl-hint">Hover an entry to see its chain. Click to open it and keep the chain lit.</span>`;
    return;
  }
  const chain = [];
  let cur = id;
  const seen = new Set();
  while (cur && !seen.has(cur)) { seen.add(cur); chain.unshift(cur); cur = (up[cur] || [])[0]; }
  const name = (nid) => escapeHTML((nodeById[nid] || {}).label || nid);
  const led = (down[id] || []).map(name);
  trail.innerHTML =
    `<span class="tl-chain">${chain.map((nid) => nid === id ? `<strong>${name(nid)}</strong>` : name(nid)).join(` <span class="tl-arrow">→</span> `)}</span>` +
    (led.length ? `<span class="tl-led">Led to ${led.join(", ")}</span>` : "");
}

(function initTimelineView() {
  const view = document.getElementById("timeline-view");
  if (!view) return;
  const canvas = document.getElementById("tl-canvas");

  canvas.addEventListener("mouseover", (e) => {
    const el = e.target.closest(".tl-entry");
    const id = el ? el.dataset.nodeId : null;
    if (id !== tlState.hover) { tlState.hover = id; timelinePaint(); }
  });
  canvas.addEventListener("mouseleave", () => { tlState.hover = null; timelinePaint(); });

  canvas.addEventListener("click", (e) => {
    const yearBtn = e.target.closest(".tl-year");
    if (yearBtn) {
      const yr = yearBtn.dataset.year;
      if (tlState.folded.has(yr)) tlState.folded.delete(yr); else tlState.folded.add(yr);
      renderTimeline();
      return;
    }
    const el = e.target.closest(".tl-entry");
    if (!el) { if (detailNodeId !== null) closeDetail(); return; }   // empty space clears
    const id = el.dataset.nodeId;
    if (detailNodeId === id) { closeDetail(); return; }               // click again clears
    const node = (simulation ? simulation.nodes().find((n) => n.id === id) : null) || nodeById[id];
    if (node) openDetail(node, null, true);
  });

  document.getElementById("tl-showall").addEventListener("change", (e) => {
    tlState.showAll = e.target.checked;
    timelinePaint();
  });

  let t = null;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(renderTimeline, 120); });
})();
