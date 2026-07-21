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

function renderPost(post) {
  document.title = `${post.title} — Sourfruits`;

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
