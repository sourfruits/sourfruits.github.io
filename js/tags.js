// Tags list: collect every tag used across posts and show each as a pill that
// links to its filtered grid (tag.html?tag=...), with the post count alongside.

const list = document.getElementById("tag-list");
const status = document.getElementById("status");

document.getElementById("year").textContent = new Date().getFullYear();
initBackButton();

fetchPosts()
  .then((posts) => {
    // Tally how many posts carry each tag.
    const counts = new Map();
    posts.forEach((post) => {
      if (!Array.isArray(post.tags)) return;
      post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });

    // Most-used first; ties broken alphabetically (case-insensitive).
    const tags = [...counts.keys()].sort((a, b) =>
      counts.get(b) - counts.get(a) ||
      a.localeCompare(b, undefined, { sensitivity: "base" }));

    list.innerHTML = tags.map((tag) => `
      <li>
        <a class="tag" href="tag.html?tag=${encodeURIComponent(tag)}">
          ${escapeHTML(tag)}<span class="tag-count">${counts.get(tag)}</span>
        </a>
      </li>
    `).join("");

    status.textContent = tags.length ? "" : "No tags yet.";
  })
  .catch((err) => {
    status.textContent = "Couldn't load tags. If you opened this file directly, run a local server (see the README).";
    status.classList.add("error");
    console.error(err);
  });
