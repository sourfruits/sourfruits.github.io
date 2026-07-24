// Precursors: a force-directed graph of where things were discovered and how
// they personally connect. Reads data/precursors.json (the graph) and, for
// hover labels, data/posts.json (to resolve post_ids to real post titles).
//
// Two views are computed from the *same* dataset at render time:
//   Discovery   — every content node plus synthesized "source" hubs pulled from
//                 discovered_via.source, with source → node edges.
//   Connections — content nodes only, wired by each node's connections array of
//                 bare node ids (plain, symmetric, undirected links).
//
// All colors are set through the site's CSS custom properties (--ink, --muted,
// --line, --accent, --surface), so the graph follows the light/dark theme toggle
// automatically — no hardcoded hex values here.

// ── "Learn more" cards ──────────────────────────────────────────────────────
// Copy for the two cards revealed by the "Learn more" toggle under the tagline.
// Edit the wording here directly — one entry per card: a short label (rendered
// as the green uppercase heading) and the serif body text. Leave a blank line
// between paragraphs and each becomes its own <p>.
const LEARN_MORE_CARDS = [
  {
    label: "Why “precursors”",
    callout: true,   // warm tint + green left-border, so it reads as a distinct aside
    body: `Lorem ipsum placeholder — the quick brown fox jumped over the lazy dog. Replace this with the real Borges "Kafka and His Precursors" explanation later.`,
  },
  {
    label: "How it works",
    body: `Discovery — how I found what I'm interested in, and how my taste evolves.

Connections — how what I'm interested in relates to each other (personal noticed connections, not factual Wikipedia categorization).`,
  },
];

// ── Tunable ────────────────────────────────────────────────────────────────
// Label density and node/label sizing. Edit these defaults, or adjust them live
// via the "Tuning" panel on the page (toggle button in the toolbar) — handy for
// troubleshooting without an edit-and-refresh loop.
const TUNING = {
  // Tier-based labels: a node always shows its label once its "outgoing" (growth)
  // meets the cutoff — all-or-nothing, never split by rank. The cutoff is
  // labelTier, loosened by one per zoom band (see zoomBand1..3), so zooming in
  // reveals successively lower tiers. Everything below the current cutoff is
  // hover-only.
  labelTier: 3,        // min outgoing (growth) to always show a label (most zoomed out)
  zoomBand1: 1.3,      // band breakpoints as multiples of the fitted view (×fit);
  zoomBand2: 1.9,      //   crossing one up loosens the tier by 1 (reveals more labels).
  zoomBand3: 2.8,      //   Relative to fit, so consistent across screens/graphs.
  maxLabelWidth: 170,  // label pixel width (world units) before it's cut off with an ellipsis
  nodeBase: 11,        // leaf/content node radius (world units)
  growthStep: 3,       // + radius per point of downstream influence (uncapped)
  nodeFont: 18,        // content label font (px)
  sourceFont: 15,      // source-hub label font (px)
  // Force-simulation knobs:
  charge: -260,        // many-body repulsion (more negative = nodes push apart harder)
  linkDistance: 90,    // preferred edge length
  collidePad: 22,      // extra spacing beyond each node's radius (collision force)
  linkWidth: 1.4,      // edge stroke width (world units); directional edges draw a touch thicker
};
// ─────────────────────────────────────────────────────────────────────────────

const svg = d3.select("#graph");
const wrap = document.getElementById("graph-wrap");
const tooltip = document.getElementById("graph-tooltip");
const detail = document.getElementById("node-detail");
const legend = document.getElementById("graph-legend");
const status = document.getElementById("status");
const modeButtons = document.querySelectorAll(".mode-btn");
const fsBtn = document.getElementById("graph-fs");
const tuningBtn = document.getElementById("graph-tuning-btn");
const tuningPanel = document.getElementById("tuning-panel");
const resetBtn = document.getElementById("graph-reset");

// Fill the "Learn more" cards from LEARN_MORE_CARDS (see top of file). Each
// card is a green uppercase label plus serif paragraphs split on blank lines.
(function renderLearnMore() {
  const host = document.getElementById("learn-more-cards");
  if (!host) return;
  host.innerHTML = LEARN_MORE_CARDS.map((card) => {
    const paras = card.body.trim().split(/\n\s*\n/).map((p) => {
      const text = p.trim();
      // Colored dot before a mode line, matching the mode-toggle colors: green
      // for Discovery, yellow for Connections. Keyed off the leading word, so
      // only those lines get a dot.
      let dot = "";
      if (/^Discovery\b/.test(text)) dot = `<span class="mode-dot mode-dot--discovery" aria-hidden="true"></span>`;
      else if (/^Connections\b/.test(text)) dot = `<span class="mode-dot mode-dot--connections" aria-hidden="true"></span>`;
      return `<p>${dot}${escapeHTML(text)}</p>`;
    }).join("");
    const cls = card.callout ? "precursors-card precursors-card--callout" : "precursors-card";
    return `<article class="${cls}">` +
      `<div class="precursors-card-label">${escapeHTML(card.label)}</div>` +
      paras +
    `</article>`;
  }).join("");
})();

let rawData = null;      // parsed precursors.json
let postTitles = {};     // post id -> title, for hover labels
let nodeById = {};        // node id -> raw node, for the detail card's lookups
let growthById = {};      // node id -> growth in the current view (nodeById holds
                          // raw nodes, which never carry the computed growth)
let currentMode = "discovery";
let simulation = null;
let detailNodeId = null;  // id of the node whose detail card is open, or null

// Remember where each node settled (by id) so switching modes doesn't reshuffle
// everything — nodes that persist across modes keep roughly their position.
const posCache = new Map();

// The <g> everything is drawn into; d3.zoom transforms this, leaving the <svg>
// itself (and its event surface) fixed.
const zoomLayer = svg.append("g").attr("class", "zoom-layer");
const linkLayer = zoomLayer.append("g").attr("class", "links");
const nodeLayer = zoomLayer.append("g").attr("class", "nodes");

// Preset relationship types for connections. Directional types draw an arrow
// from the origin (the node the connection is written on) and grow the origin
// node; non-directional types are symmetric with no arrow. Each has its own
// line color (a CSS custom property, so it follows the theme) and legend label.
const RELATIONSHIP_TYPES = {
  adaptation: { directional: true,  label: "Adaptation", color: "var(--rel-adaptation)" },
  influence:  { directional: true,  label: "Influence",  color: "var(--rel-influence)" },
  thematic:   { directional: false, label: "Thematic",   color: "var(--rel-thematic)" },
  // Authorship is directional but doesn't grow the author directly; instead it
  // propagates the authored work's own size (one hop) — see buildConnections.
  authorship: { directional: true,  label: "Authorship", color: "var(--rel-authorship)", dashed: true, propagates: true },
  // Discovery is the Discovery view's only edge (source → discovered thing). It
  // reuses the exact directional treatment (arrow, colour, sizing) but is kept
  // out of the Connections legend via discoveryOnly.
  discovery:  { directional: true,  label: "Discovery",  color: "var(--rel-discovery)", discoveryOnly: true },
};

// One arrowhead marker per directional relationship type, coloured to match its
// line. userSpaceOnUse keeps the arrow a fixed size regardless of stroke width.
const defs = svg.append("defs");
Object.entries(RELATIONSHIP_TYPES).forEach(([name, t]) => {
  if (!t.directional) return;
  defs.append("marker")
    .attr("id", `arrow-${name}`)
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 10).attr("refY", 5)
    .attr("markerWidth", 8).attr("markerHeight", 8)
    .attr("markerUnits", "userSpaceOnUse")
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,0 L10,5 L0,10 Z")
    .style("fill", t.color);
});

// While auto-fit is on, the camera reframes the graph each tick. A hand
// pan/zoom (a real gesture → event.sourceEvent set) or a node drag turns it off
// so we don't fight the user; resize, full screen, mode switch, and
// double-click turn it back on.
let autoFit = true;
let currentScale = 1;  // live zoom scale, drives label visibility
let fitScale = 1;      // scale at which the whole graph just fits — the baseline the
                       // zoom bands are measured against, so they're stable across
                       // screen sizes / node counts (band = currentScale / fitScale)
let tuningReadout = null;  // live "zoom …× · band …" line in the tuning panel
const zoom = d3.zoom().scaleExtent([0.1, 4]).on("zoom", (event) => {
  zoomLayer.attr("transform", event.transform);
  currentScale = event.transform.k;
  if (event.sourceEvent) autoFit = false;
  updateLabelVisibility();
});
svg.call(zoom);

// Double-click reframes the graph and re-enables auto-fit.
svg.on("dblclick.zoom", null);
svg.on("dblclick", () => { autoFit = true; fitView(true); });

function size() {
  const rect = wrap.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

const FIT_PADDING = 60;    // generous breathing room around the graph, world units
const MAX_FIT_SCALE = 1.75; // don't zoom a small/sparse graph in too aggressively

// Frame the camera on the nodes' actual bounding box — expanded by each node's
// radius (hub nodes are larger, so their centre isn't enough) plus generous
// padding — so nothing clips at the edge. Applied through d3.zoom so the pan/zoom
// state stays consistent.
function fitView(animate) {
  if (!simulation) return;
  const nodes = simulation.nodes();
  if (!nodes.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x == null || n.y == null) continue;
    const r = nodeRadius(n);
    minX = Math.min(minX, n.x - r); maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r); maxY = Math.max(maxY, n.y + r);
  }
  if (!isFinite(minX)) return;
  const { w, h } = size();
  const boxW = (maxX - minX) + FIT_PADDING * 2;
  const boxH = (maxY - minY) + FIT_PADDING * 2;
  const scale = Math.max(0.1, Math.min(MAX_FIT_SCALE, w / boxW, h / boxH));
  fitScale = scale;   // baseline for the zoom bands (see zoomBand)
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const t = d3.zoomIdentity.translate(w / 2 - scale * cx, h / 2 - scale * cy).scale(scale);
  (animate ? svg.transition().duration(400) : svg).call(zoom.transform, t);
}

// --- graph builders -------------------------------------------------------

// A prettier fallback label for a synthesized source hub, e.g.
// "class-philosophy-denmark" -> "Philosophy Denmark", "friend-maya" -> "Maya".
function sourceLabel(sourceId) {
  const parts = String(sourceId).split("-");
  const rest = parts.slice(1).length ? parts.slice(1) : parts;
  return rest.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

// The leading {type} of a source id ("friend-maya" -> "friend"), used as the
// source hub's kind so it reads sensibly on hover.
function sourceType(sourceId) {
  return String(sourceId).split("-")[0] || "source";
}

// A node's discovered_via as a normalized array of { source, note?, date? }.
// Tolerates the old single-object form as well as a missing field. Entries need
// not carry a source — a source-less entry (date/note only) means the thing
// entered awareness with no traceable origin; it draws no edge but still counts
// as a discovery (the node shows as an orphan in Discovery view).
function discoveredVia(node) {
  const dv = node.discovered_via;
  const arr = Array.isArray(dv) ? dv : (dv ? [dv] : []);
  return arr.filter((d) => d && (d.source || d.note || d.date));
}

// Display label for a discovery source: another node's real label when the
// source is a node id, otherwise the prettified source-string label.
function sourceDisplay(src) {
  return nodeById[src] ? nodeById[src].label : sourceLabel(src);
}

// Format a discovery date at whatever precision it was given: "2024" (year),
// "2026-03" (→ "Mar 2026"), or a full "2026-03-14" (→ "Mar 14, 2026").
function formatDiscoveryDate(s) {
  if (!s) return "";
  const parts = String(s).split("-");
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) {
    const d = new Date(+parts[0], +parts[1] - 1, 1);
    return isNaN(d) ? String(s) : d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  }
  return formatDate(s);  // full ISO date — shared helper from utils.js
}

// Discovery view: only the nodes involved in discovery — every unique
// discovered_via source (deduped) plus every node that has a discovered_via —
// wired by directional source → discovered-thing edges. A `source` matching an
// existing node id draws straight from that node; anything else synthesizes a
// shared source hub.
//
// discovered_via is an ARRAY of { source, note?, date? } (a node can be
// discovered through more than one independent path at once), so we draw one
// edge per entry. Edges are typed "discovery", so they reuse the Connections
// view's directional treatment wholesale (arrow marker, colour, width,
// out-degree sizing). Sources grow with out-degree via the same nodeRadius
// growth function, and carry the list of what they led to for their detail card.
function buildDiscovery(data) {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const included = new Map();  // graph node id -> node object
  const links = [];
  const ledTo = new Map();     // source graph id -> [{ to, note }]

  const includeContent = (id) => {
    if (!included.has(id)) included.set(id, { ...byId.get(id), isSource: false, growth: 0 });
    return included.get(id);
  };
  const includeHub = (src) => {
    const id = `source:${src}`;
    if (!included.has(id)) {
      included.set(id, { id, label: sourceLabel(src), kind: sourceType(src), isSource: true, post_ids: [], growth: 0 });
    }
    return included.get(id);
  };

  data.nodes.forEach((n) => {
    const entries = discoveredVia(n);
    if (!entries.length) return;
    includeContent(n.id);  // every node with a discovered_via appears — orphan if all its entries are source-less
    entries.forEach((dv) => {
      const src = dv.source;
      if (!src || src === n.id) return;  // source-less (or self): no edge, node stays as an orphan
      const note = dv.note || "";
      // "aware" (just heard of it) vs "engaged" (sat down with it); defaults to
      // engaged. Aware edges draw dashed. Every entry draws its own edge — a
      // node can have two (a distinct earlier "aware" and a later "engaged").
      const strength = dv.strength === "aware" ? "aware" : "engaged";
      const sourceId = byId.has(src) ? includeContent(src).id : includeHub(src).id;
      links.push({ source: sourceId, target: n.id, type: "discovery", directional: true, kind: "connection", note, strength });
      if (!ledTo.has(sourceId)) ledTo.set(sourceId, []);
      ledTo.get(sourceId).push({ to: n.id, note });
    });
  });

  // A source grows with how many things it led to (same growth → radius as a
  // Connections hub) and carries that list for its "Led to" card section.
  ledTo.forEach((list, sourceId) => {
    const node = included.get(sourceId);
    node.growth = list.length;
    node.discoveryOut = list;
  });

  return { nodes: [...included.values()], links };
}

// Connections view: content nodes, wired by each node's `connections` array.
// Each entry is a bare node id (an untyped, plain link) or an object
// { to, relationship } whose `relationship` is one of the preset types.
//
// We gather every entry per node pair, then resolve each pair to one edge:
//   - untyped / non-directional types  → one symmetric line (dedup, no warning)
//   - a single directional origin      → an arrow from that origin
//   - directional on BOTH sides        → can't tell the origin, so warn and fall
//                                         back to a plain undirected line
// Directional edges also count toward their origin node's size (out-degree).
function buildConnections(data) {
  const nodes = data.nodes.map((n) => ({ ...n, isSource: false, growth: 0 }));
  const known = new Set(nodes.map((n) => n.id));
  const pairs = new Map();  // normalized "a b" key -> array of entries

  data.nodes.forEach((node) => {
    (node.connections || []).forEach((c) => {
      const to = typeof c === "string" ? c : c && c.to;
      if (!to || to === node.id) return;                   // ignore blanks/self-loops
      if (!known.has(node.id) || !known.has(to)) return;    // skip dangling refs
      let type = typeof c === "object" && typeof c.relationship === "string"
        ? c.relationship.trim() : "";
      if (type && !RELATIONSHIP_TYPES[type]) {
        console.warn(`precursors: unknown relationship "${type}" on ${node.id} → ${to}; treating as untyped.`);
        type = "";
      }
      const note = typeof c === "object" && typeof c.note === "string" ? c.note : "";
      const key = [node.id, to].sort().join(" ");
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push({ from: node.id, to, type, note });
    });
  });

  const edges = [];
  pairs.forEach((entries) => {
    const directional = entries.filter((e) => e.type && RELATIONSHIP_TYPES[e.type].directional);
    // First note written for this pair (nodes order) wins, whichever side it's on.
    const note = (entries.find((e) => e.note) || {}).note || "";
    let edge;
    if (directional.length === 0) {
      // Untyped or non-directional: symmetric line. Prefer a typed entry's label.
      const typed = entries.find((e) => e.type) || entries[0];
      edge = { source: typed.from, target: typed.to, type: typed.type, directional: false, kind: "connection" };
    } else {
      const origins = new Set(directional.map((e) => e.from));
      if (origins.size > 1) {
        // Directional written from both ends — don't guess a direction.
        const [a, b] = [...origins];
        console.warn(`precursors: directional relationship on both sides of ${a} ↔ ${b}; drawing a plain line instead of guessing the direction.`);
        edge = { source: directional[0].from, target: directional[0].to, type: "", directional: false, kind: "connection" };
      } else {
        const d = directional[0];
        edge = { source: d.from, target: d.to, type: d.type, directional: true, kind: "connection" };
      }
    }
    edge.note = note;
    edges.push(edge);
  });

  // --- node size (growth) ---
  // growth = a node's downstream influence, and it drives both node size and the
  // hover/card "outgoing" count. It counts the node's own outgoing influence /
  // adaptation edges; authorship links themselves DON'T count, but instead each
  // authored work's OWN influence/adaptation reach is added — exactly one hop, so
  // a work's downstream (third-level) activity never cascades back. So if work1
  // influenced derivative1, that's +1 outgoing for work1 AND for work1's author.
  const sizeOut = new Map();    // id -> influence/adaptation out-degree
  const authored = new Map();   // id -> [ids of works it authored]
  edges.forEach((e) => {
    if (!e.directional) return;
    if (RELATIONSHIP_TYPES[e.type].propagates) {
      if (!authored.has(e.source)) authored.set(e.source, []);
      authored.get(e.source).push(e.target);
    } else {
      sizeOut.set(e.source, (sizeOut.get(e.source) || 0) + 1);
    }
  });
  nodes.forEach((n) => {
    let g = sizeOut.get(n.id) || 0;
    (authored.get(n.id) || []).forEach((workId) => { g += sizeOut.get(workId) || 0; });
    n.growth = g;
  });

  return { nodes, links: edges };
}

// --- rendering ------------------------------------------------------------

// Every node — content or discovery source hub — sizes the same way: a base
// radius plus growth per point of downstream influence (uncapped), so influential
// origins and prolific sources read as larger.
function nodeRadius(d) {
  return TUNING.nodeBase + (d.growth || 0) * TUNING.growthStep;
}

// Label font size (world units) for a node.
function labelFontSize(d) {
  return d.isSource ? TUNING.sourceFont : TUNING.nodeFont;
}

// Current discrete zoom band: 0 (fitted / most zoomed out) up to 3 (most zoomed
// in). Measured as how far zoomed in *relative to the fitted view* (currentScale
// / fitScale), so the bands mean the same thing on any screen size or graph — a
// breakpoint of 1.5 = "1.5× more zoomed-in than the fitted view."
function zoomRatio() {
  return fitScale ? currentScale / fitScale : currentScale;
}
function zoomBand() {
  const r = zoomRatio();
  if (r >= TUNING.zoomBand3) return 3;
  if (r >= TUNING.zoomBand2) return 2;
  if (r >= TUNING.zoomBand1) return 1;
  return 0;
}
// The growth cutoff for labels right now: the base tier, loosened by one per
// zoom band. Fixed within a band; drops (revealing a lower tier) only when a
// band boundary is crossed. Clamped at 0 (top band shows every label).
function effectiveTier() {
  return Math.max(0, TUNING.labelTier - zoomBand());
}
// All-or-nothing per tier: a node shows its label if hovered, or if its outgoing
// (growth) meets the current cutoff. No partial/percentage splitting of a tie.
function labelVisible(d) {
  return d.__hover === true || (d.growth || 0) >= effectiveTier();
}
function updateLabelVisibility() {
  nodeLayer.selectAll("g.node").select("text")
    .style("opacity", (d) => (labelVisible(d) ? 1 : 0));
  updateTuningReadout();
}

// Live line in the tuning panel showing the current zoom (relative to fit), the
// band it lands in, and the resulting label cutoff — so the bands can be
// calibrated by watching real numbers instead of guessing at scales.
function updateTuningReadout() {
  if (!tuningReadout) return;
  tuningReadout.textContent =
    `zoom ${zoomRatio().toFixed(2)}× · band ${zoomBand()} · labels ≥ ${effectiveTier()} outgoing`;
}

// Measure a string's rendered width (world units) at a given font size, using an
// offscreen canvas with the site's sans stack. Cached context, so it's cheap.
const _measureCtx = document.createElement("canvas").getContext("2d");
function measureTextWidth(s, fs) {
  _measureCtx.font = `${fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  return _measureCtx.measureText(s).width;
}

// Cut a label to TUNING.maxLabelWidth *pixels* (not characters) with an ellipsis,
// trimming from the end until it fits. The full name is still available on hover
// (the tooltip uses the untruncated d.label).
function truncateLabel(s, fs) {
  s = String(s);
  const max = TUNING.maxLabelWidth;
  if (measureTextWidth(s, fs) <= max) return s;
  let out = s;
  while (out.length > 1 && measureTextWidth(out + "…", fs) > max) {
    out = out.slice(0, -1);
  }
  return out.trimEnd() + "…";
}

// A person node = author / philosopher / director by kind, or anything that
// authored something (an outgoing authorship link). Used to abbreviate names.
function isPersonNode(d) {
  const kind = (d.kind || "").toLowerCase();
  if (kind === "author" || kind === "philosopher" || kind === "director") return true;
  return Array.isArray(d.connections) &&
    d.connections.some((c) => c && typeof c === "object" && c.relationship === "authorship");
}

// The label as drawn in the graph. For a person with a full first + last name,
// shorten to "F. Lastname" (e.g. "Fyodor Dostoevsky" → "F. Dostoevsky") to cut
// label length and collisions. The full name is untouched on hover / in the
// detail card (those read d.label directly).
function graphLabel(d) {
  const full = String(d.label || "");
  if (!isPersonNode(d)) return full;
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  const initial = parts[0].charAt(0).toUpperCase();
  return `${initial}. ${parts[parts.length - 1]}`;
}

// The line color for an edge: its relationship type's color, the neutral
// "thematic" color for an untyped connection, or muted grey for discovery edges.
function edgeColor(d) {
  if (d.type && RELATIONSHIP_TYPES[d.type]) return RELATIONSHIP_TYPES[d.type].color;
  return d.kind === "connection" ? "var(--rel-thematic)" : "var(--muted)";
}

// The hover label for a typed connection ("" for untyped/discovery edges).
function edgeLabel(d) {
  return d.type && RELATIONSHIP_TYPES[d.type] ? RELATIONSHIP_TYPES[d.type].label : "";
}

// Whether an edge is drawn dashed: authorship connections, and "aware" discovery
// edges (a weaker, "just heard of it" link) — same dashed style for both.
function edgeDashed(d) {
  if (d.strength === "aware") return true;
  return !!(d.type && RELATIONSHIP_TYPES[d.type] && RELATIONSHIP_TYPES[d.type].dashed);
}

// Where a directional line should stop: the target node's centre pulled back by
// its radius (plus a gap), leaving room for the arrowhead at the node's edge.
function edgeEnd(d) {
  const gap = nodeRadius(d.target) + 3;
  const dx = d.target.x - d.source.x;
  const dy = d.target.y - d.source.y;
  const dist = Math.hypot(dx, dy) || 1;
  return { x: d.target.x - (dx / dist) * gap, y: d.target.y - (dy / dist) * gap };
}

// Hover card: just title, kind, and the connection counts — a quick glance.
// Posts and the full connection list live in the click-to-open detail card.
function nodeTooltipHTML(d) {
  let html = `<strong>${escapeHTML(d.label)}</strong>`;
  if (d.kind) html += `<span class="tip-kind">${escapeHTML(d.kind)}</span>`;
  const author = authorInfo(d);
  if (author) html += `<span class="tip-by">by ${escapeHTML(author.name)}</span>`;
  const n = d.degree || 0;
  let meta = `${n} connection${n === 1 ? "" : "s"}`;
  // Downstream influence originating here — things it influenced / adapted, plus
  // (via authorship, one hop) what its authored works influenced. Same number
  // that drives node size. Only shown when there is any.
  const out = d.growth || 0;
  if (out) meta += ` · ${out} outgoing →`;
  html += `<span class="tip-degree">${meta}</span>`;
  return html;
}

function showTooltip(html, event) {
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  moveTooltip(event);
}

// Place a floating element (tooltip or detail card) just off the cursor, on the
// same side of it as the cursor sits in the frame: cursor in the left half →
// card to its left, right half → to its right (likewise top/bottom). Flip to the
// other side only when that side would run past the wall. A final clamp keeps it
// fully inside the frame.
function placeNearCursor(el, event, gap, pad) {
  const p = wrap.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  const cx = event.clientX - p.left, cy = event.clientY - p.top;

  let left;
  if (cx < p.width / 2) {
    left = cx - gap - w;                                   // same side: left
    if (left < pad) left = cx + gap;                       // no room → flip right
  } else {
    left = cx + gap;                                       // same side: right
    if (left + w > p.width - pad) left = cx - gap - w;     // no room → flip left
  }

  let top;
  if (cy < p.height / 2) {
    top = cy - gap - h;                                    // same side: above
    if (top < pad) top = cy + gap;                         // no room → flip below
  } else {
    top = cy + gap;                                        // same side: below
    if (top + h > p.height - pad) top = cy - gap - h;      // no room → flip above
  }

  left = Math.max(pad, Math.min(left, p.width - w - pad));
  top = Math.max(pad, Math.min(top, p.height - h - pad));
  el.style.left = left + "px";
  el.style.top = top + "px";
}

function moveTooltip(event) {
  placeNearCursor(tooltip, event, 14, 8);
}

function hideTooltip() {
  tooltip.hidden = true;
}

// --- node detail card ------------------------------------------------------
// Click a node to open a persistent card with its full details. It's a plain
// surface floated in the graph's corner (quiet style: thin dividers, no shadow)
// and doesn't capture events over the rest of the graph, so the graph stays
// pannable/hoverable around it. Escape or the × dismisses it; clicking the same
// node toggles it shut.

// The authoring node (author/director) whose authorship connection points at
// this node, or null. Authorship is written on the author, aimed at the work.
function authorOf(node) {
  for (const n of rawData.nodes) {
    for (const c of n.connections || []) {
      const to = typeof c === "string" ? c : c && c.to;
      if (to === node.id && typeof c === "object" && c.relationship === "authorship") return n;
    }
  }
  return null;
}

// The author/director for a node: a real node linked by an authorship
// connection if there is one (role from that node's kind), else the node's own
// plain `author` string (role from this node's kind — Director for a film,
// Author otherwise). Returns { name, role } or null. Shared by the hover and card.
function authorInfo(node) {
  const authorNode = authorOf(node);
  if (authorNode) {
    return { name: authorNode.label, role: authorNode.kind === "director" ? "Director" : "Author" };
  }
  if (typeof node.author === "string" && node.author.trim()) {
    return { name: node.author.trim(), role: node.kind === "film" ? "Director" : "Author" };
  }
  return null;
}

// Every connection touching this node, gathered from both ends of the dataset:
// the ones written on it (outgoing) and the ones on other nodes aimed at it
// (incoming). Incoming authorship is left out — it's shown as the author line.
// Dangling refs and unknown relationship types are dropped/neutralised.
function connectionsFor(node) {
  const out = [];
  const push = (otherId, rel, note, dir) => {
    const other = nodeById[otherId];
    if (!other) return;
    out.push({ other, rel: rel && RELATIONSHIP_TYPES[rel] ? rel : "", note: note || "", dir });
  };
  (node.connections || []).forEach((c) => {
    const to = typeof c === "string" ? c : c && c.to;
    if (!to || to === node.id) return;
    const rel = typeof c === "object" && c.relationship ? c.relationship : "";
    const note = typeof c === "object" && c.note ? c.note : "";
    push(to, rel, note, "out");
  });
  rawData.nodes.forEach((n) => {
    if (n.id === node.id) return;
    (n.connections || []).forEach((c) => {
      const to = typeof c === "string" ? c : c && c.to;
      if (to !== node.id) return;
      const rel = typeof c === "object" && c.relationship ? c.relationship : "";
      if (rel === "authorship") return;  // shown as the author/director line
      const note = typeof c === "object" && c.note ? c.note : "";
      push(n.id, rel, note, "in");
    });
  });
  return out;
}

// One connection row: relationship label (coloured to match its edge) with a
// direction glyph for directional types, the other node's name, and any note.
function connectionRowHTML(c) {
  const t = c.rel && RELATIONSHIP_TYPES[c.rel];
  const relLabel = t ? t.label : "Connection";
  const relColor = t ? t.color : "var(--rel-thematic)";
  const glyph = t && t.directional ? (c.dir === "out" ? " →" : " ←") : "";
  // For outgoing links, show how much the target influenced on its own — this is
  // the same downstream count that rolls up into this node's "outgoing" total
  // (e.g. an authored work's own influence), so the number is explained without
  // listing every derivative. Shown on the relationship row.
  const onward = c.dir === "out" ? (growthById[c.other.id] || 0) : 0;
  let html = `<div class="detail-conn">`;
  html += `<span class="detail-conn-rel" style="color:${relColor}">${escapeHTML(relLabel)}${glyph}`;
  if (onward) html += ` <span class="detail-conn-onward" title="${onward} downstream influence${onward === 1 ? "" : "s"}">+${onward}</span>`;
  html += `</span>`;
  html += `<span class="detail-conn-name">${escapeHTML(c.other.label)}</span>`;
  if (c.note) html += `<div class="detail-conn-note">${escapeHTML(c.note)}</div>`;
  html += `</div>`;
  return html;
}

// The card's list section, which differs by mode. In Discovery it's "Led to"
// (the node's outgoing discovery edges); in Connections it's the connection
// relationships with the total/outgoing stats. Returns { rows, label } — rows
// are connectionRowHTML-shaped so the same component renders both.
function cardConnections(node) {
  if (currentMode === "discovery") {
    const rows = (node.discoveryOut || [])
      .map((d) => ({ other: nodeById[d.to], rel: "discovery", note: d.note || "", dir: "out" }))
      .filter((r) => r.other);
    return { rows, label: `Led to (${rows.length})` };
  }
  const rows = connectionsFor(node);
  let label = `Connections (${rows.length})`;
  // Same downstream-influence count as node size / the hover card.
  const out = growthById[node.id] || node.growth || 0;
  if (out) label += ` · ${out} outgoing →`;
  return { rows, label };
}

function openDetail(node, event) {
  detailNodeId = node.id;

  // Header — always visible; the connections list below it scrolls, not this.
  let html = `<button type="button" class="detail-close" aria-label="Close detail">×</button>`;
  html += `<h2 class="detail-title">${escapeHTML(node.label)}</h2>`;
  if (node.kind) html += `<div class="detail-kind">${escapeHTML(node.kind)}</div>`;

  // Author/director line (see authorInfo for how it's resolved).
  const author = authorInfo(node);
  if (author) {
    html += `<div class="detail-meta-row"><span class="detail-meta-label">${author.role}</span> ${escapeHTML(author.name)}</div>`;
  }

  // "Discovered via" is a Discovery-mode section — omitted in Connections. One
  // entry reads as a single line; more than one becomes a small list (same
  // pattern as Posts). A source-less entry shows an em-dash; its note still
  // explains the untraceable origin.
  const dvs = discoveredVia(node);
  const dvLabel = (d) => (d.source ? escapeHTML(sourceDisplay(d.source)) : "—");
  const dvDate = (d) => (d.date ? ` <span class="detail-dv-date">· ${escapeHTML(formatDiscoveryDate(d.date))}</span>` : "");
  if (currentMode === "discovery" && dvs.length === 1) {
    const d = dvs[0];
    html += `<div class="detail-meta-row"><span class="detail-meta-label">Discovered via</span> ${dvLabel(d)}${dvDate(d)}</div>`;
    if (d.note) html += `<div class="detail-meta-note">${escapeHTML(d.note)}</div>`;
  } else if (currentMode === "discovery" && dvs.length > 1) {
    const items = dvs.map((d) => {
      let li = `<li>${dvLabel(d)}${dvDate(d)}`;
      if (d.note) li += `<div class="detail-meta-note">${escapeHTML(d.note)}</div>`;
      return li + `</li>`;
    }).join("");
    html += `<div class="detail-discovered"><div class="detail-section-label">Discovered via (${dvs.length})</div>` +
            `<ul class="detail-dv-list">${items}</ul></div>`;
  }

  // List section — "Led to" in Discovery, "Connections" in Connections (see
  // cardConnections). The label stays put; the list is capped to 3 rows and
  // scrolls internally.
  const { rows: conns, label: connLabel } = cardConnections(node);
  if (conns.length) {
    html += `<div class="detail-conn-section">` +
            `<div class="detail-section-label">${connLabel}</div>` +
            `<div class="detail-connections">${conns.map(connectionRowHTML).join("")}</div>` +
            `</div>`;
  }

  // Posts — always a labelled list when present (even a single one); each title
  // its own link, truncated by rendered width via CSS ellipsis.
  const postIds = node.post_ids || [];
  if (postIds.length) {
    const items = postIds.map((id) => {
      const title = postTitles[id] || id;
      return `<li><a class="detail-post-link" href="post.html?id=${encodeURIComponent(id)}" title="${escapeHTML(title)}">${escapeHTML(title)}</a></li>`;
    }).join("");
    html += `<div class="detail-posts"><div class="detail-section-label">Posts (${postIds.length})</div>` +
            `<ul class="detail-post-list">${items}</ul></div>`;
  }

  detail.innerHTML = html;
  detail.hidden = false;

  // Restart the pop-in animation on every open — including node-to-node, where
  // the card never leaves the DOM (toggling `hidden` alone wouldn't replay it).
  detail.style.animation = "none";
  void detail.offsetWidth;  // force reflow so the animation retriggers
  detail.style.animation = "";

  // Cap the connections list at 3 rows, then let the rest scroll. Measured from
  // the rendered rows (not a fixed height) so notes are counted too.
  const connEl = detail.querySelector(".detail-connections");
  if (connEl) {
    connEl.style.maxHeight = "";
    const rows = connEl.querySelectorAll(".detail-conn");
    if (rows.length > 3) {
      const top = connEl.getBoundingClientRect().top;
      const cut = rows[2].getBoundingClientRect().bottom;
      connEl.style.maxHeight = Math.ceil(cut - top) + "px";
    }
  }

  // Open just off the cursor, toward the roomier side (see placeNearCursor).
  // Measured after layout so it uses the card's real size. Falls back to the CSS
  // corner when there's no click position.
  if (event) placeNearCursor(detail, event, 14, 12);

  detail.querySelector(".detail-close").addEventListener("click", closeDetail);
  updateNodeSelection();
}

function closeDetail() {
  if (!detail) return;
  detail.hidden = true;
  detailNodeId = null;
  updateNodeSelection();
}

// Highlight the node whose card is open (a gentle scale-up — see CSS), and clear
// it from every other node.
function updateNodeSelection() {
  nodeLayer.selectAll("g.node").classed("is-selected", (d) => d.id === detailNodeId);
}

// Click a node to open its card near the cursor; clicking it again dismisses it.
function toggleDetail(node, event) {
  if (detailNodeId === node.id) closeDetail();
  else openDetail(node, event);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && detail && !detail.hidden) closeDetail();
});

// Drag the card by its header to move it out of the way — dragging over the
// scrollable lists or a link/button does its normal thing instead. Position is
// kept in the graph-wrap's own coordinates and clamped to stay inside it.
if (detail) {
  let cardDrag = null;
  detail.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".detail-connections, .detail-posts, a, button")) return;
    const rect = detail.getBoundingClientRect();
    cardDrag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    detail.classList.add("is-dragging");
    detail.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  detail.addEventListener("pointermove", (e) => {
    if (!cardDrag) return;
    const p = wrap.getBoundingClientRect();
    const left = Math.max(0, Math.min(e.clientX - p.left - cardDrag.dx, p.width - detail.offsetWidth));
    const top = Math.max(0, Math.min(e.clientY - p.top - cardDrag.dy, p.height - detail.offsetHeight));
    detail.style.left = left + "px";
    detail.style.top = top + "px";
  });
  const endCardDrag = (e) => {
    if (!cardDrag) return;
    cardDrag = null;
    detail.classList.remove("is-dragging");
    if (detail.hasPointerCapture && detail.hasPointerCapture(e.pointerId)) detail.releasePointerCapture(e.pointerId);
  };
  detail.addEventListener("pointerup", endCardDrag);
  detail.addEventListener("pointercancel", endCardDrag);
}

function render(mode) {
  closeDetail();  // node objects are rebuilt here; drop any stale open card

  const graph = mode === "connections"
    ? buildConnections(rawData)
    : buildDiscovery(rawData);

  const { w, h } = size();
  autoFit = true;  // reframe this fresh layout as it settles

  // Count each node's connections in this view (edges touching it), for the
  // hover card. Done now, while link endpoints are still plain ids. Incoming
  // authorship is folded into the work's "director/author" line (not shown or
  // counted as a connection), so it doesn't add to the target's count — keeping
  // the hover count in step with the expanded card's "Connections (N)".
  const degree = new Map();
  graph.links.forEach((l) => {
    const s = idOf(l.source), t = idOf(l.target);
    degree.set(s, (degree.get(s) || 0) + 1);
    if (l.type === "authorship") return;   // don't count it on the authored work
    degree.set(t, (degree.get(t) || 0) + 1);
  });
  graph.nodes.forEach((n) => { n.degree = degree.get(n.id) || 0; });

  // Expose this view's growth by id so the detail card (whose rows resolve
  // through nodeById → raw nodes) can show each target's own downstream count.
  growthById = {};
  graph.nodes.forEach((n) => { growthById[n.id] = n.growth || 0; });

  // Seed positions from the cache (or the center) so the layout doesn't jump
  // when toggling modes.
  graph.nodes.forEach((n) => {
    const cached = posCache.get(n.id);
    if (cached) { n.x = cached.x; n.y = cached.y; }
    else { n.x = w / 2 + (Math.random() - 0.5) * 80; n.y = h / 2 + (Math.random() - 0.5) * 80; }
  });

  // --- links ---
  const link = linkLayer.selectAll("line.link")
    .data(graph.links, linkKey);
  link.exit().remove();
  const linkEnter = link.enter().append("line").attr("class", "link");
  const linkAll = linkEnter.merge(link)
    .attr("class", "link")
    .attr("marker-end", (d) => (d.directional ? `url(#arrow-${d.type})` : null))
    .style("stroke", edgeColor)
    .style("stroke-opacity", (d) => (d.type ? 0.85 : 0.4))
    .style("stroke-width", (d) => (d.directional ? TUNING.linkWidth + 0.6 : TUNING.linkWidth))
    .style("stroke-dasharray", (d) => (edgeDashed(d) ? "5 4" : null));

  // Transparent, thick hit lines so thin edges are still easy to hover.
  const hit = linkLayer.selectAll("line.link-hit")
    .data(graph.links, linkKey);
  hit.exit().remove();
  const hitAll = hit.enter().append("line")
    .attr("class", "link-hit")
    .style("stroke", "transparent")
    .style("stroke-width", 12)
    .merge(hit);
  hitAll
    .style("cursor", (d) => (edgeLabel(d) || d.note ? "help" : "default"))
    .on("mouseenter", (event, d) => {
      let html = "";
      // Typed connections show their relationship label (coloured to match the
      // line); untyped ones show nothing. Discovery edges may carry a note.
      const label = edgeLabel(d);
      if (label) html += `<span class="tip-rel" style="color:${edgeColor(d)}">${escapeHTML(label)}</span>`;
      if (d.note) html += `<span class="tip-note">${escapeHTML(d.note)}</span>`;
      if (html) showTooltip(html, event);
    })
    .on("mousemove", (event, d) => { if (edgeLabel(d) || d.note) moveTooltip(event); })
    .on("mouseleave", hideTooltip);

  // --- nodes ---
  const node = nodeLayer.selectAll("g.node")
    .data(graph.nodes, (d) => d.id);
  node.exit().remove();

  const nodeEnter = node.enter().append("g").attr("class", "node");
  nodeEnter.append("circle");
  nodeEnter.append("text");

  const nodeAll = nodeEnter.merge(node)
    .attr("class", (d) => `node${d.isSource ? " is-source" : ""}`);

  // Content nodes are yellow in Connections view, green in Discovery view;
  // source hubs stay hollow in both. (The stroke follows the fill.)
  const contentFill = mode === "connections" ? "var(--accent2)" : "var(--accent)";
  const contentStroke = mode === "connections" ? "var(--accent2)" : "var(--accent-ink)";
  nodeAll.select("circle")
    .attr("r", nodeRadius)
    .style("fill", (d) => (d.isSource ? "var(--bg)" : contentFill))
    .style("stroke", (d) => (d.isSource ? "var(--muted)" : contentStroke))
    .style("stroke-width", (d) => (d.isSource ? 1.5 : 1))
    .style("stroke-dasharray", (d) => (d.isSource ? "3 2" : null));

  // Label position (x/y/anchor) is set per tick by positionLabels, so it points
  // outward from the graph's centre.
  nodeAll.select("text")
    .text((d) => truncateLabel(graphLabel(d), labelFontSize(d)))
    .style("fill", (d) => (d.isSource ? "var(--muted)" : "var(--ink)"))
    .style("font-family", "var(--font-sans)")
    .style("font-size", (d) => labelFontSize(d) + "px");

  nodeAll
    // Hover shows the small tooltip card; clicking a node opens the expanded
    // detail card (toggle). Dragging dismisses both (see dragStart).
    .on("mouseenter", (event, d) => { d.__hover = true; updateLabelVisibility(); showTooltip(nodeTooltipHTML(d), event); })
    .on("mousemove", moveTooltip)
    .on("mouseleave", (event, d) => { d.__hover = false; updateLabelVisibility(); hideTooltip(); })
    .on("click", (event, d) => { event.stopPropagation(); hideTooltip(); toggleDetail(d, event); })
    // clickDistance lets a tiny pointer jitter still register as a click (open the
    // card) rather than being swallowed as a drag gesture.
    .call(d3.drag()
      .clickDistance(6)
      .on("start", dragStart)
      .on("drag", dragMove)
      .on("end", dragEnd));

  // --- simulation ---
  // No containment wall: centering + repulsion keep a reasonable natural spread,
  // and the camera auto-fits to wherever the nodes actually settle.
  if (simulation) simulation.stop();
  simulation = d3.forceSimulation(graph.nodes)
    .force("link", d3.forceLink(graph.links).id((d) => d.id).distance(TUNING.linkDistance).strength(0.5))
    .force("charge", d3.forceManyBody().strength(TUNING.charge))
    .force("center", d3.forceCenter(w / 2, h / 2))
    .force("collide", d3.forceCollide().radius((d) => nodeRadius(d) + TUNING.collidePad))
    .force("labels", forceLabelSeparation())
    .on("tick", () => {
      linkAll
        .attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
        // Directional lines stop at the node's edge to make room for the arrow;
        // plain lines run to the centre (the node circle covers the join).
        .attr("x2", (d) => (d.directional ? edgeEnd(d).x : d.target.x))
        .attr("y2", (d) => (d.directional ? edgeEnd(d).y : d.target.y));
      hitAll
        .attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
      nodeAll.attr("transform", (d) => {
        posCache.set(d.id, { x: d.x, y: d.y });
        return `translate(${d.x},${d.y})`;
      });
      positionLabels(graph.nodes, nodeAll);
      if (autoFit) fitView(false);
    })
    // One more fit once it settles, in case the last tick lagged the final layout.
    .on("end", () => { if (autoFit) fitView(false); });
  simulation.alpha(0.9).restart();

  renderLegend(mode);
  updateLabelVisibility();
}

// Place each node's label toward its most open side — the direction away from
// the surrounding crowd of nearby nodes/labels — rather than always fanning out
// from the centre. The open-space direction (d.__ldx/__ldy) is computed once per
// tick by forceLabelSeparation, reusing that scan; here we just read it. Falls
// back to the outward-from-centroid direction before the first scan has run.
function positionLabels(nodes, sel) {
  if (!nodes.length) return;
  let sx = 0, sy = 0;
  for (const n of nodes) { sx += n.x || 0; sy += n.y || 0; }
  const cx = sx / nodes.length, cy = sy / nodes.length;
  sel.select("text").each(function (d) {
    let ux = d.__ldx, uy = d.__ldy;
    if (ux === undefined) {
      const dx = (d.x || 0) - cx, dy = (d.y || 0) - cy;
      const len = Math.hypot(dx, dy) || 1;
      ux = dx / len; uy = dy / len;
    }
    const gap = nodeRadius(d) + 5;
    d3.select(this)
      .attr("x", ux * gap)
      .attr("y", uy * gap)
      .attr("text-anchor", ux > 0.25 ? "start" : ux < -0.25 ? "end" : "middle")
      .attr("dominant-baseline", uy > 0.25 ? "hanging" : uy < -0.25 ? "auto" : "middle");
  });
}

// For each node, gather nearby nodes/labels (weighted by distance, labels heavier),
// sum into one "crowd vector," and point the label the opposite way (its emptiest
// side). Also nudges any node sitting inside a label's box back out. One per-tick
// scan; the direction is stored on d.__ldx/__ldy for positionLabels to read.
const LABEL_CROWD_RANGE = 100;   // world units: neighbours nearer than this crowd
function forceLabelSeparation() {
  let nodes = [];
  function force(alpha) {
    if (nodes.length < 2) return;
    let sx = 0, sy = 0;
    for (const n of nodes) { sx += n.x || 0; sy += n.y || 0; }
    const cx = sx / nodes.length, cy = sy / nodes.length;

    const boxes = [];
    for (const L of nodes) {
      if (!labelVisible(L)) continue;
      const fs = labelFontSize(L);
      const w = Math.max(measureTextWidth(truncateLabel(graphLabel(L), fs), fs), fs);
      const h = fs;
      const gap = nodeRadius(L) + 5;
      // Direction chosen last tick (or outward-from-centroid until one exists).
      let ux = L.__ldx, uy = L.__ldy;
      if (ux === undefined) {
        const dx = (L.x || 0) - cx, dy = (L.y || 0) - cy;
        const len = Math.hypot(dx, dy) || 1;
        ux = dx / len; uy = dy / len;
      }
      const ax = (L.x || 0) + ux * gap, ay = (L.y || 0) + uy * gap;
      const x0 = ux > 0.25 ? ax : ux < -0.25 ? ax - w : ax - w / 2;
      const y0 = uy > 0.25 ? ay : uy < -0.25 ? ay - h : ay - h / 2;
      boxes.push({ node: L, x0, y0, x1: x0 + w, y1: y0 + h, mx: x0 + w / 2, my: y0 + h / 2 });
    }
    if (!boxes.length) return;

    const strength = 0.6 * alpha;
    const R2 = LABEL_CROWD_RANGE * LABEL_CROWD_RANGE;
    for (const b of boxes) {
      const L = b.node;
      let crx = 0, cry = 0;  // crowd vector: weighted sum pointing toward neighbours
      for (const n of nodes) {
        if (n === L) continue;
        // (2) Open-space: accumulate this neighbour's contribution to L's crowd.
        const ndx = (n.x || 0) - (L.x || 0), ndy = (n.y || 0) - (L.y || 0);
        const nd2 = ndx * ndx + ndy * ndy;
        if (nd2 > 0 && nd2 < R2) {
          const nd = Math.sqrt(nd2);
          // Nearer neighbours weigh more; visible labels occupy space, so weigh extra.
          const wgt = (1 - nd / LABEL_CROWD_RANGE) * (labelVisible(n) ? 1.6 : 1);
          crx += (ndx / nd) * wgt;
          cry += (ndy / nd) * wgt;
        }
        // (1) Separation: nudge any node sitting inside this label's box.
        const r = nodeRadius(n) + 2;
        if (n.x > b.x0 - r && n.x < b.x1 + r && n.y > b.y0 - r && n.y < b.y1 + r) {
          let dx = n.x - b.mx, dy = n.y - b.my;
          if (dx === 0 && dy === 0) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
          const d = Math.hypot(dx, dy) || 1;
          n.vx += (dx / d) * strength * 4;
          n.vy += (dy / d) * strength * 4;
        }
      }
      // Open side = opposite the crowd; fall back to outward-from-centroid when
      // there's no nearby crowd to push against.
      const clen = Math.hypot(crx, cry);
      if (clen > 1e-3) {
        L.__ldx = -crx / clen; L.__ldy = -cry / clen;
      } else {
        const dx = (L.x || 0) - cx, dy = (L.y || 0) - cy;
        const len = Math.hypot(dx, dy) || 1;
        L.__ldx = dx / len; L.__ldy = dy / len;
      }
    }
  }
  force.initialize = (n) => { nodes = n; };
  return force;
}

// forceLink replaces source/target ids with node objects after init, so read
// the id whichever form it's in.
function idOf(endpoint) {
  return typeof endpoint === "object" ? endpoint.id : endpoint;
}

// Stable data-join key for an edge. Strength is folded in so two edges between
// the same pair (e.g. an "aware" and an "engaged" discovery of one node) are
// kept distinct rather than collapsed by the join.
function linkKey(d) {
  return `${idOf(d.source)}->${idOf(d.target)}:${d.strength || ""}`;
}

function renderLegend(mode) {
  legend.setAttribute("aria-hidden", "false");
  if (mode === "connections") {
    // One entry per relationship type (discovery excluded — it's not used here),
    // coloured to match its line; directional types get an arrow glyph.
    legend.innerHTML = Object.values(RELATIONSHIP_TYPES).filter((t) => !t.discoveryOnly).map((t) =>
      `<span class="legend-item"><span class="legend-swatch" style="border-top-color:${t.color}${t.dashed ? ";border-top-style:dashed" : ""}"></span>${t.label}${t.directional ? " →" : ""}</span>`
    ).join("");
    return;
  }
  const dc = RELATIONSHIP_TYPES.discovery.color;
  legend.innerHTML =
    `<span class="legend-item"><span class="legend-swatch" style="border-top-color:${dc}"></span>Discovery (engagement) →</span>` +
    `<span class="legend-item"><span class="legend-swatch" style="border-top-color:${dc};border-top-style:dashed"></span>Aware (weaker) →</span>` +
    `<span class="legend-item"><span class="legend-swatch swatch-node"></span>Discovered</span>` +
    `<span class="legend-item"><span class="legend-swatch swatch-source"></span>Source</span>`;
}

// --- drag -----------------------------------------------------------------

let dragDist = 0;          // total pointer travel this gesture, to tell drag from click
let dragDismissed = false; // whether this gesture already dismissed the cards
function dragStart(event, d) {
  autoFit = false;  // hand off framing control to the user once they grab a node
  dragDist = 0;
  dragDismissed = false;
  // NOTE: don't dismiss the cards here — dragStart also fires on a plain click,
  // and clearing the open card would make the click's toggle reopen it. Wait
  // until the pointer actually moves (dragMove).
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x; d.fy = d.y;
}
function dragMove(event, d) {
  dragDist += Math.hypot(event.dx || 0, event.dy || 0);
  // Past the click threshold it's a genuine drag — dismiss both cards once (a
  // real drag suppresses the click event, so this won't fight the toggle).
  if (!dragDismissed && dragDist > 6) {
    hideTooltip();
    closeDetail();
    dragDismissed = true;
  }
  d.fx = event.x; d.fy = event.y;
}
function dragEnd(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  // Release the node so the layout can breathe again after repositioning.
  d.fx = null; d.fy = null;
}

// --- mode toggle & sizing -------------------------------------------------

function setMode(mode) {
  currentMode = mode;
  modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (rawData) render(mode);
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

// Reset button: respawn the map — drop remembered positions so the layout
// re-seeds and settles fresh, and re-enable auto-fit to reframe it.
if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    posCache.clear();
    autoFit = true;
    if (rawData) render(currentMode);
  });
}

// Recenter the layout and reframe the camera when the container size changes
// (window resize, or entering/leaving full screen). Turns auto-fit back on so
// the graph is reframed to the new viewport.
function relayout() {
  if (!simulation) return;
  const { w, h } = size();
  simulation.force("center", d3.forceCenter(w / 2, h / 2));
  simulation.alpha(0.3).restart();
  autoFit = true;
  fitView(true);
}
window.addEventListener("resize", relayout);

// Full-screen toggle for the graph canvas.
if (fsBtn) {
  fsBtn.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (wrap.requestFullscreen) wrap.requestFullscreen();
  });
  document.addEventListener("fullscreenchange", () => {
    const on = document.fullscreenElement === wrap;
    const label = on ? "Exit full screen" : "Full screen";
    fsBtn.setAttribute("aria-label", label);
    fsBtn.setAttribute("title", label);
    fsBtn.setAttribute("aria-pressed", on ? "true" : "false");
    // Let the browser apply the new element size, then re-fit the layout.
    requestAnimationFrame(relayout);
  });
}

// --- tuning panel (troubleshooting) ---------------------------------------

// One row per TUNING key: [key, label, min, max, step].
const TUNING_CONTROLS = [
  ["labelTier", "Label tier (min out)", 0, 12, 1],
  ["zoomBand1", "Zoom band 1 (×fit)", 1, 6, 0.1],
  ["zoomBand2", "Zoom band 2 (×fit)", 1, 6, 0.1],
  ["zoomBand3", "Zoom band 3 (×fit)", 1, 6, 0.1],
  ["maxLabelWidth", "Max label width", 40, 400, 5],
  ["nodeBase", "Node base radius", 4, 30, 1],
  ["growthStep", "Growth step", 0, 10, 0.5],
  ["nodeFont", "Node font", 8, 40, 1],
  ["sourceFont", "Source font", 8, 40, 1],
  ["charge", "Charge (repulsion)", -800, 0, 10],
  ["linkDistance", "Link distance", 20, 240, 5],
  ["collidePad", "Collision padding", 0, 80, 1],
  ["linkWidth", "Line thickness", 0.5, 6, 0.1],
];

// Snapshot of the baked-in defaults, so the Reset button can restore them.
const TUNING_DEFAULTS = { ...TUNING };

// These only affect which labels show, not the layout — so tweaking them just
// refreshes visibility live (no re-run of the simulation, so the graph doesn't
// reshuffle while you calibrate).
const LABEL_ONLY_KEYS = new Set(["labelTier", "zoomBand1", "zoomBand2", "zoomBand3"]);

function initTuningPanel() {
  if (!tuningPanel || !tuningBtn) return;

  // Live zoom/band/tier readout at the top, updated on every zoom + slider change.
  tuningReadout = document.createElement("div");
  tuningReadout.className = "tuning-readout";
  tuningPanel.appendChild(tuningReadout);
  updateTuningReadout();

  const rows = [];  // { key, input, val } for the Reset button
  TUNING_CONTROLS.forEach(([key, label, min, max, step]) => {
    const row = document.createElement("label");
    row.className = "tuning-row";
    const head = document.createElement("div");
    head.className = "tuning-head";
    const name = document.createElement("span");
    name.className = "tuning-name";
    name.textContent = label;
    const val = document.createElement("span");
    val.className = "tuning-val";
    val.textContent = TUNING[key];
    head.append(name, val);
    const input = document.createElement("input");
    input.type = "range";
    input.min = min; input.max = max; input.step = step;
    input.value = TUNING[key];
    input.addEventListener("input", () => {
      TUNING[key] = parseFloat(input.value);
      val.textContent = TUNING[key];
      // Label/band knobs just refresh visibility; the rest re-render the layout.
      if (LABEL_ONLY_KEYS.has(key)) updateLabelVisibility();
      else if (rawData) render(currentMode);
    });
    row.append(head, input);
    tuningPanel.appendChild(row);
    rows.push({ key, input, val });
  });

  // Reset every control back to the baked-in defaults.
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "tuning-reset";
  reset.textContent = "Reset to defaults";
  reset.addEventListener("click", () => {
    rows.forEach(({ key, input, val }) => {
      TUNING[key] = TUNING_DEFAULTS[key];
      input.value = TUNING_DEFAULTS[key];
      val.textContent = TUNING_DEFAULTS[key];
    });
    if (rawData) render(currentMode);
  });
  tuningPanel.appendChild(reset);

  tuningBtn.addEventListener("click", () => {
    const show = tuningPanel.hidden;
    tuningPanel.hidden = !show;
    tuningBtn.setAttribute("aria-pressed", show ? "true" : "false");
    if (show) updateTuningReadout();
  });
}
initTuningPanel();

// --- boot -----------------------------------------------------------------

Promise.all([
  fetch("data/precursors.json").then((r) => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }),
  // Posts are only needed for hover labels; a failure there shouldn't sink the
  // whole graph, so swallow it and carry on with empty titles.
  fetchPosts().catch(() => []),
])
  .then(([graph, posts]) => {
    rawData = graph;
    posts.forEach((p) => { postTitles[p.id] = p.title; });
    graph.nodes.forEach((n) => { nodeById[n.id] = n; });
    status.textContent = "";
    setMode(currentMode);
  })
  .catch((err) => {
    status.textContent = "Couldn't load the graph. If you opened this file directly, run a local server (see the README).";
    status.classList.add("error");
    console.error(err);
  });
