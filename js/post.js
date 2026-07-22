// Post view: read ?id= from the URL, find that post in data/posts.json, render it.

const article = document.getElementById("post");
const status = document.getElementById("status");

document.getElementById("year").textContent = new Date().getFullYear();
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

  article.innerHTML = `
    <div class="post-image-frame" style="--post-bg: url('${encodeURI(src)}')">
      <img class="post-image" src="${escapeHTML(src)}" alt="${escapeHTML(post.title)}">
    </div>
    <h1 class="post-title">${escapeHTML(post.title)}</h1>
    <p class="post-date">${escapeHTML(formatDate(post.date, "long"))}</p>
    ${tags}
    <div class="post-body">${renderContent(post.content)}</div>
  `;
  status.textContent = "";
}

// Bottom-of-page previous/next links, matching the newest-first grid order
// (newest is top-left). "Previous" (left) is the newer post, "Next" (right) is
// the older post. Whichever direction doesn't exist is simply left out.
function renderPostNav(posts, current) {
  const nav = document.getElementById("post-nav");
  if (!nav) return;

  const ordered = posts.slice().sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const i = ordered.findIndex((p) => p.id === current.id);
  const newer = i >= 0 && i < ordered.length - 1 ? ordered[i + 1] : null;
  const older = i > 0 ? ordered[i - 1] : null;
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
    })
    .catch((err) => {
      status.textContent = "Couldn't load this post. If you opened this file directly, run a local server (see the README).";
      status.classList.add("error");
      console.error(err);
    });
}
