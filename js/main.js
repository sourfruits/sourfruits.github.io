// Homepage: load every post from data/posts.json and render the thumbnail grid,
// with a tag filter (synced to ?tag=) and a grid-density toggle.

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const pagination = document.getElementById("pagination");
const tagSelect = document.getElementById("tag-select");
const densityToggle = document.querySelector(".density-toggle");

const PER_PAGE = 9;
const DENSITY_KEY = "grid-density";

let allPosts = [];

// Stamp the current year in the footer.
document.getElementById("year").textContent = new Date().getFullYear();

// The tag currently selected via ?tag= (empty string means "All").
function currentTag() {
  return new URLSearchParams(window.location.search).get("tag") || "";
}

// Build an href for a given page number, keeping the active tag and page 1 clean.
function pageHref(page) {
  const params = new URLSearchParams();
  const tag = currentTag();
  if (tag) params.set("tag", tag);
  if (page > 1) params.set("page", page);
  const qs = params.toString();
  return qs ? `index.html?${qs}` : "index.html";
}

function renderGrid(posts) {
  // Newest first, regardless of order in the JSON file.
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));

  Pagination.paginate({
    items: posts,
    perPage: PER_PAGE,
    container: pagination,
    hrefFor: pageHref,
    renderItems: (pagePosts) => {
      grid.innerHTML = pagePosts.map((post) => `
        <a class="tile" href="post.html?id=${encodeURIComponent(post.id)}">
          <img src="${escapeHTML(post.thumb || post.image)}" alt="${escapeHTML(post.title)}" loading="lazy">
          <div class="tile-overlay">
            <span class="tile-title">${escapeHTML(post.title)}</span>
            <span class="tile-date">${escapeHTML(formatDate(post.date))}</span>
          </div>
        </a>
      `).join("");
    },
  });

  status.textContent = posts.length ? "" : "No posts here yet.";
}

// Show only the posts matching the active tag (or all of them for "All").
function applyFilter() {
  const tag = currentTag();
  const posts = tag
    ? allPosts.filter((p) => Array.isArray(p.tags) && p.tags.includes(tag))
    : allPosts;
  renderGrid(posts);
}

// Populate the dropdown with tags sorted by post count (ties alphabetical),
// preceded by an "All" option, and reflect whatever ?tag= is active.
function buildTagOptions(posts) {
  const counts = new Map();
  posts.forEach((post) => {
    if (!Array.isArray(post.tags)) return;
    post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });

  const tags = [...counts.keys()].sort((a, b) =>
    counts.get(b) - counts.get(a) ||
    a.localeCompare(b, undefined, { sensitivity: "base" }));

  tagSelect.innerHTML = `<option value="">All</option>` + tags.map((tag) =>
    `<option value="${escapeHTML(tag)}">${escapeHTML(tag)} (${counts.get(tag)})</option>`
  ).join("");

  tagSelect.value = currentTag();
}

// Changing the filter updates the URL (?tag=), resets to page 1, and re-renders.
tagSelect.addEventListener("change", () => {
  const tag = tagSelect.value;
  const params = new URLSearchParams(window.location.search);
  if (tag) params.set("tag", tag);
  else params.delete("tag");
  params.delete("page");
  const qs = params.toString();
  history.replaceState(null, "", qs ? `index.html?${qs}` : "index.html");
  applyFilter();
});

// Switch the grid between the compact (4-col) and normal (3-col) layouts,
// highlighting the active button and remembering the choice.
function setDensity(density) {
  const compact = density === "compact";
  grid.classList.toggle("is-compact", compact);
  densityToggle.querySelectorAll(".density-btn").forEach((btn) => {
    const active = btn.dataset.density === density;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  try { localStorage.setItem(DENSITY_KEY, density); } catch (err) { /* ignore */ }
}

densityToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".density-btn");
  if (btn) setDensity(btn.dataset.density);
});

let initialDensity = "normal";
try { initialDensity = localStorage.getItem(DENSITY_KEY) || "normal"; } catch (err) { /* ignore */ }
setDensity(initialDensity);

fetchPosts()
  .then((posts) => {
    allPosts = posts;
    buildTagOptions(posts);
    applyFilter();
  })
  .catch((err) => {
    status.textContent = "Couldn't load posts. If you opened this file directly, run a local server (see the README).";
    status.classList.add("error");
    console.error(err);
  });
