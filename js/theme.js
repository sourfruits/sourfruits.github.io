// Site-wide theme control. Normally injects a small floating day/night toggle
// (bottom-right) that flips data-theme="dark" on <html> and remembers the choice
// in localStorage. The MINIMAL flag below overrides all of that.

(function () {
  const THEME_KEY = "theme";

  // MINIMAL mode — a code-only, always-on switch (no UI). When true, the whole
  // site renders a fixed clean palette: flat white background + a very light,
  // untinted grey header (see the [data-theme="minimal"] block in
  // css/styles.css). The day/night toggle button is never shown, and saved/OS
  // preferences are ignored. Set to false to restore the normal day/night toggle.
  const MINIMAL = true;
  if (MINIMAL) {
    document.documentElement.setAttribute("data-theme", "minimal");
    return;   // fixed in code — skip the toggle button and localStorage entirely
  }

  // Build the floating toggle button. Moon shows in light mode (click → dark),
  // sun shows in dark mode (click → light); the CSS swaps which icon is visible.
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "theme-toggle";
  toggle.className = "theme-toggle";
  toggle.setAttribute("aria-label", "Toggle dark mode");
  toggle.setAttribute("aria-pressed", "false");
  toggle.innerHTML = `
    <svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
    <svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
    </svg>`;

  function setTheme(next) {
    document.documentElement.setAttribute("data-theme", next);
    toggle.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
    try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* ignore */ }
  }

  toggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    setTheme(current === "dark" ? "light" : "dark");
  });

  function mount() {
    document.body.appendChild(toggle);
    // Initialize from the saved choice (default light).
    let initialTheme = "light";
    try { initialTheme = localStorage.getItem(THEME_KEY) || "light"; } catch (err) { /* ignore */ }
    setTheme(initialTheme);
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount);
  }
})();
