// Precursors: a force-directed graph of where things were discovered and how
// they personally connect. Reads data/precursors.json (the graph) and, for
// hover labels, data/posts.json (to resolve post_ids to real post titles).
//
// Two views are computed from the *same* dataset at render time:
//   Discovery   — every content node plus synthesized "source" hubs pulled from
//                 discovered_via.source, with source → node edges.
//   Connections — content nodes only, wired by the connections array; causal
//                 edges are drawn distinct (red, via --causal) from thematic ones.
//
// All colors are set through the site's CSS custom properties (--ink, --muted,
// --line, --accent, --surface, --causal), so the graph follows the light/dark
// theme toggle automatically — no hardcoded hex values here.

const svg = d3.select("#graph");
const wrap = document.getElementById("graph-wrap");
const tooltip = document.getElementById("graph-tooltip");
const legend = document.getElementById("graph-legend");
const status = document.getElementById("status");
const modeButtons = document.querySelectorAll(".mode-btn");

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

const zoom = d3.zoom().scaleExtent([0.25, 4]).on("zoom", (event) => {
  zoomLayer.attr("transform", event.transform);
});
svg.call(zoom);

function size() {
  const rect = wrap.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
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
// with a directional-ish source → node edge for each.
function buildDiscovery(data) {
  const nodes = data.nodes.map((n) => ({ ...n, isSource: false }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sources = new Map();
  const links = [];

  data.nodes.forEach((n) => {
    const src = n.discovered_via && n.discovered_via.source;
    if (!src) return;
    if (!sources.has(src)) {
      sources.set(src, {
        id: `source:${src}`,
        label: sourceLabel(src),
        kind: sourceType(src),
        isSource: true,
        post_ids: [],
      });
    }
    links.push({
      source: `source:${src}`,
      target: n.id,
      causal: false,
      kind: "discovery",
      note: n.discovered_via.note || "",
    });
  });

  return { nodes: nodes.concat([...sources.values()]), links, byId };
}

// Connections view: content nodes only, wired by the connections array.
function buildConnections(data) {
  const nodes = data.nodes.map((n) => ({ ...n, isSource: false }));
  const known = new Set(nodes.map((n) => n.id));
  const links = (data.connections || [])
    // Skip any connection pointing at a node id that doesn't exist, rather
    // than letting the simulation choke on a dangling reference.
    .filter((c) => known.has(c.from) && known.has(c.to))
    .map((c) => ({
      source: c.from,
      target: c.to,
      causal: !!c.causal,
      kind: "connection",
      note: c.note || "",
    }));
  return { nodes, links, byId: new Map(nodes.map((n) => [n.id, n])) };
}

// --- rendering ------------------------------------------------------------

function nodeRadius(d) {
  return d.isSource ? 6 : 9;
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
    .attr("class", (d) => `link${d.causal ? " is-causal" : ""}`)
    .style("stroke", (d) => (d.causal ? "var(--causal)" : "var(--muted)"))
    .style("stroke-opacity", (d) => (d.causal ? 0.9 : 0.4))
    .style("stroke-width", (d) => (d.causal ? 2 : 1.25));

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
    .style("cursor", (d) => (d.note ? "help" : "default"))
    .on("mouseenter", (event, d) => { if (d.note) showTooltip(`<span class="tip-note">${escapeHTML(d.note)}</span>`, event); })
    .on("mousemove", (event, d) => { if (d.note) moveTooltip(event); })
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

  // Content nodes are yellow in Discovery view, green in Connections view;
  // source hubs stay hollow in both. (The stroke follows the fill.)
  const contentFill = mode === "discovery" ? "var(--accent2)" : "var(--accent)";
  const contentStroke = mode === "discovery" ? "var(--accent2)" : "var(--accent-ink)";
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
    .style("font-size", (d) => (d.isSource ? "11px" : "12px"));

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
    .on("tick", () => {
      linkAll
        .attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
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
    legend.innerHTML =
      `<span class="legend-item"><span class="legend-swatch swatch-causal"></span>Causal</span>` +
      `<span class="legend-item"><span class="legend-swatch swatch-thematic"></span>Thematic</span>`;
  } else {
    legend.innerHTML =
      `<span class="legend-item"><span class="legend-swatch swatch-node"></span>Post / node</span>` +
      `<span class="legend-item"><span class="legend-swatch swatch-source"></span>Source</span>`;
  }
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

// Keep the center force and the SVG viewport in step with the container size.
window.addEventListener("resize", () => {
  if (!simulation) return;
  const { w, h } = size();
  simulation.force("center", d3.forceCenter(w / 2, h / 2));
  simulation.alpha(0.3).restart();
});

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
