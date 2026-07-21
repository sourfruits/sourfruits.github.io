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

  article.innerHTML = `
    <img class="post-image" src="${escapeHTML(post.image || post.thumb)}" alt="${escapeHTML(post.title)}">
    <h1 class="post-title">${escapeHTML(post.title)}</h1>
    <p class="post-date">${escapeHTML(formatDate(post.date, "long"))}</p>
    ${tags}
    <div class="post-body">${renderContent(post.content)}</div>
  `;
  status.textContent = "";
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
    })
    .catch((err) => {
      status.textContent = "Couldn't load this post. If you opened this file directly, run a local server (see the README).";
      status.classList.add("error");
      console.error(err);
    });
}
