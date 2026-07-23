# Sourfruits

A small Instagram-style photo blog as a static website. The homepage shows your
posts as square thumbnails — either a horizontal carousel of the most recent ones
(the default) or a full paginated grid, switched with a view toggle. Clicking a
thumbnail opens a post with the full image, optional subtitle, date, tags, and text.
You can filter the homepage by one or more tags, browse a dedicated tag page, or
search across every post. All posts live in a single JSON file so adding a new one
is a one-block edit.

Extras baked in: a multi-select tag filter on the homepage (AND logic, synced to
the URL via `?tags=`), draft posts that stay hidden until you reveal them, a
light/dark theme toggle (floating, remembered per browser), an inline header search
box, gentle load-in fade animations (which respect `prefers-reduced-motion`), and —
at the bottom of every post — previous/next links and a "More like this" row of
posts sharing its tags.

## File structure

```
sourfruits-blog/
├── index.html        Homepage — the paginated photo grid
├── post.html         Single post view (reads ?id= from the URL)
├── tag.html          Posts filtered by one tag (reads ?tag= from the URL)
├── tags.html         All tags used across posts, with post counts
├── search.html       Search results (reads ?q= from the URL)
├── precursors.html   Force-directed graph of discoveries and connections
├── about.html        About page (static placeholder text to replace)
├── css/
│   └── styles.css    All styling, shared by every page
├── js/
│   ├── utils.js      Shared helpers: formatDate, escapeHTML, fetchPosts, sortByDateDesc, renderTile, initBackButton
│   ├── header.js     Injects the shared header/nav + search into every page (also stamps the footer year)
│   ├── theme.js      Floating dark-mode toggle; remembers the choice per browser
│   ├── pagination.js Shared page slicing + prev/next/numbered nav
│   ├── main.js       Homepage — loads posts.json, builds the grid
│   ├── post.js       Post page — loads one post by its id and renders it
│   ├── tag.js        Tag page — filters posts by tag, reuses the grid
│   ├── tags.js       Tags page — tallies tags across posts, renders pills
│   ├── search.js     Search page — matches title/tags/text, renders cards
│   ├── precursors.js Precursors page — builds the D3 graph from precursors.json
│   └── about.js      About page — footer year + back button
├── data/
│   ├── posts.json    ← Your content lives here. Add posts here.
│   └── precursors.json  ← The Precursors graph: nodes + connections.
├── images/           Post images (see images/README.md)
└── README.md
```

There is no build step and no framework — just HTML, CSS, and a little vanilla
JavaScript. Each page loads `utils.js`, `header.js`, and `theme.js`; the list pages
(home, tag, search) also load `pagination.js`, then their own page script. Scripts
talk to each other through a few plain globals (`formatDate`, `escapeHTML`,
`fetchPosts`, `sortByDateDesc`, `renderTile`, `Pagination`) — no modules or bundler
involved.

## Running it

The pages read `data/posts.json` with `fetch()`, which browsers block when you open
an HTML file directly (`file://`). So serve the folder over a local server:

```bash
# From inside the sourfruits-blog folder, pick one:
python -m http.server 8000        # Python 3
npx serve                          # Node (if you have it)
```

Then open http://localhost:8000 in your browser.

## Deploying to GitHub

Push your changes and GitHub Pages redeploys automatically:

```bash
git add .                        # stage all your changes
git commit -m "message"          # save them with a short description
git push origin main             # send them to GitHub
```

The live site at https://sourfruits.github.io updates within about a minute
after pushing.

## Adding a new post

Open `data/posts.json` and add an object to the array:

```json
{
  "id": "unique-slug",                         // used in the URL: post.html?id=unique-slug
  "title": "Post Title",
  "subtitle": "An optional italic line",       // optional — omit it to show nothing
  "date": "2026-06-29",                        // YYYY-MM-DD — used for sorting (newest first)
  "tags": ["citrus", "kitchen"],
  "thumb": "images/my-photo-square.jpg",       // square image for the grid
  "image": "images/my-photo-full.jpg",         // full image for the post page
  "content": "Your text.\n\n## A heading\n\nSome **bold** and *italic* text, plus a list:\n\n- first item\n- second item",
  "draft": true                                // optional — hides the post until drafts are revealed
}
```

Notes:
- `id` must be unique — it's how the post page finds the right entry.
- `subtitle` is optional: when present it appears in italics under the title, above
  the date. Omit the field (or leave it empty) and nothing is shown.
- Posts are sorted by `date` automatically, so order in the file doesn't matter.
- The post page automatically adds previous/next links and a "More like this" row
  (up to 3 posts sharing the most tags) — no configuration needed.
- `content` supports Markdown, rendered on the post page: headings (`## Heading`),
  **bold** (`**text**`), *italics* (`*text*`), and lists (`- item`). Blank lines
  still create paragraph breaks. (Write it as one JSON string, using `\n` for line
  breaks and `\n\n` between paragraphs.)
- `draft` is optional. Set `"draft": true` (or date the post `2099-01-01` or later)
  to keep it out of the homepage and tag counts. A "Drafts (N)" toggle appears on the
  homepage whenever drafts exist; clicking it reveals them, each marked with a DRAFT
  badge. Drafts are hidden by default.
- Tip: for longer posts, draft in Google Docs and use the "Docs to Markdown"
  add-on to convert your formatting to Markdown, then paste the result into the
  `content` field.
- `thumb` and `image` can be local paths (e.g. `images/lemon.jpg`) or full URLs.
  If you omit `thumb`, the grid falls back to `image`, and vice versa.

## Using your own images

Drop your photos into the `images/` folder and point `thumb`/`image` at them, e.g.
`"image": "images/morning-lemons.jpg"`. See `images/README.md` for the naming
convention and sizing tips.

## The Precursors graph

`precursors.html` is a companion to the photo grid: a force-directed graph
(rendered with D3) of *where* things were discovered and *how* you personally
connect them. It has two views, toggled at the top of the page and both computed
from the same data:

- **Discovery** — every node plus a hub for each `discovered_via.source`
  (friends, classes, platforms…), with an edge from each source to what it led
  you to.
- **Connections** — the nodes wired together by the `connections` array. Edges
  you mark `causal` are drawn in red; the rest are quiet grey "thematic" lines.

Its data lives in its own file, **`data/precursors.json`** — completely separate
from `posts.json`, which it never touches. The file is a single object with two
arrays, `nodes` and `connections`:

```json
{
  "nodes": [
    {
      "id": "heidegger",                       // stable, unique, hand-picked slug
      "label": "Heidegger",                    // display name on the graph
      "kind": "philosopher",                   // free string: film, book, person, platform…
      "post_ids": ["stranger-than-paradise-heidegger"],  // 0, 1, or many post ids
      "discovered_via": {                      // optional — how you first met this
        "source": "class-philosophy-denmark",  // {type}-{descriptor}, lowercase, hyphenated
        "note": "Read for a philosophy class in Denmark."  // optional, shown on hover
      }
    }
  ],
  "connections": [
    {
      "from": "stranger-than-paradise",        // node id
      "to": "heidegger",                       // node id
      "causal": false,                         // true = asserted influence (drawn red)
      "note": "Same sitting-with-boredom territory."  // optional, shown on edge hover
    }
  ]
}
```

**Node fields:**
- `id` — stable, unique, hand-picked (not auto-generated). It's what `connections`
  and `post_ids` are matched against, so once you use one for something real, keep
  it forever — never re-slug it.
- `label` — the display name shown next to the node.
- `kind` — an open string, not a fixed list (`film`, `philosopher`, `book`,
  `person`, `platform`, `class`, `podcast`, …). New kinds need no code change.
- `post_ids` — array of `posts.json` ids this node maps to. Can be empty (a
  graph-only node with no write-up), have one, or list several. Hovering a node
  shows the linked post title(s).
- `discovered_via` — optional. `source` is a `{type}-{descriptor}` string
  (`friend-maya`, `class-philosophy-denmark`, `platform-criterion-channel`); the
  same real-world source must always use the *exact same* string, or it splits
  into duplicate hubs. `note` is optional free text shown on hover. In Discovery
  view each distinct `source` becomes its own hollow hub node.

**Connection fields:**
- `from` / `to` — node `id`s (always node-to-node; sources never appear here, only
  in `discovered_via.source`).
- `causal` — `true` only when asserting a real influence, not just a resonance.
  Causal edges render distinct (red) from the default quiet thematic line. Most
  connections are thematic (`false`).
- `note` — optional but encouraged; it's shown when you hover the edge.

Notes:
- Nodes with no edges at all still render — they just float, never filtered out.
  A useful graph grows from a handful of entries, so partial data is fine.
- New nodes and connections plug into the layout automatically; there's no manual
  positioning. Pan by dragging the background, zoom with the scroll wheel, and drag
  a node to reposition it.
- Privacy: use first names only for real people (`friend-maya`), or an initial/handle
  (`friend-m`) for anyone who'd rather not be named — the graph only needs the id to
  stay consistent.
- The graph reads the site's theme colors, so it follows the light/dark toggle
  automatically.

## Adding a new page

New pages follow the same skeleton as the existing ones. In the HTML `<body>`:

- Start with an empty header placeholder — `header.js` fills it in:
  ```html
  <!-- Header markup is injected by js/header.js -->
  <header class="site-header"></header>
  ```
- Load the scripts at the end of `<body>`, `utils.js` first, then `header.js` and
  `theme.js`, then the page's own script (add `pagination.js` too if the page shows
  a paginated list):
  ```html
  <script src="js/utils.js"></script>
  <script src="js/header.js"></script>
  <script src="js/theme.js"></script>
  <script src="js/your-page.js"></script>
  ```

### The back button

Any page other than the homepage should offer a back link. It's a two-part pattern:

1. Add the placeholder as the first child of `<main>` (same position on every page).
   The `href` is the no-JS fallback; the label text is replaced at runtime:
   ```html
   <a class="back-link" href="index.html">← All posts</a>
   ```
2. Call `initBackButton()` (defined in `utils.js`) from the page's own script:
   ```js
   initBackButton();
   ```

`initBackButton()` sets the label based on where the visitor came from — `←
Search results`, `← Back to tag`, `← All posts`, or a generic `← Back` for direct
visits — and, when they arrived from within the site, returns there via
`history.back()` instead of always going to `index.html`.

The homepage deliberately omits both the placeholder and the call, since there's
nowhere to go back to. (Calling `initBackButton()` on a page with no `.back-link`
is harmless — it just does nothing.)
