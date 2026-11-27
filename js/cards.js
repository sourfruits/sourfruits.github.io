// Shared "card" previews of posts, used by the Writing page and the tag pages:
// a small-caps DATE · TAGS line, the title, the italic subtitle and a short
// excerpt from the opening. Laid out by the .writing-grid / .writing-card CSS.

// "Nov 14, 2026" (or "Nov 14" when withYear is false; the month follows
// DATE_MONTH_STYLE in utils.js). Month-only dates show just the month; year-only
// dates show only the year (or nothing).
function shortDate(iso, withYear) {
  const parts = String(iso).split("-");
  if (parts.length < 2) return withYear ? parts[0] : "";
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2] || 1));
  const month = DATE_MONTH_STYLE;
  const opts = parts.length === 2 ? { month } : { month, day: "numeric" };
  if (withYear) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}


// A short plain-text excerpt from the start of a piece: the optional
// `excerpt:` frontmatter line if there is one, otherwise the opening words of
// the body with headings, images and Markdown symbols stripped.
const EXCERPT_WORDS = 42;
const POEM_EXCERPT_LINES = 4;
function excerptOf(post) {
  if (typeof post.excerpt === "string" && post.excerpt.trim()) return post.excerpt.trim();
  // Poems: the opening lines, kept as lines (joined with \n; shown with <br>).
  if (post.layout === "poem") {
    const lines = String(post.content || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.slice(0, POEM_EXCERPT_LINES).join("\n") + (lines.length > POEM_EXCERPT_LINES ? "\n…" : "");
  }
  const text = String(post.content || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(#|!\[|---|\*\*\*|___)/.test(line))   // headings, images, rules
    .join(" ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")   // [text](link) → text
    .replace(/[*_`>]+/g, "")                    // emphasis / quote markers
    .replace(/\\/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(" ");
  return words.length > EXCERPT_WORDS ? words.slice(0, EXCERPT_WORDS).join(" ") + "…" : text;
}

// One card: a small-caps "DATE · TAGS" line on top (tags that don't fit
// collapse into a "+N more" label), then the title, the italic subtitle and
// the excerpt. The whole card links to the piece.
// `tags` is the list of tags to show on the card (each page decides which).
// `opts.excerpt: false` leaves out the excerpt (the compact cards on tag pages).
function cardHTML(post, tags, opts) {
  const withExcerpt = !(opts && opts.excerpt === false);
  const tagHTML = (tags || [])
    .map((t) => `<span class="writing-card-tag">${escapeHTML(t)}</span>`)
    .join(`<span class="writing-card-sep" aria-hidden="true">·</span>`);
  const excerpt = withExcerpt ? excerptOf(post) : "";
  return `<li><a class="writing-card${isDraft(post) ? " is-draft" : ""}" href="post.html?id=${encodeURIComponent(post.id)}">
        <span class="writing-card-info">
          <span class="writing-card-date">${escapeHTML(shortDate(post.date, true))}</span>
          ${tagHTML ? `<span class="writing-card-sep" aria-hidden="true">·</span><span class="writing-card-tags">${tagHTML}</span>` : ""}
        </span>
        <span class="writing-card-title">${escapeHTML(post.title)}</span>
        ${post.subtitle ? `<span class="writing-card-sub">${escapeHTML(post.subtitle)}</span>` : ""}
        ${excerpt ? `<span class="writing-card-excerpt">${escapeHTML(excerpt).replace(/\n/g, "<br>")}</span>` : ""}
      </a></li>`;
}

// Clamp every card's tag row to one line with a trailing "+N more" (the same
// helper the homepage tiles use).
function fitCardTags(root) {
  root.querySelectorAll(".writing-card-tags").forEach((row) =>
    fitTagsWithMore(row, ".writing-card-tag", ".writing-card-sep", "writing-card-tag"));
}


// Fit the tag rows on a container now and again whenever the window resizes.
// (Title line breaks are plain CSS — text-wrap: pretty — no script needed.)
function fitCards(root) {
  fitCardTags(root);
}
function watchCards(root) {
  fitCards(root);
  if (!root.dataset.cardsWatched) {
    root.dataset.cardsWatched = "1";
    window.addEventListener("resize", () => fitCards(root));
  }
}
