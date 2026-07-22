// Homepage: load every post from data/posts.json and render the thumbnail grid,
// with a multi-select tag filter (AND logic, synced to ?tags=) and a grid-density
// toggle.

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
const gridWrap = document.getElementById("grid-wrap");
const carouselPrev = document.getElementById("carousel-prev");
const carouselNext = document.getElementById("carousel-next");

const DENSITY_KEY = "grid-density";
const VIEWS = ["normal", "carousel"];
const CAROUSEL_MAX = 10;       // most-recent posts shown in the carousel strip

let allPosts = [];
let allTags = [];              // every tag, ordered by post count (ties alphabetical)
let selectedTags = new Set();  // the tags currently checked
let showDrafts = true;         // whether draft posts are revealed (shown by default)
let currentView = "normal";    // compact | normal | carousel

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
  return qs ? `index.html?${qs}` : "index.html";
}

function renderGrid(posts) {
  // Newest first, regardless of order in the JSON file.
  sortByDateDesc(posts);

  if (currentView === "carousel") {
    renderCarousel(posts);
  } else {
    // Fill each page based on the grid's live column count (which follows both
    // the density toggle and the screen-width breakpoints).
    Pagination.paginate({
      items: posts,
      perPage: Pagination.gridPerPage(grid),
      container: pagination,
      hrefFor: pageHref,
      renderItems: (pagePosts) => {
        grid.innerHTML = pagePosts.map(renderTile).join("");
      },
    });
  }

  status.textContent = posts.length
    ? ""
    : (selectedTags.size ? "No posts match these tags." : "No posts here yet.");
}

// Carousel view: the newest posts as a single horizontal filmstrip (no
// pagination), capped at CAROUSEL_MAX, with a "See all posts" card at the end
// that drops back to the normal grid.
function renderCarousel(posts) {
  const strip = posts.slice(0, CAROUSEL_MAX);
  grid.innerHTML =
    strip.map(renderTile).join("") +
    `<a class="tile carousel-seeall" href="index.html" data-seeall>
       <span class="carousel-seeall-inner">See all posts <span aria-hidden="true">&rarr;</span></span>
     </a>`;
  // No pager in carousel mode.
  pagination.innerHTML = "";
  updateCarouselArrows();
}

// Scroll the filmstrip roughly one viewport of tiles in the given direction.
function scrollCarousel(direction) {
  grid.scrollBy({ left: direction * grid.clientWidth * 0.8, behavior: "smooth" });
}

// Grey out (disable) the prev arrow at the start of the strip and the next
// arrow at the end. The 1px tolerance absorbs sub-pixel scroll rounding.
function updateCarouselArrows() {
  if (currentView !== "carousel") return;
  const maxScroll = grid.scrollWidth - grid.clientWidth;
  carouselPrev.disabled = grid.scrollLeft <= 1;
  carouselNext.disabled = grid.scrollLeft >= maxScroll - 1;
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

  tagMenu.innerHTML =
    `<button type="button" class="tag-clear" id="tag-clear">Clear all</button>
     <div class="tag-dropdown-divider"></div>` +
    allTags.map((tag) => `
      <label class="tag-option">
        <input type="checkbox" value="${escapeHTML(tag)}">
        <span class="tag-option-name">${escapeHTML(tag)}</span>
        <span class="tag-option-count">${counts.get(tag)}</span>
      </label>`).join("");
}

// Reflect the selection on the checkboxes, the toggle label (with the number of
// matching posts), and whether "Clear all" is enabled.
function syncMenu(matchCount) {
  tagMenu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = selectedTags.has(cb.value);
  });
  const n = selectedTags.size;
  if (n === 0) tagLabel.textContent = "All tags";
  else if (n === 1) tagLabel.textContent = `${selectedParam()} (${matchCount})`;
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
  history.replaceState(null, "", qs ? `index.html?${qs}` : "index.html");
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

// Switch the grid between the compact (4-col), normal (3-col), and carousel
// (horizontal filmstrip) views, highlighting the active button, remembering the
// choice, and re-rendering. Skips the re-render before posts load.
function setDensity(next) {
  currentView = next;
  const carousel = next === "carousel";
  grid.classList.toggle("is-compact", next === "compact");
  grid.classList.toggle("is-carousel", carousel);
  gridWrap.classList.toggle("is-carousel", carousel);
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
  if (btn) setDensity(btn.dataset.density);
});

// Carousel arrows scroll the strip; the "See all posts" card drops back to the
// normal grid (rather than following its href).
carouselPrev.addEventListener("click", () => scrollCarousel(-1));
carouselNext.addEventListener("click", () => scrollCarousel(1));
// Keep the arrows' enabled/greyed state in sync with the scroll position.
grid.addEventListener("scroll", updateCarouselArrows);
window.addEventListener("resize", updateCarouselArrows);
grid.addEventListener("click", (e) => {
  if (e.target.closest("[data-seeall]")) {
    e.preventDefault();
    setDensity("normal");
  }
});

// Drafts toggle: flip whether drafts are included, then rebuild the tag menu
// (its counts follow the visible pool) and re-render the grid.
draftsToggle.addEventListener("click", () => {
  showDrafts = !showDrafts;
  draftsToggle.setAttribute("aria-pressed", showDrafts ? "true" : "false");
  buildMenu(baseSet());
  applyFilter();
});

let initialView = "carousel";
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
