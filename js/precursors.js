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

const svg = d3.select("#graph");
const wrap = document.getElementById("graph-wrap");
const tooltip = document.getElementById("graph-tooltip");
const legend = document.getElementById("graph-legend");
const status = document.getElementById("status");
const modeButtons = document.querySelectorAll(".mode-btn");
const fsBtn = document.getElementById("graph-fs");

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
// Thin frame marking the containment boundary (the world edges). It lives inside
// the zoom layer so it pans/zooms with the graph, making the limits visible.
const boundary = zoomLayer.append("rect").attr("class", "graph-boundary");
const linkLayer = zoomLayer.append("g").attr("class", "links");
const nodeLayer = zoomLayer.append("g").attr("class", "nodes");

// Preset relationship types for connections. Directional types draw an arrow
// from the origin (the node the connection is written on) and grow the origin
// node; non-directional types are symmetric with no arrow. Each has its own
// line color (a CSS custom property, so it follows the theme) and legend label.
const RELATIONSHIP_TYPES = {
  adaptation: { directional: true,  label: "Adaptation", color: "var(--rel-adaptation)" },
  influence:  { directional: true,  label: "Influence",  color: "var(--rel-influence)" },
  response:   { directional: true,  label: "Response",   color: "var(--rel-response)" },
  companion:  { directional: false, label: "Companion",  color: "var(--rel-companion)" },
  thematic:   { directional: false, label: "Thematic",   color: "var(--rel-thematic)" },
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

const zoom = d3.zoom().scaleExtent([0.5, 4]).on("zoom", (event) => {
  zoomLayer.attr("transform", event.transform);
});
svg.call(zoom);

// Fence the pan/zoom to the canvas so the graph can never be scrolled or zoomed
// off into empty space — panning is only possible while zoomed in, and never
// past the canvas edges. Kept in step with the current size.
function updateZoomExtent() {
  const { w, h } = size();
  zoom.extent([[0, 0], [w, h]]).translateExtent([[0, 0], [w, h]]);
}

// Escape hatch: double-click anywhere resets the view to fit (identity zoom),
// so it's impossible to get permanently lost.
svg.on("dblclick.zoom", null);
svg.on("dblclick", () => {
  svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
});

function size() {
  const rect = wrap.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

// Live canvas bounds the containment force reads each tick, so a resize takes
// effect without rebuilding the force.
const bounds = { w: 0, h: 0 };

// Keep every node inside the visible canvas — clamp its centre to the bounds
// (minus its radius and a little padding) on each tick, so nothing drifts off
// the edge or renders clipped outside the frame.
function forceContain() {
  let nodes = [];
  function force() {
    if (!bounds.w || !bounds.h) return;
    for (const n of nodes) {
      const pad = nodeRadius(n) + 4;
      n.x = Math.max(pad, Math.min(bounds.w - pad, n.x));
      n.y = Math.max(pad, Math.min(bounds.h - pad, n.y));
    }
  }
  force.initialize = (n) => { nodes = n; };
  return force;
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
  const byId = new Map(nodes.map((n) => [n.id, n]));
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
      const key = [node.id, to].sort().join(" ");
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push({ from: node.id, to, type });
    });
  });

  const edges = [];
  pairs.forEach((entries) => {
    const directional = entries.filter((e) => e.type && RELATIONSHIP_TYPES[e.type].directional);
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
        const origin = byId.get(d.from);
        if (origin) origin.growth += 1;  // out-degree drives node size
      }
    }
    edges.push(edge);
  });

  return { nodes, links: edges };
}

// --- rendering ------------------------------------------------------------

// Source hubs are small; content nodes start at 9 and grow 3px per outgoing
// directional connection (capped), so influential origins read as larger.
function nodeRadius(d) {
  if (d.isSource) return 6;
  return 9 + Math.min(d.growth || 0, 4) * 3;
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
  bounds.w = w;
  bounds.h = h;
  updateZoomExtent();
  boundary.attr("x", 0).attr("y", 0).attr("width", w).attr("height", h);

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
    .style("stroke-width", (d) => (d.directional ? 2 : 1.4));

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

  nodeAll.select("text")
    .text((d) => d.label)
    .attr("x", (d) => nodeRadius(d) + 5)
    .attr("y", 4)
    .style("fill", (d) => (d.isSource ? "var(--muted)" : "var(--ink)"))
    .style("font-family", "var(--font-sans)")
    .style("font-size", (d) => (d.isSource ? "14px" : "16px"));

  nodeAll
    .on("mouseenter", (event, d) => showTooltip(nodeTooltipHTML(d), event))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .call(d3.drag()
      .on("start", dragStart)
      .on("drag", dragMove)
      .on("end", dragEnd));

  // --- simulation ---
  if (simulation) simulation.stop();
  simulation = d3.forceSimulation(graph.nodes)
    .force("link", d3.forceLink(graph.links).id((d) => d.id).distance(90).strength(0.5))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(w / 2, h / 2))
    .force("collide", d3.forceCollide().radius((d) => nodeRadius(d) + 22))
    .force("contain", forceContain())
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
    });
  simulation.alpha(0.9).restart();

  renderLegend(mode);
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
      `<span class="legend-item"><span class="legend-swatch" style="border-top-color:${t.color}"></span>${t.label}${t.directional ? " →" : ""}</span>`
    ).join("");
    return;
  }
  legend.innerHTML =
    `<span class="legend-item"><span class="legend-swatch swatch-node"></span>Post / node</span>` +
    `<span class="legend-item"><span class="legend-swatch swatch-source"></span>Source</span>`;
}

// --- drag -----------------------------------------------------------------

function dragStart(event, d) {
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

// Keep the center force, containment bounds, and zoom fence in step with the
// current container size (fires on window resize and on entering/leaving
// full screen, where the canvas size changes dramatically).
function relayout() {
  if (!simulation) return;
  const { w, h } = size();
  bounds.w = w;
  bounds.h = h;
  updateZoomExtent();
  boundary.attr("width", w).attr("height", h);
  simulation.force("center", d3.forceCenter(w / 2, h / 2));
  simulation.alpha(0.3).restart();
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
