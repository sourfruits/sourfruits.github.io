// Search view: read ?q= from the URL, match posts across title, tags, and
// content, and render the results as a paginated list of cards.

const resultsEl = document.getElementById("results");
const status = document.getElementById("status");
const heading = document.getElementById("search-heading");
const pagination = document.getElementById("pagination");

const PER_PAGE = 10;

initBackButton();

const query = (new URLSearchParams(window.location.search).get("q") || "").trim();

// Build an href for a given page number, keeping the query and page 1 clean.
function pageHref(page) {
  const base = `search.html?q=${encodeURIComponent(query)}`;
  return page <= 1 ? base : `${base}&page=${page}`;
}

// Escape text and wrap every case-insensitive occurrence of the query in <mark>.
function highlight(text, q) {
  if (!q) return escapeHTML(text);
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let out = "";
  let from = 0;
  let idx;
  while ((idx = lower.indexOf(needle, from)) !== -1) {
    out += escapeHTML(text.slice(from, idx));
    out += `<mark class="hl">${escapeHTML(text.slice(idx, idx + needle.length))}</mark>`;
    from = idx + needle.length;
  }
  out += escapeHTML(text.slice(from));
  return out;
}

// Pull a short snippet from the content, centered on the first match when
// there is one, otherwise from the start.
function makeSnippet(content, q) {
  const text = content.replace(/\s+/g, " ").trim();
  const radius = 90;
  const idx = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;

  if (idx === -1) {
    const end = radius * 2;
    return text.slice(0, end).trim() + (text.length > end ? " …" : "");
  }

  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "… " + snippet;
  if (end < text.length) snippet = snippet + " …";
  return snippet;
}

function matches(post, q) {
  const needle = q.toLowerCase();
  const inTitle = String(post.title || "").toLowerCase().includes(needle);
  const inTags = Array.isArray(post.tags) &&
    post.tags.some((t) => String(t).toLowerCase().includes(needle));
  const inContent = String(post.content || "").toLowerCase().includes(needle);
  return inTitle || inTags || inContent;
}

function renderResults(posts) {
  // Newest first, regardless of order in the JSON file.
  sortByDateDesc(posts);

  Pagination.paginate({
    items: posts,
    perPage: PER_PAGE,
    container: pagination,
    hrefFor: pageHref,
    renderItems: (pagePosts) => {
      resultsEl.innerHTML = pagePosts.map((post) => {
        const tags = Array.isArray(post.tags) ? post.tags : [];
        const tagsHTML = tags.length
          ? `<ul class="tags result-tags">${tags
              .map((t) => `<li class="tag">${escapeHTML(t)}</li>`)
              .join("")}</ul>`
          : "";

        return `
          <li>
            <a class="result-card" href="post.html?id=${encodeURIComponent(post.id)}">
              <img class="result-thumb" src="${escapeHTML(post.thumb || post.image)}" alt="${escapeHTML(post.title)}" loading="lazy">
              <div class="result-body">
                <h2 class="result-title">${highlight(post.title, query)}</h2>
                <p class="result-date">${escapeHTML(formatDate(post.date))}</p>
                ${tagsHTML}
                <p class="result-snippet">${highlight(makeSnippet(post.content || "", query), query)}</p>
              </div>
            </a>
          </li>
        `;
      }).join("");
    },
  });
}

function setHeading(count) {
  const noun = count === 1 ? "result" : "results";
  heading.innerHTML = `${count} ${noun} for &ldquo;<span class="query-term">${escapeHTML(query)}</span>&rdquo;`;
}

if (!query) {
  heading.textContent = "Search Sourfruits";
  status.textContent = "Type something above to search posts, tags, and text.";
  document.querySelector(".header-search-input")?.focus();
} else {
  document.title = `“${query}” — Sourfruits`;

  fetchPosts()
    .then((posts) => {
      const found = posts.filter((p) => !isDraft(p) && matches(p, query));
      setHeading(found.length);
      renderResults(found);
      status.textContent = found.length
        ? ""
        : `No posts matched your search. Try a different word or phrase.`;
    })
    .catch((err) => {
      status.textContent = "Couldn't load posts. If you opened this file directly, run a local server (see the README).";
      status.classList.add("error");
      console.error(err);
    });
}
