// Shared helpers used across the page scripts. Exposed as globals so the plain
// <script src> pages (no bundler / modules) can all reach them.

// Turn an ISO date (YYYY-MM-DD) into something friendlier, e.g. "Jun 21, 2026".
// Pass month: "long" for the fuller "June 21, 2026" used on the post page.
function formatDate(iso, month = "short") {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month, day: "numeric" });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// Fetch and parse data/posts.json, resolving to the array of posts. Callers
// attach their own .catch to show a page-appropriate error message.
function fetchPosts() {
  return fetch("data/posts.json").then((res) => {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

// Tiebreak for posts sharing the same date: an optional numeric `dateOrder`
// (lower first). Posts without one sort after those with one, and keep their
// existing order relative to each other (return 0 → stable sort).
function byDateOrder(a, b) {
  const oa = Number.isFinite(a.dateOrder) ? a.dateOrder : Infinity;
  const ob = Number.isFinite(b.dateOrder) ? b.dateOrder : Infinity;
  return oa === ob ? 0 : oa - ob;
}

// Sort posts newest-first by ISO date. Mutates and returns the array. Same-date
// ties fall back to `dateOrder` (set by appending a number to a post's date,
// e.g. "2025-03 2"), then to their existing order.
function sortByDateDesc(posts) {
  return posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : byDateOrder(a, b)));
}

// A post is a draft if it's flagged "draft": true, or dated in 2099 or later
// (a convention for posts parked in the future). Drafts are hidden by default.
function isDraft(post) {
  if (post.draft === true) return true;
  const year = parseInt(String(post.date || "").slice(0, 4), 10);
  return year >= 2099;
}

// A post is pinned if it's flagged "pinned": true. Pinned posts sort ahead of
// everything else regardless of date (drafts can be pinned too).
function isPinned(post) {
  return post && post.pinned === true;
}

// Display order for a list of posts: pinned first, then everyone else. Within
// the pinned group an optional numeric "pinOrder" sets the order (lower first);
// pinned posts without one fall to the end of the pinned group. Otherwise it's
// newest-first by date, and same-date posts break by `dateOrder` (see
// byDateOrder). Mutates + returns.
function sortPosts(posts) {
  return posts.sort((a, b) => {
    const pa = isPinned(a), pb = isPinned(b);
    if (pa !== pb) return pa ? -1 : 1;                 // pinned ahead of the rest
    if (pa && pb) {                                     // both pinned → by pinOrder
      const oa = Number.isFinite(a.pinOrder) ? a.pinOrder : Infinity;
      const ob = Number.isFinite(b.pinOrder) ? b.pinOrder : Infinity;
      if (oa !== ob) return oa - ob;
    }
    return a.date < b.date ? 1 : a.date > b.date ? -1 : byDateOrder(a, b);   // newest first, then dateOrder
  });
}

// Content-type tags that mark what a post *is* (a writeup vs. a quick blurb)
// always lead the tag list, wherever a post's tags are shown. Everything else
// keeps its given order.
const LEAD_TAGS = ["writeup", "blurb"];
function orderTags(tags) {
  if (!Array.isArray(tags)) return [];
  const rank = (t) => {
    const i = LEAD_TAGS.indexOf(t);
    return i === -1 ? LEAD_TAGS.length : i;
  };
  // Stable sort: ties (same rank) keep their original order.
  return [...tags].sort((a, b) => rank(a) - rank(b));
}

// One homepage/tag grid tile. `i` is the item's index on the page, driving the
// staggered load-in animation delay (see the .tile rule in the CSS).
function renderTile(post, i) {
  const draft = isDraft(post);
  const pinned = isPinned(post);
  // Pinned posts sort to the front (see sortPosts) but have NO visual indicator
  // on the tile — just the is-pinned class as a hook. Only drafts get a badge.
  return `
    <a class="tile${draft ? " is-draft" : ""}${pinned ? " is-pinned" : ""}" href="post.html?id=${encodeURIComponent(post.id)}" style="animation-delay: ${(0.3 + i * 0.05).toFixed(2)}s">
      ${draft ? '<span class="draft-badge">DRAFT</span>' : ""}
      <img src="${escapeHTML(post.thumb || post.image)}" alt="${escapeHTML(post.title)}" loading="lazy">
      <div class="tile-overlay">
        <span class="tile-caption">
          <span class="tile-title">${escapeHTML(post.title)}</span>
          <span class="tile-date">${escapeHTML(formatDate(post.date))}</span>
        </span>
      </div>
    </a>
  `;
}

// Wire up the back link (class="back-link"): always labeled "← Back", and
// return via history.back() when the user arrived from within the site.
// Otherwise the plain href (index.html) handles the fallback. Call this from a
// page's own script; pages without a back link (the homepage) just don't call
// it. Safe to call when no .back-link is present — it's a no-op.
function initBackButton() {
  const backLink = document.querySelector(".back-link");
  if (!backLink) return;

  backLink.textContent = "← Back";

  backLink.addEventListener("click", (e) => {
    const cameFromSite = window.history.length > 1 &&
      document.referrer &&
      new URL(document.referrer).origin === window.location.origin;
    if (cameFromSite) {
      e.preventDefault();
      window.history.back();
    }
  });
}
