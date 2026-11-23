// Writing page: every post marked "show: writing" (or "show: grid, writing"), as a
// plain text index grouped by year — no photos. Same tag filter (multi-select,
// AND logic, synced to ?tags=), drafts toggle, and pinned-first order as the
// homepage grid (js/main.js); each title opens the normal post page.

const list = document.getElementById("writing-list");
const status = document.getElementById("status");
const tagFilter = document.getElementById("tag-filter");
const tagToggle = document.getElementById("tag-dropdown-toggle");
const tagMenu = document.getElementById("tag-dropdown-menu");
const tagLabel = document.getElementById("tag-dropdown-label");
const draftsToggle = document.getElementById("drafts-toggle");
const draftsLabel = draftsToggle.querySelector(".drafts-label");

// Shares the homepage's drafts switch, so revealing drafts sticks across both.
const DRAFTS_KEY = "sourfruits:drafts";

let allPosts = [];
let allTags = [];
let selectedTags = new Set();
let showDrafts = false;
try { showDrafts = sessionStorage.getItem(DRAFTS_KEY) === "1"; } catch (err) { /* ignore */ }

const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function tagsFromURL() {
  const raw = new URLSearchParams(window.location.search).get("tags") || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
function selectedParam() {
  return allTags.filter((t) => selectedTags.has(t)).join(",");
}
function updateURL() {
  const tags = selectedParam();
  history.replaceState(null, "", tags ? `writing.html?tags=${encodeURIComponent(tags).replace(/%2C/g, ",")}` : "writing.html");
}

function baseSet() {
  return showDrafts ? allPosts : allPosts.filter((p) => !isDraft(p));
}
function filteredPosts() {
  const base = baseSet();
  if (!selectedTags.size) return base;
  const wanted = [...selectedTags];
  return base.filter((p) => Array.isArray(p.tags) && wanted.every((t) => p.tags.includes(t)));
}

// "Nov 14" — the year is already the group heading. Month-only dates ("2025-03")
// show just the month; year-only dates show nothing.
function shortDate(iso) {
  const parts = String(iso).split("-");
  if (parts.length < 2) return "";
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2] || 1));
  return parts.length === 2
    ? d.toLocaleDateString(undefined, { month: "short" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function itemHTML(post) {
  const draft = isDraft(post);
  const tags = orderTags(post.tags)
    .map((t) => `<span class="writing-tag">${escapeHTML(t)}</span>`)
    .join(`<span class="writing-sep" aria-hidden="true">·</span>`);
  return `
    <li>
      <a class="writing-item${draft ? " is-draft" : ""}" href="post.html?id=${encodeURIComponent(post.id)}">
        <span class="writing-date">${escapeHTML(shortDate(post.date))}</span>
        <span class="writing-main">
          <span class="writing-title">${escapeHTML(post.title)}</span>
          ${post.subtitle ? `<span class="writing-subtitle">${escapeHTML(post.subtitle)}</span>` : ""}
          ${tags ? `<span class="writing-tags">${tags}</span>` : ""}
        </span>
      </a>
    </li>`;
}

// Sections, top to bottom, each under a small heading like the years:
// "Drafts" (only when revealed), "Pinned", then one per year, newest first.
// Within each, the same order the grid uses.
function render(posts) {
  sortPosts(posts, "writing");
  const groups = [];
  const drafts = posts.filter((p) => isDraft(p));
  const pinned = posts.filter((p) => !isDraft(p) && isPinned(p, "writing"));
  if (drafts.length) groups.push({ heading: "Drafts", posts: drafts });
  if (pinned.length) groups.push({ heading: "Pinned", posts: pinned });
  posts.filter((p) => !isDraft(p) && !isPinned(p, "writing")).forEach((p) => {
    const y = String(p.date).slice(0, 4);
    const last = groups[groups.length - 1];
    if (last && last.year === y) last.posts.push(p);
    else groups.push({ heading: y, year: y, posts: [p] });
  });

  list.innerHTML = groups.map((g) => `
      <section class="writing-group">
        <h2 class="writing-year">${escapeHTML(g.heading)}</h2>
        <ul>${g.posts.map(itemHTML).join("")}</ul>
      </section>`).join("");

  status.textContent = posts.length
    ? ""
    : (selectedTags.size ? "Nothing matches these tags." : "Nothing here yet.");
}

function buildMenu(posts) {
  const counts = new Map();
  posts.forEach((p) => (p.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  allTags = [...counts.keys()].sort((a, b) =>
    counts.get(b) - counts.get(a) || a.localeCompare(b, undefined, { sensitivity: "base" }));
  const check = `<span class="tag-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`;
  tagMenu.innerHTML =
    `<button type="button" class="tag-clear" id="tag-clear">Clear all</button>
     <div class="tag-dropdown-divider"></div>
     <div class="tag-dropdown-scroll">` +
    allTags.map((tag) => `
      <label class="tag-option">
        <input type="checkbox" value="${escapeHTML(tag)}">
        ${check}
        <span class="tag-option-name">${escapeHTML(capFirst(tag))}</span>
        <span class="tag-option-count">${counts.get(tag)}</span>
      </label>`).join("") +
    `</div>`;
}

function syncMenu(matchCount) {
  tagMenu.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = selectedTags.has(cb.value); });
  const n = selectedTags.size;
  if (n === 0) tagLabel.textContent = `All tags (${matchCount})`;
  else if (n === 1) tagLabel.textContent = `${capFirst(selectedParam())} (${matchCount})`;
  else tagLabel.textContent = `${n} tags (${matchCount})`;
  tagToggle.classList.toggle("is-active", n > 0);
  const clear = document.getElementById("tag-clear");
  if (clear) clear.disabled = n === 0;
}

function applyFilter() {
  const posts = filteredPosts();
  syncMenu(posts.length);
  render(posts);
}

// --- dropdown + toggles (same behaviour as the homepage) ---
tagToggle.addEventListener("click", () => {
  tagMenu.hidden = !tagMenu.hidden;
  tagToggle.setAttribute("aria-expanded", tagMenu.hidden ? "false" : "true");
});
document.addEventListener("click", (e) => {
  if (!tagFilter.contains(e.target)) { tagMenu.hidden = true; tagToggle.setAttribute("aria-expanded", "false"); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { tagMenu.hidden = true; tagToggle.setAttribute("aria-expanded", "false"); }
});
tagMenu.addEventListener("change", (e) => {
  const cb = e.target.closest('input[type="checkbox"]');
  if (!cb) return;
  if (cb.checked) selectedTags.add(cb.value); else selectedTags.delete(cb.value);
  updateURL();
  applyFilter();
});
tagMenu.addEventListener("click", (e) => {
  if (e.target.closest("#tag-clear")) { selectedTags.clear(); updateURL(); applyFilter(); }
});
draftsToggle.addEventListener("click", () => {
  showDrafts = !showDrafts;
  try { sessionStorage.setItem(DRAFTS_KEY, showDrafts ? "1" : "0"); } catch (err) { /* ignore */ }
  draftsToggle.setAttribute("aria-pressed", showDrafts ? "true" : "false");
  buildMenu(baseSet());
  applyFilter();
});

fetchPosts()
  .then((posts) => {
    allPosts = posts.filter((p) => showsIn(p, "writing"));
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
