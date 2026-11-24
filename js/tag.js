// Tag view: read ?tag= from the URL and list every published post that carries
// that tag — photo posts and writing alike — as compact text cards (date · tags,
// title, subtitle; no excerpt), newest first. The Writing page keeps the full
// cards with excerpts.

const list = document.getElementById("tag-list");
const status = document.getElementById("status");
const heading = document.getElementById("tag-heading");

initBackButton();

const tag = new URLSearchParams(window.location.search).get("tag");

if (!tag) {
  heading.textContent = "No tag specified.";
  status.textContent = "";
} else {
  document.title = `#${tag} — elia website`;
  // Title is the tag itself, like the other section pages ("Film"); the grey
  // line underneath says how many posts carry it.
  heading.textContent = tag.charAt(0).toUpperCase() + tag.slice(1);

  fetchPosts()
    .then((posts) => {
      const matches = sortByDateDesc(posts.filter((p) =>
        !isDraft(p) && Array.isArray(p.tags) && p.tags.includes(tag)));
      const intro = document.getElementById("tag-intro");
      if (intro) intro.textContent = `${matches.length} ${matches.length === 1 ? "post" : "posts"} tagged ${tag}.`;
      // Compact cards (no excerpt): a quick index of the tag. They show all of
      // a post's tags, in its usual order (writeup/blurb first).
      list.innerHTML = matches.map((p) => cardHTML(p, orderTags(p.tags), { excerpt: false })).join("");
      watchCards(list);
      status.textContent = matches.length ? "" : "No posts with this tag yet.";
    })
    .catch((err) => {
      status.textContent = "Couldn't load posts. If you opened this file directly, run a local server (see the README).";
      status.classList.add("error");
      console.error(err);
    });
}
