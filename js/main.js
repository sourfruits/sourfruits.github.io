// Photo grid (now on index.html): load every post from data/posts.json and render
// the thumbnail grid, paginated. Above it: medium tabs (All · Film · Books ·
// Music, synced to ?medium=), a dropdown for the other tags — length, form and
// theme (multi-select, AND logic, synced to ?tags=, with the drafts switch at
// its bottom) — and a grid-density toggle. (A
// carousel preview built by js/home.js is stashed in snippets/carousel.html.)

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const pagination = document.getElementById("pagination");
const tagFilter = document.getElementById("tag-filter");
const tagToggle = document.getElementById("tag-dropdown-toggle");
const tagMenu = document.getElementById("tag-dropdown-menu");
const tagLabel = document.getElementById("tag-dropdown-label");
const densityToggle = document.querySelector(".density-toggle");
const draftsToggle = document.getElementById("drafts-toggle");
const draftsLabel = draftsToggle.querySelector(".drafts-label");
const mediumTabs = document.getElementById("medium-tabs");

const DENSITY_KEY = "grid-density-v3";   // v3: the default changed to compact, so older saved choices start fresh
const VIEWS = ["normal", "compact"];
// Posts per page for each view — different  on desktop and mobile (number
// of columns depends on page width).
const PER_PAGE = {
  normal:  { desktop: 9,  mobile: 12 },   // pick your mobile number
  compact: { desktop: 16, mobile: 15 }
};

function getPerPage(view) {
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  return PER_PAGE[view][isMobile ? "mobile" : "desktop"];
}


// This page's own filename, so pagination + ?tags= URLs stay on whatever page
// hosts the grid. Kept dynamic rather than hardcoded so main.js works wherever
// it's loaded — the grid lives on index.html now, but this doesn't assume that.
const PAGE = window.location.pathname.split("/").pop() || "index.html";

let allPosts = [];
let allTags = [];              // every tag, ordered by post count (ties alphabetical)
let selectedTags = new Set();  // every tag ticked in the dropdown (the tabs tick media here too)
// Drafts live in the link (?drafts=1), like tags: paging keeps them, but
// landing on the page fresh starts with drafts off.
let showDrafts = new URLSearchParams(window.location.search).get("drafts") === "1";
let currentView = "normal";    // normal | compact

// Capitalize a tag's first letter for display (values stay lowercase).
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Selected tags parsed from ?tags= (comma-separated).
function tagsFromURL() {
  const raw = new URLSearchParams(window.location.search).get("tags") || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// The selected tags as a comma-joined string, in the menu's display order so
// the URL is stable and readable.
function selectedParam() {
  return allTags.filter((t) => selectedTags.has(t)).join(",");
}

// Build an href for a given page number, preserving ?tags= and keeping page 1 clean.
function pageHref(page) {
  const params = new URLSearchParams();
  const tags = selectedParam();
  if (tags) params.set("tags", tags);
  if (showDrafts) params.set("drafts", "1");
  if (page > 1) params.set("page", page);
  const qs = params.toString();
  return qs ? `${PAGE}?${qs}` : PAGE;
}

function renderGrid(posts) {
  // Pinned first, then newest-first, regardless of order in the JSON file.
  sortPosts(posts);

  // Variable page size per view, different on phone and desktop.
  Pagination.paginate({
    items: posts,
    perPage: getPerPage(currentView),
    container: pagination,
    hrefFor: pageHref,
    renderItems: (pagePosts) => {
      grid.innerHTML = pagePosts.map(renderTile).join("");
      fitTileTags();
    },
  });

  status.textContent = posts.length
    ? ""
    : (selectedTags.size ? "Nothing matches these tags." : "Nothing here yet.");
}

// The pool the grid and tag menu work from: all posts, minus drafts unless the
// drafts toggle is on.
function baseSet() {
  return showDrafts ? allPosts : allPosts.filter((p) => !isDraft(p));
}

// AND logic: a post must carry every selected tag. No selection → show all.
function filteredPosts() {
  const posts = baseSet();
  if (selectedTags.size === 0) return posts;
  const wanted = [...selectedTags];
  return posts.filter((p) =>
    Array.isArray(p.tags) && wanted.every((t) => p.tags.includes(t)));
}

// Medium tabs: "All · Film · Books · Music" — the media listed in
// data/tags.txt, in that order (only ones some post has). Same look as the
// Writing page's form tabs. They're shortcuts into the dropdown: clicking
// Film ticks "film" there (and unticks any other medium); All unticks them
// all. A tab is lit when its medium is the one ticked, so "Clear all" — or
// unticking it in the menu — brings the tabs back to All.
function currentMedium() {
  const picked = [...selectedTags].filter((t) => tagKind(t) === "medium");
  return picked.length === 1 ? picked[0] : picked.length ? null : "";
}
function renderMediumTabs() {
  const base = baseSet();
  const counts = new Map();
  base.forEach((p) => (Array.isArray(p.tags) ? p.tags : [])
    .forEach((t) => { if (tagKind(t) === "medium") counts.set(t, (counts.get(t) || 0) + 1); }));
  const media = groupTagsByKind(counts, ["medium"]).flatMap((g) => g.tags);
  const selectedMedium = currentMedium();   // "" = All, null = several ticked (no tab lit)
  mediumTabs.hidden = media.length === 0;
  const tab = (key, label, n) =>
    `<button type="button" class="form-tab${selectedMedium === key ? " is-on" : ""}" data-medium="${escapeHTML(key)}" aria-pressed="${selectedMedium === key}">` +
    `<span class="form-tab-name" data-label="${escapeHTML(label)}">${escapeHTML(label)}</span></button>`;
  mediumTabs.innerHTML = tab("", "All", base.length) + media.map((t) => tab(t, capFirst(t), counts.get(t))).join("");
}
mediumTabs.addEventListener("click", (e) => {
  const b = e.target.closest(".form-tab");
  if (!b) return;
  [...selectedTags].forEach((t) => { if (tagKind(t) === "medium") selectedTags.delete(t); });
  if (b.dataset.medium) selectedTags.add(b.dataset.medium);
  updateURL();
  applyFilter();
});

// Build the dropdown checklist: a "Clear all" action, then one checkbox per
// tag, ordered by post count (ties alphabetical).
function buildMenu(posts) {
  const counts = new Map();
  posts.forEach((post) => {
    if (!Array.isArray(post.tags)) return;
    post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  // Every tag, grouped by kind with a thin line between: lengths, forms,
  // media (also reachable from the tabs), then themes (data/tags.txt).
  const groups = groupTagsByKind(counts);
  allTags = groups.flatMap((g) => g.tags);

  // Custom accent checkmark (Letterboxd-style) that replaces the native checkbox.
  const check = `<span class="tag-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`;
  const option = (tag) => `
      <label class="tag-option">
        <input type="checkbox" value="${escapeHTML(tag)}">
        ${check}
        <span class="tag-option-name">${escapeHTML(capFirst(tag))}</span>
        <span class="tag-option-count">${counts.get(tag)}</span>
      </label>`;
  tagMenu.innerHTML =
    // "Clear all" pinned at the top (doesn't scroll with the list)…
    `<button type="button" class="tag-clear" id="tag-clear">Clear all</button>
     <div class="tag-dropdown-divider"></div>` +
    // …then the scrollable list of tags below it.
    `<div class="tag-dropdown-scroll">` +
    groups.map((g) => g.tags.map(option).join("")).join(`<div class="tag-group-line"></div>`) +
    `</div>`;
  // The Drafts switch lives at the bottom of this menu (tucked away rather
  // than up front); it's only shown when there are drafts.
  if (!draftsToggle.hidden) {
    draftsToggle.classList.add("drafts-in-menu");
    tagMenu.appendChild(draftsToggle);
  }
}

// Reflect the selection on the checkboxes, the toggle label (with the number of
// matching posts), and whether "Clear all" is enabled.
function syncMenu(matchCount) {
  tagMenu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = selectedTags.has(cb.value);
  });
  // Every tick narrows. Each unticked tag's count is how many of the posts
  // showing now also have it. A tag at 0 can still be ticked — it just
  // shows nothing until something else is unticked.
  const showing = filteredPosts();
  const tagsOf = (p) => (Array.isArray(p.tags) ? p.tags : []);
  tagMenu.querySelectorAll(".tag-option").forEach((row) => {
    const cb = row.querySelector('input[type="checkbox"]');
    const n = cb.checked ? showing.length : showing.filter((p) => tagsOf(p).includes(cb.value)).length;
    row.querySelector(".tag-option-count").textContent = n;
  });
  const n = selectedTags.size;
  if (n === 0) tagLabel.textContent = "Tags";
  else if (n === 1) tagLabel.textContent = capFirst(selectedParam());
  else tagLabel.textContent = `${n} tags`;
  // Underline the toggle while a filter is applied.
  tagToggle.classList.toggle("is-active", n > 0);
  const clear = document.getElementById("tag-clear");
  // "Clear all" is live whenever there's something to undo: a ticked tag or drafts on.
  if (clear) clear.disabled = n === 0 && !showDrafts;
}

// Write the selection to ?tags= (dropped when empty), resetting to page 1.
function updateURL() {
  const params = new URLSearchParams(window.location.search);
  const tags = selectedParam();
  if (tags) params.set("tags", tags);
  else params.delete("tags");
  if (showDrafts) params.set("drafts", "1");
  else params.delete("drafts");
  params.delete("page");
  const qs = params.toString();
  history.replaceState(null, "", qs ? `${PAGE}?${qs}` : PAGE);
}

function applyFilter() {
  renderMediumTabs();
  const posts = filteredPosts();
  syncMenu(posts.length);
  renderGrid(posts);
}

// --- dropdown open/close ---
function openMenu() {
  tagMenu.hidden = false;
  tagToggle.setAttribute("aria-expanded", "true");
}
function closeMenu() {
  tagMenu.hidden = true;
  tagToggle.setAttribute("aria-expanded", "false");
}

tagToggle.addEventListener("click", () => {
  if (tagMenu.hidden) openMenu();
  else closeMenu();
});
// Close on a click outside the menu. (A click on something the menu just
// redrew — e.g. "Clear all" rebuilding it — no longer sits in the page; ignore it.)
document.addEventListener("click", (e) => {
  if (e.target.isConnected && !tagFilter.contains(e.target)) closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

// Checking a tag toggles it in the selection; "Clear all" empties it and hides
// drafts again. The menu
// stays open so several tags can be picked in one go.
tagMenu.addEventListener("change", (e) => {
  const cb = e.target.closest('input[type="checkbox"]');
  if (!cb) return;
  if (cb.checked) selectedTags.add(cb.value);
  else selectedTags.delete(cb.value);
  updateURL();
  applyFilter();
});
tagMenu.addEventListener("click", (e) => {
  if (e.target.closest("#tag-clear")) {
    selectedTags.clear();
    if (showDrafts) setDrafts(false);
    updateURL();
    applyFilter();
  }
});

// Drafts toggle: flip whether drafts are included, then rebuild the tag menu
// (its counts follow the visible pool) and re-render the grid.
function setDrafts(on) {
  showDrafts = on;
  draftsToggle.setAttribute("aria-pressed", showDrafts ? "true" : "false");
  buildMenu(baseSet());
}
draftsToggle.addEventListener("click", () => {
  setDrafts(!showDrafts);
  updateURL();
  applyFilter();
});

// Switch the grid between the normal and compact views (column counts live in
// the CSS — normal 3/1, compact 4/3 for desktop/phone), highlighting the active
// button, remembering the choice, and re-rendering. Skips the re-render before
// posts load.
function setDensity(next, remember = true) {
  currentView = next;
  grid.classList.toggle("is-compact", next === "compact");
  densityToggle.querySelectorAll(".density-btn").forEach((btn) => {
    const active = btn.dataset.density === next;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  // Only remember a choice the visitor actually made (a toggle click), not the
  // default — so changing the default later reaches everyone who never chose.
  if (remember) { try { localStorage.setItem(DENSITY_KEY, next); } catch (err) { /* ignore */ } }
  if (allPosts.length) applyFilter();
}

densityToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".density-btn");
  // Ignore a click on the view you're already in — no needless re-render.
  if (btn && btn.dataset.density !== currentView) setDensity(btn.dataset.density);
});

// Default to the compact grid (more tiles per row on desktop and phones); a visitor's
// own choice from the toggle is remembered and wins on later visits.
let initialView = "compact";
try {
  const saved = localStorage.getItem(DENSITY_KEY);
  if (VIEWS.includes(saved)) initialView = saved;
} catch (err) { /* ignore */ }
setDensity(initialView, false);

fetchPosts()
  .then((posts) => {
    // Only posts marked for the grid (the default) — writing-only pieces live
    // on writing.html.
    allPosts = posts.filter((p) => showsIn(p, "grid"));

    // Reveal the drafts toggle only when there's at least one draft to show.
    // Drafts are shown by default, so the toggle starts in its pressed state.
    const draftCount = allPosts.filter(isDraft).length;
    if (draftCount > 0) {
      draftsLabel.textContent = "Show drafts";
      // Count on the right, like the tag rows in the menu.
      draftsToggle.insertAdjacentHTML("beforeend", `<span class="tag-option-count">${draftCount}</span>`);
      draftsToggle.setAttribute("aria-pressed", showDrafts ? "true" : "false");
      draftsToggle.hidden = false;
    }

    buildMenu(baseSet());
    selectedTags = new Set(tagsFromURL().filter((t) => allTags.includes(t)));
    applyFilter();
    // The tiles fade in on this first load only; later filter changes (tabs,
    // tags, drafts, Clear all) swap them instantly rather than replaying the
    // fade, which looked like the page reloading.
    setTimeout(() => grid.classList.add("is-settled"), 1200);
  })
  .catch((err) => {
    status.textContent = "Couldn't load posts. If you opened this file directly, run a local server (see the README).";
    status.classList.add("error");
    console.error(err);
  });
