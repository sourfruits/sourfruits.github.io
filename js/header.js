// Shared site header/nav. Fills the empty <header class="site-header">
// placeholder on every page so the markup lives in one place.

(function () {
  const header = document.querySelector(".site-header");
  if (!header) return;

  header.innerHTML = `
    <div class="header-right">
      <nav class="site-nav" aria-label="Primary">
        <a class="nav-link" href="about.html">About</a>
        <a class="nav-link" href="tags.html">Tags</a>
      </nav>
      <a class="header-search" href="search.html" aria-label="Search">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </a>
    </div>
    <a class="site-title" href="index.html">Sourfruits</a>
    <p class="site-tagline">A blog about life's tart little pleasures</p>
  `;
})();
