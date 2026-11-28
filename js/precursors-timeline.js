// ─────────────────────────────────────────────────────────────────────────────
// Timeline view for the Precursors page.
//
// A third view beside Graph and List: time runs left to right (oldest on the
// left, scrolled to the newest end on open), one horizontal band per kind of
// thing, and a faint curved line for every "discovered via" link. Hovering an
// entry lights it and its direct connections (what it came straight from and
// what it led straight to); clicking opens its card in the docked side panel
// and keeps them lit
// until the card closes. Clicking a year folds it to one narrow column.
//
// Loaded after js/precursors.js and uses its globals: rawData, nodeById,
// discoveredVia, nodeFirstDate, MONTH_NAMES, detailNodeId, openDetail,
// closeDetail, simulation, escapeHTML.
// ─────────────────────────────────────────────────────────────────────────────

// Bands, top to bottom. Each lists the `kind` values it holds; any kind not
// listed lands in the last band ("Other"). Edit freely.
// Smaller bands go on top, so a tall band (Films) can never push them out of
// view at the bottom of the box.
const TL_LANES = [
  { name: "Music", kinds: ["musician", "album"] },
  { name: "People and places", kinds: ["person", "director", "school", "class", "platform"] },
  { name: "Books and writers", kinds: ["book", "writer", "philosopher"] },
  { name: "Films", kinds: ["film"] },
  { name: "Other", kinds: [] },   // anything not listed above (new kinds land here)
];
const TL_COL_W = 156;         // px per month (or year-only) column
const TL_FOLD_W = 64;         // px for a folded year
const TL_ROW_H = 22;          // px per entry line
const TL_BOTTOM_GAP = 30;     // px kept clear under the last band (scrollbar + full-screen button)
const TL_LANE_PAD = 10;       // px above/below each band's entries
const TL_GUTTER = 118;        // px for the band names on the left (sticky)
const TL_HEAD_H = 46;         // px for the year + month headings on top

const tlState = { hover: null, showAll: false, folded: new Set(), scrolledOnce: false, lastDetail: null };

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
  if (p === "undated") return "";
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(p);
  // Year on every month, so you always know where you are while scrolling.
  return m[2] ? `${MONTH_NAMES[parseInt(m[2], 10) - 1].slice(0, 3)} ${m[1]}` : `${m[1]}, month unknown`;
}

// An entry sits at the EARLIEST date it has — when it first entered your
// world (an aware date if you'd heard of it before engaging). That way a
// thing always sits at or before whatever it led to, so arrows run forward.
// (The List view and the card still use/show the engaged date.)
function tlEarliestDate(n) {
  const all = discoveredVia(n).flatMap((d) => [d.awareDate, d.engagedDate]).filter(Boolean);
  if (!all.length) return "";
  return all.reduce((best, s) => (dayKey(s) < dayKey(best) ? s : best));
}

// True when the entry's spot on the timeline is an AWARE date — you'd heard
// of it before (or without) engaging with it. Drawn as a hollow dot.
function tlPlacedAware(n) {
  const dvs = discoveredVia(n);
  const engaged = dvs.map((d) => d.engagedDate).filter(Boolean);
  if (!engaged.length) return dvs.some((d) => d.awareDate);
  const firstEngaged = Math.min(...engaged.map(dayKey));
  return dvs.some((d) => d.awareDate && dayKey(d.awareDate) < firstEngaged);
}

// Entries, links and the up/down maps used for chains.
function tlData() {
  const nodes = rawData.nodes.map((n) => ({
    id: n.id, label: n.label, kind: n.kind, lane: tlLaneOf(n.kind),
    date: tlEarliestDate(n),
    placedAware: tlPlacedAware(n),
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const links = [];
  rawData.nodes.forEach((n) => {
    discoveredVia(n).forEach((d) => {
      // Same rule as the graph: an engagedDate makes it "engaged" (solid line);
      // an awareDate alone makes it "aware" (dashed).
      if (d.source && ids.has(d.source) && d.source !== n.id) links.push({ s: d.source, t: n.id, aware: !d.engagedDate });
    });
  });
  const up = {}, down = {};
  links.forEach((l) => { (up[l.t] = up[l.t] || []).push(l.s); (down[l.s] = down[l.s] || []).push(l.t); });
  return { nodes, links, up, down };
}

let tlCache = null;   // { data, entryEls, linkEls } of the current render

function renderTimeline() {
  const view = document.getElementById("timeline-view");
  if (!view || view.hidden || !rawData) return;
  const canvas = document.getElementById("tl-canvas");
  const gutter = document.getElementById("tl-gutter");
  const scroller = document.getElementById("tl-scroll");
  const data = tlData();

  // Group by year, then by period inside the year, oldest first.
  const byYear = new Map();
  data.nodes.forEach((n) => {
    const p = tlPeriod(n.date);
    const y = p === "undated" ? "Undated" : p.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, new Map());
    const periods = byYear.get(y);
    if (!periods.has(p)) periods.set(p, []);
    periods.get(p).push(n);
  });
  const years = [...byYear.keys()].sort((a, b) => (a === "Undated" ? 1 : b === "Undated" ? -1 : a.localeCompare(b)));

  const laneUsed = TL_LANES.map((_, li) => data.nodes.some((n) => n.lane === li));
  const usedCount = laneUsed.filter(Boolean).length;

  // Columns (left to right) for a given row cap: a month whose busiest band
  // has more entries than the cap splits into side-by-side sub-columns. A
  // folded year is one narrow column.
  function layoutFor(maxRows) {
    const cols = [];
    years.forEach((yr) => {
      const periods = byYear.get(yr);
      const keys = [...periods.keys()].sort((a, b) => {
        // Year-only ("2026") goes after that year's months.
        const ay = a.length === 4, by = b.length === 4;
        return ay === by ? a.localeCompare(b) : ay ? 1 : -1;
      });
      if (tlState.folded.has(yr)) {
        cols.push({ year: yr, folded: true, items: keys.flatMap((k) => periods.get(k)), w: TL_FOLD_W });
      } else {
        keys.forEach((k) => {
          const items = periods.get(k);
          const busiest = Math.max(...TL_LANES.map((_, li) => items.filter((n) => n.lane === li).length));
          const subs = Math.max(1, Math.ceil(busiest / maxRows));
          cols.push({ year: yr, period: k, items, subs, w: TL_COL_W * subs });
        });
      }
    });
    // Band rows: the most entries any one column has in that band (after
    // splitting). A band with nothing in it at all takes no space.
    const laneRows = TL_LANES.map((_, li) => !laneUsed[li] ? 0 :
      Math.max(1, ...cols.filter((c) => !c.folded).map((c) => Math.ceil(c.items.filter((n) => n.lane === li).length / c.subs))));
    const bandsH = laneRows.reduce((s, r) => s + (r ? r * TL_ROW_H + TL_LANE_PAD * 2 : 0), 0);
    return { cols, laneRows, bandsH };
  }

  // Fit to the box: use the most rows per month that still fits the height
  // (fewer sub-columns = less sideways scrolling), then share any space left
  // over evenly between the bands so they always reach the bottom.
  const avail = Math.max(0, scroller.clientHeight - TL_HEAD_H - TL_BOTTOM_GAP);
  let lay = null;
  for (let rows = 40; rows >= 2; rows--) {
    lay = layoutFor(rows);
    if (lay.bandsH <= avail) break;
  }
  const { cols, laneRows } = lay;
  const extra = usedCount ? Math.max(0, avail - lay.bandsH) / usedCount : 0;
  const laneH = laneRows.map((r) => (r ? r * TL_ROW_H + TL_LANE_PAD * 2 + extra : 0));
  const laneTop = [];
  let yy = TL_HEAD_H;
  laneH.forEach((h, li) => { laneTop[li] = yy; yy += h; });
  const totalH = yy + TL_BOTTOM_GAP;

  // Place entries. pos[id] = { x, y } of the entry's dot.
  const pos = {};
  const html = [];
  let x = 32;   // start clear of the soft fade beside the band names
  let yearStart = 0;
  cols.forEach((c, ci) => {
    const firstOfYear = ci === 0 || cols[ci - 1].year !== c.year;
    if (firstOfYear) yearStart = x;
    html.push(`<div class="tl-col${ci % 2 ? "" : " is-alt"}${c.folded ? " is-folded" : ""}" style="left:${x}px;width:${c.w}px;height:${totalH}px"></div>`);
    if (!c.folded) html.push(`<span class="tl-month" style="left:${x + 10}px">${escapeHTML(tlPeriodLabel(c.period))}</span>`);
    if (c.folded) {
      // Folded year: entries collapse to their band's middle; show a count.
      TL_LANES.forEach((_, li) => {
        const n = c.items.filter((it) => it.lane === li).length;
        const cy = laneTop[li] + laneH[li] / 2;
        if (n) html.push(`<span class="tl-foldcount" style="left:${x}px;width:${c.w}px;top:${cy - 9}px">${n}</span>`);
      });
      c.items.forEach((n) => {
        const cy = laneTop[n.lane] + laneH[n.lane] / 2;
        pos[n.id] = { x: x + c.w / 2, y: cy, folded: true, col: ci };
      });
    } else {
      TL_LANES.forEach((_, li) => {
        c.items.filter((n) => n.lane === li)
          .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label))
          .forEach((n, i, arr) => {
            // Fill top to bottom, then the next sub-column to the right.
            const perCol = Math.ceil(arr.length / c.subs);
            const sub = Math.floor(i / perCol), row = i % perCol;
            const dx = x + 12 + sub * TL_COL_W, cy = laneTop[li] + TL_LANE_PAD + row * TL_ROW_H + TL_ROW_H / 2;
            pos[n.id] = { x: dx, y: cy, col: ci };
            html.push(`<button type="button" class="tl-entry lane-${li}${n.placedAware ? " is-aware-pos" : ""}" data-node-id="${escapeHTML(n.id)}"
              style="left:${dx - 6}px;top:${cy - TL_ROW_H / 2}px;max-width:${TL_COL_W - 10}px" title="${escapeHTML(n.label)}">
              <span class="tl-dot" aria-hidden="true"></span><span class="tl-label">${escapeHTML(n.label)}</span></button>`);
          });
      });
    }
    x += c.w;
    const lastOfYear = ci === cols.length - 1 || cols[ci + 1].year !== c.year;
    if (lastOfYear) {
      const count = byYear.get(c.year) ? [...byYear.get(c.year).values()].reduce((s, a) => s + a.length, 0) : 0;
      const folded = tlState.folded.has(c.year);
      html.push(`<button type="button" class="tl-year" data-year="${escapeHTML(c.year)}" style="left:${yearStart}px;width:${x - yearStart}px"
        aria-expanded="${!folded}" title="${folded ? "Expand" : "Fold"} ${escapeHTML(c.year)}">
        <span class="tl-year-pin"><span class="tl-year-caret" aria-hidden="true">${folded ? "▸" : "▾"}</span>${escapeHTML(c.year)}${folded ? "" : ` <span class="tl-year-count">${count}</span>`}</span></button>`);
    }
  });
  const totalW = x + 24;

  // Band lines + names (names live in the sticky gutter so they stay put
  // while you scroll sideways).
  TL_LANES.forEach((l, li) => {
    if (li && laneUsed[li]) html.push(`<div class="tl-band-rule" style="top:${laneTop[li]}px;width:${totalW}px"></div>`);
  });
  gutter.style.height = totalH + "px";
  gutter.innerHTML = TL_LANES.map((l, li) => !laneUsed[li] ? "" :
    `<span class="tl-band" style="top:${laneTop[li] + TL_LANE_PAD - 1}px"><i class="tl-dot lane-${li}"></i>${escapeHTML(l.name)}</span>`).join("");

  canvas.style.width = totalW + "px";
  canvas.style.height = totalH + "px";
  const defs = `<defs><marker id="tl-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7"
      markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0.5 L7,4 L0,7.5 Z" class="tl-arrowhead"/></marker>
      <marker id="tl-arrow-out" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7"
      markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0.5 L7,4 L0,7.5 Z" class="tl-arrowhead is-out"/></marker></defs>`;
  canvas.innerHTML = `<svg class="tl-lines" width="${totalW}" height="${totalH}" aria-hidden="true">${defs}</svg>` + html.join("");

  // Lines: dot to dot — leave the source's dot, arrive at the target's dot
  // from the left and stop just short of it, leaving room for the arrowhead
  // (shown on lit lines) that marks which way the discovery went. Labels have
  // a soft halo (CSS), so a line passing under text never cuts through it.
  // Fan-out: when one entry leads to several things, each line leaves at a
  // slightly different height (top target = top lane), so they don't merge
  // into one thick line where they start.
  const fan = {};
  const bySource = {};
  data.links.forEach((l) => { if (pos[l.s] && pos[l.t]) (bySource[l.s] = bySource[l.s] || []).push(l); });
  Object.values(bySource).forEach((arr) => {
    arr.sort((p, q) => pos[p.t].y - pos[q.t].y || pos[p.t].x - pos[q.t].x);
    const n = arr.length, step = n > 1 ? Math.min(2.6, 7 / (n - 1)) : 0;
    arr.forEach((l, i) => { fan[l.s + ">" + l.t] = (i - (n - 1) / 2) * step; });
  });

  const paths = data.links.map((l) => {
    const a = pos[l.s], b = pos[l.t];
    if (!a || !b || (a.folded && b.folded && a.x === b.x)) return "";
    const sx = a.folded ? a.x : a.x + 5;   // leave from the right edge of the source's dot
    const ex = b.x - 7;
    const sy = a.y + (fan[l.s + ">" + l.t] || 0);
    let d;
    if (ex - sx > 40) {
      // Hold each lane level for a stretch before turning, so the fan reads.
      const run = Math.min(70, (ex - sx) * 0.4);
      d = `M${sx},${sy} C${sx + run},${sy} ${ex - run},${b.y} ${ex},${b.y}`;
    } else {
      // Same month (or an earlier date): bow out to the left, then come in.
      d = `M${sx},${sy} C${sx - 34},${sy} ${ex - 34},${b.y} ${ex},${b.y}`;
    }
    const sameMonth = a.col === b.col;   // lit lines skip these; the source / led to tags say it
    return `<path class="tl-link${l.aware ? " is-aware" : ""}${sameMonth ? " is-same-month" : ""}" data-s="${escapeHTML(l.s)}" data-t="${escapeHTML(l.t)}" d="${d}"/>`;
  }).join("");
  canvas.querySelector(".tl-lines").insertAdjacentHTML("beforeend", paths);

  tlCache = {
    data,
    entryEls: [...canvas.querySelectorAll(".tl-entry")],
    linkEls: [...canvas.querySelectorAll(".tl-link")],
  };
  // First time it opens, start at the newest (right-hand) end.
  if (!tlState.scrolledOnce) { scroller.scrollLeft = scroller.scrollWidth; tlState.scrolledOnce = true; }
  timelinePaint();
}

// Apply the highlight for the hovered entry, else the one whose card is open.
function timelinePaint() {
  if (!tlCache) return;
  const view = document.getElementById("timeline-view");
  if (!view || view.hidden) return;
  // A newly opened card (e.g. from a link inside the card) scrolls its entry
  // into view, unfolding its year if needed.
  if (detailNodeId !== tlState.lastDetail) {
    tlState.lastDetail = detailNodeId;
    if (detailNodeId) timelineReveal(detailNodeId);
    if (!tlCache) return;   // timelineReveal re-rendered (and repainted) already
  }
  const id = tlState.hover || detailNodeId;
  const { up, down } = tlCache.data;
  // Three levels: the entry plus what it came straight from and led straight
  // to are fully lit ("direct"); the rest of its lineage back to where it
  // started is lit a step softer ("lineage"); everything else dims. Things it
  // led to further downstream are NOT lit (that tree gets big fast).
  const direct = id ? new Set([id, ...(up[id] || []), ...(down[id] || [])]) : null;
  const lineage = new Set();
  if (id) {
    const stack = [...(up[id] || [])];
    while (stack.length) {
      const n = stack.pop();
      (up[n] || []).forEach((p) => { if (!lineage.has(p) && p !== id) { lineage.add(p); stack.push(p); } });
    }
  }
  view.classList.toggle("has-focus", !!direct);
  view.classList.toggle("show-all", tlState.showAll);
  tlCache.entryEls.forEach((el) => {
    const nid = el.dataset.nodeId;
    el.classList.toggle("is-lit", !!direct && direct.has(nid));
    el.classList.toggle("is-lineage", !!direct && !direct.has(nid) && lineage.has(nid));
    el.classList.toggle("is-current", nid === id);
    // Say how each direct connection relates to the selected entry.
    el.classList.toggle("is-source", !!direct && nid !== id && (up[id] || []).includes(nid));
    el.classList.toggle("is-ledto", !!direct && nid !== id && (down[id] || []).includes(nid));
  });
  tlCache.linkEls.forEach((p) => {
    const s = p.dataset.s, t = p.dataset.t;
    const isDirect = !!direct && (s === id || t === id);
    // A lineage link runs between two ancestors (or an ancestor and a parent).
    const isLineage = !!direct && !isDirect && lineage.has(s) && (lineage.has(t) || (up[id] || []).includes(t));
    p.classList.toggle("is-lit", isDirect);
    p.classList.toggle("is-in", isDirect && t === id);    // came from → arrives at the entry
    p.classList.toggle("is-out", isDirect && s === id);   // led to → leaves the entry
    p.classList.toggle("is-lineage", isLineage);
  });

  timelineEdges();

  // Trail strip (fixed height — it must never resize, or the entries under the
  // cursor would shift and the hover would flicker): the chain back to its
  // origin, shortened to "first → … → last three" when long, then what it led to.
  const trail = document.getElementById("tl-trail");
  if (!id) {
    trail.innerHTML = `<span class="tl-chain tl-hint">Hover or click an entry to see where it came from.</span>`;
    return;
  }
  let chain = [];
  let cur = id;
  const seen = new Set();
  while (cur && !seen.has(cur)) { seen.add(cur); chain.unshift(cur); cur = (up[cur] || [])[0]; }
  const name = (nid) => escapeHTML((nodeById[nid] || {}).label || nid);
  // Every other name in the trail is a link: click it to open that entry.
  const link = (nid) => `<button type="button" class="tl-trail-link" data-node-id="${escapeHTML(nid)}">${name(nid)}</button>`;
  const before = chain.slice(0, -1).map(link);
  const shownBefore = before.length > 3 ? ["…", ...before.slice(-2)] : before;
  const led = (down[id] || []).map(link);
  // The path before the entry may truncate; the entry's own name never does.
  trail.innerHTML =
    `<span class="tl-chain" title="${escapeHTML(chain.map((nid) => (nodeById[nid] || {}).label || nid).join(" → "))}">` +
      (shownBefore.length ? `${shownBefore.join(` <span class="tl-arrow">→</span> `)} <span class="tl-arrow">→</span> ` : "") +
      `<strong>${name(id)}</strong></span>` +
    `<span class="tl-led">${led.length ? `Led to ${led.join(", ")}` : "Hasn't led anywhere yet"}</span>`;
}

// Edge markers: when the selected/hovered entry's direct connections sit
// off-screen to the left or right, pin a small clickable marker
// at that edge — "← Felix · 2023" — at the entry's height. Re-run on scroll.
function timelineEdges() {
  const box = document.getElementById("tl-edges");
  const scroller = document.getElementById("tl-scroll");
  if (!box || !scroller || !tlCache) return;
  const view = document.getElementById("timeline-view");
  // Only the immediate connections (what it came straight from / led straight to).
  const lit = tlCache.entryEls.filter((el) => el.classList.contains("is-lit"));
  if (!view.classList.contains("has-focus") || !lit.length) { box.innerHTML = ""; return; }
  const left = scroller.scrollLeft, right = left + scroller.clientWidth - TL_GUTTER;
  const top = -scroller.scrollTop;   // markers sit in a layer at the strip's top edge
  const dateOf = {};
  tlCache.data.nodes.forEach((n) => { dateOf[n.id] = n.date; });
  const used = { l: [], r: [] };
  const out = [];
  lit.forEach((el) => {
    if (el.classList.contains("is-current")) return;
    const x0 = el.offsetLeft, x1 = x0 + el.offsetWidth;
    const side = x1 < left + 12 ? "l" : x0 > right - 12 ? "r" : null;
    if (!side) return;
    let y = top + el.offsetTop + 2;
    while (used[side].some((u) => Math.abs(u - y) < 20)) y += 20;   // don't stack on top of each other
    used[side].push(y);
    const id = el.dataset.nodeId;
    const p = tlPeriod(dateOf[id]);
    // "Mar ’26", or just the year for a year-only date.
    const when = p === "undated" ? "" : ` · ${p.length === 4 ? p : `${MONTH_NAMES[parseInt(p.slice(5, 7), 10) - 1].slice(0, 3)} ’${p.slice(2, 4)}`}`;
    const name = escapeHTML((nodeById[id] || {}).label || id);
    out.push(`<button type="button" class="tl-edge tl-edge-${side}${el.classList.contains("is-lit") ? "" : " is-faint"}" data-node-id="${escapeHTML(id)}"
      style="top:${y}px" title="Scroll to ${name}">${side === "l" ? "← " : ""}${name}${escapeHTML(when)}${side === "r" ? " →" : ""}</button>`);
  });
  box.innerHTML = out.join("");
}

// Bring an entry into view: unfold its year if it's folded, then, only if it
// isn't already fully visible (clear of the pinned band names), smoothly
// scroll so it sits in the middle.
function timelineReveal(id, force) {
  const n = rawData && rawData.nodes.find((x) => x.id === id);
  if (!n) return;
  const p = tlPeriod(nodeFirstDate(n) || "");
  const yr = p === "undated" ? "Undated" : p.slice(0, 4);
  if (tlState.folded.has(yr)) {
    tlState.folded.delete(yr);
    tlCache = null;
    renderTimeline();          // repaints, which reveals again with the year open
    return;
  }
  const el = tlCache && tlCache.entryEls.find((e) => e.dataset.nodeId === id);
  const scroller = document.getElementById("tl-scroll");
  if (!el || !scroller) return;
  const sr = scroller.getBoundingClientRect(), er = el.getBoundingClientRect();
  const left = sr.left + TL_GUTTER, right = sr.right, top = sr.top, bottom = sr.bottom;
  const visible = er.left >= left && er.right <= right && er.top >= top && er.bottom <= bottom;
  if (visible) return;
  scroller.scrollTo({
    left: scroller.scrollLeft + (er.left - left) - ((right - left) - er.width) / 2,
    top: scroller.scrollTop + (er.top - top) - ((bottom - top) - er.height) / 2,
    behavior: "smooth",
  });
  el.classList.add("is-flash");
  setTimeout(() => el.classList.remove("is-flash"), 1200);
}

(function initTimelineView() {
  const view = document.getElementById("timeline-view");
  if (!view) return;

  // Edge markers: click to scroll to that entry; keep them in place on scroll.
  document.getElementById("tl-edges").addEventListener("click", (e) => {
    const b = e.target.closest(".tl-edge");
    if (b) timelineReveal(b.dataset.nodeId, true);
  });
  document.getElementById("tl-scroll").addEventListener("scroll", () => timelineEdges(), { passive: true });

  // Names in the trail bar open that entry (same as clicking it below).
  document.getElementById("tl-trail").addEventListener("click", (e) => {
    const b = e.target.closest(".tl-trail-link");
    if (!b) return;
    const id = b.dataset.nodeId;
    const node = (simulation ? simulation.nodes().find((n) => n.id === id) : null) || nodeById[id];
    if (node) openDetail(node, null, true);
  });
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
