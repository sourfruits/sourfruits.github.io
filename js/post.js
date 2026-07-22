// Post view: read ?id= from the URL, find that post in data/posts.json, render it.

const article = document.getElementById("post");
const status = document.getElementById("status");

initBackButton();

const id = new URLSearchParams(window.location.search).get("id");

// Render the post's Markdown content to HTML with marked, then sanitize the
// result with DOMPurify before it reaches the DOM.
function renderContent(text) {
  const html = marked.parse(String(text || ""));
  return DOMPurify.sanitize(html);
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

  const tags = Array.isArray(post.tags) && post.tags.length
    ? `<ul class="tags">${post.tags.map((t) => `<li><a class="tag" href="tag.html?tag=${encodeURIComponent(t)}">${escapeHTML(t)}</a></li>`).join("")}</ul>`
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
    <div class="post-image-frame" style="--post-bg: url('${encodeURI(src)}')">
      <img class="post-image" src="${escapeHTML(src)}" alt="${escapeHTML(post.title)}">
    </div>
    <h1 class="post-title">${escapeHTML(post.title)}</h1>
    ${subtitle}
    <p class="post-date">${escapeHTML(formatDate(post.date, "long"))}</p>
    ${tags}
    <div class="post-body">${renderContent(post.content)}</div>
  `;
  status.textContent = "";

  // Fade the image in once it loads, then cascade the content in (see the
  // load-in animation rules in the CSS). Reveal immediately if the image is
  // already cached or fails to load, so content never gets stuck hidden.
  const image = article.querySelector(".post-image");
  const reveal = () => article.classList.add("is-loaded");
  if (image && !image.complete) {
    image.addEventListener("load", reveal);
    image.addEventListener("error", reveal);
  } else {
    reveal();
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
    // Only the tags shared with the current post; CSS truncates with ellipsis.
    const tags = matched.join(" · ");
    return `
      <a class="related-card" href="post.html?id=${encodeURIComponent(post.id)}">
        <span class="related-thumb"><img src="${escapeHTML(src)}" alt="${escapeHTML(post.title)}" loading="lazy"></span>
        <span class="related-title">${escapeHTML(post.title)}</span>
        ${tags ? `<span class="related-tags">${escapeHTML(tags)}</span>` : ""}
      </a>`;
  }).join("");
  section.hidden = false;
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
      renderPost(post);
      renderPostNav(posts, post);
      renderRelated(posts, post);
    })
    .catch((err) => {
      status.textContent = "Couldn't load this post. If you opened this file directly, run a local server (see the README).";
      status.classList.add("error");
      console.error(err);
    });
}
