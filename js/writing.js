// Writing page: every post marked "show: writing" (or "show: grid, writing"), as a
// grid of cards grouped under year headings: each card has the title, a
// "tag · date" line, the subtitle and a short excerpt from the opening. Above
// the list: one tab per form (All · Essay · Poem…, shortcuts into the dropdown)
// and the "All tags" dropdown (multi-select, AND logic, synced to ?tags=, with
// Show drafts at its bottom).
// Each title opens the normal post page.

const list = document.getElementById("writing-list");
const status = document.getElementById("status");
const tagFilter = document.getElementById("tag-filter");
const tagToggle = document.getElementById("tag-dropdown-toggle");
const tagMenu = document.getElementById("tag-dropdown-menu");
const tagLabel = document.getElementById("tag-dropdown-label");
const draftsToggle = document.getElementById("drafts-toggle");
const draftsLabel = draftsToggle.querySelector(".drafts-label");
const formTabs = document.getElementById("form-tabs");

// The Writing page's own Drafts setting (separate from the homepage's).
const DRAFTS_KEY = "sourfruits:drafts:writing";

let allPosts = [];
let allTags = [];
let selectedTags = new Set();     // every tag ticked in the dropdown (the tabs tick forms here too)
let showDrafts = false;
try { showDrafts = sessionStorage.getItem(DRAFTS_KEY) === "1"; } catch (err) { /* ignore */ }

const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// The Writing page shows (and filters by) a piece's tags except the length
// ones (blurb / writeup, see data/tags.txt) — those describe length on the
// homepage grid. Form tags come first, then media, then themes.
const writingTags = (post) => orderTags(post.tags).filter((t) => tagKind(t) !== "length");

function tagsFromURL() {
  const raw = new URLSearchParams(window.location.search).get("tags") || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
function selectedParam() {
  return allTags.filter((t) => selectedTags.has(t)).join(",");
}
function updateURL() {
  const tags = selectedParam();
  const q = [];
  if (tags) q.push(`tags=${encodeURIComponent(tags).replace(/%2C/g, ",")}`);
  history.replaceState(null, "", q.length ? `writing.html?${q.join("&")}` : "writing.html");
}

function baseSet() {
  return showDrafts ? allPosts : allPosts.filter((p) => !isDraft(p));
}
// AND logic: a piece must carry every selected tag. No selection → all.
function filteredPosts() {
  const posts = baseSet();
  if (!selectedTags.size) return posts;
  const wanted = [...selectedTags];
  return posts.filter((p) => wanted.every((t) => writingTags(p).includes(t)));
}

// --- form tabs: "All · Essay · Poem" (forms from data/tags.txt, in the
// order listed there; only forms that some piece has). Hidden when no piece
// has a form yet. They're shortcuts into the dropdown: clicking Essay ticks
// "essay" there (and unticks any other form); All unticks them all. A tab is
// lit when its form is the one ticked, so "Clear all" brings them back to All.
function currentForm() {
  const picked = [...selectedTags].filter((t) => tagKind(t) === "form");
  return picked.length === 1 ? picked[0] : picked.length ? null : "";
}
function renderFormTabs() {
  const base = baseSet();
  const forms = TAG_KINDS.form
    .map((f) => ({ f, n: base.filter((p) => writingTags(p).includes(f)).length }))
    .filter((x) => x.n);
  const selectedForm = currentForm();   // "" = All, null = several ticked (no tab lit)
  formTabs.hidden = forms.length === 0;
  // A tab that would leave nothing (given the other ticked tags) is greyed
  // out, like the dead ends in the dropdown.
  const others = [...selectedTags].filter((t) => tagKind(t) !== "form");
  const tagsOfTab = writingTags;
  const leaves = (key) => base.filter((p) => [...others, key].filter(Boolean).every((t) => tagsOfTab(p).includes(t))).length;
  const tab = (key, label, n) =>
    `<button type="button" class="form-tab${selectedForm === key ? " is-on" : ""}${leaves(key) ? "" : " is-empty"}" data-form="${escapeHTML(key)}" aria-pressed="${selectedForm === key}"${leaves(key) ? "" : " disabled"}>` +
    `<span class="form-tab-name" data-label="${escapeHTML(label)}">${escapeHTML(label)}</span></button>`;
  formTabs.innerHTML = tab("", "All", base.length) + forms.map((x) => tab(x.f, capFirst(x.f), x.n)).join("");
}
formTabs.addEventListener("click", (e) => {
  const b = e.target.closest(".form-tab");
  if (!b) return;
  [...selectedTags].forEach((t) => { if (tagKind(t) === "form") selectedTags.delete(t); });
  if (b.dataset.form) selectedTags.add(b.dataset.form);
  updateURL();
  applyFilter();
});

// One Writing card: the shared card (js/cards.js) with this page's tags.
function itemHTML(post, withYear) {
  return cardHTML(post, writingTags(post));
}



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
  watchCards(list);

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
  // Every tag but lengths, grouped with a thin line between: forms (also
  // reachable from the tabs), media, then themes (data/tags.txt).
  const groups = groupTagsByKind(counts, ["form", "medium", "theme"]);
  allTags = groups.flatMap((g) => g.tags);
  const check = `<span class="tag-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`;
  tagMenu.innerHTML =
    `<button type="button" class="tag-clear" id="tag-clear">Clear all</button>
     <div class="tag-dropdown-divider"></div>
     <div class="tag-dropdown-scroll">` +
    groups.map((g) => g.tags.map((tag) => `
      <label class="tag-option">
        <input type="checkbox" value="${escapeHTML(tag)}">
        ${check}
        <span class="tag-option-name">${escapeHTML(capFirst(tag))}</span>
        <span class="tag-option-count">${counts.get(tag)}</span>
      </label>`).join("")).join(`<div class="tag-group-line"></div>`) +
    `</div>`;
  // The Drafts switch lives at the bottom of this menu (as on the homepage);
  // it's only shown when there are drafts.
  if (!draftsToggle.hidden) {
    draftsToggle.classList.add("drafts-in-menu");
    tagMenu.appendChild(draftsToggle);
  }
}

function syncMenu(matchCount) {
  tagMenu.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = selectedTags.has(cb.value); });
  // Every tick narrows. Each unticked tag's count is how many of the posts
  // showing now also have it; a tag that would leave nothing is greyed out
  // and can't be ticked, so you never land on an empty page.
  const showing = filteredPosts();
  const tagsOf = writingTags;
  tagMenu.querySelectorAll(".tag-option").forEach((row) => {
    const cb = row.querySelector('input[type="checkbox"]');
    const n = cb.checked ? showing.length : showing.filter((p) => tagsOf(p).includes(cb.value)).length;
    row.querySelector(".tag-option-count").textContent = n;
    const dead = !cb.checked && n === 0;
    row.classList.toggle("is-empty", dead);
    cb.disabled = dead;
  });
  const n = selectedTags.size;
  if (n === 0) tagLabel.textContent = `All tags (${matchCount})`;
  else if (n === 1) tagLabel.textContent = `${capFirst(selectedParam())} (${matchCount})`;
  else tagLabel.textContent = `${n} tags (${matchCount})`;
  tagToggle.classList.toggle("is-active", n > 0);
  const clear = document.getElementById("tag-clear");
  // "Clear all" is live whenever there's something to undo: a ticked tag or drafts on.
  if (clear) clear.disabled = n === 0 && !showDrafts;
}

function applyFilter() {
  renderFormTabs();
  syncMenu(filteredPosts().length);
  render();
}

tagToggle.addEventListener("click", () => {
  tagMenu.hidden = !tagMenu.hidden;
  tagToggle.setAttribute("aria-expanded", tagMenu.hidden ? "false" : "true");
});
// Close on a click outside the menu (ignoring clicks on things the menu just
// redrew, like "Clear all", which are no longer in the page).
document.addEventListener("click", (e) => {
  if (e.target.isConnected && !tagFilter.contains(e.target)) { tagMenu.hidden = true; tagToggle.setAttribute("aria-expanded", "false"); }
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
  // Clear all: untick every tag (tabs go back to All) and hide drafts again.
  if (e.target.closest("#tag-clear")) {
    selectedTags.clear();
    if (showDrafts) setDrafts(false);
    updateURL();
    applyFilter();
  }
});

function setDrafts(on) {
  showDrafts = on;
  try { sessionStorage.setItem(DRAFTS_KEY, showDrafts ? "1" : "0"); } catch (err) { /* ignore */ }
  draftsToggle.setAttribute("aria-pressed", showDrafts ? "true" : "false");
  buildMenu(baseSet());
}
draftsToggle.addEventListener("click", () => {
  setDrafts(!showDrafts);
  applyFilter();
});

fetchPosts()
  .then((posts) => {
    allPosts = posts.filter((p) => showsIn(p, "writing"));
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
  })
  .catch((err) => {
    status.textContent = "Couldn't load posts. If you opened this file directly, run a local server (see the README).";
    status.classList.add("error");
    console.error(err);
  });
