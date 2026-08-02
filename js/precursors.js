// Precursors: a force-directed graph of where things were discovered and how
// they personally connect. Reads data/precursors.json (the graph) and
// data/posts.json — a node lists every post whose workId equals the node's id.
//
// Two views are computed from the *same* dataset at render time:
//   Discovery   — every node that has a discovered_via, plus the nodes named as
//                 their discovered_via.source, with source → node edges.
//   Connections — nodes wired by their connections array; each connection is a
//                 bare id (plain line) or { to, relationship } (typed, possibly
//                 directional). In either view, nodes with no edges are omitted.
//
// All colors are set through the site's CSS custom properties (--accent, --accent2,
// --rel-*, --ink, --muted, …), so the graph follows the light/dark theme toggle
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
    body: `In 1951, Jorge Luis Borges wrote an essay titled <em>Kafka and His Precursors</em>. He argues that while works influence their successors, they also create their own precursors.  When we retroactively term old works as Kafka-esque, we reinterpret our reading of the text. A work's influence runs both forwards and backwards, "modifi[ying] our conception of the past, as it will modify the future."
    
    This tracker visualizes the two-way influence of my personal journey through film, art, and literature.`,
  },
  {
    label: "How it works",
    body: `Discovery — what I'm interested in, and how I found it. Tracks the moment something genuinely registered in my mind.

Connections — how what I'm interested in relates to each other (personally noted connections only, not factual Wikipedia categorization).`,
  },
];

// ── Tunable ────────────────────────────────────────────────────────────────
// Label density and node/label sizing. Edit these defaults, or adjust them live
// via the "Tuning" panel on the page (toggle button in the toolbar) — handy for
// troubleshooting without an edit-and-refresh loop.
const TUNING = {
  // ── Hub tier ──────────────────────────────────────────────────────────────
  hubThreshold: 3,       // growth (outgoing connections) at/above which a node is a "hub":
                         // permanent label + hollow/dashed outline. Fixed value, not a
                         // percentile — so equally-sized nodes never split across the boundary.
  growthStep: 3,         // + hub radius per point of downstream influence (uncapped)
  hubFont: 18,           // hub label font (px)
  hubMaxLabelWidth: 170, // hub label pixel width (world units) before ellipsis
  hubLabelThreshold: 0,  // on-screen radius (size × zoom, px) to reveal a hub label (0 = always)
  // ── Leaf tier ─────────────────────────────────────────────────────────────
  nodeBase: 11,          // base node radius (world units): every node grows from this base
  leafStep: 3,           // + leaf radius per point of downstream influence (hubs use growthStep)
  leafFont: 15,          // leaf hover-label font (px)
  leafMaxLabelWidth: 170,// leaf label pixel width (world units) before ellipsis
  leafLabelThreshold: 5, // on-screen radius (size × zoom, px) to reveal a leaf label
  // ── Shared (whole simulation) ───────────────────────────────────────────────
  charge: -260,        // many-body repulsion (more negative = nodes push apart harder)
  linkDistance: 90,    // preferred edge length
  collidePad: 22,      // extra spacing beyond each node's radius (collision force)
  linkWidth: 3,        // edge stroke width (world units); directional edges draw a touch thicker
};
// ─────────────────────────────────────────────────────────────────────────────

const svg = d3.select("#graph");
const wrap = document.getElementById("graph-wrap");
const detail = document.getElementById("node-detail");
const legend = document.getElementById("graph-legend");
const status = document.getElementById("status");
const modeButtons = document.querySelectorAll(".mode-btn");
const threadFilter = document.getElementById("thread-filter");
const threadToggle = document.getElementById("thread-dropdown-toggle");
const threadMenu = document.getElementById("thread-dropdown-menu");
const threadLabel = document.getElementById("thread-dropdown-label");
const fsBtn = document.getElementById("graph-fs");
const tuningBtn = document.getElementById("graph-tuning-btn");
const tuningPanel = document.getElementById("tuning-panel");            // bottom bar: Overall / Hub / Leaf
const resetBtn = document.getElementById("graph-reset");
// Timeline scrubber (Discovery only)
const timelineBtn = document.getElementById("timeline-btn");
const timelineRow = document.getElementById("timeline-row");
const timelinePlay = document.getElementById("timeline-play");
const timelineTrack = document.getElementById("timeline-track");
const timelineThumb = document.getElementById("timeline-thumb");
const timelineFill = document.getElementById("timeline-fill");
const timelineMinEl = document.getElementById("timeline-min");
const timelineMaxEl = document.getElementById("timeline-max");
const timelineCurEl = document.getElementById("timeline-current");

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
      return `<p>${dot}${text}</p>`;
    }).join("");
    const cls = card.callout ? "precursors-card precursors-card--callout" : "precursors-card";
    return `<article class="${cls}">` +
      `<div class="precursors-card-label">${escapeHTML(card.label)}</div>` +
      paras +
    `</article>`;
  }).join("");
})();

let rawData = null;      // parsed precursors.json
let allPosts = [];       // every post, for matching a node's workId to its posts
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
// Labels live in their own layer above every node, so a title is always drawn in
// front of the circles (its own and its neighbours'), never hidden behind them.
const labelLayer = zoomLayer.append("g").attr("class", "node-labels");

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
// line. markerUnits "strokeWidth" scales the arrow with its line's stroke width,
// so the Line-thickness tuning drives the arrowheads too.
const defs = svg.append("defs");
Object.entries(RELATIONSHIP_TYPES).forEach(([name, t]) => {
  if (!t.directional) return;
  defs.append("marker")
    .attr("id", `arrow-${name}`)
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 10).attr("refY", 5)
    .attr("markerWidth", 4).attr("markerHeight", 4)
    .attr("markerUnits", "strokeWidth")
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,0 L10,5 L0,10 Z")
    .style("fill", t.color);
});

// Faint dot-grid backdrop: a tiled dot pattern on a full-viewport rect behind the
// graph. Its patternTransform tracks the zoom transform, so the dots pan and
// scale *with* the graph (reinforcing the pannable-canvas feel) rather than
// sticking to the screen. A radial mask fades the dots out toward the panel edges
// so the grid never boxes the area in.
const GRID_TILE = 38;
const gridPattern = defs.append("pattern")
  .attr("id", "dot-grid")
  .attr("patternUnits", "userSpaceOnUse")
  .attr("width", GRID_TILE).attr("height", GRID_TILE);
gridPattern.append("circle")
  .attr("class", "grid-dot")
  .attr("cx", GRID_TILE / 2).attr("cy", GRID_TILE / 2).attr("r", 2.5);
const gridFade = defs.append("radialGradient")
  .attr("id", "grid-fade").attr("cx", "50%").attr("cy", "50%").attr("r", "62%");
gridFade.append("stop").attr("offset", "50%").attr("stop-color", "#fff");
gridFade.append("stop").attr("offset", "100%").attr("stop-color", "#000");
defs.append("mask").attr("id", "grid-mask")
  .append("rect").attr("width", "100%").attr("height", "100%").attr("fill", "url(#grid-fade)");
svg.append("rect")
  .attr("class", "grid-bg")
  .attr("width", "100%").attr("height", "100%")
  .attr("fill", "url(#dot-grid)")
  .attr("mask", "url(#grid-mask)")
  .attr("pointer-events", "none")
  .lower();   // behind the zoom layer

// While auto-fit is on, the camera reframes the graph each tick. A hand
// pan/zoom (a real gesture → event.sourceEvent set) or a node drag turns it off
// so we don't fight the user; resize, full screen, mode switch, and
// double-click turn it back on.
let autoFit = true;
let lastFitScale = 1;      // the zoom the whole graph frames at (base for click zoom)
let activeThread = null;   // the thread currently highlighted (null = none)
let threadKeep = null;     // Set of node ids kept lit for the active thread/scrub (else null)
// Timeline scrubber state (shares threadKeep + the .is-thread-dim fade — the two
// are mutually exclusive overlays).
let scrubOpen = false;
let scrubStops = [];       // [{ key, label }] — sorted distinct discovery months
let scrubIndex = 0;        // current position into scrubStops
let scrubPlaying = false;
let scrubPlayTimer = null;
let currentScale = 1;  // live zoom scale, drives size-based label visibility
// Camera transitions use interpolateZoom — the "flyover" that zooms out, arcs
// across, and zooms back in on longer moves. rho controls how aggressive that
// arc is (default √2 ≈ 1.41); a lower rho flattens it. Tune rho below, or swap
// to .interpolate(d3.interpolate) for plain linear transitions.
const zoom = d3.zoom().scaleExtent([0.1, 4]).interpolate(d3.interpolateZoom.rho(0.75)).on("zoom", (event) => {
  zoomLayer.attr("transform", event.transform);
  // Pan/scale the dot grid with the graph so the backdrop moves with the content.
  gridPattern.attr("patternTransform",
    `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`);
  currentScale = event.transform.k;
  if (event.sourceEvent) autoFit = false;
  updateLabelVisibility();
});
svg.call(zoom);

// Track the last two pointer presses (capture phase, so d3-zoom can't swallow
// them) — enough to tell whether either half of a double-click landed on a node.
let lastDownOnNode = false;
let prevDownOnNode = false;
let bgDownXY = null;
document.addEventListener("pointerdown", (e) => {
  bgDownXY = [e.clientX, e.clientY];
  prevDownOnNode = lastDownOnNode;
  lastDownOnNode = !!(e.target.closest && e.target.closest("g.node"));
}, true);

// Double-click reframes the graph and re-enables auto-fit — but only when the
// whole gesture was on blank canvas. If either press hit a node, skip it.
svg.on("dblclick.zoom", null);
svg.on("dblclick", () => {
  if (lastDownOnNode || prevDownOnNode) return;
  autoFit = true;
  fitView(true);
});

// Tap/click inside the graph but outside the open detail card to dismiss it.
// Listens in the capture phase on the document so d3-zoom (which swallows the
// svg's own click via preventDefault) can't stop it. A small movement guard
// means panning the canvas doesn't count as a click, and node taps are left to
// the node's own toggle handler.
document.addEventListener("pointerup", (e) => {
  if (!bgDownXY) return;
  const moved = Math.hypot(e.clientX - bgDownXY[0], e.clientY - bgDownXY[1]);
  bgDownXY = null;
  if (detailNodeId === null && !activeThread) return;  // nothing to dismiss
  if (moved > 6) return;                             // a drag/pan, not a tap
  const t = e.target;
  if (!wrap.contains(t)) return;                     // outside the graph entirely
  if (detail.contains(t)) return;                    // inside the card
  if (t.closest && t.closest("g.node")) return;      // a node — it toggles itself
  if (detailNodeId !== null) closeDetail();
  if (activeThread) selectThread(null);              // empty tap clears the thread
}, true);

function size() {
  const rect = wrap.getBoundingClientRect();
  // The detail panel is docked on the right and always present; the usable
  // canvas is everything left of it, so auto-fit/centering never frames nodes
  // into the panel's reserved space.
  const panelW = detail ? detail.getBoundingClientRect().width : 0;
  return { w: rect.width - panelW, h: rect.height };
}

const FIT_PADDING = 100;   // generous breathing room around the graph, world units
const PLAY_FIT_PADDING = 240; // extra breathing room while the timeline plays
const MAX_FIT_SCALE = 1.75; // don't zoom a small/sparse graph in too aggressively
let fitPad = FIT_PADDING;  // current padding (bumped up during timeline playback)

// Frame the camera on the nodes' actual bounding box — expanded by each node's
// radius (hub nodes are larger, so their centre isn't enough) plus generous
// padding — so nothing clips at the edge. Applied through d3.zoom so the pan/zoom
// state stays consistent.
function fitView(animate, subset) {
  if (!simulation) return;
  // `subset` (optional) frames only those nodes — used to zoom in on a thread's
  // highlighted members + origin; otherwise the whole graph is framed.
  const nodes = (subset && subset.length) ? subset : simulation.nodes();
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
  const boxW = (maxX - minX) + fitPad * 2;
  const boxH = (maxY - minY) + fitPad * 2;
  const scale = Math.max(0.1, Math.min(MAX_FIT_SCALE, w / boxW, h / boxH));
  if (!(subset && subset.length)) lastFitScale = scale;   // remember the base (whole-graph) zoom
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const t = d3.zoomIdentity.translate(w / 2 - scale * cx, h / 2 - scale * cy).scale(scale);
  (animate ? svg.transition().duration(400) : svg).call(zoom.transform, t);
}

// A node's current on-screen position within the graph wrap (its world x/y run
// through the live zoom transform; the svg fills the wrap, so these are also
// wrap-relative pixels).
function nodeScreenXY(node) {
  const t = d3.zoomTransform(svg.node());
  return { x: t.applyX(node.x), y: t.applyY(node.y) };
}

// Whether a node sits comfortably inside the viewport (with a small margin).
function nodeInView(node, margin) {
  if (node.x == null || node.y == null) return false;
  const { w, h } = size();
  const s = nodeScreenXY(node);
  return s.x >= margin && s.x <= w - margin && s.y >= margin && s.y <= h - margin;
}

// Zoom level to settle at when moving to a node (e.g. following a discovery
// chain). Only zooms IN toward this — if you're already closer it keeps your
// zoom — so repeated hops don't keep zooming in or ever zoom out.
const PAN_ZOOM = 1.3;            // absolute zoom floor when following a connection from the card
const DIRECT_ZOOM_FACTOR = 3; // a direct graph click frames at this × the base fit zoom

// Center a node in the viewport at absolute zoom `targetK` (defaults to the
// current zoom = recenter only). Callers decide the zoom level.
function panToNode(node, animate, targetK) {
  const { w, h } = size();
  const k = targetK != null ? targetK : d3.zoomTransform(svg.node()).k;
  const t = d3.zoomIdentity.translate(w / 2 - k * node.x, h / 2 - k * node.y).scale(k);
  (animate ? svg.transition().duration(400) : svg).call(zoom.transform, t);
  autoFit = false;  // the user drove the camera here; don't auto-reframe over it
}

// --- graph builders -------------------------------------------------------

// Prettify an id/slug for display, dropping a leading {type} segment, e.g.
// "platform-letterboxd" -> "Letterboxd". Used for the discovered_via mechanism
// (a platform/method, not a node), and as a fallback label.
function humanizeId(id) {
  const parts = String(id).split("-");
  const rest = parts.slice(1).length ? parts.slice(1) : parts;
  return rest.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

// A node's discovered_via as a normalized array of { source, note?, date? }.
// Tolerates the old single-object form as well as a missing field. Entries need
// not carry a source — a source-less entry (date/note only) means the thing
// entered awareness with no traceable origin; it draws no edge but still counts
// as a discovery (the node shows as an orphan in Discovery view).
function discoveredVia(node) {
  const dv = node.discovered_via;
  const arr = Array.isArray(dv) ? dv : (dv ? [dv] : []);
  return arr.filter((d) => d && (d.source || d.note || d.date || d.mechanism));
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

// Discovery view: only the nodes involved in discovery — every node that has a
// discovered_via, plus every node named as a discovered_via source — wired by
// directional source → discovered-thing edges. Sources are ordinary nodes now:
// a `source` is just another node id, so it must exist in the data (an unknown
// id draws no edge).
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
  const ledTo = new Map();     // source node id -> [{ to, note }]

  const include = (id) => {
    if (!included.has(id)) included.set(id, { ...byId.get(id), growth: 0 });
    return included.get(id);
  };

  const consciousnessOut = new Map();  // node id -> # direct "consciousness" (engaged) discovery children

  data.nodes.forEach((n) => {
    const entries = discoveredVia(n);
    if (!entries.length) return;
    include(n.id);  // every node with a discovered_via appears — orphan if all its entries are source-less
    entries.forEach((dv) => {
      const src = dv.source;
      if (!src || src === n.id) return;  // source-less (or self): no edge, node stays as an orphan
      if (!byId.has(src)) {              // source isn't a defined node: skip (no magic hub)
        console.warn(`precursors: discovered_via source "${src}" on "${n.id}" is not a node; no edge drawn.`);
        return;
      }
      const note = dv.note || "";
      const thread = dv.thread || "";
      // "aware" (just heard of it) vs "engaged" (sat down with it); defaults to
      // engaged. Aware edges draw dashed. Every entry draws its own edge — a
      // node can have two (a distinct earlier "aware" and a later "engaged").
      const strength = dv.strength === "aware" ? "aware" : "engaged";
      include(src);
      links.push({ source: src, target: n.id, type: "discovery", directional: true, note, strength });
      // The source's "Led to" row shows the thread (the pull), not the story note.
      if (!ledTo.has(src)) ledTo.set(src, []);
      ledTo.get(src).push({ to: n.id, thread });
      // Only "consciousness" (engaged) discoveries count toward size.
      if (strength === "engaged") consciousnessOut.set(src, (consciousnessOut.get(src) || 0) + 1);
    });
  });

  // Each source carries its direct "led to" list for the card's "Led to" section.
  ledTo.forEach((list, sourceId) => { included.get(sourceId).discoveryOut = list; });

  // growth mirrors the Connections rule, in discovery terms: a node's own direct
  // consciousness out-degree, plus (one hop, via authorship) the consciousness
  // out-degree of each work it authored. Drives node size and the row "+N" badge.
  const authored = new Map();   // author id -> [authored work ids]
  data.nodes.forEach((n) => {
    (n.connections || []).forEach((c) => {
      if (typeof c !== "object" || c.relationship !== "authorship" || !c.to) return;
      if (!authored.has(n.id)) authored.set(n.id, []);
      authored.get(n.id).push(c.to);
    });
  });
  included.forEach((node, id) => {
    let g = consciousnessOut.get(id) || 0;
    (authored.get(id) || []).forEach((workId) => { g += consciousnessOut.get(workId) || 0; });
    node.growth = g;
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
  const nodes = data.nodes.map((n) => ({ ...n, growth: 0 }));
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
      edge = { source: typed.from, target: typed.to, type: typed.type, directional: false };
    } else {
      const origins = new Set(directional.map((e) => e.from));
      if (origins.size > 1) {
        // Directional written from both ends — don't guess a direction.
        const [a, b] = [...origins];
        console.warn(`precursors: directional relationship on both sides of ${a} ↔ ${b}; drawing a plain line instead of guessing the direction.`);
        edge = { source: directional[0].from, target: directional[0].to, type: "", directional: false };
      } else {
        const d = directional[0];
        edge = { source: d.from, target: d.to, type: d.type, directional: true };
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

  // Only keep nodes that actually take part in a connection (as either end) —
  // a node with no real connection data never appears as an isolated floating dot.
  const connected = new Set();
  edges.forEach((e) => { connected.add(e.source); connected.add(e.target); });
  return { nodes: nodes.filter((n) => connected.has(n.id)), links: edges };
}

// --- rendering ------------------------------------------------------------

// A node is a "hub" once its downstream influence (out-degree) reaches the
// tunable cutoff; anything below is a "leaf". A fixed cutoff (not a rank) means
// equally-sized nodes always fall on the same side of the line.
function isHub(d) {
  return (d.growth || 0) >= TUNING.hubThreshold;
}

// Node size: every node grows from the shared base by its downstream influence
// (out-degree, uncapped), so more-influential nodes read as larger — leaves
// included. Leaves and hubs each have their own per-connection growth step
// (leafStep / growthStep), so the two tiers can be tuned independently.
function nodeRadius(d) {
  const step = isHub(d) ? TUNING.growthStep : TUNING.leafStep;
  return TUNING.nodeBase + (d.growth || 0) * step;
}

// Label font size (px) — per tier.
function labelFontSize(d) {
  return isHub(d) ? TUNING.hubFont : TUNING.leafFont;
}

// Label truncation width (px) — per tier.
function labelMaxWidth(d) {
  return isHub(d) ? TUNING.hubMaxLabelWidth : TUNING.leafMaxLabelWidth;
}

// Label tiers each have their own reveal threshold: a label shows on hover, or
// once its on-screen radius (size × zoom) clears the tier's threshold. Hubs
// default to 0 (always shown); leaves reveal as you zoom in.
function labelVisible(d) {
  const thr = isHub(d) ? TUNING.hubLabelThreshold : TUNING.leafLabelThreshold;
  return d.__hover === true || nodeRadius(d) * currentScale >= thr;
}
function updateLabelVisibility() {
  labelLayer.selectAll("text.node-label")
    .style("opacity", (d) => {
      const base = labelVisible(d) ? 1 : 0;
      // Off-thread labels fade with the rest of the graph (kept here rather than
      // in CSS because this inline opacity is re-applied on every zoom).
      return (threadKeep && !threadKeep.has(d.id)) ? base * 0.12 : base;
    });
}

// Re-apply label text/size/width/position in place (no simulation restart), so
// font/width/threshold tuning updates the labels without moving the layout.
function refreshLabels() {
  const sel = labelLayer.selectAll("text.node-label");
  sel.text((d) => truncateLabel(graphLabel(d), labelFontSize(d), labelMaxWidth(d)))
     .style("font-size", (d) => labelFontSize(d) + "px")
     .style("font-weight", (d) => (isHub(d) ? "700" : "400"));
  positionLabels(sel.data(), sel);
  updateLabelVisibility();
}

// Re-apply node/link/label appearance in place, without rebuilding the graph or
// restarting the force simulation — so tuning visual knobs never shifts the
// layout. Only the true force knobs (see LAYOUT_KEYS) trigger a re-layout.
function refreshVisuals() {
  const contentFill = currentMode === "connections" ? "var(--accent2)" : "var(--accent)";
  const contentStroke = currentMode === "connections" ? "var(--accent2-ink)" : "var(--accent-ink)";
  nodeLayer.selectAll("g.node")
    .attr("class", (d) => `node${isHub(d) ? " is-hub" : ""}`)
    .select("circle")
      .attr("r", nodeRadius)
      .style("fill", (d) => (isHub(d) ? "var(--bg)" : contentFill))
      .style("stroke", (d) => (isHub(d) ? "var(--muted)" : contentStroke))
      .style("stroke-width", (d) => (isHub(d) ? 1.5 : 1))
      .style("stroke-dasharray", (d) => (isHub(d) ? "3 2" : null));
  linkLayer.selectAll("line.link")
    .style("stroke-width", (d) => (d.directional ? TUNING.linkWidth + 0.6 : TUNING.linkWidth));
  refreshLabels();
}

// Measure a string's rendered width (world units) at a given font size, using an
// offscreen canvas with the site's sans stack. Cached context, so it's cheap.
const _measureCtx = document.createElement("canvas").getContext("2d");
function measureTextWidth(s, fs) {
  _measureCtx.font = `${fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  return _measureCtx.measureText(s).width;
}

// Cut a label to `max` *pixels* (not characters) with an ellipsis, trimming from
// the end until it fits. The full, untruncated name shows in the detail card.
function truncateLabel(s, fs, max) {
  s = String(s);
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

// The line color for an edge: its relationship type's color, or the neutral
// "thematic" color for an untyped connection.
function edgeColor(d) {
  if (d.type && RELATIONSHIP_TYPES[d.type]) return RELATIONSHIP_TYPES[d.type].color;
  return "var(--rel-thematic)";
}

// The hover label for a typed connection. Discovery edges read by strength —
// "Consciousness" (engaged) vs "Awareness" (aware) — matching the legend.
function edgeLabel(d) {
  if (d.type === "discovery") return d.strength === "aware" ? "Awareness" : "Consciousness";
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


// --- node detail card ------------------------------------------------------
// Click a node to open a persistent card with its full details. It's a plain
// surface floated in the graph's corner (quiet style: thin dividers, no shadow)
// and doesn't capture events over the rest of the graph, so the graph stays
// pannable/hoverable around it. Escape or the × dismisses it; clicking the same
// node toggles it shut.

// The creator node (author/director) whose authorship connection points at this
// node, or null. Authorship is written on the creator, aimed at the work.
function creatorOf(node) {
  for (const n of rawData.nodes) {
    for (const c of n.connections || []) {
      const to = typeof c === "string" ? c : c && c.to;
      if (to === node.id && typeof c === "object" && c.relationship === "authorship") return n;
    }
  }
  return null;
}

// The label for a work's creator, decided by the *work's* kind (not the maker's).
// One place to extend later (e.g. album → "Musician").
function creatorRole(kind) {
  return kind === "film" ? "Director" : "Author";
}
// The short credit prefix for a role — "dir." for a Director, "by" otherwise.
function creatorCredit(role) {
  return role === "Director" ? "dir." : "by";
}

// The creator for a node: a real node linked by an authorship connection if there
// is one, else the node's own plain `creator` string. Either way the role comes
// from this work's kind (see creatorRole). Returns { name, role } or null.
function creatorInfo(node) {
  const role = creatorRole(node.kind);
  const creatorNode = creatorOf(node);
  if (creatorNode) return { name: creatorNode.label, role };
  if (typeof node.creator === "string" && node.creator.trim()) return { name: node.creator.trim(), role };
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

// Capitalize the first letter (thread values are stored lowercase but display
// as "Thread: Existential fiction").
function capFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// The "↳ Thread: X" sub-line, shown under a source's "Led to" rows. The ↳ is
// nudged up in CSS so it aligns with the text.
function threadLine(thread) {
  if (!thread) return "";
  return `<div class="detail-conn-thread"><span class="thread-arrow">↳</span> Thread: ${escapeHTML(capFirst(thread))}</div>`;
}

// One connection row: relationship label (coloured to match its edge) with a
// direction glyph for directional types, the other node's name, and any note.
function connectionRowHTML(c) {
  const t = c.rel && RELATIONSHIP_TYPES[c.rel];
  const relLabel = t ? t.label : "Connection";
  const relColor = t ? t.color : "var(--rel-thematic)";
  // Directional types get an arrow; a typed non-directional one (thematic) gets
  // a dash to mark the symmetric link, mirroring the arrow's slot.
  const glyph = t ? (t.directional ? (c.dir === "out" ? " →" : " ←") : " —") : "";
  // For outgoing links, show how much the target influenced on its own — this is
  // the same downstream count that rolls up into this node's "outgoing" total
  // (e.g. an authored work's own influence), so the number is explained without
  // listing every derivative. Shown on the relationship row.
  const onward = c.dir === "out" ? (growthById[c.other.id] || 0) : 0;
  // After the title: the target's own downstream count. Both modes prefix it with
  // an arrow — Connections = downstream influence, Discovery = onward discoveries.
  const onwardText = `→ ${onward}`;
  const onwardTitle = currentMode === "discovery"
    ? `leads to ${onward} more discover${onward === 1 ? "y" : "ies"} downstream`
    : `${onward} downstream influence${onward === 1 ? "" : "s"}`;
  // Discovery rows drop the "Discovery →" relationship prefix — it's redundant
  // under the "Led to N discoveries" heading — and instead show the name itself
  // in the discovery blue + bold (see .detail-conn.is-discovery in the CSS).
  const isDiscovery = c.rel === "discovery";
  let html = `<div class="detail-conn${isDiscovery ? " is-discovery" : ""}">`;
  // The relationship label + the name together are the link (opens the other
  // node's card). The "→N" badge and any sub-lines stay outside it, so only the
  // relationship + name is clickable — not the trailing count.
  html += `<span class="detail-conn-main" data-node-id="${escapeHTML(c.other.id)}" role="button" tabindex="0" title="Open ${escapeHTML(c.other.label)}">`;
  if (!isDiscovery) html += `<span class="detail-conn-rel" style="color:${relColor}">${escapeHTML(relLabel)}${glyph}</span>`;
  html += `<span class="detail-conn-name">${escapeHTML(c.other.label)}</span>`;
  html += `</span>`;
  // The onward marker sits after the link, not part of it.
  if (onward) html += ` <span class="detail-conn-onward" title="${escapeHTML(onwardTitle)}">${onwardText}</span>`;
  // Discovery rows show the thread (the pull); Connections rows show the
  // connection note. (A row only ever carries one of the two.)
  html += threadLine(c.thread);
  if (c.note) html += `<div class="detail-conn-note">${escapeHTML(c.note)}</div>`;
  html += `</div>`;
  return html;
}

// The card's list section, which differs by mode. In Discovery it's "Led to"
// (the node's outgoing discovery edges); in Connections it's the connection
// relationships with the total/outgoing stats. Returns { rows, label } — rows
// are connectionRowHTML-shaped so the same component renders both.
// The "+N" shown on a row = the other node's own downstream reach (only for
// outgoing rows): influence in Connections, consciousness in Discovery. The list
// is ordered by it, most-downstream first.
function onwardOf(c) {
  return c.dir === "out" ? (growthById[c.other.id] || 0) : 0;
}
function byOnwardDesc(a, b) {
  return onwardOf(b) - onwardOf(a);
}
// Connections list order — by relationship type *and* direction. Untyped/plain
// links last. Within a group, the "+N" (downstream reach) still sorts descending.
const CONN_ORDER = [
  { type: "authorship" },              // always outgoing ("authored X")
  { type: "adaptation", dir: "in" },   // "adaptation of ←"
  { type: "influence",  dir: "out" },  // "influenced →"
  { type: "adaptation", dir: "out" },  // "adapted into →"
  { type: "influence",  dir: "in" },   // "influenced by ←"
  { type: "thematic" },                // non-directional
];
function connRank(c) {
  for (let i = 0; i < CONN_ORDER.length; i++) {
    const o = CONN_ORDER[i];
    if (o.type === c.rel && (!o.dir || o.dir === c.dir)) return i;
  }
  return CONN_ORDER.length;   // untyped / anything else, last
}
function byConnOrder(a, b) {
  return connRank(a) - connRank(b) || onwardOf(b) - onwardOf(a);
}
function cardConnections(node) {
  if (currentMode === "discovery") {
    const rows = (node.discoveryOut || [])
      .map((d) => ({ other: nodeById[d.to], rel: "discovery", thread: d.thread || "", dir: "out" }))
      .filter((r) => r.other)
      .sort(byOnwardDesc);
    return { rows, label: `Led to (${rows.length}) discover${rows.length === 1 ? "y" : "ies"}` };
  }
  const rows = connectionsFor(node).sort(byConnOrder);
  let label = `Connections (${rows.length})`;
  // Same downstream-influence count as node size / the hover card.
  const out = growthById[node.id] || node.growth || 0;
  if (out) label += ` · ${out} outgoing`;
  return { rows, label };
}

function openDetail(node, event, skipCamera) {
  detailNodeId = node.id;

  // Header block: kind as a small uppercase eyebrow above the serif title, then
  // the creator as a byline on its own line, then a hairline before the meta.
  let head = `<button type="button" class="detail-close" aria-label="Close detail">×</button>`;
  if (node.kind) head += `<div class="detail-eyebrow">${escapeHTML(node.kind)}</div>`;
  head += `<h2 class="detail-title">${escapeHTML(node.label)}</h2>`;
  const creator = creatorInfo(node);
  if (creator) {
    head += `<div class="detail-byline">${creatorCredit(creator.role)} ${escapeHTML(creator.name)}</div>`;
  }

  // Everything below the header goes in a scrollable body, so the header stays
  // fixed while the content fills (and scrolls within) the panel's height.
  let body = "";

  // "Discovered via" is a Discovery-mode section — omitted in Connections. One
  // entry reads as a single line; more than one becomes a small list (same
  // pattern as Posts). A source-less entry shows an em-dash; its note still
  // explains the untraceable origin.
  const dvs = discoveredVia(node);
  // A discovery source is just a node: when it resolves to one, its label
  // becomes a button that opens its card; an unknown id stays plain text.
  const dvLabel = (d) => {
    if (!d.source) return "—";
    const other = nodeById[d.source];
    if (!other) return escapeHTML(humanizeId(d.source));
    const label = escapeHTML(other.label);
    return `<span class="detail-source-link" data-node-id="${escapeHTML(d.source)}" role="button" tabindex="0" title="Open ${label}">${label}</span>`;
  };
  // Date and thread both ride inline on the "Discovered via" (origin) line; the
  // story note is the line below. NOTE: `mechanism` (e.g. "letterboxd") is kept
  // in the data but NOT displayed anywhere right now — it used to render as
  // "· found on X".
  const dvDate = (d) => (d.date ? ` <span class="detail-dv-date">· ${escapeHTML(formatDiscoveryDate(d.date))}</span>` : "");
  const dvThread = (d) => (d.thread ? ` <span class="detail-dv-thread">· Thread: ${escapeHTML(capFirst(d.thread))}</span>` : "");
  // Hairline separating the title block from the metadata (Discovery only — in
  // Connections the connections section's own top border does the separating).
  if (currentMode === "discovery" && dvs.length) head += `<hr class="detail-rule">`;
  if (currentMode === "discovery" && dvs.length === 1) {
    const d = dvs[0];
    body += `<div class="detail-meta-row"><span class="detail-meta-label">Discovered via</span> ${dvLabel(d)}${dvDate(d)}${dvThread(d)}</div>`;
    if (d.note) body += `<div class="detail-meta-note">${escapeHTML(d.note)}</div>`;
  } else if (currentMode === "discovery" && dvs.length > 1) {
    const items = dvs.map((d) => {
      let li = `<li>${dvLabel(d)}${dvDate(d)}${dvThread(d)}`;
      if (d.note) li += `<div class="detail-meta-note">${escapeHTML(d.note)}</div>`;
      return li + `</li>`;
    }).join("");
    body += `<div class="detail-discovered"><div class="detail-section-label">Discovered via (${dvs.length})</div>` +
            `<ul class="detail-dv-list">${items}</ul></div>`;
  }

  // List section — "Led to" in Discovery, "Connections" in Connections (see
  // cardConnections).
  const { rows: conns, label: connLabel } = cardConnections(node);
  if (conns.length) {
    body += `<div class="detail-conn-section">` +
            `<div class="detail-section-label">${connLabel}</div>` +
            `<div class="detail-connections">${conns.map(connectionRowHTML).join("")}</div>` +
            `</div>`;
  }

  // Posts — every post whose workId matches this node's id (the node id IS the
  // work identifier; posts point back to it via their own data-only workId),
  // newest first, each a link to the post.
  const matchedPosts = allPosts
    .filter((p) => p.workId === node.id)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (matchedPosts.length) {
    const items = matchedPosts.map((p) =>
      `<li><a class="detail-post-link" href="post.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener" title="${escapeHTML(p.title)}">${escapeHTML(p.title)}</a></li>`
    ).join("");
    body += `<div class="detail-posts"><div class="detail-section-label">Posts</div>` +
            `<ul class="detail-post-list">${items}</ul></div>`;
  }

  detail.innerHTML = head + `<div class="detail-body">${body}</div>`;

  // The header stays fixed; the body fills the panel height and its connections
  // list scrolls (CSS). The panel is docked, so there's no positioning to do.

  // Recenter on the node when its card opens (skipped when the caller drives the
  // camera, e.g. a thread selection). A direct graph click zooms to a fixed
  // level a little above the base fit (absolute floor — first click nudges in,
  // later clicks don't add more); following a connection from the card zooms in
  // to at least PAN_ZOOM so the next node reads up close.
  if (!skipCamera && node.x != null && node.y != null) {
    const curK = d3.zoomTransform(svg.node()).k;
    const clickZoom = Math.max(curK, lastFitScale * DIRECT_ZOOM_FACTOR);
    panToNode(node, true, event ? clickZoom : Math.max(curK, PAN_ZOOM));
  }

  detail.querySelector(".detail-close").addEventListener("click", closeDetail);
  updateNodeSelection();
}

// Empty-state shown in the docked panel when nothing is selected.
function renderPlaceholder() {
  if (!detail) return;
  detail.innerHTML = `<div class="detail-placeholder">Select a node to see how it connects.</div>`;
}

// "Close" = deselect. The panel is permanent (docked), so this just clears the
// selection and drops back to the placeholder — nothing is hidden. `immediate`
// is kept for existing callers but no longer changes anything.
function closeDetail(immediate) {
  if (!detail) return;
  detailNodeId = null;
  renderPlaceholder();
  updateNodeSelection();
}
renderPlaceholder();   // start empty

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
  if (e.key === "Escape" && detail) closeDetail();
});

if (detail) {
  // Clicking a connection row (or a linked discovery source) opens that node in
  // the docked panel. Delegated once here since the panel's innerHTML is rebuilt
  // on every open. Enter/Space activate keyboard focus too.
  const openLinked = (el) => {
    const id = el.getAttribute("data-node-id");
    // Resolve the built view node (it carries growth / discoveryOut that the raw
    // node from nodeById doesn't), so the opened card renders in full.
    const other = (simulation ? simulation.nodes().find((n) => n.id === id) : null) || nodeById[id];
    if (other) openDetail(other);   // no event → pan the camera to trace to it
  };
  detail.addEventListener("click", (e) => {
    const link = e.target.closest("[data-node-id]");
    if (link && detail.contains(link)) openLinked(link);
  });
  detail.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const link = e.target.closest("[data-node-id]");
    if (link && detail.contains(link)) { e.preventDefault(); openLinked(link); }
  });
}

function render(mode) {
  closeDetail(true);  // node objects are rebuilt here; drop any stale open card at once

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

  // --- nodes ---
  const node = nodeLayer.selectAll("g.node")
    .data(graph.nodes, (d) => d.id);
  node.exit().remove();

  const nodeEnter = node.enter().append("g").attr("class", "node");
  nodeEnter.append("circle").attr("class", "node-dot");

  const nodeAll = nodeEnter.merge(node)
    .attr("class", (d) => `node${isHub(d) ? " is-hub" : ""}`);

  // Leaves are solid — yellow in Connections view, green in Discovery view (this
  // now includes discovery source nodes). Hubs read as hollow with a dashed
  // outline, in both modes. (The stroke follows the fill for leaves.)
  const contentFill = mode === "connections" ? "var(--accent2)" : "var(--accent)";
  const contentStroke = mode === "connections" ? "var(--accent2-ink)" : "var(--accent-ink)";
  nodeAll.select("circle.node-dot")
    .attr("r", nodeRadius)
    .style("fill", (d) => (isHub(d) ? "var(--bg)" : contentFill))
    .style("stroke", (d) => (isHub(d) ? "var(--muted)" : contentStroke))
    .style("stroke-width", (d) => (isHub(d) ? 1.5 : 1))
    .style("stroke-dasharray", (d) => (isHub(d) ? "3 2" : null));

  // Labels live in the top layer (not in the node groups) so they always paint in
  // front. Position (x/y/anchor) is set per tick by positionLabels.
  const label = labelLayer.selectAll("text.node-label").data(graph.nodes, (d) => d.id);
  label.exit().remove();
  const labelAll = label.enter().append("text").attr("class", "node-label").merge(label);
  labelAll
    .text((d) => truncateLabel(graphLabel(d), labelFontSize(d), labelMaxWidth(d)))
    .style("fill", "var(--ink)")
    .style("font-family", "var(--font-sans)")
    .style("font-size", (d) => labelFontSize(d) + "px")
    .style("font-weight", (d) => (isHub(d) ? "700" : "400"));

  nodeAll
    // Hovering reveals the node's own label; clicking opens the detail panel.
    .on("mouseenter", (event, d) => { d.__hover = true; updateLabelVisibility(); })
    .on("mouseleave", (event, d) => { d.__hover = false; updateLabelVisibility(); })
    .on("click", (event, d) => { event.stopPropagation(); toggleDetail(d, event); })
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
      positionLabels(graph.nodes, labelAll);
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
function positionLabels(nodes, labelSel) {
  if (!nodes.length) return;
  let sx = 0, sy = 0;
  for (const n of nodes) { sx += n.x || 0; sy += n.y || 0; }
  const cx = sx / nodes.length, cy = sy / nodes.length;
  // Labels sit in their own top layer (world coordinates), so positions are the
  // node's own x/y plus the offset — not relative to a node group.
  labelSel.each(function (d) {
    const nx = d.x || 0, ny = d.y || 0;
    // Hubs carry their label centred on the node itself, not offset outward.
    if (isHub(d)) {
      d3.select(this)
        .attr("x", nx).attr("y", ny)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle");
      return;
    }
    let ux = d.__ldx, uy = d.__ldy;
    if (ux === undefined) {
      const dx = nx - cx, dy = ny - cy;
      const len = Math.hypot(dx, dy) || 1;
      ux = dx / len; uy = dy / len;
    }
    const gap = nodeRadius(d) + 5;
    d3.select(this)
      .attr("x", nx + ux * gap)
      .attr("y", ny + uy * gap)
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
      const w = Math.max(measureTextWidth(truncateLabel(graphLabel(L), fs, labelMaxWidth(L)), fs), fs);
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
  // Hollow/dashed swatch = a hub (high out-degree); shown in both modes.
  const hubItem = `<span class="legend-item"><span class="legend-swatch swatch-hub"></span>Hub</span>`;
  if (mode === "connections") {
    // Hub first, then one entry per relationship type (discovery excluded — it's
    // not used here), coloured to match its line; directional types get an arrow.
    legend.innerHTML = hubItem + Object.values(RELATIONSHIP_TYPES).filter((t) => !t.discoveryOnly).map((t) =>
      `<span class="legend-item"><span class="legend-swatch" style="border-top-color:${t.color}${t.dashed ? ";border-top-style:dashed" : ""}"></span>${t.label}${t.directional ? " →" : ""}</span>`
    ).join("");
    return;
  }
  const dc = RELATIONSHIP_TYPES.discovery.color;
  legend.innerHTML =
    hubItem +
    `<span class="legend-item"><span class="legend-swatch" style="border-top-color:${dc}"></span>Consciousness →</span>` +
    `<span class="legend-item"><span class="legend-swatch" style="border-top-color:${dc};border-top-style:dashed"></span>Awareness →</span>`;
}

// --- drag -----------------------------------------------------------------

let dragDist = 0;          // total pointer travel this gesture, to tell drag from click
let dragDismissed = false; // whether this gesture already dismissed the cards
function dragStart(event, d) {
  autoFit = false;  // hand off framing control to the user once they grab a node
  dragDist = 0;
  dragDismissed = false;
  // NOTE: don't dismiss the cards or reheat the simulation here — dragStart also
  // fires on a plain click. Clearing the card would make the click's toggle
  // reopen it, and restarting the sim would make the whole layout drift on every
  // click. Both wait until the pointer actually moves (dragMove). Pin the node
  // in place so a click alone doesn't nudge it.
  d.fx = d.x; d.fy = d.y;
}
function dragMove(event, d) {
  dragDist += Math.hypot(event.dx || 0, event.dy || 0);
  // Past the click threshold it's a genuine drag — dismiss both cards and reheat
  // the simulation once (a real drag suppresses the click event, so this won't
  // fight the toggle).
  if (!dragDismissed && dragDist > 6) {
    closeDetail();
    // Reheat once for a genuine drag. (No !event.active guard: event.active is
    // only 0 in start/end, so it would never be true here and the reheat would
    // never fire — leaving the whole graph frozen.)
    simulation.alphaTarget(0.3).restart();
    dragDismissed = true;
  }
  d.fx = event.x; d.fy = event.y;
}
function dragEnd(event, d) {
  // Only cool the simulation if this gesture actually reheated it (a real drag).
  if (dragDismissed && !event.active) simulation.alphaTarget(0);
  // Release the node so the layout can breathe again after repositioning.
  d.fx = null; d.fy = null;
}

// --- mode toggle & sizing -------------------------------------------------

function setMode(mode) {
  currentMode = mode;
  // A rebuilt graph drops any thread highlight; clear the state and any classes
  // lingering on reused elements (the node join resets node classes, but labels
  // and links are merged and keep theirs).
  activeThread = null;
  threadKeep = null;
  syncThreadMenu();
  // Threads + timeline are Discovery-view concepts; hide them in Connections.
  if (threadFilter) threadFilter.hidden = mode !== "discovery";
  if (timelineBtn) timelineBtn.hidden = mode !== "discovery";
  // Close the scrubber (state only — the dim/classes are cleared just below).
  stopPlay();
  scrubOpen = false;
  if (timelineRow) timelineRow.hidden = true;
  if (timelineBtn) timelineBtn.setAttribute("aria-pressed", "false");
  nodeLayer.selectAll("g.node").classed("is-thread-dim", false).classed("is-thread-origin", false);
  linkLayer.selectAll("line.link").classed("is-thread-dim", false);
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

// --- Threads highlight -----------------------------------------------------
// A "thread" is the through-line label on discovered_via entries. Selecting one
// highlights every node tagged with it (plus the origin node those members were
// discovered via), fading everything else, and frames the camera on that subset.

// Distinct threads across all nodes, with a count of everything the thread lights
// up (its tagged members PLUS the origin node, which needn't carry the thread),
// most first.
function collectThreads() {
  const threads = new Set();
  (rawData && rawData.nodes ? rawData.nodes : []).forEach((n) => {
    discoveredVia(n).forEach((d) => { if (d.thread) threads.add(d.thread); });
  });
  return [...threads]
    .map((thread) => {
      const { members, origins } = threadSets(thread);
      return { thread, count: new Set([...members, ...origins]).size };
    })
    .sort((a, b) => b.count - a.count || a.thread.localeCompare(b.thread, undefined, { sensitivity: "base" }));
}

// Members = nodes tagged with the thread. Origins = the source nodes those
// members were discovered via (an origin needn't carry the thread itself).
function threadSets(thread) {
  const members = new Set();
  const origins = new Set();
  (rawData && rawData.nodes ? rawData.nodes : []).forEach((n) => {
    const dvs = discoveredVia(n);
    if (!dvs.some((d) => d.thread === thread)) return;
    members.add(n.id);
    dvs.forEach((d) => { if (d.source && nodeById[d.source]) origins.add(d.source); });
  });
  return { members, origins };
}

function buildThreadMenu() {
  if (!threadMenu) return;
  const threads = collectThreads();
  const list = threads.length
    ? threads.map(({ thread, count }) => `
        <button type="button" class="thread-option" data-thread="${escapeHTML(thread)}">
          <span class="thread-option-name">${escapeHTML(capFirst(thread))}</span>
          <span class="thread-option-count">${count}</span>
        </button>`).join("")
    : `<div class="thread-empty">No threads yet.</div>`;
  // "Clear all" pinned at the top (like the homepage tag filter); list scrolls.
  threadMenu.innerHTML =
    `<button type="button" class="tag-clear" id="thread-clear">Clear all</button>
     <div class="tag-dropdown-divider"></div>
     <div class="thread-dropdown-scroll">${list}</div>`;
  syncThreadMenu();
}

function syncThreadMenu() {
  if (threadMenu) {
    threadMenu.querySelectorAll(".thread-option").forEach((btn) => {
      btn.classList.toggle("is-selected", btn.dataset.thread === activeThread);
    });
    const clear = threadMenu.querySelector("#thread-clear");
    if (clear) clear.disabled = !activeThread;
  }
  if (threadToggle) threadToggle.classList.toggle("is-active", !!activeThread);
  if (threadLabel) threadLabel.textContent = activeThread ? capFirst(activeThread) : "Threads";
}

// Dim everything except the thread's members + origin; glow/outline the origin;
// frame the camera on the kept subset. Passing null reverts to normal.
function applyThreadHighlight() {
  if (!activeThread) {
    threadKeep = null;
    nodeLayer.selectAll("g.node").classed("is-thread-dim", false).classed("is-thread-origin", false);
    linkLayer.selectAll("line.link").classed("is-thread-dim", false);
    updateLabelVisibility();
    autoFit = false;
    fitView(true);   // reframe the whole graph
    return;
  }
  const { members, origins } = threadSets(activeThread);
  const keep = new Set([...members, ...origins]);
  threadKeep = keep;
  nodeLayer.selectAll("g.node")
    .classed("is-thread-dim", (d) => !keep.has(d.id))
    .classed("is-thread-origin", (d) => origins.has(d.id));
  // A link stays lit only if BOTH its endpoints are in the kept set (origin↔
  // member or member↔member); any link touching a faded node fades.
  linkLayer.selectAll("line.link").classed("is-thread-dim", (d) => {
    const s = (d.source && d.source.id) || d.source;
    const t = (d.target && d.target.id) || d.target;
    return !(keep.has(s) && keep.has(t));
  });
  updateLabelVisibility();
  autoFit = false;
  const subset = simulation ? simulation.nodes().filter((n) => keep.has(n.id)) : [];
  fitView(true, subset);
}

// Select a thread (or null to clear). Selecting the active one clears it.
// On select, open the origin (source) node's card too — without moving the
// camera, since applyThreadHighlight already frames the subset.
function selectThread(thread) {
  // The timeline scrubber and thread highlight share the same fade; close the
  // scrubber row (state only) when a thread takes over.
  if (thread && scrubOpen) {
    stopPlay();
    scrubOpen = false;
    if (timelineRow) timelineRow.hidden = true;
    if (timelineBtn) timelineBtn.setAttribute("aria-pressed", "false");
  }
  activeThread = thread || null;
  syncThreadMenu();
  applyThreadHighlight();
  if (!activeThread) { closeDetail(); return; }
  const originId = [...threadSets(activeThread).origins][0];
  if (!originId) return;
  const node = (simulation ? simulation.nodes().find((n) => n.id === originId) : null) || nodeById[originId];
  if (node) openDetail(node, null, true);   // true = don't move the camera
}

if (threadToggle && threadMenu) {
  const openMenu = () => { threadMenu.hidden = false; threadToggle.setAttribute("aria-expanded", "true"); };
  const closeMenu = () => { threadMenu.hidden = true; threadToggle.setAttribute("aria-expanded", "false"); };
  threadToggle.addEventListener("click", () => (threadMenu.hidden ? openMenu() : closeMenu()));
  threadMenu.addEventListener("click", (e) => {
    if (e.target.closest("#thread-clear")) { selectThread(null); closeMenu(); return; }
    const btn = e.target.closest(".thread-option");
    if (!btn) return;
    const t = btn.dataset.thread;
    selectThread(t === activeThread ? null : t);   // re-selecting clears it
    closeMenu();                                    // close immediately after selecting
  });
  document.addEventListener("click", (e) => {
    if (threadFilter && !threadFilter.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
}

// --- Timeline scrubber -----------------------------------------------------
// Discovery-only. Steps through the actual discovered_via dates (month
// granularity): nodes discovered after the current position fade to gray (same
// treatment as a thread highlight), and the camera reframes to the visible set.

const PLAY_DURATION = 4500;   // total ms for the play button to sweep min→max

// A month key for sorting/comparison: year*12 + (month-1). "2024" → January of
// that year; "2026-03" / "2026-03-14" → that month. null if unparseable.
function dateKey(s) {
  const parts = String(s).split("-");
  const y = parseInt(parts[0], 10);
  if (isNaN(y)) return null;
  const m = parts.length >= 2 ? parseInt(parts[1], 10) : 1;
  return y * 12 + (m - 1);
}

// The month a node was first discovered (earliest date across its dv entries),
// or null if it has no dated discovery (those stay visible at every position).
function nodeDiscoveryKey(node) {
  let min = Infinity;
  discoveredVia(node).forEach((d) => {
    if (!d.date) return;
    const k = dateKey(d.date);
    if (k != null && k < min) min = k;
  });
  return isFinite(min) ? min : null;
}

// Every calendar month from the earliest to the latest discovery, inclusive —
// continuous, not just the months where something was discovered. Scrubbing
// through an empty month simply produces the same visible set as the month
// before it (no change), so the real pacing/gaps between discoveries show.
function collectTimeline() {
  let min = Infinity, max = -Infinity;
  (rawData && rawData.nodes ? rawData.nodes : []).forEach((n) => {
    discoveredVia(n).forEach((d) => {
      if (!d.date) return;
      const k = dateKey(d.date);
      if (k == null) return;
      if (k < min) min = k;
      if (k > max) max = k;
    });
  });
  if (!isFinite(min)) return [];
  const stops = [];
  for (let k = min; k <= max; k++) {
    const y = Math.floor(k / 12);
    const m = (k % 12) + 1;
    stops.push({ key: k, label: formatDiscoveryDate(`${y}-${String(m).padStart(2, "0")}`) });
  }
  return stops;
}

// Fade every node discovered after the current stop; keep undated + on-or-before
// nodes full colour. Reuses threadKeep + .is-thread-dim, and reframes the camera
// on the visible set (like a thread selection).
function applyScrub(skipCamera) {
  if (!scrubStops.length || !simulation) return;
  const cutoff = scrubStops[scrubIndex].key;
  const keep = new Set();
  simulation.nodes().forEach((n) => {
    const k = nodeDiscoveryKey(nodeById[n.id] || n);
    if (k == null || k <= cutoff) keep.add(n.id);
  });
  threadKeep = keep;
  nodeLayer.selectAll("g.node")
    .classed("is-thread-dim", (d) => !keep.has(d.id))
    .classed("is-thread-origin", false);
  linkLayer.selectAll("line.link").classed("is-thread-dim", (d) => {
    const s = (d.source && d.source.id) || d.source;
    const t = (d.target && d.target.id) || d.target;
    return !(keep.has(s) && keep.has(t));
  });
  updateLabelVisibility();
  autoFit = false;
  // Only drag/playback moves the camera; opening the scrubber leaves it put.
  if (!skipCamera) {
    const subset = simulation.nodes().filter((n) => keep.has(n.id));
    if (subset.length) fitView(true, subset);
  }
  updateScrubUI();
}

// Reflect scrubIndex on the track fill, thumb position, and current-date label.
function updateScrubUI() {
  const n = scrubStops.length;
  const frac = n > 1 ? scrubIndex / (n - 1) : 1;
  const pct = (frac * 100) + "%";
  if (timelineFill) timelineFill.style.width = pct;
  if (timelineThumb) timelineThumb.style.left = pct;
  if (timelineCurEl) timelineCurEl.textContent = scrubStops[scrubIndex] ? scrubStops[scrubIndex].label : "";
}

// Clear the scrub fade and reframe the whole graph (mirrors the thread clear).
function clearScrubFade() {
  threadKeep = null;
  nodeLayer.selectAll("g.node").classed("is-thread-dim", false).classed("is-thread-origin", false);
  linkLayer.selectAll("line.link").classed("is-thread-dim", false);
  updateLabelVisibility();
}

function openTimeline() {
  scrubStops = collectTimeline();
  scrubOpen = true;
  if (timelineRow) timelineRow.hidden = false;
  if (timelineBtn) timelineBtn.setAttribute("aria-pressed", "true");
  // Mutually exclusive with a thread highlight.
  if (activeThread) { activeThread = null; syncThreadMenu(); }
  if (!scrubStops.length) {
    if (timelineCurEl) timelineCurEl.textContent = "No dated discoveries";
    if (timelineMinEl) timelineMinEl.textContent = "";
    if (timelineMaxEl) timelineMaxEl.textContent = "";
    return;
  }
  if (timelineMinEl) timelineMinEl.textContent = Math.floor(scrubStops[0].key / 12);
  if (timelineMaxEl) timelineMaxEl.textContent = Math.floor(scrubStops[scrubStops.length - 1].key / 12);
  scrubIndex = scrubStops.length - 1;   // start at the latest date (everything visible)
  applyScrub(true);                     // reveal the scrubber without moving the camera
}

function closeTimeline() {
  stopPlay();
  scrubOpen = false;
  if (timelineRow) timelineRow.hidden = true;
  if (timelineBtn) timelineBtn.setAttribute("aria-pressed", "false");
  clearScrubFade();
  autoFit = false;   // leave the camera where it is (closing shouldn't jump it)
}

// Fade the legend back while the timeline is actively playing or being dragged,
// so it doesn't compete with the moving graph.
function setLegendDim(on) {
  const card = legend ? legend.closest(".graph-legend-card") : null;
  if (card) card.classList.toggle("is-scrub-dim", on);
}

function startPlay() {
  if (!scrubStops.length) return;
  scrubPlaying = true;
  if (timelineRow) timelineRow.classList.add("is-playing");
  setLegendDim(true);
  fitPad = PLAY_FIT_PADDING;   // more breathing room while it plays
  // Resume from where the scrubber sits; only replay from the start if we're
  // already parked at the end.
  if (scrubIndex >= scrubStops.length - 1) { scrubIndex = 0; applyScrub(); }
  const steps = Math.max(1, scrubStops.length - 1);
  scrubPlayTimer = setInterval(() => {
    if (scrubIndex >= scrubStops.length - 1) { stopPlay(); return; }
    scrubIndex++;
    applyScrub();
  }, PLAY_DURATION / steps);
}

function stopPlay() {
  scrubPlaying = false;
  if (timelineRow) timelineRow.classList.remove("is-playing");
  if (scrubPlayTimer) { clearInterval(scrubPlayTimer); scrubPlayTimer = null; }
  setLegendDim(false);
  fitPad = FIT_PADDING;
}

if (timelineBtn && timelineRow) {
  timelineBtn.addEventListener("click", () => (scrubOpen ? closeTimeline() : openTimeline()));
  if (timelinePlay) timelinePlay.addEventListener("click", () => (scrubPlaying ? stopPlay() : startPlay()));

  // Drag anywhere on the track to scrub; snaps to the nearest discovery stop.
  let scrubbing = false;
  const scrubToPointer = (e) => {
    if (scrubStops.length < 2) return;
    const r = timelineTrack.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const idx = Math.round(frac * (scrubStops.length - 1));
    if (idx !== scrubIndex) { scrubIndex = idx; applyScrub(); }
  };
  timelineTrack.addEventListener("pointerdown", (e) => {
    if (!scrubStops.length) return;
    stopPlay();
    scrubbing = true;
    setLegendDim(true);
    try { timelineTrack.setPointerCapture(e.pointerId); } catch (_) {}
    scrubToPointer(e);
  });
  timelineTrack.addEventListener("pointermove", (e) => { if (scrubbing) scrubToPointer(e); });
  const endScrub = (e) => {
    scrubbing = false;
    setLegendDim(false);
    try { timelineTrack.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  timelineTrack.addEventListener("pointerup", endScrub);
  timelineTrack.addEventListener("pointercancel", endScrub);
}

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
  // The full-screen target is the frame (toolbar + graph), so the mode toggle
  // stays visible in full screen. iOS Safari has no element Fullscreen API, so
  // fall back to a fixed overlay (see .is-faux-fullscreen in the CSS).
  const frame = document.getElementById("graph-frame") || wrap;
  const reqFs = frame.requestFullscreen || frame.webkitRequestFullscreen;
  const exitFs = document.exitFullscreen || document.webkitExitFullscreen;
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;

  function setFsUI(on) {
    const label = on ? "Exit full screen" : "Full screen";
    fsBtn.setAttribute("aria-label", label);
    fsBtn.setAttribute("title", label);
    fsBtn.setAttribute("aria-pressed", on ? "true" : "false");
    // Let the browser apply the new element size, then re-fit the layout.
    requestAnimationFrame(relayout);
  }

  fsBtn.addEventListener("click", () => {
    if (reqFs) {
      if (fsEl()) exitFs.call(document);
      else reqFs.call(frame);
    } else {
      // No Fullscreen API (iOS): toggle the CSS overlay ourselves.
      const on = frame.classList.toggle("is-faux-fullscreen");
      document.body.classList.toggle("is-graph-faux-fs", on);
      setFsUI(on);
    }
  });

  const onFsChange = () => setFsUI(fsEl() === frame);
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);
}

// --- tuning panel (troubleshooting) ---------------------------------------

// Controls grouped into titled sections: the shared group renders in the left
// panel, the tier-specific (Hub/Leaf) groups in the right. Each row is
// [key, label, min, max, step, description] — the description is a hover tooltip.
const TUNING_GROUPS = [
  { side: "left", title: "Overall", controls: [
    ["charge", "Charge (repulsion)", -800, 0, 10, "How hard nodes push apart — more negative spreads the graph out."],
    ["linkDistance", "Link distance", 20, 240, 5, "Preferred length of each connection line."],
    ["collidePad", "Collision padding", 0, 80, 1, "Extra empty space kept around every node so they don't overlap."],
    ["linkWidth", "Line thickness", 0.5, 6, 0.1, "Stroke width of the connection lines (arrowheads scale with it)."],
  ] },
  { side: "right", title: "Hub", controls: [
    ["hubThreshold", "Hub threshold", 0, 20, 1, "Outgoing connections a node needs to count as a hub (bigger, always labelled, hollow/dashed)."],
    ["growthStep", "Hub growth step", 0, 10, 0.5, "How much a hub's radius grows per outgoing connection."],
    ["hubFont", "Hub font", 8, 40, 1, "Font size of hub labels."],
    ["hubMaxLabelWidth", "Hub max label width", 40, 400, 5, "Pixel width before a hub label is trimmed with an ellipsis."],
    ["hubLabelThreshold", "Hub label threshold", 0, 40, 1, "On-screen size a hub must reach before its label shows (0 = always shown)."],
  ] },
  { side: "right", title: "Leaf", controls: [
    ["nodeBase", "Leaf base radius", 4, 30, 1, "Base radius every node grows from."],
    ["leafStep", "Leaf growth step", 0, 10, 0.5, "How much a leaf's radius grows per outgoing connection."],
    ["leafFont", "Leaf font", 8, 40, 1, "Font size of leaf labels (shown on hover / zoom)."],
    ["leafMaxLabelWidth", "Leaf max label width", 40, 400, 5, "Pixel width before a leaf label is trimmed with an ellipsis."],
    ["leafLabelThreshold", "Leaf label threshold", 0, 40, 1, "On-screen size a leaf must reach before its label appears as you zoom in."],
  ] },
];

// Only these knobs feed the force simulation, so only they re-lay-out the graph.
// Everything else is visual (sizes/labels/colours) and updates in place — the
// layout stays frozen so you can compare settings without it drifting.
const LAYOUT_KEYS = new Set(["charge", "linkDistance", "collidePad"]);

// Snapshot of the baked-in defaults, so the Reset button can restore them.
const TUNING_DEFAULTS = { ...TUNING };

function initTuningPanel() {
  if (!tuningPanel || !tuningBtn) return;
  tuningPanel.innerHTML = "";

  const rows = [];  // { key, input, val } for the Reset button
  const buildRow = (parent, [key, label, min, max, step, desc]) => {
    const row = document.createElement("label");
    row.className = "tuning-row";
    if (desc) row.title = desc;   // brief explanation on hover
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
      if (!rawData) return;
      // Force knobs re-lay-out; visual knobs update in place (layout stays put).
      if (LAYOUT_KEYS.has(key)) render(currentMode);
      else refreshVisuals();
    });
    row.append(head, input);
    parent.appendChild(row);
    rows.push({ key, input, val });
  };

  // One column per group (Overall / Hub / Leaf), laid out as a row along the
  // bottom of the graph.
  const sections = document.createElement("div");
  sections.className = "tuning-sections";
  TUNING_GROUPS.forEach((group) => {
    const section = document.createElement("div");
    section.className = "tuning-section";
    const title = document.createElement("div");
    title.className = "tuning-group-title";
    title.textContent = group.title;
    section.appendChild(title);
    group.controls.forEach((ctrl) => buildRow(section, ctrl));
    sections.appendChild(section);
  });
  tuningPanel.appendChild(sections);

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
  });
}
initTuningPanel();

// --- "last updated" stamp -------------------------------------------------
// Ask the GitHub API for the most recent commit that touched the graph data,
// and show its date under the intro. Best-effort: any failure (offline, rate
// limit, API down) just leaves the line hidden — the graph is unaffected.
(function showLastUpdated() {
  const el = document.getElementById("precursors-updated");
  if (!el) return;
  const url =
    "https://api.github.com/repos/sourfruits/sourfruits.github.io/commits" +
    "?path=data/precursors.json&per_page=1";
  fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .then((commits) => {
      const iso = commits && commits[0] && commits[0].commit &&
        commits[0].commit.committer && commits[0].commit.committer.date;
      if (!iso) return;
      const d = new Date(iso);
      const nice = d.toLocaleDateString(undefined, {
        year: "numeric", month: "long", day: "numeric",
      });
      el.textContent = "Updated " + nice;
      el.hidden = false;
    })
    .catch(() => { /* leave it hidden */ });
})();

// --- boot -----------------------------------------------------------------

Promise.all([
  fetch("data/precursors.json").then((r) => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }),
  // Posts are only needed to list a node's matching posts in the card; a failure
  // there shouldn't sink the whole graph, so swallow it and carry on.
  fetchPosts().catch(() => []),
])
  .then(([graph, posts]) => {
    rawData = graph;
    allPosts = posts;
    // A node may omit `label`; derive it from the id so the label stays coupled
    // to the id (e.g. "class-dis-philosophy" → "Dis Philosophy").
    graph.nodes.forEach((n) => { if (!n.label) n.label = humanizeId(n.id); });
    graph.nodes.forEach((n) => { nodeById[n.id] = n; });
    status.textContent = "";
    buildThreadMenu();
    setMode(currentMode);
  })
  .catch((err) => {
    status.textContent = "Couldn't load the graph. If you opened this file directly, run a local server (see the README).";
    status.classList.add("error");
    console.error(err);
  });
