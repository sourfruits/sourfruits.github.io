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
        <a class="header-logo" href="index.html">${SITE_NAME}</a>
        <div class="header-actions">
          <nav class="site-nav" aria-label="Primary">
            <a class="nav-link" href="tags.html">Tags</a>
            <a class="nav-link" href="about.html">About</a>
          </nav>
          <button type="button" id="theme-toggle" class="theme-toggle" aria-label="Toggle dark mode" aria-pressed="false">
            <!-- Moon: shown in light mode (click to switch to dark) -->
            <svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
            <!-- Sun: shown in dark mode (click to switch to light) -->
            <svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4"></circle>
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
            </svg>
          </button>
          <a class="header-search" href="search.html" aria-label="Search">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </a>
        </div>
      </div>
    </div>${intro}
  `;

  // ---------- Dark-mode toggle (site-wide) ----------
  // Apply a theme ("light" or "dark") to the document, reflect it on the toggle
  // button, and remember the choice in localStorage so it persists across pages
  // and sessions. The CSS swaps the moon/sun icon and the color variables based
  // on the data-theme attribute on <html>.
  const THEME_KEY = "theme";
  const themeToggle = header.querySelector("#theme-toggle");

  function setTheme(next) {
    document.documentElement.setAttribute("data-theme", next);
    themeToggle.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
    try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* ignore */ }
  }

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    setTheme(current === "dark" ? "light" : "dark");
  });

  // Initialize from the saved choice (default light).
  let initialTheme = "light";
  try { initialTheme = localStorage.getItem(THEME_KEY) || "light"; } catch (err) { /* ignore */ }
  setTheme(initialTheme);
})();
