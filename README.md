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
posts sharing its tags. There's also a small easter egg in the header logo (give
the little green-and-yellow mark a few clicks) and a companion **Precursors** page
— a force-directed graph of where things were discovered and how they connect.

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
│   ├── utils.js      Shared helpers: formatDate, escapeHTML, fetchPosts, sortByDateDesc, isDraft, renderTile, initBackButton
│   ├── header.js     Injects the shared header/nav + search into every page (stamps the footer year; hosts the logo "squeeze the lemon" easter egg)
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

- **Discovery** — every node that records a `discovered_via`, plus a synthesized
  node for each discovery `source` (friends, classes, platforms…), with an edge
  from each source to what it led you to. An "engaged" discovery (you really sat with it) draws a
  solid edge, labelled *Consciousness* on hover; a lighter "aware" one (you'd just
  heard of it) draws dashed, labelled *Awareness*. Nodes are green here.
- **Connections** — the nodes wired together by their `connections`. Each
  connection can carry a `relationship` type, colored per type with a legend;
  directional types (adaptation, influence, authorship) draw an arrow from the
  origin and enlarge the origin node, while the non-directional type (thematic)
  is a plain symmetric line. Nodes are yellow here.

In both views a node is drawn as a **hub** or a **leaf** by its out-degree (how
much points *out* of it). Hubs are the well-connected origins — larger, hollow
with a dashed outline, and permanently labelled (bold, centered on the node) —
while leaves are solid and reveal their label on hover or once you zoom in close.
A view only shows nodes that actually have data for it, so nothing floats
disconnected: Connections omits nodes with no connections, and Discovery omits
nodes with no `discovered_via`.

Its data lives in its own file, **`data/precursors.json`** — completely separate
from `posts.json`, which it never touches. The file is a single object with one
`nodes` array; every node is added by hand (nothing from `posts.json` becomes a
node automatically). Each node carries its *own* connections:

```json
{
  "nodes": [
    {
      "id": "the-trial",                       // stable, unique, hand-picked slug
      "label": "The Trial",                    // display name on the graph
      "kind": "book",                          // free string: film, book, person, platform…
      "author": "Franz Kafka",                 // optional — shown as the Author/Director line
      "post_ids": ["kafka-the-trial"],         // 0, 1, or many post ids (optional link-out)
      "connections": [                         // bare id, or { to, relationship, note }
        { "to": "after-hours", "relationship": "influence" }
      ],
      "discovered_via": [                      // optional — an ARRAY of discovery events
        {
          "source": "class-philosophy-dis",   // {type}-{descriptor}, or another node's id
          "strength": "engaged",              // "engaged" (default) or "aware"
          "date": "2026-03",                  // optional — year / year-month / full date
          "note": "Read for a philosophy class."  // optional, shown on hover + card
        }
      ]
    },
    {
      "id": "four-nights-of-a-dreamer",
      "label": "Four Nights of a Dreamer (1971)",
      "kind": "film",
      "post_ids": [],
      "discovered_via": [                      // discovered via another node, found on a platform
        { "source": "the-parallax-view", "mechanism": "platform-letterboxd", "date": "2026-03" }
      ],
      "connections": ["pickpocket"]            // bare id = untyped, plain line
    }
  ]
}
```

**Node fields:**
- `id` — stable, unique, hand-picked (not auto-generated). It's what `connections`,
  `discovered_via.source`, and `post_ids` are matched against, so once you use one
  for something real, keep it forever — never re-slug it.
- `label` — the display name shown next to the node.
- `kind` — an open string, not a fixed list (`film`, `book`, `philosopher`,
  `person`, `platform`, `class`, `podcast`, …). New kinds need no code change.
- `author` — optional string. Shown on hover and in the detail card as the
  "Director" line (for a `film`) or "Author" line (otherwise). If instead another
  node points at this one with an `authorship` connection, that node is used as the
  author automatically and you can omit this field.
- `post_ids` — array of `posts.json` ids this node maps to. Usually empty (a
  graph-only node with no write-up yet); can point to one or several. The detail
  card lists the linked post title(s) as links.
- `connections` — an array of the other nodes this one connects to. Each entry is
  either a **bare node id** (`"pickpocket"`) — an untyped, plain undirected line
  with no hover label — or an object
  **`{ "to": "<id>", "relationship": "<type>", "note": "<optional>" }`** where
  `relationship` is one of the preset types:
  - **Directional** (arrow points from this node to `to`, and grows this node's
    size — one step per outgoing directional link): `adaptation`, `influence`,
    `authorship` (drawn dashed). Write these only on the **origin's** side.
  - **Non-directional** (symmetric line, no arrow, no size effect): `thematic`.

  Each type has its own line color and a legend entry; the type name shows on edge
  hover. An untyped connection behaves like `thematic` but shows no hover label. The
  optional `note` is free text shown on edge hover (below the relationship label) —
  use it to say *how* the two are connected. If a pair is written from both sides
  and both carry a note, the first (in `nodes` order) is shown.
- `discovered_via` — optional. An **array** of discovery events (a thing can be
  discovered more than once, by different routes), each an object with:
  - `source` — where it came from: either a `{type}-{descriptor}` string
    (`friend-maya`, `class-philosophy-dis`, `platform-criterion-channel`) **or
    another node's id** (when the discovery came from something already in the
    graph). A string source auto-creates one shared hub node the first time it's
    used, so reuse the *exact same* string every time or it splits into duplicate
    hubs. Omit `source` for a discovery with no traceable origin — the node still
    counts as discovered (it just draws no edge).
  - `strength` — `"engaged"` (default; a solid edge, *Consciousness*) or `"aware"`
    (a dashed edge, *Awareness*, for something you'd only heard of).
  - `mechanism` — optional. The platform/means you actually found it through, as a
    `{type}-{descriptor}` string; a `platform-*` value renders as "found on X"
    (e.g. `platform-letterboxd` → "found on Letterboxd") in the detail card.
  - `date` — optional, at any precision: `"2024"`, `"2026-03"`, or `"2026-03-14"`.
  - `note` — optional free text, shown on hover and in the card.

  (The older single-object form — `"discovered_via": { "source": … }` — is still
  read and treated as a one-element array, so existing data keeps working.)

Notes:
- **Write connections on either side — or both.** Listing B under A, A under B, or
  both describes the *same* single edge; it's drawn once either way, so you never
  have to hunt down the "other" node to keep things in sync. Non-directional and
  untyped links can safely appear on both sides. A **directional** type, though,
  should live only on the origin's side — if the same pair is marked directional
  from both ends, the origin is ambiguous, so it logs a console warning and falls
  back to a plain undirected line rather than guessing.
- Each view hides nodes that have no data for it (no connections in Connections, no
  `discovered_via` in Discovery), so nothing floats disconnected. Partial,
  in-progress data is fine — a node simply appears in whichever view(s) it has data
  for. (A discovery with a `note`/`date` but no `source` still counts, showing as an
  orphan in Discovery.)
- New nodes and connections plug into the layout automatically; there's no manual
  positioning. The camera auto-fits to frame whatever the graph settles into (node
  sizes included, so hubs never clip). Pan by dragging the background, zoom with the
  scroll wheel, and drag a node to reposition it; double-click to reframe. Hover a
  node for a quick card; click it for a persistent detail card (drag it by its header
  to move it, Escape or × to close). **Reset** respawns the layout; the full-screen
  button expands the canvas.
- A **Tuning** panel (toolbar button) exposes live sliders for troubleshooting the
  layout without editing code — shared force knobs (charge, link distance, collision
  padding, line thickness) on the left, per-tier Hub/Leaf sizing and label controls
  on the right, each with a hover tooltip. Only the force knobs re-run the layout;
  the rest update in place so the graph doesn't drift while you compare. "Reset to
  defaults" restores every slider.
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
