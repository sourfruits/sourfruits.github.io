// Homepage: load every post from data/posts.json and render the thumbnail grid.

const grid = document.getElementById("grid");
const status = document.getElementById("status");

// Stamp the current year in the footer.
document.getElementById("year").textContent = new Date().getFullYear();

// Turn an ISO date (YYYY-MM-DD) into something friendlier, e.g. "Jun 21, 2026".
function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function renderGrid(posts) {
  // Newest first, regardless of order in the JSON file.
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));

  grid.innerHTML = posts.map((post) => `
    <a class="tile" href="post.html?id=${encodeURIComponent(post.id)}">
      <img src="${escapeHTML(post.thumb || post.image)}" alt="${escapeHTML(post.title)}" loading="lazy">
      <div class="tile-overlay">
        <span class="tile-title">${escapeHTML(post.title)}</span>
        <span class="tile-date">${escapeHTML(formatDate(post.date))}</span>
      </div>
    </a>
  `).join("");

  status.textContent = posts.length ? "" : "No posts yet.";
}

fetch("data/posts.json")
  .then((res) => {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  })
  .then(renderGrid)
  .catch((err) => {
    status.textContent = "Couldn't load posts. If you opened this file directly, run a local server (see the README).";
    status.classList.add("error");
    console.error(err);
  });
