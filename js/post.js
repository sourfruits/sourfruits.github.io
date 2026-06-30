// Post view: read ?id= from the URL, find that post in data/posts.json, render it.

const article = document.getElementById("post");
const status = document.getElementById("status");

document.getElementById("year").textContent = new Date().getFullYear();

const id = new URLSearchParams(window.location.search).get("id");

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// Split the content on blank lines into separate <p> paragraphs.
function renderParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHTML(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderPost(post) {
  document.title = `${post.title} — Sourfruits`;

  const tags = Array.isArray(post.tags) && post.tags.length
    ? `<ul class="tags">${post.tags.map((t) => `<li><a class="tag" href="tag.html?tag=${encodeURIComponent(t)}">${escapeHTML(t)}</a></li>`).join("")}</ul>`
    : "";

  article.innerHTML = `
    <img class="post-image" src="${escapeHTML(post.image || post.thumb)}" alt="${escapeHTML(post.title)}">
    <h1 class="post-title">${escapeHTML(post.title)}</h1>
    <p class="post-date">${escapeHTML(formatDate(post.date))}</p>
    ${tags}
    <div class="post-body">${renderParagraphs(post.content)}</div>
  `;
  status.textContent = "";
}

if (!id) {
  status.textContent = "No post specified.";
  status.classList.add("error");
} else {
  fetch("data/posts.json")
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
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
