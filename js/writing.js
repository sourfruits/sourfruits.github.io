// Writing page: every post that isn't a blurb (see postPlaces), as a
// grid of cards grouped under year headings: each card has the title, a
// "tag · date" line, the subtitle and a short excerpt from the opening. Above
// the list: one tab per form (All · Essay · Poem…, shortcuts into the dropdown)
// and the "Tags" dropdown (multi-select, AND logic, synced to ?tags=, with
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


let allPosts = [];
let allTags = [];
let selectedTags = new Set();     // every tag ticked in the dropdown (the tabs tick forms here too)
// Drafts live in the link (?drafts=1), like tags: landing fresh starts off.
let showDrafts = new URLSearchParams(window.location.search).get("drafts") === "1";

const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// A piece's tags in display order: form first, then media, then themes.
const writingTags = (post) => orderTags(post.tags);

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
  if (showDrafts) q.push("drafts=1");
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
  const tab = (key, label, n) =>
    `<button type="button" class="form-tab${selectedForm === key ? " is-on" : ""}" data-form="${escapeHTML(key)}" aria-pressed="${selectedForm === key}">` +
    `<span class="form-tab-name" data-label="${escapeHTML(label)}">${escapeHTML(label)}</span></button>`;
  formTabs.innerHTML = tab("", "All", base.length) + forms.map((x) => tab(x.f, capFirst(x.f), x.n)).join("");
}
// Pick a form ("" = All): unticks any other form. Used by the tabs and the
// side index.
function pickForm(form) {
  [...selectedTags].forEach((t) => { if (tagKind(t) === "form") selectedTags.delete(t); });
  if (form) selectedTags.add(form);
  updateURL();
  applyFilter();
}
formTabs.addEventListener("click", (e) => {
  const b = e.target.closest(".form-tab");
  if (b) pickForm(b.dataset.form);
});

// One Writing card: the shared card (js/cards.js) with this page's tags.
function itemHTML(post, withYear) {
  return cardHTML(post, writingTags(post));
}



const CHEVRON = `<svg class="chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
const collapsedYears = new Set();   // years folded shut by clicking their heading
let shownYears = [];                // the year groups currently listed (for the side index)

// Cards grouped under year headings (dark serif, with a chevron that folds the
// year shut and then shows its count). Drafts (when revealed) and Pinned come
// first, under small dark capital labels with an icon (see .writing-label).
function render() {
  const posts = sortPosts(filteredPosts(), "writing");
  const drafts = posts.filter((p) => isDraft(p));
  const pinned = posts.filter((p) => !isDraft(p) && isPinned(p, "writing"));
  const rest = posts.filter((p) => !isDraft(p) && !isPinned(p, "writing"));

  const grid = (items, withYear) => `<ul class="writing-grid">${items.map((p) => itemHTML(p, withYear)).join("")}</ul>`;
  let html = "";
  if (drafts.length) html += `<section class="writing-group"><h2 class="writing-label"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><span>Drafts</span></h2>${grid(drafts, true)}</section>`;
  if (pinned.length) html += `<section class="writing-group"><h2 class="writing-label"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a6 6 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707s.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a6 6 0 0 1 1.013.16l3.134-3.133a3 3 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/></svg><span>Pinned</span></h2>${grid(pinned, true)}</section>`;

  const years = [];
  shownYears = years;
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
  // Every tag, grouped with a thin line between: forms (also
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
  // showing now also have it. A tag at 0 can still be ticked — it just
  // shows nothing until something else is unticked.
  const showing = filteredPosts();
  const tagsOf = writingTags;
  tagMenu.querySelectorAll(".tag-option").forEach((row) => {
    const cb = row.querySelector('input[type="checkbox"]');
    const n = cb.checked ? showing.length : showing.filter((p) => tagsOf(p).includes(cb.value)).length;
    row.querySelector(".tag-option-count").textContent = n;
  });
  const n = selectedTags.size;
  if (n === 0) tagLabel.textContent = "Tags";
  else if (n === 1) tagLabel.textContent = capFirst(selectedParam());
  else tagLabel.textContent = `${n} tags`;
  tagToggle.classList.toggle("is-active", n > 0);
  const clear = document.getElementById("tag-clear");
  // "Clear all" is live whenever there's something to undo: a ticked tag or drafts on.
  if (clear) clear.disabled = n === 0 && !showDrafts;
}

function applyFilter() {
  renderFormTabs();
  syncMenu(filteredPosts().length);
  render();
  renderIndex();
  // If you'd scrolled down past the top of the list, land at the top of the
  // new results (instead of wherever the shorter page leaves you).
  const top = list.getBoundingClientRect().top;
  if (top < 0) window.scrollTo({ top: window.scrollY + top - 24 });
}

// --- side index (computers only; phones keep the bar above) ---
// A narrow column down the left: FORM (All · Essay · Poem…), SUBJECT (media
// then themes, with live counts — the top SUBJECT_CAP, then "More"), YEAR
// (jump links) and Show drafts at the bottom. No Clear all here: a ticked
// subject shows × to untick it, and Form's "All" resets the form. It drives the same
// selection as the tabs and the Tags dropdown, so they always agree.
const index = document.getElementById("writing-index");
const SUBJECT_CAP = 5;
let showAllSubjects = false;
function renderIndex() {
  if (!index) return;
  const showing = filteredPosts();
  const base = baseSet();
  const item = (attrs, label, on, n) =>
    `<li><button type="button" ${attrs} class="${on ? "is-on" : ""}" aria-pressed="${on}">` +
    `<span>${escapeHTML(label)}</span>${n === undefined ? "" : `<span class="index-count">${n}</span>`}</button></li>`;

  const current = currentForm();
  const forms = TAG_KINDS.form.filter((f) => base.some((p) => writingTags(p).includes(f)));
  const plainHead = (label) => `<h3>${label}</h3>`;
  let html = "";
  if (forms.length) {
    // Counts follow the ticked subjects (but not the form itself, so switching
    // form shows what you'd get).
    const subjects = [...selectedTags].filter((t) => tagKind(t) !== "form");
    const pool = base.filter((p) => subjects.every((t) => writingTags(p).includes(t)));
    const nForm = (f) => pool.filter((p) => writingTags(p).includes(f)).length;
    html += plainHead("Form") + `<ul>` + item(`data-form=""`, "All", current === "", pool.length) +
      forms.map((f) => item(`data-form="${escapeHTML(f)}"`, capFirst(f), current === f, nForm(f))).join("") + `</ul>`;
  }

  // Subjects: media (tags.txt order), then themes (most-used first). Past the
  // cap they fold behind "More", but a ticked one always stays visible.
  const counts = new Map();
  base.forEach((p) => writingTags(p).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  const subjects = groupTagsByKind(counts, ["medium", "theme"]).flatMap((g) => g.tags);
  const visible = showAllSubjects ? subjects
    : subjects.filter((t, i) => i < SUBJECT_CAP || selectedTags.has(t));
  const hiddenCount = subjects.length - visible.length;
  if (subjects.length) {
    html += plainHead("Subject") + `<ul>` + visible.map((t) => {
      const on = selectedTags.has(t);
      const n = on ? showing.length : showing.filter((p) => writingTags(p).includes(t)).length;
      // A ticked subject shows × in place of its count; clicking unticks it.
      return item(`data-tag="${escapeHTML(t)}"`, capFirst(t), on, on ? "×" : n);
    }).join("") + `</ul>`;
    if (hiddenCount > 0) html += `<button type="button" class="index-more" data-more>More (${hiddenCount})</button>`;
    else if (showAllSubjects && subjects.length > SUBJECT_CAP) html += `<button type="button" class="index-more" data-more>Less</button>`;
  }

  if (shownYears.length) html += plainHead("Year") + `<ul>` + shownYears.map((y) => item(`data-year="${escapeHTML(y.year)}"`, y.year, false, y.posts.length)).join("") + `</ul>`;

  if (!draftsToggle.hidden) html += `<div class="index-foot"><button type="button" data-drafts class="${showDrafts ? "is-on" : ""}" aria-pressed="${showDrafts}">Show drafts</button></div>`;
  index.innerHTML = html;
}
if (index) index.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.hasAttribute("data-form")) pickForm(b.dataset.form);
  else if (b.dataset.tag) {
    const t = b.dataset.tag;
    if (selectedTags.has(t)) selectedTags.delete(t); else selectedTags.add(t);
    updateURL();
    applyFilter();
  } else if (b.dataset.year) {
    const head = list.querySelector(`.list-yeartoggle[data-year="${CSS.escape(b.dataset.year)}"]`);
    if (head) head.closest("section").scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (b.hasAttribute("data-more")) { showAllSubjects = !showAllSubjects; renderIndex(); }
  else if (b.hasAttribute("data-drafts")) draftsToggle.click();
});

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
  if (cb.checked) selectedTags.add(cb.value);
  else selectedTags.delete(cb.value);
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
  draftsToggle.setAttribute("aria-pressed", showDrafts ? "true" : "false");
  buildMenu(baseSet());
}
draftsToggle.addEventListener("click", () => {
  setDrafts(!showDrafts);
  updateURL();
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
