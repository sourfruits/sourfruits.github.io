// Tag view: read ?tag= from the URL, show every post that carries that tag.

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const heading = document.getElementById("tag-heading");
const pagination = document.getElementById("pagination");

initBackButton();

const tag = new URLSearchParams(window.location.search).get("tag");

// Build an href for a given page number, keeping the tag and page 1 clean.
function pageHref(page) {
  const base = `tag.html?tag=${encodeURIComponent(tag)}`;
  return page <= 1 ? base : `${base}&page=${page}`;
}

function renderGrid(posts) {
  // Newest first, regardless of order in the JSON file.
  sortByDateDesc(posts);

  // Fill each page based on the grid's live column count (which follows the
  // screen-width breakpoints).
  Pagination.paginate({
    items: posts,
    perPage: Pagination.gridPerPage(grid),
    container: pagination,
    hrefFor: pageHref,
    renderItems: (pagePosts) => {
      grid.innerHTML = pagePosts.map(renderTile).join("");
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
      const matches = posts.filter((p) =>
        !isDraft(p) && Array.isArray(p.tags) && p.tags.includes(tag));
      renderGrid(matches);
      status.textContent = matches.length ? "" : "No posts with this tag yet.";
    })
    .catch((err) => {
      status.textContent = "Couldn't load posts. If you opened this file directly, run a local server (see the README).";
      status.classList.add("error");
      console.error(err);
    });
}
