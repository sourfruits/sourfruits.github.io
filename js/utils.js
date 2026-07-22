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

// Sort posts newest-first by ISO date. Mutates and returns the array. Ties
// (same date) return 0, so the stable sort keeps their order from posts.json.
function sortByDateDesc(posts) {
  return posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// A post is a draft if it's flagged "draft": true, or dated in 2099 or later
// (a convention for posts parked in the future). Drafts are hidden by default.
function isDraft(post) {
  if (post.draft === true) return true;
  const year = parseInt(String(post.date || "").slice(0, 4), 10);
  return year >= 2099;
}

// One homepage/tag grid tile. `i` is the item's index on the page, driving the
// staggered load-in animation delay (see the .tile rule in the CSS).
function renderTile(post, i) {
  const draft = isDraft(post);
  return `
    <a class="tile${draft ? " is-draft" : ""}" href="post.html?id=${encodeURIComponent(post.id)}" style="animation-delay: ${(0.3 + i * 0.05).toFixed(2)}s">
      ${draft ? '<span class="draft-badge">DRAFT</span>' : ""}
      <img src="${escapeHTML(post.thumb || post.image)}" alt="${escapeHTML(post.title)}" loading="lazy">
      <div class="tile-overlay">
        <span class="tile-title">${escapeHTML(post.title)}</span>
        <span class="tile-date">${escapeHTML(formatDate(post.date))}</span>
      </div>
    </a>
  `;
}

// Pick the back-link label based on the page the user came from.
function backLabel() {
  const ref = document.referrer;
  if (ref.includes("search.html")) return "← Search results";
  if (ref.includes("tag.html")) return "← Back to tag";
  if (ref.includes("index.html")) return "← All posts";
  // A same-origin root URL (e.g. "https://host/" or ".../blog/") is the homepage.
  try {
    const url = new URL(ref);
    if (url.origin === window.location.origin && url.pathname.endsWith("/")) {
      return "← All posts";
    }
  } catch (err) {
    // No/malformed referrer — fall through to the generic label.
  }
  return "← Back";
}

// Wire up the back link (class="back-link"): label it with wherever the user
// came from, and return there via history.back() when they arrived from within
// the site. Otherwise the plain href (index.html) handles the fallback. Call
// this from a page's own script; pages without a back link (the homepage) just
// don't call it. Safe to call when no .back-link is present — it's a no-op.
function initBackButton() {
  const backLink = document.querySelector(".back-link");
  if (!backLink) return;

  backLink.textContent = backLabel();

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
