// Writing page: every post marked "show: writing" (or "show: grid, writing"), as a
// list grouped under year headings: each entry is title ······ date, then its
// tag and subtitle, with a thin line between entries. The same tag filter as the
// homepage (multi-select, AND logic, synced to ?tags=) and a drafts toggle sit
// above the list. Each title opens the normal post page.

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

// On the Writing page each piece shows (and is filtered by) just ONE tag: its
// first tag that isn't "longform" / "notes" (those describe length on the
// homepage grid). So tags: ["longform", "essay", "film"] → "essay".
const GRID_ONLY_TAGS = ["longform", "notes"];
const writingTags = (post) =>
  (Array.isArray(post.tags) ? post.tags : []).filter((t) => !GRID_ONLY_TAGS.includes(t)).slice(0, 1);

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
// AND logic: a piece must carry every selected tag. No selection → all.
function filteredPosts() {
  const base = baseSet();
  if (!selectedTags.size) return base;
  const wanted = [...selectedTags];
  return base.filter((p) => wanted.every((t) => writingTags(p).includes(t)));
}

// "Nov 14" — the year is the group heading. Month-only dates show just the
// month; year-only dates show nothing. In the Pinned and Drafts groups (no year
// heading) the year is added: "Nov 14, 2025".
function shortDate(iso, withYear) {
  const parts = String(iso).split("-");
  if (parts.length < 2) return withYear ? parts[0] : "";
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2] || 1));
  const opts = parts.length === 2 ? { month: "short" } : { month: "short", day: "numeric" };
  if (withYear) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}


// One entry: the date in a left column (month and day — the year is the
// heading above), then the title, the italic subtitle, and the tag underneath.
// A thin line separates entries.
function itemHTML(post, withYear) {
  const tags = writingTags(post);
  return `<li><a class="writing-entry${isDraft(post) ? " is-draft" : ""}" href="post.html?id=${encodeURIComponent(post.id)}">
        <span class="writing-date">${escapeHTML(shortDate(post.date, withYear))}</span>
        <span class="writing-body">
          <span class="writing-title">${escapeHTML(post.title)}</span>
          ${post.subtitle ? `<span class="writing-sub">${escapeHTML(post.subtitle)}</span>` : ""}
          ${tags.length ? `<span class="writing-tags">${tags.map(escapeHTML).join(" · ")}</span>` : ""}
        </span>
      </a></li>`;
}

const CHEVRON = `<svg class="chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
const collapsedYears = new Set();   // years folded shut by clicking their heading

// Entries grouped under year headings like the Precursors list (black italic
// serif, with a chevron that folds the year shut and then shows its count).
// Drafts (when revealed) and Pinned come first under small labels, with the
// year in their dates.
function render() {
  const posts = sortPosts(filteredPosts(), "writing");
  const drafts = posts.filter((p) => isDraft(p));
  const pinned = posts.filter((p) => !isDraft(p) && isPinned(p, "writing"));
  const rest = posts.filter((p) => !isDraft(p) && !isPinned(p, "writing"));
  const yearCounts = {};
  rest.forEach((p) => { const y = String(p.date).slice(0, 4); yearCounts[y] = (yearCounts[y] || 0) + 1; });

  let html = "";
  if (drafts.length) html += `<li class="list-month">Drafts</li>` + drafts.map((p) => itemHTML(p, true)).join("");
  if (pinned.length) html += `<li class="list-month">Pinned</li>` + pinned.map((p) => itemHTML(p, true)).join("");
  let year = "";
  rest.forEach((p) => {
    const y = String(p.date).slice(0, 4);
    const folded = collapsedYears.has(y);
    if (y !== year) {
      html += `<li class="list-yearhead writing-yearhead"><button type="button" class="list-yeartoggle" data-year="${escapeHTML(y)}" aria-expanded="${folded ? "false" : "true"}">` +
        `<span>${escapeHTML(y)}</span>${CHEVRON}` +
        (folded ? `<span class="list-yearcount">${yearCounts[y]}</span>` : "") +
        `</button></li>`;
      year = y;
    }
    if (!folded) html += itemHTML(p, false);
  });
  list.innerHTML = html ? `<ol class="writing-index">${html}</ol>` : "";

  status.textContent = posts.length
    ? ""
    : (selectedTags.size ? "Nothing matches these tags." : "Nothing here yet.");
}

list.addEventListener("click", (e) => {
  const toggle = e.target.closest(".list-yeartoggle");
  if (!toggle) return;
  const y = toggle.dataset.year;
  if (collapsedYears.has(y)) collapsedYears.delete(y); else collapsedYears.add(y);
  render();
});

// --- tag dropdown (same behaviour as the homepage's) ---
function buildMenu(posts) {
  const counts = new Map();
  posts.forEach((p) => writingTags(p).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
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
  syncMenu(filteredPosts().length);
  render();
}

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
