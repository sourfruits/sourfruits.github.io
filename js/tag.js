// Tag view: read ?tag= from the URL, show every post that carries that tag.

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const heading = document.getElementById("tag-heading");
const pagination = document.getElementById("pagination");

const PER_PAGE = 9;

document.getElementById("year").textContent = new Date().getFullYear();
initBackButton();

const tag = new URLSearchParams(window.location.search).get("tag");

// Build an href for a given page number, keeping the tag and page 1 clean.
function pageHref(page) {
  const base = `tag.html?tag=${encodeURIComponent(tag)}`;
  return page <= 1 ? base : `${base}&page=${page}`;
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
}

if (!tag) {
  heading.textContent = "No tag specified.";
  status.textContent = "";
} else {
  document.title = `#${tag} — Sourfruits`;
  heading.innerHTML = `Posts tagged &ldquo;<span class="tag-name">${escapeHTML(tag)}</span>&rdquo;`;

  fetchPosts()
    .then((posts) => {
      const matches = posts.filter((p) => Array.isArray(p.tags) && p.tags.includes(tag));
      renderGrid(matches);
      status.textContent = matches.length ? "" : "No posts with this tag yet.";
    })
    .catch((err) => {
      status.textContent = "Couldn't load posts. If you opened this file directly, run a local server (see the README).";
      status.classList.add("error");
      console.error(err);
    });
}
