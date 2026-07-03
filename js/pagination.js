// Shared pagination used by the homepage, tag view, and search view.
//
// Reads ?page= from the URL, slices the items for the current page, hands that
// slice to a page-specific render callback, and draws the numbered prev/next
// nav. Each page supplies its own `hrefFor` (so ?tag=/?q= are preserved) and
// its own `renderItems` (grid of tiles vs. list of cards).

(function (global) {
  // Read the requested page from ?page=, clamped to a valid range.
  function currentPage(totalPages) {
    const raw = parseInt(new URLSearchParams(window.location.search).get("page"), 10);
    if (isNaN(raw) || raw < 1) return 1;
    return Math.min(raw, totalPages);
  }

  function renderNav(container, page, totalPages, hrefFor) {
    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    const parts = [];

    // Previous button — disabled on the first page.
    parts.push(page > 1
      ? `<a class="page-link page-prev" href="${hrefFor(page - 1)}" rel="prev">‹ Prev</a>`
      : `<span class="page-link page-prev is-disabled" aria-disabled="true">‹ Prev</span>`);

    // Numbered page links.
    for (let n = 1; n <= totalPages; n++) {
      parts.push(n === page
        ? `<span class="page-link page-number is-current" aria-current="page">${n}</span>`
        : `<a class="page-link page-number" href="${hrefFor(n)}">${n}</a>`);
    }

    // Next button — disabled on the last page.
    parts.push(page < totalPages
      ? `<a class="page-link page-next" href="${hrefFor(page + 1)}" rel="next">Next ›</a>`
      : `<span class="page-link page-next is-disabled" aria-disabled="true">Next ›</span>`);

    container.innerHTML = parts.join("");
  }

  // Paginate `items` into pages of `perPage`, render the current page's slice
  // via `renderItems`, and draw the nav into `container`.
  function paginate({ items, perPage, container, hrefFor, renderItems }) {
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    const page = currentPage(totalPages);
    const start = (page - 1) * perPage;

    renderItems(items.slice(start, start + perPage));
    renderNav(container, page, totalPages, hrefFor);

    return { page, totalPages };
  }

  global.Pagination = { paginate };
})(window);
