// Tags list: collect every tag used across posts and show each as a pill that
// links to its filtered grid (tag.html?tag=...), with the post count alongside.

const list = document.getElementById("tag-list");
const status = document.getElementById("status");

fetchPosts()
  .then((posts) => {
    // Tally how many posts carry each tag.
    const counts = new Map();
    posts.forEach((post) => {
      if (isDraft(post) || !Array.isArray(post.tags)) return;
      post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });

    // Most-used first; ties broken alphabetically (case-insensitive).
    const tags = [...counts.keys()].sort((a, b) =>
      counts.get(b) - counts.get(a) ||
      a.localeCompare(b, undefined, { sensitivity: "base" }));

    list.innerHTML = tags.map((tag) =>
      `<a class="tag-index-row" href="tag.html?tag=${encodeURIComponent(tag)}">` +
        `<span class="tag-index-name">${escapeHTML(tag)}</span>` +
        `<span class="tag-index-leader" aria-hidden="true"></span>` +
        `<span class="tag-index-count">${counts.get(tag)}</span>` +
      `</a>`
    ).join("");

    const postCount = posts.filter((p) => !isDraft(p)).length;
    status.textContent = tags.length
      ? `${tags.length} tags across ${postCount} posts`
      : "No tags yet.";
  })
  .catch((err) => {
    status.textContent = "Couldn't load tags. If you opened this file directly, run a local server (see the README).";
    status.classList.add("error");
    console.error(err);
  });
