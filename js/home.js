// Recent-posts carousel filmstrip (markup stashed in snippets/carousel.html; not
// on a live page right now), capped at CAROUSEL_MAX and ending in a "See all
// posts →" card that links to the full grid. That grid — tag filter, density
// toggle, pagination — lives on index.html (js/main.js); this is a preview only,
// so it's intentionally lightweight and always a filmstrip.

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const carouselPrev = document.getElementById("carousel-prev");
const carouselNext = document.getElementById("carousel-next");

const CAROUSEL_MAX = 6;   // most-recent posts shown in the strip

// Scroll the filmstrip roughly one viewport of tiles in the given direction.
function scrollCarousel(direction) {
  grid.scrollBy({ left: direction * grid.clientWidth * 0.8, behavior: "smooth" });
}

// Grey out (disable) the prev arrow at the start of the strip and the next
// arrow at the end. The 1px tolerance absorbs sub-pixel scroll rounding.
function updateCarouselArrows() {
  const maxScroll = grid.scrollWidth - grid.clientWidth;
  carouselPrev.disabled = grid.scrollLeft <= 1;
  carouselNext.disabled = grid.scrollLeft >= maxScroll - 1;
}

// The "See all posts" card at the end of the strip. If there are more posts
// than the strip shows, the next one's image sits blurred behind the label as a
// teaser; otherwise it's a plain card. Either way it links to the full grid,
// which now lives on index.html.
function renderSeeAll(nextPost) {
  const label = `<span class="carousel-seeall-inner">See all posts <span aria-hidden="true">&rarr;</span></span>`;
  if (!nextPost) {
    return `<a class="tile carousel-seeall" href="index.html">${label}</a>`;
  }
  const img = escapeHTML(nextPost.thumb || nextPost.image);
  return `<a class="tile carousel-seeall carousel-seeall--preview" href="index.html">
       <img src="${img}" alt="" aria-hidden="true" loading="lazy">
       ${label}
     </a>`;
}

carouselPrev.addEventListener("click", () => scrollCarousel(-1));
carouselNext.addEventListener("click", () => scrollCarousel(1));
grid.addEventListener("scroll", updateCarouselArrows);
window.addEventListener("resize", updateCarouselArrows);

fetchPosts()
  .then((posts) => {
    // Drafts are included in the homepage preview (for testing); renderTile
    // tags them with the DRAFT badge. Newest first — pinning is a Posts-page
    // concept and doesn't apply to the carousel.
    const all = posts.slice();
    sortByDateDesc(all);

    const strip = all.slice(0, CAROUSEL_MAX);
    const nextPost = all[CAROUSEL_MAX];   // previews behind "See all"
    // pins:false — the carousel doesn't sort pinned-first, so it renders no pin
    // marker and no pinned fade-in. "Pinned" is a Posts-page concept only.
    grid.innerHTML = strip.map((post, i) => renderTile(post, i, { pins: false })).join("") + renderSeeAll(nextPost);
    fitTileTags();

    status.textContent = all.length ? "" : "No posts here yet.";
    updateCarouselArrows();
  })
  .catch((err) => {
    status.textContent = "Couldn't load posts. If you opened this file directly, run a local server (see the README).";
    status.classList.add("error");
    console.error(err);
  });
