// Shared site header/nav. Fills the empty <header class="site-header">
// placeholder on every page so the markup lives in one place.

(function () {
  const header = document.querySelector(".site-header");
  if (!header) return;

  // Single source of truth for the site name — used by both the top-left logo
  // and the centered title below, so changing it here updates both.
  const SITE_NAME = "Sourfruits";

  // The large centered title lives on the homepage only; every other page shows
  // just the top-left logo. Treat "/" and "index.html" as the homepage.
  const file = window.location.pathname.split("/").pop();
  const isHome = file === "" || file === "index.html";

  const intro = isHome
    ? `
    <div class="site-intro">
      <a class="site-title" href="index.html">${SITE_NAME}</a>
      <p class="site-tagline">Documenting what I read, watch, and create.</p>
    </div>`
    : "";

  header.innerHTML = `
    <div class="header-bar">
      <div class="header-bar-inner">
        <a class="header-logo" href="index.html"><span class="dot-wrap"><span class="dot dot-green"></span><span class="dot dot-yellow"></span></span>${SITE_NAME}</a>
        <div class="header-actions">
          <nav class="site-nav" aria-label="Primary">
            <a class="nav-link" href="tags.html">Tags</a>
            <a class="nav-link" href="about.html">About</a>
          </nav>
          <form class="header-search" action="search.html" method="get" role="search">
            <input type="search" name="q" class="header-search-input" aria-label="Search posts" autocomplete="off">
            <button type="submit" class="header-search-btn" aria-label="Search">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>${intro}
  `;

  // Search: the magnifier is a submit button. With a query typed, submitting
  // (button click or Enter) navigates to search.html. When the field is empty,
  // don't navigate — just focus the input so the user can start typing.
  const searchForm = header.querySelector(".header-search");
  if (searchForm) {
    const searchInput = searchForm.querySelector(".header-search-input");
    searchForm.addEventListener("submit", (e) => {
      if (!searchInput.value.trim()) {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

  // Stamp the current year into the footer's year slot (present on every page),
  // so individual page scripts don't each repeat it.
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
