// Shared pagination used by the homepage, tag view, and search view.
//
// Reads ?page= from the URL, slices the items for the current page, hands that
// slice to a page-specific render callback, and draws the numbered prev/next
// nav. Each page supplies its own `hrefFor` (so ?tag=/?q= are preserved) and
// its own `renderItems` (grid of tiles vs. list of cards).

(function (global) {
  // How many rows we want to fill for a given column count, so each page's grid
  // comes out complete. The grid is fixed at 3 columns → 4 rows (12 per page);
  // the other entries are kept as sane fallbacks.
  const ROWS_FOR_COLUMNS = { 2: 4, 3: 4, 4: 4 };

  // Count the grid's rendered columns from its computed style. This reflects
  // both the screen-width media queries and the compact/normal class, so it
  // always matches what the visitor actually sees.
  function columnCount(grid) {
    const cols = getComputedStyle(grid)
      .gridTemplateColumns
      .split(" ")
      .filter(Boolean).length;
    return cols || 3;
  }

  // Posts per page for a grid = columns × the rows we want for that column
  // count. Falls back to 3 rows for any unexpected column count.
  function gridPerPage(grid) {
    const cols = columnCount(grid);
    return cols * (ROWS_FOR_COLUMNS[cols] || 3);
  }

  // Read the requested page from ?page=, clamped to a valid range.
  function currentPage(totalPages) {
    const raw = parseInt(new URLSearchParams(window.location.search).get("page"), 10);
    if (isNaN(raw) || raw < 1) return 1;
    return Math.min(raw, totalPages);
  }

  // The page numbers to actually show: always the first and last page, plus the
  // current page and its immediate neighbours. Any gap wider than one page
  // collapses to an ellipsis marker ("…"), e.g. [1, "…", 4, 5, 6, "…", 20].
  function pageWindow(page, totalPages) {
    const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
    const shown = [...wanted]
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);
    const out = [];
    let prev = 0;
    for (const n of shown) {
      if (n - prev > 1) out.push("…");   // skipped one or more pages → ellipsis
      out.push(n);
      prev = n;
    }
    return out;
  }

  function renderNav(container, page, totalPages, hrefFor) {
    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    const parts = [];

    // Previous page holds newer posts (newest-first) — disabled on the first page.
    parts.push(page > 1
      ? `<a class="page-link page-prev" href="${hrefFor(page - 1)}" rel="prev">Newer</a>`
      : `<span class="page-link page-prev is-disabled" aria-disabled="true">Newer</span>`);

    // Numbered page links: first, last, and the current page ±1; larger gaps
    // show as a non-interactive ellipsis.
    for (const n of pageWindow(page, totalPages)) {
      if (n === "…") {
        parts.push(`<span class="page-link page-ellipsis" aria-hidden="true">…</span>`);
        continue;
      }
      parts.push(n === page
        ? `<span class="page-link page-number is-current" aria-current="page">${n}</span>`
        : `<a class="page-link page-number" href="${hrefFor(n)}">${n}</a>`);
    }

    // Next page holds older posts — disabled on the last page.
    parts.push(page < totalPages
      ? `<a class="page-link page-next" href="${hrefFor(page + 1)}" rel="next">Older</a>`
      : `<span class="page-link page-next is-disabled" aria-disabled="true">Older</span>`);

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

  global.Pagination = { paginate, gridPerPage };
})(window);
