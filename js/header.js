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
        <div class="header-brand">
          <button type="button" class="logo-dots" aria-label="Squeeze the lemon">
            <span class="dot-wrap"><span class="dot dot-green"></span><span class="dot dot-yellow"></span></span>
          </button>
          <a class="header-logo" href="index.html">${SITE_NAME}</a>
        </div>
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

  // Logo dots easter egg: the two dots are their own button (not the home link),
  // so clicking navigates nowhere. Each click swells the lemon a step and makes
  // it shudder (like it's working loose); on the 10th it pops off, falls onto the
  // navbar, and rolls left. Counter is in memory only (resets on reload).
  // (More rewards TBD.)
  const dots = header.querySelector(".logo-dots");
  if (dots) {
    const dotWrap = dots.querySelector(".dot-wrap");
    let squeezes = 0;
    let phase = "building";   // building → rolling → rested → finale → rested
    let finaled = false;      // the yellow-falls finale only happens once
    const GROW_STEP = 0.05;   // how much the lemon swells per click

    // Persist across page navigations for this tab (sessionStorage — clears when
    // the tab closes). Stores the rolled/rested lemon, its count/size, and whether
    // the finale (yellow gone) has happened.
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

    // Detach a dot into a fixed-position clone at its current on-screen spot, so
    // it can fall freely (past the rotated logo / down the page). Hides the
    // original and hands off to the clone.
    function makeFallingClone(dotEl) {
      const r = dotEl.getBoundingClientRect();
      const c = document.createElement("span");
      c.className = "falling-dot";
      c.style.left = r.left + "px";
      c.style.top = r.top + "px";
      c.style.width = r.width + "px";
      c.style.height = r.height + "px";
      c.style.background = getComputedStyle(dotEl).backgroundColor;
      document.body.appendChild(c);
      dotEl.style.visibility = "hidden";
      return c;
    }

    // Simple gravity fall: accelerate downward, and (if it bounces) rebound off
    // floorY with diminishing energy until it settles. vx gives a little sideways
    // momentum (with friction on each bounce). Drives top/left per frame.
    // Yellow's exit: it rolls (drifts sideways + spins) as it bounces fully on
    // the floor; once the bounces are spent it stops rolling and drops straight
    // off the bottom into the void (no extra roll tacked on). onDone when gone.
    function yellowFall(el, floorY, onDone) {
      const g = 1.1;
      let x = parseFloat(el.style.left) || 0;
      let y = parseFloat(el.style.top) || 0;
      let vy = 0, vx = -1.4, rot = 0, vrot = -9;
      let floored = true;
      const goneY = floorY + window.innerHeight + 200;
      el.style.transition = "none";
      function step() {
        vy += g; y += vy; x += vx; rot += vrot;
        if (floored && y >= floorY) {
          y = floorY; vy = -vy * 0.55; vx *= 0.8; vrot *= 0.8;   // bounce, roll a little slower
          if (Math.abs(vy) < 2.2) {                              // bounces spent → stop rolling, drop
            floored = false; vy = 0; vx = 0; vrot = 0;
          }
        }
        el.style.left = x + "px"; el.style.top = y + "px";
        el.style.transform = "rotate(" + rot + "deg)";
        if (!floored && y > goneY) {                             // gone past the bottom
          if (onDone) onDone();
          return;
        }
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    // 50-click milestone: the whole lemon shakes, then yellow drops (gravity + a
    // little bounce) and settles on the footer. Green stays on the logo for now.
    function finale() {
      finaled = true;
      phase = "finale";
      lemonSave({ stage: "fallen", finaled: true });   // persist even if you navigate mid-fall
      dotWrap.classList.remove("is-shuddering", "is-squeezing");
      void dotWrap.offsetWidth;
      dotWrap.classList.add("is-finale-shudder");

      setTimeout(() => {
        // Yellow drops, bounces fully at the bottom of the viewport, rolls a bit,
        // then falls off the screen. Green stays on the logo — and the click
        // counter resumes on it once yellow is gone.
        const yellow = makeFallingClone(dots.querySelector(".dot-yellow"));
        const floorY = window.innerHeight - 8 - yellow.offsetHeight;
        yellowFall(yellow, floorY, () => {
          yellow.remove();
          phase = "rested";   // green is clickable again; counting continues on it
        });
      }, 550);
    }

    dots.addEventListener("click", () => {
      if (phase === "rolling" || phase === "finale") return;   // locked mid-transition
      if (phase === "rested") {
        // Fallen lemon: clicking it squeezes it in place and floats up a count.
        landedSqueezes += 1;
        dotWrap.classList.remove("is-squeezing");
        void dotWrap.offsetWidth;
        dotWrap.classList.add("is-squeezing");
        spawnCount(landedSqueezes);
        lemonSave({ count: landedSqueezes });
        if (!finaled && landedSqueezes >= 1) finale();   // TESTING: milestone lowered (was 50)
        return;
      }
      // Building: swell a step and shudder (like it's working loose) each click,
      // restarting even on rapid repeats; the 10th pops it loose.
      squeezes += 1;
      if (squeezes >= 10) {
        phase = "rolling";
        dotWrap.classList.remove("is-shuddering");
        dots.classList.add("is-rolling", "is-dropping");
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
      if (e.animationName === "logo-finale-shudder") dotWrap.classList.remove("is-finale-shudder");
    });
    // When the roll finishes, unlock it — it's now clickable at its new resting
    // spot (the old spot is dead, since the button transform moved its hit area).
    dots.addEventListener("animationend", (e) => {
      if (e.animationName === "lemon-drop") {
        dots.classList.remove("is-rolling");
        dots.classList.add("is-landed", "is-rested");   // hold the rolled spot; no hover-swell
        phase = "rested";
        lemonSave({ stage: "rested", count: landedSqueezes, grow: dotWrap.style.getPropertyValue("--grow") || "1" });
      }
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
      if (s.stage !== "rested" && s.stage !== "fallen") return;
      if (s.grow) dotWrap.style.setProperty("--grow", s.grow);
      dots.classList.add("is-landed", "is-rested");   // sit at the rolled spot (no animation)
      landedSqueezes = s.count || 0;
      finaled = !!s.finaled;
      phase = "rested";                               // clickable — green keeps counting
      if (s.stage === "fallen") {
        dots.querySelector(".dot-yellow").style.visibility = "hidden";   // yellow already fell away
      }
    })();
  }

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
