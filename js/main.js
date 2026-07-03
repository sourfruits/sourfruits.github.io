// Homepage: load every post from data/posts.json and render the thumbnail grid.

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const pagination = document.getElementById("pagination");

const PER_PAGE = 9;

// Stamp the current year in the footer.
document.getElementById("year").textContent = new Date().getFullYear();

// Build an href for a given page number, keeping page 1 clean (no ?page=).
function pageHref(page) {
  return page <= 1 ? "index.html" : `index.html?page=${page}`;
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

  status.textContent = posts.length ? "" : "No posts yet.";
}

fetchPosts()
  .then(renderGrid)
  .catch((err) => {
    status.textContent = "Couldn't load posts. If you opened this file directly, run a local server (see the README).";
    status.classList.add("error");
    console.error(err);
  });
