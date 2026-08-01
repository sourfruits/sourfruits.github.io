// Photo grid (now on index.html): load every post from data/posts.json and render
// the thumbnail grid, with a multi-select tag filter (AND logic, synced to ?tags=),
// a drafts toggle, and a grid-density toggle (normal ↔ compact), paginated. (A
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

const DENSITY_KEY = "grid-density";
const VIEWS = ["normal", "compact"];
// Posts per page for each view — different  on desktop and mobile (number
// of columns depends on page width).
const PER_PAGE = {
  normal:  { desktop: 7,  mobile: 12 },   // pick your mobile number
  compact: { desktop: 15, mobile: 15 }
};

function getPerPage(view) {
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  return PER_PAGE[view][isMobile ? "mobile" : "desktop"];
}

// Drafts toggle persists across page navigations within the tab (sessionStorage
// clears when the tab closes), so paging through the grid keeps drafts on/off.
const DRAFTS_KEY = "sourfruits:drafts";

// This page's own filename, so pagination + ?tags= URLs stay on whatever page
// hosts the grid. Kept dynamic rather than hardcoded so main.js works wherever
// it's loaded — the grid lives on index.html now, but this doesn't assume that.
const PAGE = window.location.pathname.split("/").pop() || "index.html";

let allPosts = [];
let allTags = [];              // every tag, ordered by post count (ties alphabetical)
let selectedTags = new Set();  // the tags currently checked
// Restored from sessionStorage so it survives page navigation within the tab.
let showDrafts = false;
try { showDrafts = sessionStorage.getItem(DRAFTS_KEY) === "1"; } catch (err) { /* ignore */ }
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
    : (selectedTags.size ? "No posts match these tags." : "No posts here yet.");
}

// The pool the grid and tag menu work from: all posts, minus drafts unless the
// drafts toggle is on.
function baseSet() {
  return showDrafts ? allPosts : allPosts.filter((p) => !isDraft(p));
}

// AND logic: a post must carry every selected tag. No selection → show all.
function filteredPosts() {
  const base = baseSet();
  if (selectedTags.size === 0) return base;
  const wanted = [...selectedTags];
  return base.filter((p) =>
    Array.isArray(p.tags) && wanted.every((t) => p.tags.includes(t)));
}

// Build the dropdown checklist: a "Clear all" action, then one checkbox per
// tag, ordered by post count (ties alphabetical).
function buildMenu(posts) {
  const counts = new Map();
  posts.forEach((post) => {
    if (!Array.isArray(post.tags)) return;
    post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  allTags = [...counts.keys()].sort((a, b) =>
    counts.get(b) - counts.get(a) ||
    a.localeCompare(b, undefined, { sensitivity: "base" }));

  // Custom accent checkmark (Letterboxd-style) that replaces the native checkbox.
  const check = `<span class="tag-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`;
  tagMenu.innerHTML =
    // "Clear all" pinned at the top (doesn't scroll with the list)…
    `<button type="button" class="tag-clear" id="tag-clear">Clear all</button>
     <div class="tag-dropdown-divider"></div>` +
    // …then the scrollable list of tags below it.
    `<div class="tag-dropdown-scroll">` +
    allTags.map((tag) => `
      <label class="tag-option">
        <input type="checkbox" value="${escapeHTML(tag)}">
        ${check}
        <span class="tag-option-name">${escapeHTML(capFirst(tag))}</span>
        <span class="tag-option-count">${counts.get(tag)}</span>
      </label>`).join("") +
    `</div>`;
}

// Reflect the selection on the checkboxes, the toggle label (with the number of
// matching posts), and whether "Clear all" is enabled.
function syncMenu(matchCount) {
  tagMenu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = selectedTags.has(cb.value);
  });
  const n = selectedTags.size;
  if (n === 0) tagLabel.textContent = `All tags (${matchCount})`;
  else if (n === 1) tagLabel.textContent = `${capFirst(selectedParam())} (${matchCount})`;
  else tagLabel.textContent = `${n} tags (${matchCount})`;
  // Underline the toggle while a filter is applied.
  tagToggle.classList.toggle("is-active", n > 0);
  const clear = document.getElementById("tag-clear");
  if (clear) clear.disabled = n === 0;
}

// Write the selection to ?tags= (dropped when empty), resetting to page 1.
function updateURL() {
  const params = new URLSearchParams(window.location.search);
  const tags = selectedParam();
  if (tags) params.set("tags", tags);
  else params.delete("tags");
  params.delete("page");
  const qs = params.toString();
  history.replaceState(null, "", qs ? `${PAGE}?${qs}` : PAGE);
}

function applyFilter() {
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
document.addEventListener("click", (e) => {
  if (!tagFilter.contains(e.target)) closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

// Checking a tag toggles it in the selection; "Clear all" empties it. The menu
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
    updateURL();
    applyFilter();
  }
});

// Drafts toggle: flip whether drafts are included, then rebuild the tag menu
// (its counts follow the visible pool) and re-render the grid.
draftsToggle.addEventListener("click", () => {
  showDrafts = !showDrafts;
  try { sessionStorage.setItem(DRAFTS_KEY, showDrafts ? "1" : "0"); } catch (err) { /* ignore */ }
  draftsToggle.setAttribute("aria-pressed", showDrafts ? "true" : "false");
  buildMenu(baseSet());
  applyFilter();
});

// Switch the grid between the normal and compact views (column counts live in
// the CSS — normal 3/1, compact 4/3 for desktop/phone), highlighting the active
// button, remembering the choice, and re-rendering. Skips the re-render before
// posts load.
function setDensity(next) {
  currentView = next;
  grid.classList.toggle("is-compact", next === "compact");
  densityToggle.querySelectorAll(".density-btn").forEach((btn) => {
    const active = btn.dataset.density === next;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  try { localStorage.setItem(DENSITY_KEY, next); } catch (err) { /* ignore */ }
  if (allPosts.length) applyFilter();
}

densityToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".density-btn");
  // Ignore a click on the view you're already in — no needless re-render.
  if (btn && btn.dataset.density !== currentView) setDensity(btn.dataset.density);
});

let initialView = "normal";
try {
  const saved = localStorage.getItem(DENSITY_KEY);
  if (VIEWS.includes(saved)) initialView = saved;
} catch (err) { /* ignore */ }
setDensity(initialView);

fetchPosts()
  .then((posts) => {
    allPosts = posts;

    // Reveal the drafts toggle only when there's at least one draft to show.
    // Drafts are shown by default, so the toggle starts in its pressed state.
    const draftCount = allPosts.filter(isDraft).length;
    if (draftCount > 0) {
      draftsLabel.textContent = `Drafts (${draftCount})`;
      draftsToggle.setAttribute("aria-pressed", showDrafts ? "true" : "false");
      draftsToggle.hidden = false;
    }

    buildMenu(baseSet());
    selectedTags = new Set(tagsFromURL().filter((t) => allTags.includes(t)));
    applyFilter();
  })
  .catch((err) => {
    status.textContent = "Couldn't load posts. If you opened this file directly, run a local server (see the README).";
    status.classList.add("error");
    console.error(err);
  });
