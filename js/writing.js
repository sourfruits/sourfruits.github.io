// Writing page: every post marked "show: writing" (or "show: grid, writing"), as a
// grid of cards grouped under year headings: each card has the title, a
// "tag · date" line, the subtitle and a short excerpt from the opening. The same tag filter as the
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

// The Writing page shows (and filters by) a piece's tags except "writeup" /
// "blurb" — those describe length on the homepage grid, and every piece here
// is long-form. Tags keep the order they're written in.
const GRID_ONLY_TAGS = ["writeup", "blurb"];
const writingTags = (post) =>
  (Array.isArray(post.tags) ? post.tags : []).filter((t) => !GRID_ONLY_TAGS.includes(t));

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

// "November 14" — the year is the group heading. Month-only dates show just
// the month; year-only dates show nothing. In the Pinned and Drafts groups (no
// year heading) the year is added: "November 14, 2025".
function shortDate(iso, withYear) {
  const parts = String(iso).split("-");
  if (parts.length < 2) return withYear ? parts[0] : "";
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2] || 1));
  const opts = parts.length === 2 ? { month: "long" } : { month: "long", day: "numeric" };
  if (withYear) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}


// A short plain-text excerpt from the start of a piece: the optional
// `excerpt:` frontmatter line if there is one, otherwise the opening words of
// the body with headings, images and Markdown symbols stripped.
const EXCERPT_WORDS = 42;
const POEM_EXCERPT_LINES = 4;
function excerptOf(post) {
  if (typeof post.excerpt === "string" && post.excerpt.trim()) return post.excerpt.trim();
  // Poems: the opening lines, kept as lines (joined with \n; shown with <br>).
  if (post.layout === "poem") {
    const lines = String(post.content || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.slice(0, POEM_EXCERPT_LINES).join("\n") + (lines.length > POEM_EXCERPT_LINES ? "\n…" : "");
  }
  const text = String(post.content || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(#|!\[|---|\*\*\*|___)/.test(line))   // headings, images, rules
    .join(" ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")   // [text](link) → text
    .replace(/[*_`>]+/g, "")                    // emphasis / quote markers
    .replace(/\\/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(" ");
  return words.length > EXCERPT_WORDS ? words.slice(0, EXCERPT_WORDS).join(" ") + "…" : text;
}

// One card: a small-caps "DATE · TAGS" line on top (tags that don't fit
// collapse into a "+N more" label), then the title, the italic subtitle and
// the excerpt. The whole card links to the piece.
function itemHTML(post, withYear) {
  const tags = writingTags(post)
    .map((t) => `<span class="writing-card-tag">${escapeHTML(t)}</span>`)
    .join(`<span class="writing-card-sep" aria-hidden="true">·</span>`);
  const excerpt = excerptOf(post);
  return `<li><a class="writing-card${isDraft(post) ? " is-draft" : ""}" href="post.html?id=${encodeURIComponent(post.id)}">
        <span class="writing-card-info">
          <span class="writing-card-date">${escapeHTML(shortDate(post.date, true))}</span>
          ${tags ? `<span class="writing-card-sep" aria-hidden="true">·</span><span class="writing-card-tags">${tags}</span>` : ""}
        </span>
        <span class="writing-card-title">${escapeHTML(post.title)}</span>
        ${post.subtitle ? `<span class="writing-card-sub">${escapeHTML(post.subtitle)}</span>` : ""}
        ${excerpt ? `<span class="writing-card-excerpt">${escapeHTML(excerpt).replace(/\n/g, "<br>")}</span>` : ""}
      </a></li>`;
}

// Clamp every card's tag row to one line with a trailing "+N more" (the same
// helper the homepage tiles use).
function fitCardTags() {
  list.querySelectorAll(".writing-card-tags").forEach((row) =>
    fitTagsWithMore(row, ".writing-card-tag", ".writing-card-sep", "writing-card-tag"));
}
window.addEventListener("resize", fitCardTags);

// Two-line titles split roughly two-thirds / one-third: when a title is too
// long for one line but would fit on two, cap its width at ~70% of its one-line
// length, so the first line carries most of it and the second isn't a lonely
// word or two.
// Longer titles (3+ lines) just wrap normally.
function fitCardTitles() {
  list.querySelectorAll(".writing-card-title").forEach((t) => {
    t.style.maxWidth = "";
    t.style.textWrap = "";
    const room = t.parentElement.clientWidth;
    t.style.whiteSpace = "nowrap";
    const oneLine = t.scrollWidth;
    t.style.whiteSpace = "";
    if (oneLine <= room) return;                 // fits on one line
    const target = Math.ceil(oneLine * 0.7);
    if (target <= room && oneLine <= room * 1.9) {
      t.style.maxWidth = target + "px";
      t.style.textWrap = "wrap";   // plain greedy wrap: fill line 1 up to the cap
    }
  });
}
window.addEventListener("resize", fitCardTitles);

const CHEVRON = `<svg class="chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
const collapsedYears = new Set();   // years folded shut by clicking their heading

// Cards grouped under year headings (dark serif, with a chevron that folds the
// year shut and then shows its count). Drafts (when revealed) and Pinned come
// first under small labels, with the year in their dates.
function render() {
  const posts = sortPosts(filteredPosts(), "writing");
  const drafts = posts.filter((p) => isDraft(p));
  const pinned = posts.filter((p) => !isDraft(p) && isPinned(p, "writing"));
  const rest = posts.filter((p) => !isDraft(p) && !isPinned(p, "writing"));

  const grid = (items, withYear) => `<ul class="writing-grid">${items.map((p) => itemHTML(p, withYear)).join("")}</ul>`;
  let html = "";
  if (drafts.length) html += `<section class="writing-group"><h2 class="writing-label">Drafts</h2>${grid(drafts, true)}</section>`;
  if (pinned.length) html += `<section class="writing-group"><h2 class="writing-label">Pinned</h2>${grid(pinned, true)}</section>`;

  const years = [];
  rest.forEach((p) => {
    const y = String(p.date).slice(0, 4);
    const last = years[years.length - 1];
    if (last && last.year === y) last.posts.push(p); else years.push({ year: y, posts: [p] });
  });
  years.forEach(({ year, posts: items }) => {
    const folded = collapsedYears.has(year);
    html += `<section class="writing-group">
        <h2 class="list-yearhead writing-yearhead"><button type="button" class="list-yeartoggle" data-year="${escapeHTML(year)}" aria-expanded="${folded ? "false" : "true"}">` +
        `<span>${escapeHTML(year)}</span>${CHEVRON}` +
        (folded ? `<span class="list-yearcount">${items.length}</span>` : "") +
        `</button></h2>${folded ? "" : grid(items, false)}</section>`;
  });
  list.innerHTML = html;
  fitCardTags();
  fitCardTitles();

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
