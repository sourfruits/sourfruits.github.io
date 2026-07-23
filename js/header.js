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

  // "Precursors" nav link, one <span> per letter so each can jitter and colour
  // independently on hover. `--dy` is that letter's little vertical nudge; `--d`
  // staggers the transition so they don't all move as one block. The empty
  // <svg> is filled on hover with the connecting lines/dots (see below).
  const PRECURSORS = "Precursors";
  const JITTER = [-3, 2, -2, 3, -1, 2, -3, 2, -2, 1];  // px, gentle up/down
  const precursorsLetters = [...PRECURSORS].map((ch, i) =>
    `<span class="np-letter" style="--dy:${JITTER[i % JITTER.length]}px;--d:${(i * 0.015).toFixed(3)}s">${ch}</span>`
  ).join("");

  // Homepage hero: the big centered title + green divider line.
  const intro = isHome
    ? `
    <div class="site-intro">
      <a class="site-title" href="index.html">${SITE_NAME}</a>
    </div>`
    : "";

  header.innerHTML = `
    <div class="header-bar">
      <div class="header-bar-inner">
        <a class="header-logo" href="index.html"><span class="dot-wrap"><span class="dot dot-green"></span><span class="dot dot-yellow"></span></span>${SITE_NAME}</a>
        <div class="header-actions">
          <nav class="site-nav" aria-label="Primary">
            <a class="nav-link nav-precursors" href="precursors.html">${precursorsLetters}<svg class="np-graph" aria-hidden="true"></svg></a>
            <a class="nav-link" href="about.html">About</a>
            <a class="nav-link" href="tags.html">Tags</a>
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
    // On the search page, reflect the active ?q= so the header bar shows it.
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) searchInput.value = q;
    searchForm.addEventListener("submit", (e) => {
      if (!searchInput.value.trim()) {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

  // Precursors easter egg: on hover the letters jitter + turn green (CSS), and a
  // beat later a faint node-graph fades in between them — a line from each letter
  // to the next, with a dot at every letter. The dots sit at each letter's
  // *hovered* position (its rest centre plus its --dy nudge). Rebuilt on every
  // enter so it tracks window resizing / zoom without extra listeners.
  const precursorsLink = header.querySelector(".nav-precursors");
  if (precursorsLink) {
    const graphSvg = precursorsLink.querySelector(".np-graph");
    const letterEls = [...precursorsLink.querySelectorAll(".np-letter")];
    const SVG_NS = "http://www.w3.org/2000/svg";

    precursorsLink.addEventListener("mouseenter", () => {
      const box = precursorsLink.getBoundingClientRect();
      graphSvg.setAttribute("width", box.width);
      graphSvg.setAttribute("height", box.height);
      const pts = letterEls.map((el) => {
        const r = el.getBoundingClientRect();
        const dy = parseFloat(getComputedStyle(el).getPropertyValue("--dy")) || 0;
        return {
          x: r.left - box.left + r.width / 2,
          y: r.top - box.top + r.height / 2 + dy,
        };
      });

      while (graphSvg.firstChild) graphSvg.removeChild(graphSvg.firstChild);
      // Connecting lines between the letters (no dots).
      for (let i = 0; i < pts.length - 1; i++) {
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("class", "np-line");
        line.setAttribute("x1", pts[i].x);
        line.setAttribute("y1", pts[i].y);
        line.setAttribute("x2", pts[i + 1].x);
        line.setAttribute("y2", pts[i + 1].y);
        graphSvg.appendChild(line);
      }
    });
  }

  // Stamp the current year into the footer's year slot (present on every page),
  // so individual page scripts don't each repeat it.
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
