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

// ── Tunable ────────────────────────────────────────────────────────────────
// Label density and node/label sizing. Edit these defaults, or adjust them live
// via the "Tuning" panel on the page (toggle button in the toolbar) — handy for
// troubleshooting without an edit-and-refresh loop.
const TUNING = {
  labelThreshold: 5,   // on-screen node radius (size × zoom, px) to show a label by default
  maxLabelWidth: 170,  // label pixel width (world units) before it's cut off with an ellipsis
  nodeBase: 11,        // leaf/content node radius (world units)
  growthStep: 3,       // + radius per outgoing directional link, capped at 4 steps
  sourceRadius: 7,     // discovery source-hub radius
  nodeFont: 18,        // content label font (px)
  sourceFont: 15,      // source-hub label font (px)
  // Force-simulation knobs:
  charge: -260,        // many-body repulsion (more negative = nodes push apart harder)
  linkDistance: 90,    // preferred edge length
  collidePad: 22,      // extra spacing beyond each node's radius (collision force)
};
// ─────────────────────────────────────────────────────────────────────────────

const svg = d3.select("#graph");
const wrap = document.getElementById("graph-wrap");
const tooltip = document.getElementById("graph-tooltip");
const legend = document.getElementById("graph-legend");
const status = document.getElementById("status");
const modeButtons = document.querySelectorAll(".mode-btn");
const fsBtn = document.getElementById("graph-fs");
const tuningBtn = document.getElementById("graph-tuning-btn");
const tuningPanel = document.getElementById("tuning-panel");
const resetBtn = document.getElementById("graph-reset");

let rawData = null;      // parsed precursors.json
let postTitles = {};     // post id -> title, for hover labels
let currentMode = "discovery";
let simulation = null;

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
let currentScale = 1;  // live zoom scale, drives size-based label visibility
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

// Discovery view: content nodes + a hub per distinct discovered_via.source,
// with a source → node edge for each. A `source` that matches an existing node
// id draws the edge straight from that node (the discovery came from another
// thing in the graph); anything else synthesizes a shared source hub.
function buildDiscovery(data) {
  const nodes = data.nodes.map((n) => ({ ...n, isSource: false }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const sources = new Map();
  const links = [];

  data.nodes.forEach((n) => {
    const dv = n.discovered_via;
    const src = dv && dv.source;
    if (!src) return;
    const note = dv.note || "";
    if (nodeIds.has(src)) {
      links.push({ source: src, target: n.id, kind: "discovery", note });
    } else {
      if (!sources.has(src)) {
        sources.set(src, {
          id: `source:${src}`,
          label: sourceLabel(src),
          kind: sourceType(src),
          isSource: true,
          post_ids: [],
        });
      }
      links.push({ source: `source:${src}`, target: n.id, kind: "discovery", note });
    }
  });

  return { nodes: nodes.concat([...sources.values()]), links };
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
  // Base size = a node's own outgoing size-directional out-degree (influence /
  // adaptation). Authorship doesn't count directly; instead, for each work a
  // node authored, that work's OWN base out-degree is added — exactly one hop,
  // so a work's downstream (third-level) activity never cascades back.
  // outDegree (all directional out, authorship included) is kept for the hover.
  const sizeOut = new Map();    // id -> influence/adaptation out-degree
  const outDegree = new Map();  // id -> all directional out-degree (hover count)
  const authored = new Map();   // id -> [ids of works it authored]
  edges.forEach((e) => {
    if (!e.directional) return;
    outDegree.set(e.source, (outDegree.get(e.source) || 0) + 1);
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
    n.outDegree = outDegree.get(n.id) || 0;
  });

  return { nodes, links: edges };
}

// --- rendering ------------------------------------------------------------

// Source hubs are small; content nodes start at 9 and grow 3px per outgoing
// directional connection (capped), so influential origins read as larger.
function nodeRadius(d) {
  if (d.isSource) return TUNING.sourceRadius;
  return TUNING.nodeBase + Math.min(d.growth || 0, 4) * TUNING.growthStep;
}

// Label font size (world units) for a node.
function labelFontSize(d) {
  return d.isSource ? TUNING.sourceFont : TUNING.nodeFont;
}

// A label is visible if the node is hovered, or its *rendered* radius (data
// size × current zoom) clears TUNING.labelThreshold (see top of file) — so bigger
// hubs stay labelled at any zoom, and small nodes reveal their labels once you
// zoom in close enough.
function labelVisible(d) {
  return d.__hover === true || nodeRadius(d) * currentScale >= TUNING.labelThreshold;
}
function updateLabelVisibility() {
  nodeLayer.selectAll("g.node").select("text")
    .style("opacity", (d) => (labelVisible(d) ? 1 : 0));
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

// Whether an edge's type is drawn dashed (e.g. authorship).
function edgeDashed(d) {
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

// Post title(s) behind a node, resolved from post_ids for the hover card.
function postTitlesFor(d) {
  return (d.post_ids || [])
    .map((id) => postTitles[id])
    .filter(Boolean);
}

function nodeTooltipHTML(d) {
  let html = `<strong>${escapeHTML(d.label)}</strong>`;
  if (d.kind) html += `<span class="tip-kind">${escapeHTML(d.kind)}</span>`;
  if (!d.isSource) {
    const titles = postTitlesFor(d);
    if (titles.length) {
      html += `<span class="tip-posts">${titles.map(escapeHTML).join("<br>")}</span>`;
    }
  }
  const n = d.degree || 0;
  let meta = `${n} connection${n === 1 ? "" : "s"}`;
  // Directional links originating here — the node's "children" (things it
  // influenced / adapted / authored). Only shown when there are any.
  const out = d.outDegree || 0;
  if (out) meta += ` · ${out} outgoing →`;
  html += `<span class="tip-degree">${meta}</span>`;
  return html;
}

function showTooltip(html, event) {
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  moveTooltip(event);
}

function moveTooltip(event) {
  const rect = wrap.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  // Nudge up/right of the cursor, clamped so it never spills out of the frame.
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  tooltip.style.left = Math.min(Math.max(8, x + 14), rect.width - tw - 8) + "px";
  tooltip.style.top = Math.min(Math.max(8, y - th - 12), rect.height - th - 8) + "px";
}

function hideTooltip() {
  tooltip.hidden = true;
}

function render(mode) {
  const graph = mode === "connections"
    ? buildConnections(rawData)
    : buildDiscovery(rawData);

  const { w, h } = size();
  autoFit = true;  // reframe this fresh layout as it settles

  // Count each node's connections in this view (edges touching it), for the
  // hover card. Done now, while link endpoints are still plain ids.
  const degree = new Map();
  graph.links.forEach((l) => {
    const s = idOf(l.source), t = idOf(l.target);
    degree.set(s, (degree.get(s) || 0) + 1);
    degree.set(t, (degree.get(t) || 0) + 1);
  });
  graph.nodes.forEach((n) => { n.degree = degree.get(n.id) || 0; });

  // Seed positions from the cache (or the center) so the layout doesn't jump
  // when toggling modes.
  graph.nodes.forEach((n) => {
    const cached = posCache.get(n.id);
    if (cached) { n.x = cached.x; n.y = cached.y; }
    else { n.x = w / 2 + (Math.random() - 0.5) * 80; n.y = h / 2 + (Math.random() - 0.5) * 80; }
  });

  // --- links ---
  const link = linkLayer.selectAll("line.link")
    .data(graph.links, (d) => `${idOf(d.source)}->${idOf(d.target)}`);
  link.exit().remove();
  const linkEnter = link.enter().append("line").attr("class", "link");
  const linkAll = linkEnter.merge(link)
    .attr("class", "link")
    .attr("marker-end", (d) => (d.directional ? `url(#arrow-${d.type})` : null))
    .style("stroke", edgeColor)
    .style("stroke-opacity", (d) => (d.type ? 0.85 : 0.4))
    .style("stroke-width", (d) => (d.directional ? 2 : 1.4))
    .style("stroke-dasharray", (d) => (edgeDashed(d) ? "5 4" : null));

  // Transparent, thick hit lines so thin edges are still easy to hover.
  const hit = linkLayer.selectAll("line.link-hit")
    .data(graph.links, (d) => `${idOf(d.source)}->${idOf(d.target)}`);
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
    .text((d) => truncateLabel(d.label, labelFontSize(d)))
    .style("fill", (d) => (d.isSource ? "var(--muted)" : "var(--ink)"))
    .style("font-family", "var(--font-sans)")
    .style("font-size", (d) => labelFontSize(d) + "px");

  nodeAll
    .on("mouseenter", (event, d) => { d.__hover = true; updateLabelVisibility(); showTooltip(nodeTooltipHTML(d), event); })
    .on("mousemove", moveTooltip)
    .on("mouseleave", (event, d) => { d.__hover = false; updateLabelVisibility(); hideTooltip(); })
    .call(d3.drag()
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

// Place each node's label on the outward side — the direction from the graph's
// centroid to the node — so labels fan away from the middle instead of all
// sitting on the right. Runs each tick as positions shift.
function positionLabels(nodes, sel) {
  if (!nodes.length) return;
  let sx = 0, sy = 0;
  for (const n of nodes) { sx += n.x || 0; sy += n.y || 0; }
  const cx = sx / nodes.length, cy = sy / nodes.length;
  sel.select("text").each(function (d) {
    const dx = (d.x || 0) - cx, dy = (d.y || 0) - cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const gap = nodeRadius(d) + 5;
    d3.select(this)
      .attr("x", ux * gap)
      .attr("y", uy * gap)
      .attr("text-anchor", ux > 0.25 ? "start" : ux < -0.25 ? "end" : "middle")
      .attr("dominant-baseline", uy > 0.25 ? "hanging" : uy < -0.25 ? "auto" : "middle");
  });
}

// Basic label collision avoidance. Each visible label gets an approximate
// bounding box (matching positionLabels' outward geometry); any *other* node
// sitting inside that box is nudged out of it. Velocity-based and alpha-scaled,
// so it blends with the layout instead of fighting it and fades out as things
// settle — keeping always-on hub labels from being covered by a neighbour.
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
      const w = Math.max(measureTextWidth(truncateLabel(L.label, fs), fs), fs);
      const h = fs;
      const gap = nodeRadius(L) + 5;
      const dx = (L.x || 0) - cx, dy = (L.y || 0) - cy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const ax = (L.x || 0) + ux * gap, ay = (L.y || 0) + uy * gap;
      const x0 = ux > 0.25 ? ax : ux < -0.25 ? ax - w : ax - w / 2;
      const y0 = uy > 0.25 ? ay : uy < -0.25 ? ay - h : ay - h / 2;
      boxes.push({ node: L, x0, y0, x1: x0 + w, y1: y0 + h, mx: x0 + w / 2, my: y0 + h / 2 });
    }
    if (!boxes.length) return;

    const strength = 0.6 * alpha;
    for (const b of boxes) {
      for (const n of nodes) {
        if (n === b.node) continue;
        const r = nodeRadius(n) + 2;
        if (n.x > b.x0 - r && n.x < b.x1 + r && n.y > b.y0 - r && n.y < b.y1 + r) {
          let dx = n.x - b.mx, dy = n.y - b.my;
          if (dx === 0 && dy === 0) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
          const d = Math.hypot(dx, dy) || 1;
          n.vx += (dx / d) * strength * 4;
          n.vy += (dy / d) * strength * 4;
        }
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

function renderLegend(mode) {
  legend.setAttribute("aria-hidden", "false");
  if (mode === "connections") {
    // One entry per relationship type, coloured to match its line; directional
    // types get an arrow glyph.
    legend.innerHTML = Object.values(RELATIONSHIP_TYPES).map((t) =>
      `<span class="legend-item"><span class="legend-swatch" style="border-top-color:${t.color}${t.dashed ? ";border-top-style:dashed" : ""}"></span>${t.label}${t.directional ? " →" : ""}</span>`
    ).join("");
    return;
  }
  legend.innerHTML =
    `<span class="legend-item"><span class="legend-swatch swatch-node"></span>Post / node</span>` +
    `<span class="legend-item"><span class="legend-swatch swatch-source"></span>Source</span>`;
}

// --- drag -----------------------------------------------------------------

function dragStart(event, d) {
  autoFit = false;  // hand off framing control to the user once they grab a node
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x; d.fy = d.y;
}
function dragMove(event, d) {
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
    fsBtn.textContent = on ? "Exit full screen" : "Full screen";
    fsBtn.setAttribute("aria-pressed", on ? "true" : "false");
    // Let the browser apply the new element size, then re-fit the layout.
    requestAnimationFrame(relayout);
  });
}

// --- tuning panel (troubleshooting) ---------------------------------------

// One row per TUNING key: [key, label, min, max, step].
const TUNING_CONTROLS = [
  ["labelThreshold", "Label threshold", 0, 40, 1],
  ["maxLabelWidth", "Max label width", 40, 400, 5],
  ["nodeBase", "Node base radius", 4, 30, 1],
  ["growthStep", "Growth step", 0, 10, 0.5],
  ["sourceRadius", "Source radius", 3, 20, 1],
  ["nodeFont", "Node font", 8, 40, 1],
  ["sourceFont", "Source font", 8, 40, 1],
  ["charge", "Charge (repulsion)", -800, 0, 10],
  ["linkDistance", "Link distance", 20, 240, 5],
  ["collidePad", "Collision padding", 0, 80, 1],
];

// Snapshot of the baked-in defaults, so the Reset button can restore them.
const TUNING_DEFAULTS = { ...TUNING };

function initTuningPanel() {
  if (!tuningPanel || !tuningBtn) return;

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
      if (rawData) render(currentMode);  // re-render live with the new value
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
    status.textContent = "";
    setMode(currentMode);
  })
  .catch((err) => {
    status.textContent = "Couldn't load the graph. If you opened this file directly, run a local server (see the README).";
    status.classList.add("error");
    console.error(err);
  });

initBackButton();
