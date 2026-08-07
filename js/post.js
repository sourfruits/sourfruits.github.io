// Post view: read ?id= from the URL, find that post in data/posts.json, render it.

const article = document.getElementById("post");
const status = document.getElementById("status");

initBackButton();

const id = new URLSearchParams(window.location.search).get("id");

// Render the post's Markdown content to HTML with marked, then sanitize the
// result with DOMPurify before it reaches the DOM.
function renderContent(text) {
  const html = marked.parse(String(text || ""));
  const clean = DOMPurify.sanitize(html);

  // Give any inline image that carries a Markdown title — ![alt](src "caption") —
  // a small muted caption beneath it, by wrapping it in a <figure>/<figcaption>.
  // Untitled images render bare. When the image is a standalone paragraph (the
  // usual case) the whole <p> is swapped out, so we don't nest a block <figure>
  // inside a <p>.
  const tmp = document.createElement("div");
  tmp.innerHTML = clean;
  tmp.querySelectorAll("img[title]").forEach((img) => {
    const caption = img.getAttribute("title").trim();
    if (!caption) return;
    const figure = document.createElement("figure");
    figure.className = "post-figure";
    const cap = document.createElement("figcaption");
    cap.className = "post-figcaption";
    cap.textContent = caption;

    const p = img.parentElement;
    const standalone = p && p.tagName === "P" && p.childNodes.length === 1;
    (standalone ? p : img).replaceWith(figure);
    img.removeAttribute("title");   // caption replaces the hover tooltip
    figure.append(img, cap);
  });
  return tmp.innerHTML;
}

// Create/update an <meta property="og:*"> tag in <head>.
function setOG(property, content) {
  if (!content) return;
  let tag = document.head.querySelector(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

// Turn the post's Markdown content into a short plain-text snippet for previews.
function contentSnippet(text, max = 160) {
  const tmp = document.createElement("div");
  tmp.innerHTML = renderContent(text);
  const plain = (tmp.textContent || "").replace(/\s+/g, " ").trim();
  return plain.length > max ? plain.slice(0, max - 1).trimEnd() + "…" : plain;
}

// Fill in Open Graph tags so shared links show the post's title, image, etc.
function setPostMeta(post) {
  const image = post.image || post.thumb;
  setOG("og:type", "article");
  setOG("og:site_name", "Sourfruits");
  setOG("og:title", post.title);
  setOG("og:description", contentSnippet(post.content));
  if (image) setOG("og:image", new URL(image, window.location.href).href);
  setOG("og:url", window.location.href);
}

function renderPost(post) {
  document.title = `${post.title} — Sourfruits`;
  setPostMeta(post);

  // Content-type tags ("writeup"/"blurb") lead; the rest keep their order.
  const orderedTags = orderTags(post.tags);
  const tags = orderedTags.length
    ? orderedTags
        .map((t) => `<a class="post-tag" href="tag.html?tag=${encodeURIComponent(t)}">${escapeHTML(t)}</a>`)
        // A standalone "·" divider sits between tags only — not attached to a tag,
        // and never between the date and the first tag.
        .join(`<span class="post-sep" aria-hidden="true">·</span>`)
    : "";

  // The frame shows the same photo as a blurred, darkened backdrop (via the
  // --post-bg custom property) so portrait/odd-ratio images fill the side space
  // instead of leaving it empty. The real image sits centered on top.
  const src = post.image || post.thumb;

  // Optional subtitle, shown between the title and the date.
  const subtitle = post.subtitle
    ? `<p class="post-subtitle">${escapeHTML(post.subtitle)}</p>`
    : "";

  article.innerHTML = `
    <h1 class="post-title">${escapeHTML(post.title)}</h1>
    ${subtitle}
    <p class="post-byline">by <span class="post-byline-name">Elia C</span></p>
    <div class="post-meta">
      <p class="post-date">${escapeHTML(formatDate(post.date, "short"))}</p>
      ${tags}
    </div>
    <hr class="post-rule">
    <div class="post-image-frame" style="--post-bg: url('${encodeURI(src)}')">
      <img class="post-image" src="${escapeHTML(src)}" alt="${escapeHTML(post.title)}">
    </div>
    <hr class="post-rule">
    <div class="post-body">${renderContent(post.content)}</div>
  `;
  status.textContent = "";

  // Collapse the tag row to a single line, spilling the overflow behind a
  // "+N more" toggle (recomputed on resize until the reader expands it).
  const meta = article.querySelector(".post-meta");
  clampMetaTags(meta);
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => clampMetaTags(meta), 150);
  });
}

// Fit the meta row's tags on one line. Whatever doesn't fit is hidden behind a
// trailing "+N more" button; clicking it drops the clamp so the row wraps out
// to every tag. Individual tags are never cut — the break only ever falls on a
// whole-tag boundary. No-ops once expanded, and when every tag already fits.
function clampMetaTags(meta) {
  if (!meta || meta.classList.contains("is-expanded")) return;
  const tags = Array.from(meta.querySelectorAll(".post-tag"));
  const seps = Array.from(meta.querySelectorAll(".post-sep"));
  if (tags.length < 2) return;

  // A reusable toggle, created once and parked at the end of the row.
  let more = meta.querySelector(".post-tags-more");
  if (!more) {
    more = document.createElement("button");
    more.type = "button";
    more.className = "post-tags-more";
    more.addEventListener("click", () => {
      meta.classList.add("is-expanded");
      tags.forEach((t) => (t.style.display = ""));
      seps.forEach((s) => (s.style.display = ""));
      more.style.display = "none";
    });
    meta.appendChild(more);
  }

  // Reset to the full, unclamped layout so we can measure the natural wrap.
  tags.forEach((t) => (t.style.display = ""));
  seps.forEach((s) => (s.style.display = ""));
  more.style.display = "none";

  // First-line test, relative to the first tag (all tags share a baseline).
  const refTop = tags[0].offsetTop;
  const tol = tags[0].offsetHeight * 0.5;
  const onFirstLine = (el) => el.offsetTop <= refTop + tol;

  // Everything already fits — no toggle needed.
  if (onFirstLine(tags[tags.length - 1])) return;

  // Show the largest leading run of tags that still leaves "+N more" on line 1.
  more.style.display = "";
  for (let k = tags.length - 1; k >= 1; k--) {
    more.textContent = `+${tags.length - k} more`;
    // k tags, plus k separators: k-1 between them and one before the button.
    tags.forEach((t, i) => (t.style.display = i < k ? "" : "none"));
    seps.forEach((s, i) => (s.style.display = i < k ? "" : "none"));
    if (onFirstLine(more)) break;
  }
}

// Bottom-of-page previous/next links, matching the newest-first grid order
// (newest is top-left). "Previous" (left) is the newer post, "Next" (right) is
// the older post. Whichever direction doesn't exist is simply left out.
function renderPostNav(posts, current) {
  const nav = document.getElementById("post-nav");
  if (!nav) return;

  // Newest-first, matching the grid; so the newer neighbour is the previous
  // index and the older neighbour is the next index.
  const ordered = sortByDateDesc(posts.slice());
  const i = ordered.findIndex((p) => p.id === current.id);
  const newer = i > 0 ? ordered[i - 1] : null;
  const older = i >= 0 && i < ordered.length - 1 ? ordered[i + 1] : null;
  const prev = newer; // Previous → newer post (previous in grid order)
  const next = older; // Next → older post (next in grid order)

  const href = (p) => `post.html?id=${encodeURIComponent(p.id)}`;
  const prevHtml = prev
    ? `<a class="post-nav-prev" href="${href(prev)}"><span class="post-nav-arrow">&larr;</span><span class="post-nav-title">${escapeHTML(prev.title)}</span></a>`
    : "";
  const nextHtml = next
    ? `<a class="post-nav-next" href="${href(next)}"><span class="post-nav-title">${escapeHTML(next.title)}</span><span class="post-nav-arrow">&rarr;</span></a>`
    : "";
  nav.innerHTML = prevHtml + nextHtml;
  fitNavTitles();
}

// Trim each nav title to a word boundary so it never cuts mid-word or
// mid-parenthesis. The title span is overflow-hidden, so we drop trailing words
// (adding an ellipsis) until the content fits its visible box. A single word
// too long to fit is left to the CSS text-overflow ellipsis. Re-run on resize
// since the box width is a percentage of the page.
function fitNavTitles() {
  document.querySelectorAll(".post-nav-title").forEach((span) => {
    const full = span.dataset.fullTitle || span.textContent;
    span.dataset.fullTitle = full;
    span.textContent = full;
    if (span.scrollWidth <= span.clientWidth) return;

    const words = full.split(/\s+/);
    while (words.length > 1) {
      words.pop();
      span.textContent = words.join(" ") + "…";
      if (span.scrollWidth <= span.clientWidth) return;
    }
    // One long word — hand it back to the CSS ellipsis.
    span.textContent = full;
  });
}

window.addEventListener("resize", fitNavTitles);

// "More like this": up to 3 posts sharing at least one tag with the current
// post, ranked by most matching tags then most recent. Hidden entirely when
// there are no matches (or the current post has no tags).
function renderRelated(posts, current) {
  const section = document.getElementById("related");
  if (!section) return;

  const currentTags = new Set(Array.isArray(current.tags) ? current.tags : []);
  const related = posts
    .filter((p) => p.id !== current.id && Array.isArray(p.tags))
    .map((p) => {
      const matched = p.tags.filter((t) => currentTags.has(t));
      return { post: p, matched, matches: matched.length };
    })
    .filter((x) => x.matches > 0)
    .sort((a, b) =>
      b.matches - a.matches ||
      (a.post.date < b.post.date ? 1 : a.post.date > b.post.date ? -1 : 0))
    .slice(0, 3);

  if (!related.length) {
    section.hidden = true;
    return;
  }

  section.querySelector(".related-grid").innerHTML = related.map(({ post, matched }) => {
    const src = post.thumb || post.image;
    // All of the post's tags, shared ones first (highlighted), then the rest.
    // They sit on a single line; CSS clips whatever overflows the row.
    const matchedSet = new Set(matched);
    const rest = post.tags.filter((t) => !matchedSet.has(t));
    const ordered = [...orderTags(matched), ...orderTags(rest)];
    const tags = ordered
      .map((t) => `<span class="related-tag${matchedSet.has(t) ? " is-shared" : ""}">${escapeHTML(t)}</span>`)
      .join("");
    return `
      <a class="related-card" href="post.html?id=${encodeURIComponent(post.id)}">
        <span class="related-thumb"><img src="${escapeHTML(src)}" alt="${escapeHTML(post.title)}" loading="lazy"></span>
        <span class="related-title">${escapeHTML(post.title)}</span>
        ${tags ? `<span class="related-tags">${tags}</span>` : ""}
      </a>`;
  }).join("");
  section.hidden = false;

  // Same "+N more" clamp as the tiles: overflow tags collapse to a trailing
  // "+N more" label (dots come from the CSS ::before, so no separator selector).
  const fitRelated = () =>
    section.querySelectorAll(".related-tags").forEach((row) =>
      fitTagsWithMore(row, ".related-tag", null, "related-tag"));
  fitRelated();
  window.addEventListener("resize", fitRelated);
}

if (!id) {
  status.textContent = "No post specified.";
  status.classList.add("error");
} else {
  fetchPosts()
    .then((posts) => {
      const post = posts.find((p) => p.id === id);
      if (!post) {
        status.textContent = "Post not found.";
        status.classList.add("error");
        return;
      }
      // The current post always renders (a draft is reachable by direct link),
      // but drafts never appear as neighbours or "more like this".
      const published = posts.filter((p) => !isDraft(p));
      renderPost(post);
      renderPostNav(published, post);
      renderRelated(published, post);
    })
    .catch((err) => {
      status.textContent = "Couldn't load this post. If you opened this file directly, run a local server (see the README).";
      status.classList.add("error");
      console.error(err);
    });
}
