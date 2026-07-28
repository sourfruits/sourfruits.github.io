// Shared site header/nav. Fills the empty <header class="site-header">
// placeholder on every page so the markup lives in one place.

(function () {
  const header = document.querySelector(".site-header");
  if (!header) return;

  // Single source of truth for the site name in the header's top-left logo.
  // (The homepage masthead title now lives in the page HTML — see index2.html.)
  const SITE_NAME = "elia website";

  // "Precursors" nav link, one <span> per letter so each can jitter and colour
  // independently on hover. `--dy` is that letter's little vertical nudge; `--d`
  // staggers the transition so they don't all move as one block. The empty
  // <svg> is filled on hover with the connecting lines/dots (see below).
  const PRECURSORS = "see more";
  const JITTER = [-3, 2, -2, 3, -1, 2, -3, 2, -2, 1];  // px, gentle up/down
  const precursorsLetters = [...PRECURSORS].map((ch, i) =>
    `<span class="np-letter" style="--dy:${JITTER[i % JITTER.length]}px;--d:${(i * 0.015).toFixed(3)}s">${ch}</span>`
  ).join("");

  // Primary nav links + search, shared by the top bar (interior pages) and the
  // homepage hero. Only one of the two layouts renders per page, so the
  // easter-egg selectors (.nav-precursors, .header-search) stay unambiguous.
  // About link hidden — re-add `<a class="nav-link" href="about.html">About</a>`
  // to navLinks (and the mobile-nav block below) to restore it.
  const navLinks = `
            <a class="nav-link nav-precursors" href="precursors.html">${precursorsLetters}<svg class="np-graph" aria-hidden="true"></svg></a>`;
  const searchMarkup = `
          <form class="header-search" action="search.html" method="get" role="search">
            <input type="search" name="q" class="header-search-input" aria-label="Search posts" autocomplete="off">
            <button type="submit" class="header-search-btn" aria-label="Search">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          </form>`;

  header.innerHTML = `
    <div class="header-bar">
      <div class="header-bar-inner">
        <div class="header-brand">
          <a class="header-logo" href="index.html">${SITE_NAME}</a>
        </div>
        <div class="header-actions">
          <nav class="site-nav" aria-label="Primary">${navLinks}
          </nav>
          <!-- Search bar hidden — re-insert the searchMarkup variable here to restore it. -->
          <button type="button" class="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav">
            <span class="nav-toggle-box">
              <span class="nav-toggle-bar"></span>
              <span class="nav-toggle-bar"></span>
              <span class="nav-toggle-bar"></span>
            </span>
          </button>
        </div>
      </div>
    </div>
    <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile">
      <a class="nav-link" href="precursors.html">Precursors</a>
      <!-- About link hidden — re-insert <a class="nav-link" href="about.html">About</a> here to restore it. -->
    </nav>
  `;

  // Logo dots easter egg: the two dots are their own button (not the home link),
  // so clicking navigates nowhere. Each click swells the lemon a step and makes
  // it shudder (like it's working loose); on the 10th it pops off, falls onto the
  // navbar, and rolls left. Counter is in memory only (resets on reload).
  // (More rewards TBD.)
  const dots = header.querySelector(".logo-dots");
  if (dots) {
    const dotWrap = dots.querySelector(".dot-wrap");
    let squeezes = 0;
    let phase = "building";   // building → rolling → rested
    const GROW_STEP = 0.05;   // how much the lemon swells per click

    // Persist across page navigations for this tab (sessionStorage — clears when
    // the tab closes). Stores the rolled/rested lemon and its count/size.
    const LEMON_KEY = "sourfruits:lemon";
    function lemonLoad() {
      try { return JSON.parse(sessionStorage.getItem(LEMON_KEY)) || {}; } catch (e) { return {}; }
    }
    function lemonSave(patch) {
      const s = lemonLoad();
      Object.assign(s, patch);
      try { sessionStorage.setItem(LEMON_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    }

    // Count only starts once the lemon has fallen. Each squeeze of the grounded
    // lemon spawns a floating number (cookie-clicker style) that drifts up and
    // away, fades, and removes itself — several can overlap on fast clicks.
    const brand = dots.parentElement;   // un-rotated anchor (the button itself is rolled)
    let landedSqueezes = 0;
    function spawnCount(n) {
      const f = document.createElement("span");
      f.className = "squeeze-float";
      f.textContent = n;
      f.style.setProperty("--jx", (Math.random() * 10 - 5).toFixed(1) + "px");  // random start
      f.style.setProperty("--dx", (Math.random() * 16 - 8).toFixed(1) + "px");  // sideways drift
      // Anchor to the brand (not the rolled button) and place at the lemon's
      // current on-screen spot, so the number floats straight up regardless of
      // how the lemon is rotated.
      const b = brand.getBoundingClientRect();
      const d = dotWrap.getBoundingClientRect();
      f.style.left = (d.left + d.width / 2 - b.left) + "px";
      f.style.top = (d.top - b.top - 8) + "px";   // start a little above the lemon
      brand.appendChild(f);
      f.addEventListener("animationend", () => f.remove());
    }

    // The tenth-click drop, as physics: the button pops up-and-out, falls under
    // gravity, hits the navbar at whatever rotation it's tumbled to, rolls a
    // little (spin coupled to its speed), then — like the offset yellow is a
    // weighted bob — rocks to rest with yellow settling to green's lower-left.
    // Drives the button's inline transform each frame; freezes + saves at rest.
    const YELLOW_DOWN_LEFT = 90;   // rot (deg) that hangs yellow to green's lower-left
    function dropLemon() {
      const g = 0.85;             // gravity (px/frame^2)
      const radius = 13;          // ~lemon radius, for rolling (spin ↔ travel)
      const DEG = 180 / Math.PI;
      const floorY = 25;          // where it lands relative to its start
      let x = 0, y = 0, rot = 0;
      let vx = -1.25, vy = -7;    // initial pop: up and out to the left (kept short, near the logo)
      let vrot = -5;              // initial tumble in the air (gentle — most of the turning is the ground roll)
      let stage = "air";          // air → roll (one continuous, decelerating roll to rest)
      let eq = 0;                 // resting angle (yellow lower-left) just ahead in the rolling direction
      let cap = 0;                // rolling speed on touchdown; the ease is never faster than this
      dots.style.transition = "none";   // physics drives the transform per frame
      // The nearest yellow-lower-left orientation strictly ahead in the rolling direction.
      function restAhead(from, dir) {
        const k = (from - YELLOW_DOWN_LEFT) / 360;
        return YELLOW_DOWN_LEFT + 360 * (dir < 0 ? Math.ceil(k) - 1 : Math.floor(k) + 1);
      }
      function frame() {
        if (stage === "air") {
          vy += g;
          x += vx; y += vy; rot += vrot;
          if (y >= floorY) {
            y = floorY;
            if (vy > 3) {                 // still has drop energy → a small bounce
              vy = -vy * 0.34; vx *= 0.86; vrot *= 0.86;
            } else {                      // vertical energy spent → settle onto the ground and roll to rest
              vy = 0; stage = "roll";
              eq = restAhead(rot, vx);
              cap = Math.abs((vx / radius) * DEG);
            }
          }
        } else {                          // roll: speed ∝ remaining angle → smooth, single deceleration to rest
          cap *= 0.99;                    // gentle rolling friction on the ceiling speed
          let v = (eq - rot) * 0.09;      // ease-out toward the rest angle
          if (Math.abs(v) > cap) v = Math.sign(v) * cap;   // …but never faster than the roll came in
          rot += v;
          x += (v / DEG) * radius;        // no-slip: turning is rolling, never a spin in place
          if (Math.abs(eq - rot) < 0.4) {
            finishDrop(x, floorY, eq);
            return;
          }
        }
        dots.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
    function finishDrop(x, y, rot) {
      const t = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
      dots.style.transform = t;
      dots.classList.remove("is-rolling");
      dots.classList.add("is-rested");
      phase = "rested";
      lemonSave({ stage: "rested", count: landedSqueezes, grow: dotWrap.style.getPropertyValue("--grow") || "1", rest: t });
    }

    dots.addEventListener("click", () => {
      if (phase === "rolling") return;   // locked mid-drop
      if (phase === "rested") {
        // Fallen lemon: clicking it squeezes it in place and floats up a count.
        landedSqueezes += 1;
        dotWrap.classList.remove("is-squeezing");
        void dotWrap.offsetWidth;
        dotWrap.classList.add("is-squeezing");
        spawnCount(landedSqueezes);
        lemonSave({ count: landedSqueezes });
        return;
      }
      // Building: swell a step and shudder (like it's working loose) each click,
      // restarting even on rapid repeats; the 10th pops it loose.
      squeezes += 1;
      if (squeezes >= 10) {
        phase = "rolling";
        dotWrap.classList.remove("is-shuddering");
        dots.classList.add("is-rolling");
        dropLemon();
        return;
      }
      dotWrap.style.setProperty("--grow", (1 + squeezes * GROW_STEP).toFixed(3));
      dotWrap.classList.remove("is-shuddering");
      void dotWrap.offsetWidth;   // force reflow
      dotWrap.classList.add("is-shuddering");
    });
    dotWrap.addEventListener("animationend", (e) => {
      if (e.animationName === "lemon-shudder") dotWrap.classList.remove("is-shuddering");
      if (e.animationName === "lemon-squeeze") dotWrap.classList.remove("is-squeezing");
    });

    // State carries across page *navigations* within the tab, but a refresh
    // resets it, and it's gone in a new/closed tab (sessionStorage is per-tab).
    // A reload and a navigation both load the page; the Performance API tells
    // them apart.
    (function restore() {
      try { localStorage.removeItem(LEMON_KEY); } catch (e) {}   // clear any orphan from earlier testing
      const nav = performance.getEntriesByType("navigation")[0];
      const isReload = nav
        ? nav.type === "reload"
        : (performance.navigation && performance.navigation.type === 1);
      if (isReload) { try { sessionStorage.removeItem(LEMON_KEY); } catch (e) {} return; }

      const s = lemonLoad();
      if (s.stage !== "rested") return;
      if (s.grow) dotWrap.style.setProperty("--grow", s.grow);
      // Restore the exact resting transform the physics landed on (fallback to
      // the static landed spot for older saves without it). No animation.
      if (s.rest) dots.style.transform = s.rest;
      else dots.classList.add("is-landed");
      dots.classList.add("is-rested");
      landedSqueezes = s.count || 0;
      phase = "rested";                               // clickable — green keeps counting
    })();
  }

  // Mobile nav: below the CSS breakpoint the three links are hidden and this
  // hamburger toggles a stacked panel under the header. The .nav-open class on
  // the header drives both the icon morph (→ X) and the panel open/close (CSS).
  const navToggle = header.querySelector(".nav-toggle");
  if (navToggle) {
    navToggle.addEventListener("click", () => {
      const open = header.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
  }

  // Search: the magnifier is a submit button. With a query typed, submitting
  // (button click or Enter) navigates to search.html. When the field is empty,
  // don't navigate — just focus the input so the user can start typing.
  const searchForm = header.querySelector(".header-search");
  if (searchForm) {
    const searchInput = searchForm.querySelector(".header-search-input");
    // On the search page, reflect the active ?q= so the header bar shows it —
    // and keep the field open (mobile) so it doesn't appear to close after you
    // press enter and land on the results page.
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      searchInput.value = q;
      searchForm.classList.add("is-expanded");
    }
    // Below this width the field is collapsed to just the magnifier (matches the
    // CSS breakpoint).
    const isCollapsedLayout = () => window.matchMedia("(max-width: 640px)").matches;
    searchForm.addEventListener("submit", (e) => {
      if (isCollapsedLayout()) {
        // Mobile: the first tap opens the field and focuses it. Once open, an
        // empty tap closes it again; a tap with text runs the search.
        if (!searchForm.classList.contains("is-expanded")) {
          e.preventDefault();
          searchForm.classList.add("is-expanded");
          searchInput.focus();
        } else if (!searchInput.value.trim()) {
          e.preventDefault();
          searchForm.classList.remove("is-expanded");
          searchInput.blur();
        }
        return;
      }
      // Desktop: an empty submit just focuses the field, doesn't navigate.
      if (!searchInput.value.trim()) {
        e.preventDefault();
        searchInput.focus();
      }
    });
    // Collapse the mobile field back to an icon when you tap outside it while
    // it's empty (tapping the magnifier itself stays open — handled above).
    document.addEventListener("click", (e) => {
      if (searchForm.classList.contains("is-expanded") &&
          !searchForm.contains(e.target) &&
          !searchInput.value.trim()) {
        searchForm.classList.remove("is-expanded");
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
