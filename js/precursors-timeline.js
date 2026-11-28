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
// discoveredVia, dayKey, MONTH_NAMES, detailNodeId, openDetail,
// closeDetail, simulation, escapeHTML.
// ─────────────────────────────────────────────────────────────────────────────

// Bands, top to bottom. Each lists the `kind` values it holds; any kind not
// listed lands in the last band ("Other"). Edit freely.
// Smaller bands go on top, so a tall band (Films) can never push them out of
// view at the bottom of the box.
let TL_LANES = [   // default; replaced by the categories in precursors.txt (tlSetLanes)
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
const TL_GUTTER = 110;        // px for the band names on the left (sticky)
const TL_TREE_STEP = 14;    // px each tree level is indented inside a month
const TL_HEAD_H = 30;         // px for the month headings on top (the year sits in the corner)

const tlState = { hover: null, showAll: true, fade: { engaged: false, aware: false }, folded: new Set(), scrolledOnce: false, lastDetail: null };

// Bands come from the categories block in precursors.txt (same as the graph's
// colours and the List): one band per category in file order, then "Other".
function tlSetLanes(view) {
  const cats = (rawData && rawData.categories) || {};
  const names = Object.keys(cats);
  if (names.length) {
    TL_LANES = names.map((name) => ({ name, kinds: (cats[name] || []).map((k) => String(k).trim().toLowerCase()),
      color: categoryColor.get(name) }));
    TL_LANES.push({ name: "Other", kinds: [], color: OTHER_COLOR });
  }
  TL_LANES.forEach((l, i) => { if (l.color) view.style.setProperty(`--tl-lane-${i}`, l.color); });
}

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

// One dot per discovery EVENT. Each "discovered via" line in precursors.txt
// is an event with an aware date (heard of it), an engaged date (read /
// watched it), or both. An entry gets a dot in every month where one of its
// events happened: hollow if you'd only heard of it then, filled once you'd
// engaged. So Orientalism shows a hollow dot in Aug (heard of it via Sontag)
// and a filled one in Oct (read it via Edward Said), joined along its row,
// and each line lands on the dot for the event it describes.
function tlData() {
  const ids = new Set(rawData.nodes.map((n) => n.id));
  const items = [];          // appearances: { key, id, label, kind, lane, date, period, aware }
  const byId = {};           // id -> its appearances, oldest first
  rawData.nodes.forEach((n) => {
    // At most two moments per entry, in time order: when you first heard of
    // it (aware) and when you first got into it (engaged). If both fall in
    // the same month they're one (engaged) dot.
    const dvs = discoveredVia(n);
    const earliest = (dates) => dates.filter(Boolean).reduce((b, x) => (!b || dayKey(x) < dayKey(b) ? x : b), "");
    const aw = earliest(dvs.map((d) => d.awareDate));
    const en = earliest(dvs.map((d) => d.engagedDate));
    const mk = (date, aware) => ({ key: `${n.id}@${tlPeriod(date)}`, id: n.id, label: n.label, kind: n.kind,
      lane: tlLaneOf(n.kind), date, period: tlPeriod(date), aware, moment: aware ? "aware" : "engaged" });
    let list;
    if (en && aw && dayKey(aw) < dayKey(en) && tlPeriod(aw) !== tlPeriod(en)) list = [mk(aw, true), mk(en, false)];
    else if (en) list = [mk(en, false)];
    else if (aw) list = [mk(aw, true)];
    else list = [mk("", false)];
    // One labelled dot per entry, at when you first engaged with it (or its
    // earliest date if you haven't yet). Its other events become small
    // unlabelled "ghost" dots, so every line can land on the event it's about
    // and point forward in time, without the name appearing twice.
    const mainIdx = Math.max(0, list.findIndex((a) => !a.aware));
    list.forEach((a, i) => { a.ghost = i !== mainIdx; });
    byId[n.id] = list;
    items.push(...list);
  });

  // Links: each event with a source. It lands on the target's dot for that
  // event's first date, and leaves from the source's latest dot at or before
  // that date (else its earliest).
  const links = [];
  const reminders = [];   // "heard of it again" links: no line, but still connections
  rawData.nodes.forEach((n) => {
    discoveredVia(n).forEach((d) => {
      if (!d.source || !ids.has(d.source) || d.source === n.id) return;
      // No date yet = pending (e.g. something you mean to watch "via" a book
      // you've just read). It's listed in the card, but there's no moment on
      // the timeline to draw it to until you add a date.
      if (!d.awareDate && !d.engagedDate) return;
      // The event lands on the dot for its moment: an event that made you
      // aware → the aware dot; one where you engaged → the engaged dot.
      const kind = d.awareDate && !(d.engagedDate && tlPeriod(d.engagedDate) === tlPeriod(d.awareDate)) ? "aware" : "engaged";
      const t = byId[n.id].find((a) => a.moment === kind) || byId[n.id][0];
      const when = (kind === "aware" ? d.awareDate : d.engagedDate) || d.awareDate || d.engagedDate || "";
      // A later "heard of" (you'd already heard of it in an earlier month) is a
      // reminder: the card lists it with its date, but there's no earlier
      // moment to draw it to without going backwards, so no line. It becomes a
      // real line once you add an engaged date to it.
      if (kind === "aware" && t.moment === "aware" && when && tlPeriod(when) > t.period) {
        reminders.push({ s: d.source, t: n.id });   // still counts in the trail's "Led to"
        return;
      }
      const srcs = byId[d.source];
      // Compare by month: a source dot from the same month as the event
      // counts as "before" it (e.g. Pickpocket watched May 18 → Bresson,
      // dated just "May", leaves from Pickpocket's May dot, not its April one).
      const before = srcs.filter((a) => !when || a.period <= tlPeriod(when));
      const sItem = before.length ? before[before.length - 1] : srcs[0];
      // Same rule as the graph: an engagedDate makes it "engaged" (solid line);
      // an awareDate alone makes it "aware" (dashed).
      links.push({ s: d.source, t: n.id, sk: sItem.key, tk: t.key, aware: !d.engagedDate });
    });
  });
  const up = {}, down = {};
  [...links, ...reminders].forEach((l) => {
    if (!(up[l.t] || []).includes(l.s)) (up[l.t] = up[l.t] || []).push(l.s);
    if (!(down[l.s] || []).includes(l.t)) (down[l.s] = down[l.s] || []).push(l.t);
  });
  return { items, byId, links, up, down };
}

// Order inside one month: what led to what. If A led to B and both are in
// this month, A comes before B (above it, or in an earlier sub-column).
// Entries not linked to each other keep date order (then A to Z).
// Returns { key: position }.
function tlMonthOrder(items, links) {
  const byDate = [...items].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  const rank = new Map(byDate.map((n, i) => [n.key, i]));
  const keys = new Set(items.map((n) => n.key));
  const after = new Map(), need = new Map(byDate.map((n) => [n.key, 0]));
  links.forEach((l) => {
    if (!keys.has(l.sk) || !keys.has(l.tk) || l.sk === l.tk) return;
    (after.get(l.sk) || after.set(l.sk, []).get(l.sk)).push(l.tk);
    need.set(l.tk, need.get(l.tk) + 1);
  });
  const ready = byDate.filter((n) => !need.get(n.key)).map((n) => n.key);
  const out = {};
  let i = 0;
  while (ready.length) {
    ready.sort((a, b) => rank.get(a) - rank.get(b));
    const k = ready.shift();
    out[k] = i++;
    (after.get(k) || []).forEach((t) => { need.set(t, need.get(t) - 1); if (!need.get(t)) ready.push(t); });
  }
  byDate.forEach((n) => { if (!(n.key in out)) out[n.key] = i++; });   // a loop (shouldn't happen): date order
  return out;
}

// Rows for one band in one month, as a small tree: whatever an entry led to
// (same month, same band) goes straight under it, indented one step. At most
// two steps deep; anything deeper stays at the second step and gets a normal
// line instead of an elbow. Returns [{ n, depth, parent }] top to bottom.
const TL_TREE_MAX = 2;
function tlTreeRows(inLane, links, order) {
  inLane = [...inLane].sort((a, b) => order[a.key] - order[b.key]);
  const keys = new Set(inLane.map((n) => n.key));
  const parent = {};
  inLane.forEach((n) => {
    const l = links.find((x) => x.tk === n.key && keys.has(x.sk) && x.sk !== n.key);
    if (l) parent[n.key] = l.sk;
  });
  const out = [], seen = new Set();
  const visit = (n, dpt, elbow) => {
    seen.add(n.key);
    out.push({ n, depth: dpt, parent: elbow ? parent[n.key] : null });
    inLane.filter((m) => parent[m.key] === n.key && !seen.has(m.key)).forEach((m) => {
      if (dpt < TL_TREE_MAX) visit(m, dpt + 1, true);
      else visit(m, dpt, false);   // too deep: same step, normal line
    });
  };
  inLane.forEach((n) => { if (!parent[n.key] && !seen.has(n.key)) visit(n, 0, false); });
  inLane.forEach((n) => { if (!seen.has(n.key)) visit(n, 0, false); });   // safety (loops)
  return out;
}

// Split a band's rows into side-by-side sub-columns of at most maxRows,
// never breaking a tree (an entry stays in the same sub-column as what it
// led to), unless one tree alone is taller than maxRows.
function tlPack(rows, maxRows) {
  const groups = [];
  rows.forEach((r) => { if (r.depth === 0 || !groups.length) groups.push([]); groups[groups.length - 1].push(r); });
  const place = {};
  let sub = 0, used = 0, tallest = 0;
  groups.forEach((g) => {
    if (used && used + g.length > maxRows) { sub++; used = 0; }
    g.forEach((r) => {
      if (used >= maxRows && g.length > maxRows) { sub++; used = 0; }
      place[r.n.key] = { sub, row: used++ };
      tallest = Math.max(tallest, used);
    });
  });
  return { place, subs: rows.length ? sub + 1 : 1, rows: tallest };
}

let tlCache = null;   // { data, entryEls, linkEls } of the current render

function renderTimeline() {
  const view = document.getElementById("timeline-view");
  if (!view || view.hidden || !rawData) return;
  const canvas = document.getElementById("tl-canvas");
  // The corner year: click to fold the year you're looking at.
  document.getElementById("tl-gutter").addEventListener("click", (e) => {
    const b = e.target.closest(".tl-corner-year");
    if (!b || !b.dataset.year) return;
    tlState.folded.add(b.dataset.year);
    renderTimeline();
  });
  const gutter = document.getElementById("tl-gutter");
  const scroller = document.getElementById("tl-scroll");
  tlSetLanes(view);
  const data = tlData();
  const vertical = tlIsVertical();
  view.classList.toggle("is-vertical", vertical);
  if (vertical) { renderTimelineVertical(data, canvas, gutter, scroller); return; }

  // Group by year, then by period inside the year, oldest first.
  const byYear = new Map();
  data.items.forEach((n) => {
    const p = n.period;
    const y = p === "undated" ? "Undated" : p.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, new Map());
    const periods = byYear.get(y);
    if (!periods.has(p)) periods.set(p, []);
    periods.get(p).push(n);
  });
  // Undated goes first: things with no date are usually from long before
  // you started keeping track (childhood reading, etc.).
  const years = [...byYear.keys()].sort((a, b) => (a === "Undated" ? -1 : b === "Undated" ? 1 : a.localeCompare(b)));

  const laneUsed = TL_LANES.map((_, li) => data.items.some((n) => n.lane === li));
  const usedCount = laneUsed.filter(Boolean).length;

  // Columns (left to right) for a given row cap: a month whose busiest band
  // has more entries than the cap splits into side-by-side sub-columns. A
  // folded year is one narrow column.
  const treeCache = {};
  function treesOf(k, items) {
    if (!treeCache[k]) {
      const order = tlMonthOrder(items, data.links);
      treeCache[k] = TL_LANES.map((_, li) => tlTreeRows(items.filter((n) => n.lane === li), data.links, order));
    }
    return treeCache[k];
  }
  function layoutFor(caps) {   // caps[li] = most rows band li may use before a month splits
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
          const trees = treesOf(k, items);
          const packs = TL_LANES.map((_, li) => tlPack(trees[li], caps[li]));
          const subs = Math.max(1, ...packs.map((pk) => pk.subs));
          // Only a sub-column that holds an indented tree gets wider (by its
          // indent), so indented names keep their room without stretching
          // every other sub-column of the month too.
          const subDepth = Array(subs).fill(0);
          trees.forEach((rows, li) => rows.forEach((r) => {
            const sb = packs[li].place[r.n.key].sub;
            subDepth[sb] = Math.max(subDepth[sb], r.depth);
          }));
          const subW = subDepth.map((d) => TL_COL_W + d * TL_TREE_STEP);
          const subX = subW.map((_, i) => subW.slice(0, i).reduce((a, b) => a + b, 0));
          cols.push({ year: yr, period: k, items, subs, packs, trees, subW, subX, w: subW.reduce((a, b) => a + b, 0) });
        });
      }
    });
    // Band rows: the most entries any one column has in that band (after
    // splitting). A band with nothing in it at all takes no space.
    const laneRows = TL_LANES.map((_, li) => !laneUsed[li] ? 0 :
      Math.max(1, ...cols.filter((c) => !c.folded).map((c) => c.packs[li].rows)));
    const bandsH = laneRows.reduce((s, r) => s + (r ? r * TL_ROW_H + TL_LANE_PAD * 2 : 0), 0);
    return { cols, laneRows, bandsH };
  }

  // Fit to the box: use the most rows per month that still fits the height
  // (fewer sub-columns = less sideways scrolling), then share any space left
  // over evenly between the bands so they always reach the bottom.
  const avail = Math.max(0, scroller.clientHeight - TL_HEAD_H - TL_BOTTOM_GAP);
  let lay = null;
  for (let rows = 40; rows >= 2; rows--) {
    lay = layoutFor(TL_LANES.map(() => rows));
    if (lay.bandsH <= avail) break;
  }
  const { cols, laneRows } = lay;
  const extra = usedCount ? Math.max(0, avail - lay.bandsH) / usedCount : 0;
  const laneH = laneRows.map((r) => (r ? r * TL_ROW_H + TL_LANE_PAD * 2 + extra : 0));
  // The last band runs on to the bottom of the box (the space kept clear for
  // the scrollbar and full-screen button is part of it, not a blank strip).
  const lastLane = laneH.reduce((last, h, li) => (h ? li : last), -1);
  if (lastLane >= 0) laneH[lastLane] += TL_BOTTOM_GAP;
  const laneTop = [];
  let yy = TL_HEAD_H;
  laneH.forEach((h, li) => { laneTop[li] = yy; yy += h; });
  const totalH = yy;

  // Which bands get the grey fill (every other used band).
  const shadedLane = [];
  TL_LANES.reduce((n, _, li) => { if (laneUsed[li]) { shadedLane[li] = n % 2 === 1; return n + 1; } return n; }, 0);

  // Place entries. pos[id] = { x, y } of the entry's dot.
  const pos = {};
  const html = [];
  let x = 0;    // first month starts right at the band names' line
  let yearStart = 0;
  const yearSpans = [];   // where each year runs, for the corner label
  cols.forEach((c, ci) => {
    const firstOfYear = ci === 0 || cols[ci - 1].year !== c.year;
    if (firstOfYear) yearStart = x;
    const yearLine = ci > 0 && firstOfYear;
    const cls = `tl-col${c.folded ? " is-folded" : ""}${yearLine ? " is-year-start" : ""}${ci === 0 ? " is-first" : ""}`;
    html.push(`<div class="${cls}" style="left:${x}px;width:${c.w}px;top:${yearLine ? 0 : TL_HEAD_H}px;height:${totalH - (yearLine ? 0 : TL_HEAD_H)}px"></div>`);
    // Month headings, one row. The first month of each year also carries the
    // year in bold ("2027 Jan"), so a year change shows on the timeline itself
    // as well as in the corner.
    if (!c.folded) {
      const isMonth = /^\d{4}-\d{2}$/.test(c.period);
      const mon = isMonth ? MONTH_NAMES[parseInt(c.period.slice(5, 7), 10) - 1].slice(0, 3) : c.year === "Undated" ? "Undated" : "Month unknown";
      const yr = firstOfYear && c.year !== "Undated" ? `<b class="tl-month-year">${escapeHTML(c.year)}</b> ` : "";
      html.push(`<span class="tl-month" style="left:${x + 10}px">${yr}${escapeHTML(mon)}</span>`);
    } else {
      html.push(`<button type="button" class="tl-fold-tag" data-year="${escapeHTML(c.year)}" style="left:${x}px;width:${c.w}px" title="Expand ${escapeHTML(c.year)}">▸ ${escapeHTML(c.year)}</button>`);
    }
    if (c.folded) {
      // Folded year: entries collapse to their band's middle; show a count.
      TL_LANES.forEach((_, li) => {
        const n = c.items.filter((it) => it.lane === li).length;
        const cy = laneTop[li] + laneH[li] / 2;
        if (n) html.push(`<span class="tl-foldcount" style="left:${x}px;width:${c.w}px;top:${cy - 9}px">${n}</span>`);
      });
      c.items.forEach((n) => {
        const cy = laneTop[n.lane] + laneH[n.lane] / 2;
        pos[n.key] = { x: x + c.w / 2, y: cy, folded: true, col: ci };
      });
    } else {
      TL_LANES.forEach((_, li) => {
        c.trees[li].forEach(({ n, depth, parent }) => {
            const { sub, row } = c.packs[li].place[n.key];
            const ind = depth * TL_TREE_STEP;
            const dx = x + 12 + c.subX[sub] + ind, cy = laneTop[li] + TL_LANE_PAD + row * TL_ROW_H + TL_ROW_H / 2;
            pos[n.key] = { x: dx, y: cy, col: ci, sub, right: dx - ind - 6 + c.subW[sub] - 4, parent };
            html.push(`<button type="button" class="tl-entry lane-${li}${shadedLane[li] ? " on-shade" : ""}${n.aware ? " is-aware-pos" : ""}${n.ghost ? " is-ghost" : ""}" data-node-id="${escapeHTML(n.id)}" data-period="${escapeHTML(n.period)}"
              style="left:${dx - 6}px;top:${cy - TL_ROW_H / 2}px;max-width:${c.subW[sub] - 10 - ind}px" title="${escapeHTML(n.label)}">
              <span class="tl-dot" aria-hidden="true"></span><span class="tl-label">${escapeHTML(n.label)}</span></button>`);
          });
      });
    }
    x += c.w;
    const lastOfYear = ci === cols.length - 1 || cols[ci + 1].year !== c.year;
    if (lastOfYear) {
      const count = byYear.get(c.year) ? new Set([...byYear.get(c.year).values()].flat().map((a) => a.id)).size : 0;
      yearSpans.push({ year: c.year, x0: yearStart, x1: x, count, folded: tlState.folded.has(c.year) });
    }
  });
  const totalW = x + 24;

  // Band lines + names (names live in the sticky gutter so they stay put
  // while you scroll sideways).
  // The heading strip (years + months) is grey with a line under it, so
  // it's clear where the first band starts.
  html.push(`<div class="tl-head-shade" style="height:${TL_HEAD_H}px;width:${totalW}px"></div>`);
  // Every other band gets a faint grey fill, so the rows are easy to follow.
  let shade = 0;
  TL_LANES.forEach((l, li) => {
    if (!laneUsed[li]) return;
    if (shade++ % 2) html.push(`<div class="tl-band-shade" style="top:${laneTop[li]}px;height:${laneH[li]}px;width:${totalW}px"></div>`);
  });
  gutter.style.height = totalH + "px";
  // Band names: a thin bar in the band's colour, lined up with its first
  // row. Each band also gets its own soft fade on the right edge of this
  // column, in that band's own shade, so it blends into the strip cleanly.
  let gShade = 0;
  gutter.innerHTML = `<div class="tl-gutter-band tl-gutter-head" style="top:0;height:${TL_HEAD_H}px"><button type="button" class="tl-corner-year" id="tl-corner-year"></button></div>` + TL_LANES.map((l, li) => {
    if (!laneUsed[li]) return "";
    const shaded = gShade++ % 2 === 1;
    return `<div class="tl-gutter-band${shaded ? " is-shaded" : ""}" style="top:${laneTop[li]}px;height:${laneH[li]}px"></div>` +
      `<span class="tl-band lane-${li}" style="top:${laneTop[li] + TL_LANE_PAD + 2}px">${escapeHTML(l.name)}</span>`;
  }).join("");

  canvas.style.width = totalW + "px";
  canvas.style.height = totalH + "px";
  const defs = `<defs><marker id="tl-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7"
      markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0.5 L7,4 L0,7.5 Z" class="tl-arrowhead"/></marker>
      <marker id="tl-arrow-tree" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6"
      markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0.5 L7,4 L0,7.5 Z" class="tl-arrowhead"/></marker></defs>`;
  canvas.innerHTML = `<svg class="tl-lines" width="${totalW}" height="${totalH}" aria-hidden="true">${defs}</svg>` + html.join("");

  // Lines: dot to dot — leave the source's dot, arrive at the target's dot
  // from the left and stop just short of it, leaving room for the arrowhead
  // (shown on lit lines) that marks which way the discovery went. Labels have
  // a soft halo (CSS), so a line passing under text never cuts through it.
  // Where each entry's label ends (measured now that it's on the page): lines
  // leave a source from just after its label, where the "→" sits when lit.
  const labelEnd = {};
  canvas.querySelectorAll(".tl-entry").forEach((el) => { labelEnd[`${el.dataset.nodeId}@${el.dataset.period}`] = el.offsetLeft + el.offsetWidth; });

  // Tracks: a faint line along an entry's own row from one of its dots to the
  // next (heard of it here → read it there).
  const tracks = [];
  Object.values(data.byId).forEach((list) => {
    for (let i = 1; i < list.length; i++) {
      const a = pos[list[i - 1].key], b = pos[list[i].key];
      if (!a || !b || (a.folded && b.folded && a.x === b.x)) continue;
      const sx = a.x + 5, ex = b.x - 6, run = Math.max(10, (ex - sx) * 0.35);
      tracks.push(`<path class="tl-track" data-node="${escapeHTML(list[i].id)}" d="M${sx},${a.y} C${sx + run},${a.y} ${ex - run},${b.y} ${ex},${b.y}"/>`);
    }
  });

  // Lit lines fade from the source's band colour to the target's.
  const laneOfKey = {};
  data.items.forEach((a) => { laneOfKey[a.key] = a.lane; });
  const grads = [];
  const paths = tracks.join("") + data.links.map((l, gi) => {
    const a = pos[l.sk], b = pos[l.tk];
    if (!a || !b || (a.folded && b.folded && a.x === b.x)) return "";
    // Out: just after the source's label (past its "→"). In: just before the
    // target's dot (at its "→").
    const sx = a.folded ? a.x : (labelEnd[l.sk] || a.x) + 13;
    const ex = b.folded ? b.x : b.x - 21;   // the incoming "→" sits just left of the box
    const sy = a.y;
    let d, tree = false;
    if (b.parent === l.sk && a.sub === b.sub && !a.folded && !b.folded) {
      // Tree elbow: down from the source's dot, then right into the
      // indented entry's dot, ending in an arrowhead.
      tree = true;
      const px = a.x + 4, cx = b.x;
      d = `M${px},${a.y + 6} V${b.y - 5} Q${px},${b.y} ${px + 5},${b.y} H${cx - 2}`;
    } else if (a.col === b.col && !a.folded && !b.folded && ex - sx > 16) {
      // Same month but the target sits in a sub-column further right: no need
      // to turn around, just a plain forward S-curve like any other line.
      const run = Math.min(70, (ex - sx) * 0.4);
      d = `M${sx},${sy} C${sx + run},${sy} ${ex - run},${b.y} ${ex},${b.y}`;
    } else if (a.col === b.col && !a.folded && !b.folded) {
      // Same month, target underneath (another band): out from the END like
      // every line, round to a run halfway between the two entries, then
      // round into the target's "→".
      {
        const r = 5;
        const vx = Math.max(sx + 2, a.right);
        // The run back sits exactly halfway between the two entries (it's a
        // short run in the space between columns, so it clears the names).
        const gy = (sy + b.y) / 2;
        const hx = Math.min(vx - r, ex + 2);
        // Same curve at both ends, mirrored: out of the source's "→" it
        // bends round to the middle, runs across, and bends round into the
        // target's "→".
        // The bends are round arcs that get wider the further they travel,
        // so a long one is a real curve (not a straight post with corners)
        // and lines leaving the same entry spread apart instead of stacking.
        const w = Math.min(48, 10 + Math.abs(gy - sy) * 0.3);
        const ux = Math.max(sx, hx) + w;
        d = `M${sx},${sy} C${ux},${sy} ${ux},${gy} ${sx},${gy} H${hx}` +
            ` C${ex - w},${gy} ${ex - w},${b.y} ${ex},${b.y}`;
      }
    } else if (ex - sx <= 6) {
      // Neighbours across a column edge: the two "→"s already (nearly) touch.
      // A short straight join if there's any room, else no line at all.
      // Only skip the line when both arrows sit on the same row and touch;
      // on different rows a short S joins them (e.g. Mahjong → Cold Water).
      if (Math.abs(b.y - sy) < 2) {
        if (ex - sx < 2) return "";
        d = `M${sx},${sy} L${ex},${b.y}`;
      } else {
        d = `M${sx},${sy} C${sx + 10},${sy} ${ex - 10},${b.y} ${ex},${b.y}`;
      }
    } else {
      // Target is ahead (to the right): a plain S-curve.
      const run = Math.min(70, (ex - sx) * 0.4);
      d = `M${sx},${sy} C${sx + run},${sy} ${ex - run},${b.y} ${ex},${b.y}`;
    }
    const sl = laneOfKey[l.sk], tl = laneOfKey[l.tk];
    const gx1 = a.folded ? a.x : sx, gx2 = ex;
    grads.push(`<linearGradient id="tlg-${gi}" gradientUnits="userSpaceOnUse" x1="${gx1}" y1="${sy}" x2="${gx2 === gx1 ? gx1 + 1 : gx2}" y2="${b.y}">` +
      `<stop offset="0" style="stop-color:var(--tl-lane-${sl})"/><stop offset="1" style="stop-color:var(--tl-lane-${tl})"/></linearGradient>`);
    return `<path class="tl-link${l.aware ? " is-aware" : ""}"${tree ? ' data-tree="1"' : ""} data-s="${escapeHTML(l.s)}" data-t="${escapeHTML(l.t)}" style="--tl-grad:url(#tlg-${gi})" d="${d}"/>`;
  }).join("");
  canvas.querySelector(".tl-lines defs").insertAdjacentHTML("beforeend", grads.join(""));
  canvas.querySelector(".tl-lines").insertAdjacentHTML("beforeend", paths);

  tlCache = {
    data,
    entryEls: [...canvas.querySelectorAll(".tl-entry")],
    linkEls: [...canvas.querySelectorAll(".tl-link")],
    yearSpans,
  };
  tlUpdateCornerYear();
  // First time it opens, start at the newest (right-hand) end.
  if (!tlState.scrolledOnce) { scroller.scrollLeft = scroller.scrollWidth; tlState.scrolledOnce = true; }
  timelinePaint();
}

// ── Phones: the same timeline, turned upright ─────────────────────────────
// Bands become columns (names pinned along the top), time runs top to bottom
// one row per month (labels pinned down the left), newest at the top. Wider than a phone, so it also scrolls sideways.
const TL_V_BREAK = "(max-width: 560px)";
const TL_V_ROW = 22;       // px per entry
const TL_V_PAD = 8;        // px above/below a month's entries
const TL_V_HEAD = 30;      // px for the pinned band names
const TL_V_GUTTER = 70;    // px for the pinned month labels
const TL_V_COL_MIN = 140;  // px per band column, at least
function tlIsVertical() { return window.matchMedia(TL_V_BREAK).matches; }

function renderTimelineVertical(data, canvas, gutter, scroller) {
  const lanes = TL_LANES.map((_, li) => li).filter((li) => data.items.some((n) => n.lane === li));
  const colW = Math.max(TL_V_COL_MIN, Math.floor((scroller.clientWidth - TL_V_GUTTER - 8) / lanes.length));
  const colX = {};
  lanes.forEach((li, i) => { colX[li] = i * colW; });
  const W = lanes.length * colW + 8;

  const periods = new Map();
  data.items.forEach((n) => { if (!periods.has(n.period)) periods.set(n.period, []); periods.get(n.period).push(n); });
  const keys = [...periods.keys()].sort((a, b) => {
    if (a === "undated" || b === "undated") return a === b ? 0 : a === "undated" ? -1 : 1;   // undated = oldest
    const ya = a.slice(0, 4), yb = b.slice(0, 4);
    if (ya !== yb) return ya.localeCompare(yb);
    return a.length === b.length ? a.localeCompare(b) : a.length === 4 ? 1 : -1;   // year-only after its months
  }).reverse();   // newest month at the top, like a feed

  const html = [], side = [], pos = {};
  let y = TL_V_HEAD;
  keys.forEach((p, ri) => {
    const items = periods.get(p);
    const order = tlMonthOrder(items, data.links);
    const rows = Math.max(...lanes.map((li) => items.filter((n) => n.lane === li).length));
    const h = rows * TL_V_ROW + TL_V_PAD * 2;
    html.push(`<div class="tl-v-row${ri % 2 ? "" : " is-alt"}" style="top:${y}px;height:${h}px;width:${W}px"></div>`);
    const label = p === "undated" ? "Undated" : p.length === 4 ? p : `${MONTH_NAMES[parseInt(p.slice(5, 7), 10) - 1].slice(0, 3)} ${p.slice(0, 4)}`;
    side.push(`<span class="tl-v-when" style="top:${y + TL_V_PAD}px">${escapeHTML(label)}</span>`);
    lanes.forEach((li) => {
      // Newest at the top inside a month too: what something led to sits
      // above it, so every line runs upwards, forward in time.
      items.filter((n) => n.lane === li).sort((a, b) => order[b.key] - order[a.key]).forEach((n, i) => {
        const top = y + TL_V_PAD + i * TL_V_ROW;
        pos[n.key] = { x: colX[li] + 16, y: top + TL_V_ROW / 2, col: li };
        html.push(`<button type="button" class="tl-entry lane-${li}${n.aware ? " is-aware-pos" : ""}${n.ghost ? " is-ghost" : ""}" data-node-id="${escapeHTML(n.id)}" data-period="${escapeHTML(n.period)}"
          style="left:${colX[li] + 6}px;top:${top}px;max-width:${colW - 10}px" title="${escapeHTML(n.label)}">
          <span class="tl-dot" aria-hidden="true"></span><span class="tl-label">${escapeHTML(n.label)}</span></button>`);
      });
    });
    y += h;
  });
  const H = y + 40;

  // Lines run dot to dot and arrive at the target's dot from its left (the
  // arrowhead sits just before the dot). Within one band column they bow out
  // into the gap on the left so they don't run through the other names.
  const curve = (a, b) => {
    if (a.col === b.col) {
      const w = Math.min(12, 5 + Math.abs(b.y - a.y) * 0.02);
      return `M${a.x - 6},${a.y} C${a.x - 6 - w},${a.y} ${b.x - 7 - w},${b.y} ${b.x - 7},${b.y}`;
    }
    const k = Math.max(20, Math.abs(b.y - a.y) * 0.5), dir = b.y < a.y ? -1 : 1;
    return `M${a.x},${a.y + 5 * dir} C${a.x},${a.y + (5 + k) * dir} ${b.x - 40},${b.y} ${b.x - 7},${b.y}`;
  };
  const tracks = [];
  Object.values(data.byId).forEach((list) => {
    for (let i = 1; i < list.length; i++) {
      const a = pos[list[i - 1].key], b = pos[list[i].key];
      if (a && b) tracks.push(`<path class="tl-track" data-node="${escapeHTML(list[i].id)}" d="${curve(a, b)}"/>`);
    }
  });
  const links = data.links.map((l) => {
    const a = pos[l.sk], b = pos[l.tk];
    if (!a || !b || l.sk === l.tk) return "";
    return `<path class="tl-link${l.aware ? " is-aware" : ""}" data-s="${escapeHTML(l.s)}" data-t="${escapeHTML(l.t)}" d="${curve(a, b)}"/>`;
  }).join("");
  const defs = `<defs><marker id="tl-arrow-v" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7"
      markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0.5 L7,4 L0,7.5 Z" class="tl-arrowhead"/></marker></defs>`;
  const head = `<div class="tl-v-head" style="width:${W}px">${lanes.map((li) =>
    `<span style="left:${colX[li] + 6}px;width:${colW - 10}px"><i class="tl-dot lane-${li}"></i>${escapeHTML(TL_LANES[li].name)}</span>`).join("")}</div>`;

  gutter.style.height = H + "px";
  gutter.innerHTML = `<div class="tl-v-corner"></div>` + side.join("");
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  canvas.innerHTML = head + `<svg class="tl-lines" width="${W}" height="${H}" aria-hidden="true">${defs}${tracks.join("")}${links}</svg>` + html.join("");

  tlCache = { data, entryEls: [...canvas.querySelectorAll(".tl-entry")], linkEls: [...canvas.querySelectorAll(".tl-link")] };
  if (!tlState.scrolledOnce) { scroller.scrollTop = 0; scroller.scrollLeft = 0; tlState.scrolledOnce = true; }
  timelinePaint();
}

// The corner above the band names shows the year you're looking at (the one
// at the left edge of the strip), with its entry count; click it to fold that
// year to a single narrow column.
function tlUpdateCornerYear() {
  const el = document.getElementById("tl-corner-year");
  const scroller = document.getElementById("tl-scroll");
  if (!el || !scroller || !tlCache || !tlCache.yearSpans) return;
  const at = scroller.scrollLeft + 20;
  const span = tlCache.yearSpans.find((y) => at >= y.x0 && at < y.x1) || tlCache.yearSpans[tlCache.yearSpans.length - 1];
  if (!span) { el.innerHTML = ""; return; }
  if (el.dataset.year === span.year) return;
  el.dataset.year = span.year;
  el.title = `Fold ${span.year}`;
  el.innerHTML = `<span class="tl-corner-main"><span class="tl-year-caret" aria-hidden="true">▾</span>${escapeHTML(span.year)}</span>` +
    `<span class="tl-corner-count">${span.count} ${span.count === 1 ? "entry" : "entries"}</span>`;
}

// Apply the highlight for the hovered entry, else the one whose card is open.
function timelinePaint() {
  if (!tlCache) return;
  const view = document.getElementById("timeline-view");
  if (!view || view.hidden) return;
  // A newly opened card (e.g. from a link inside the card) scrolls its entry
  // into view, unfolding its year if needed.
  if (detailNodeId !== tlState.lastDetail) {
    const prev = tlState.lastDetail;
    tlState.lastDetail = detailNodeId;
    if (detailNodeId) timelineReveal(detailNodeId, false, tlPickDot(detailNodeId, prev));
    if (!tlCache) return;   // timelineReveal re-rendered (and repainted) already
  }
  const id = tlState.hover || detailNodeId;
  const { up, down } = tlCache.data;
  // The entry plus what it came straight from and led straight to are lit;
  // everything else dims (the trail bar spells out the path further back).
  const direct = id ? new Set([id, ...(up[id] || []), ...(down[id] || [])]) : null;
  // Dots that a drawn line of the selected entry leaves from / arrives at.
  const drawnOut = new Set(), drawnIn = new Set();
  if (id) tlCache.data.links.forEach((l) => {
    if (l.s !== id && l.t !== id) return;
    const p = tlCache.linkEls.find((x) => x.dataset.s === l.s && x.dataset.t === l.t);
    if (!p) return;   // not drawn
    if (p.dataset.tree) return;   // a tree elbow carries its own arrowhead
    drawnOut.add(l.sk);
    drawnIn.add(l.tk);
  });
  view.classList.toggle("has-focus", !!direct);
  // Lit lines take the colour of the selected entry's band.
  const focusItem = id && tlCache.data.items.find((a) => a.id === id);
  if (focusItem) view.style.setProperty("--tl-lit", `var(--tl-lane-${focusItem.lane})`);
  else view.style.removeProperty("--tl-lit");
  view.classList.toggle("show-all", tlState.showAll);
  view.classList.toggle("fade-engaged", tlState.fade.engaged);
  view.classList.toggle("fade-aware", tlState.fade.aware);

  tlCache.entryEls.forEach((el) => {
    const nid = el.dataset.nodeId;
    el.classList.toggle("is-lit", !!direct && direct.has(nid));
    el.classList.toggle("is-current", nid === id);
    // Arrows sit only where a line is actually drawn, dot by dot: "→" after
    // a dot a line leaves from, "→" before a dot a line arrives at. (A
    // "heard of again" link has no line, so it gets no arrow either.)
    const k = `${nid}@${el.dataset.period}`;
    const outHere = !!id && drawnOut.has(k), inHere = !!id && drawnIn.has(k);
    el.classList.toggle("is-source", nid !== id && outHere);
    el.classList.toggle("is-ledto", nid !== id && inHere);
    el.classList.toggle("has-in", nid === id && inHere);
    el.classList.toggle("has-out", nid === id && outHere);
  });
  tlCache.linkEls.forEach((p) => {
    const s = p.dataset.s, t = p.dataset.t;
    const isDirect = !!direct && (s === id || t === id);
    p.classList.toggle("is-lit", isDirect);
    p.classList.toggle("is-in", isDirect && t === id);    // came from → arrives at the entry
    p.classList.toggle("is-out", isDirect && s === id);   // led to → leaves the entry
  });
  document.querySelectorAll("#tl-canvas .tl-track").forEach((t) => t.classList.toggle("is-lit", !!direct && t.dataset.node === id));

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
  if (view.classList.contains("is-vertical")) { box.innerHTML = ""; return; }   // phones: lines are short enough
  // Only the immediate connections (what it came straight from / led straight to).
  const lit = tlCache.entryEls.filter((el) => el.classList.contains("is-lit"));
  // The selected entry's own other dot (heard of ↔ read/watched) counts too.
  const here = tlCache.entryEls.filter((el) => el.classList.contains("is-current"));
  const twin = here.length > 1 ? here : [];
  // The dot you're at: the one you arrived at (is-here), else the labelled
  // main one. Only connections whose line actually touches THAT dot get a
  // marker — e.g. at Gillian Welch's Oct (engaged) dot, Lucinda Williams'
  // line goes to her Feb (aware) dot, so it's not listed until you're there.
  const keyOf = (el) => `${el.dataset.nodeId}@${el.dataset.period}`;
  const atEl = here.find((el) => el.classList.contains("is-here")) || here.find((el) => !el.classList.contains("is-ghost")) || here[0];
  const atKey = atEl ? keyOf(atEl) : null;
  const touching = new Set();
  tlCache.data.links.forEach((l) => {
    if (l.sk === atKey) touching.add(l.tk);
    if (l.tk === atKey) touching.add(l.sk);
  });
  if (!view.classList.contains("has-focus") || !lit.length) { box.innerHTML = ""; return; }
  const left = scroller.scrollLeft, right = left + scroller.clientWidth - TL_GUTTER;
  const top = -scroller.scrollTop;   // markers sit in a layer at the strip's top edge
  const used = { l: [], r: [] };
  const out = [];
  const onScreen = (el) => el.offsetLeft + el.offsetWidth >= left + 12 && el.offsetLeft <= right - 12;
  const shown = new Set(lit.filter(onScreen).map((el) => el.dataset.nodeId));   // any dot of it in view
  const done = new Set();
  twin.forEach((el) => {
    if (el === atEl || onScreen(el)) return;
    const x0 = el.offsetLeft, x1 = x0 + el.offsetWidth;
    const side = x1 < left + 12 ? "l" : x0 > right - 12 ? "r" : null;
    if (!side) return;
    let y = top + el.offsetTop + 2;
    while (used[side].some((u) => Math.abs(u - y) < 20)) y += 20;
    used[side].push(y);
    const id = el.dataset.nodeId, p = el.dataset.period || "undated";
    // Short: it's the selected entry's own other dot, so no need to repeat
    // its name — just which moment and when ("aware · Feb ’26").
    const what = el.classList.contains("is-aware-pos") ? "aware" : "engaged";
    const when = p === "undated" ? "" : ` · ${p.length === 4 ? p : `${MONTH_NAMES[parseInt(p.slice(5, 7), 10) - 1].slice(0, 3)} ’${p.slice(2, 4)}`}`;
    const name = escapeHTML((nodeById[id] || {}).label || id);
    out.push(`<button type="button" class="tl-edge tl-edge-${side} is-self" data-node-id="${escapeHTML(id)}" data-period="${escapeHTML(p)}"
      style="top:${y}px" title="Scroll to ${name} (${what})">${side === "l" ? "← " : ""}${what}${escapeHTML(when)}${side === "r" ? " →" : ""}</button>`);
  });
  lit.forEach((el) => {
    if (el.classList.contains("is-current")) return;
    if (atKey && !touching.has(keyOf(el))) return;
    const id0 = el.dataset.nodeId;
    if (shown.has(id0) || done.has(id0)) return;   // one marker per connection, none if it's visible
    const x0 = el.offsetLeft, x1 = x0 + el.offsetWidth;
    const side = x1 < left + 12 ? "l" : x0 > right - 12 ? "r" : null;
    if (!side) return;
    done.add(id0);
    let y = top + el.offsetTop + 2;
    while (used[side].some((u) => Math.abs(u - y) < 20)) y += 20;   // don't stack on top of each other
    used[side].push(y);
    const id = el.dataset.nodeId;
    const p = el.dataset.period || "undated";
    // "Mar ’26", or just the year for a year-only date.
    const when = p === "undated" ? "" : ` · ${p.length === 4 ? p : `${MONTH_NAMES[parseInt(p.slice(5, 7), 10) - 1].slice(0, 3)} ’${p.slice(2, 4)}`}`;
    const name = escapeHTML((nodeById[id] || {}).label || id);
    out.push(`<button type="button" class="tl-edge tl-edge-${side}${el.classList.contains("is-lit") ? "" : " is-faint"}" data-node-id="${escapeHTML(id)}"
      style="top:${y}px" title="Scroll to ${name}">${side === "l" ? "← " : ""}<span class="tl-edge-name">${name}</span><span class="tl-edge-when">${escapeHTML(when)}${side === "r" ? " →" : ""}</span></button>`);
  });
  // Keep it light: at most two markers per side; any more collapse into a
  // "+N more" pill (clicking it scrolls to the nearest one).
  const keep = { l: 0, r: 0 }, extra = { l: [], r: [] };
  const trimmed = out.filter((html) => {
    const side = html.includes("tl-edge-l") ? "l" : "r";
    if (keep[side] < 2) { keep[side]++; return true; }
    extra[side].push(html.match(/data-node-id="([^"]+)"/)[1]);
    return false;
  });
  ["l", "r"].forEach((side) => {
    const n = extra[side].length;
    if (!n) return;
    const y = Math.max(...used[side].slice(0, 2)) + 20;
    trimmed.push(`<button type="button" class="tl-edge tl-edge-${side} is-faint" data-node-id="${escapeHTML(extra[side][0])}"
      style="top:${y}px">${side === "l" ? "← " : ""}+${n} more${side === "r" ? " →" : ""}</button>`);
  });
  box.innerHTML = trimmed.join("");
}

// Bring an entry into view: unfold its year if it's folded, then, only if it
// isn't already fully visible (clear of the pinned band names), smoothly
// scroll so it sits in the middle.
// Which of an entry's dots to go to when it's opened. A dot clicked directly
// wins; otherwise, if it was reached from a connected entry (a link in the
// card or the trail), the dot that connection is about: arriving from its
// source → the dot that source led to; arriving from something it led to →
// the dot that link left from. Else its latest dot.
function tlPickDot(id, prev) {
  if (tlState.clickedKey && tlState.clickedKey.startsWith(id + "@")) {
    const k = tlState.clickedKey; tlState.clickedKey = null; return k;
  }
  tlState.clickedKey = null;
  if (!prev || !tlCache) return null;
  const l = tlCache.data.links.find((x) => x.s === prev && x.t === id)
         || tlCache.data.links.find((x) => x.s === id && x.t === prev);
  if (!l) return null;
  return l.t === id ? l.tk : l.sk;
}

function timelineReveal(id, force, key) {
  const apps = tlCache && tlCache.data.byId[id];
  if (!apps) return;
  // Unfold any folded year holding one of its dots.
  const years = apps.map((a) => (a.period === "undated" ? "Undated" : a.period.slice(0, 4)));
  if (years.some((y) => tlState.folded.has(y))) {
    years.forEach((y) => tlState.folded.delete(y));
    tlCache = null;
    renderTimeline();          // repaints, which reveals again with the years open
    return;
  }
  // Its latest dot (where you engaged with it, if you have).
  const els = tlCache.entryEls.filter((e) => e.dataset.nodeId === id);
  const want = key && els.find((e) => `${id}@${e.dataset.period}` === key);
  const el = want || els.find((e) => !e.classList.contains("is-ghost")) || els[els.length - 1];
  // The dot you arrived at gets a stronger mark than its other dot(s).
  tlCache.entryEls.forEach((e) => e.classList.toggle("is-here", e === el));
  const scroller = document.getElementById("tl-scroll");
  if (!el || !scroller) return;
  const sr = scroller.getBoundingClientRect(), er = el.getBoundingClientRect();
  const vert = document.getElementById("timeline-view").classList.contains("is-vertical");
  const left = sr.left + (vert ? TL_V_GUTTER : TL_GUTTER), right = sr.right, top = sr.top + (vert ? TL_V_HEAD : 0), bottom = sr.bottom;
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
    if (b) timelineReveal(b.dataset.nodeId, true, b.dataset.period ? `${b.dataset.nodeId}@${b.dataset.period}` : null);
  });
  document.getElementById("tl-scroll").addEventListener("scroll", (e) => {
    // The soft fade beside the band names only shows once something has
    // scrolled under them (at the start it would wash out the first entries).
    view.classList.toggle("is-scrolled-x", e.currentTarget.scrollLeft > 4);
    timelineEdges();
    tlUpdateCornerYear();
  }, { passive: true });

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
    const yearBtn = e.target.closest(".tl-fold-tag");
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
    tlState.clickedKey = `${id}@${el.dataset.period}`;
    const node = (simulation ? simulation.nodes().find((n) => n.id === id) : null) || nodeById[id];
    if (node) openDetail(node, null, true);
  });


  // The key doubles as a filter: click "Engaged" or "Aware" to fade those dots.
  view.querySelectorAll(".tl-key-btn").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.kind;
    tlState.fade[k] = !tlState.fade[k];
    b.setAttribute("aria-pressed", tlState.fade[k] ? "false" : "true");
    b.title = `Click to ${tlState.fade[k] ? "show" : "fade"} ${k}`;
    timelinePaint();
  }));
  document.getElementById("tl-showall").checked = tlState.showAll;   // on by default (browsers may restore an old state)
  document.getElementById("tl-showall").addEventListener("change", (e) => {
    tlState.showAll = e.target.checked;
    timelinePaint();
  });

  let t = null;
  let wasVertical = tlIsVertical();
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const v = tlIsVertical();
      if (v !== wasVertical) { wasVertical = v; tlState.scrolledOnce = false; }   // jump to the newest end again
      renderTimeline();
    }, 120);
  });
})();
