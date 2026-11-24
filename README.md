# Sourfruits

A small Instagram-style photo blog as a static website. The homepage (`index.html`)
shows your posts as a full, paginated grid of square thumbnails, with a masthead
title above it. Clicking a thumbnail opens a post with the full image, optional
subtitle, date, tags, and text. You can filter the grid by one or more tags, browse
a dedicated tag page, or search across every post. Each post is a Markdown file with
a little frontmatter; a small build step compiles them all into the JSON the site reads.

> **Recent layout change:** the homepage used to be a recent-posts *carousel* preview,
> with the full grid on a separate `posts.html`. Those were swapped — the grid is now
> the homepage — and `posts.html` was removed. The carousel still exists as reusable
> markup in `snippets/carousel.html`. See **Hidden & deleted materials** below.

Extras baked in: a multi-select tag filter on the homepage (AND logic, synced to
the URL via `?tags=`), a **density toggle** that switches the homepage grid between
a normal view (7 posts/page, the default) and a denser compact view (15–16/page), draft posts that
stay hidden until you reveal them (and then sort first: pinned drafts, then drafts, then pinned posts), **pinned** posts that sort to the front with a pin
marker, three display modes (light / dark / **Minimal** — see below), gentle load-in
fade animations (which respect `prefers-reduced-motion`), and — at the bottom of every
post — previous/next links and a "More like this" row of posts sharing its tags. There's also a small easter egg
still coded into the header logo (a green-and-yellow lemon you could squeeze) — though
its icon is currently removed — and a companion
**Precursors** page — a force-directed graph of where things were discovered and how
they connect.

> **Currently hidden/off:** the site is locked to **Minimal mode**; the header search
> box and the Posts and Tags nav links are hidden, and the logo's lemon icon (with its
> squeeze animation) was removed. See **Display modes** and **Hidden & deleted
> materials** below.

## File structure

```
sourfruits-blog/
├── index.html        Homepage — masthead + the full photo grid (tag filter, density toggle, pagination)
├── post.html         Single post view (reads ?id= from the URL)
├── tag.html          Posts filtered by one tag (reads ?tag= from the URL)
├── tags.html         All tags across posts, with counts (exists, but hidden from the nav)
├── search.html       Search results (reads ?q= from the URL; the header search box is hidden)
├── precursors.html   Force-directed graph of discoveries and connections
├── about.html        About page (content is the ABOUT_CONTENT Markdown string in js/about.js)
├── css/
│   └── styles.css    All styling, shared by every page (light/dark/minimal theme variables live here)
├── js/
│   ├── utils.js      Shared helpers: formatDate, escapeHTML, fetchPosts, sortByDateDesc/sortPosts, isDraft/isPinned, orderTags, renderTile, fitTileTags/fitTagsWithMore (tag "+N more" clamping), initBackButton
│   ├── header.js     Injects the shared header/nav into every page (stamps the footer year; the "squeeze the lemon" easter-egg code lives here but is inert — the lemon icon was removed)
│   ├── theme.js      Display mode: the light/dark toggle button + the MINIMAL flag (see Display modes)
│   ├── pagination.js Shared page slicing + prev/next/numbered nav
│   ├── main.js       Homepage grid — loads posts.json, builds the filterable/paginated grid
│   ├── home.js       Carousel filmstrip renderer — currently unused (see snippets/carousel.html)
│   ├── post.js       Post page — loads one post by its id and renders it
│   ├── tag.js        Tag page — filters posts by tag, reuses the grid
│   ├── tags.js       Tags page — tallies tags across posts, renders pills
│   ├── search.js     Search page — matches title/tags/text, renders cards
│   ├── precursors.js Precursors page — builds the D3 graph from precursors.json
│   └── about.js      About page — renders the ABOUT_CONTENT Markdown string (marked + DOMPurify), plus footer year + back button
├── data/
│   ├── posts/        ← Your posts: one Markdown file per post (the source of truth), in any folders you like (e.g. one per year: 2026/)
│   ├── posts.json    ← GENERATED from data/posts/ by the build — don't edit by hand
│   └── precursors.json  ← The Precursors graph: nodes + connections.
├── snippets/
│   └── carousel.html Stashed carousel markup (not a live page — see Hidden & deleted materials)
├── scripts/
│   └── build-posts.mjs  Compiles data/posts/**/*.md → data/posts.json (Node, no deps)
├── .github/workflows/
│   └── build-posts.yml  Runs the build on every push to main, commits posts.json back
├── images/           Post images (see images/README.md)
│   └── favicon/      Favicon set (.ico, PNGs, apple-touch-icon, site.webmanifest) — see Favicons
├── serve.json        Config for `npx serve` (cleanUrls: false)
└── README.md
```

The site itself has no framework or bundler — just HTML, CSS, and a little vanilla
JavaScript. Three pages do pull small libraries from a CDN, though: `post.html` and
`about.html` load **marked** + **DOMPurify** to render (and sanitize) Markdown into
HTML, and `precursors.html` loads **D3** for the graph. The one *build* step is a tiny
dependency-free Node script that compiles the post Markdown files into
`data/posts.json` (run automatically on push — see *Adding a new post*). Each page
loads `utils.js`, `header.js`, and `theme.js`; the paginated pages (home, tag, search)
also load `pagination.js`, then their own page script. Scripts talk to each other
through a few plain globals (`formatDate`, `escapeHTML`, `fetchPosts`, `sortByDateDesc`,
`renderTile`, `Pagination`) — no modules or bundler involved.

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

Each post is a Markdown file in `data/posts/`, and **the filename is the post's
id**: `data/posts/my-first-lemon.md` is the post `my-first-lemon` (its URL is
`post.html?id=my-first-lemon`). To re-slug a post, just rename the file — there's
no `id` field to keep in sync.

**Folders inside `data/posts/` are just for tidiness** — e.g. one folder per
year (`data/posts/2026/`). The build reads every
`.md` file in every folder, and which folder a file sits in changes nothing on the
site (`draft:` / `show:` / the date decide that). Moving a file between folders is
safe; the only rule is that **filenames must be unique across all folders**, since
the filename is the id — the build stops with a clear error if two match. The pages don't read these files directly — the
build compiles them all into `data/posts.json`, which is what the site fetches.
**Don't edit `data/posts.json` by hand — it's generated and gets overwritten.**

A post file is YAML frontmatter (the metadata, between `---` fences) followed by
the post's text as normal Markdown:

```markdown
---
title: "My First Lemon"
subtitle: "An optional italic line"
date: "2026-06-29"
tags: ["citrus", "kitchen"]
workId: "my-first-lemon"
thumb: "images/my-photo-square.jpg"
image: "images/my-photo-full.jpg"
draft: false
---

Your text, as normal Markdown.

## A heading

Some **bold** and *italic* text, plus a list:

- first item
- second item
```

Then regenerate the JSON:

```bash
node scripts/build-posts.mjs
```

Or don't — on every push to `main`, a GitHub Action runs the build for you and
commits the regenerated `posts.json` back. So the everyday workflow is just: add or
edit a `.md` file, commit, push. (You only need the local command to preview before
pushing.)

Fields (same names/shape as before — they just live in frontmatter now):
- The **filename** (`<slug>.md`) is the post's `id` — there's no `id:` field.
  Rename the file to re-slug the post.
- `title` — required.
- `subtitle` — optional; italic line under the title. Omit it to show nothing.
- `date` — `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`; posts sort newest-first. To order
  posts that share the *same* date, append a number: `date: "2026-06-29 1"` (lower
  first). The build splits that into a clean `date` plus a `dateOrder` the sorts use.
- `tags` — a list, e.g. `["citrus", "kitchen"]`.
- `show` — optional; where the post appears. `show: grid` (the homepage photo grid)
  is the default when the line is left out. `show: writing` lists it only on the
  **Writing** page (`writing.html`, a text index grouped by year — no photo needed).
  `show: grid, writing` puts the same post in both places (one file, no duplicate).
  Writing-only posts don't need `thumb`/`image` or `workId`, their tags link to the
  Writing page's filter, and their previous/next links step through the Writing list.
  On the Writing page each piece shows — and is filtered by — its tags **except
  `writeup` / `blurb`**, in the order written, on one line that ends in "+N more"
  if they don't fit: `tags: ["writeup", "essay", "film"]` shows "essay · film".
- `layout` — optional; `layout: poem` keeps every line break exactly as you type it
  (blank lines start a new stanza), on the post page and in the Writing card's
  preview (its first four lines). Without it, Markdown joins adjacent lines.
- `excerpt` — optional; the short passage shown on the piece's Writing page card.
  Without it, the card uses the first ~40 words of the body (headings and images
  skipped). Use it to pick a better passage than the opening, e.g.
  `excerpt: "Two trees greeted me on my morning walk to the dining hall."`
- `workId` — required for grid posts; ties the post to a Precursors node (the graph's detail card
  lists posts whose `workId` equals its node id). If the post isn't tied to a node,
  just set it to the same value as `id`. It can be a **single id** (`workId: "my-first-lemon"`)
  or an **array of ids** (`workId: ["four-nights-of-a-dreamer-1971", "pickpocket"]`) —
  with an array, the post shows on *each* of those nodes' cards. Both forms are
  accepted; every id must be a non-empty string.
- `thumb` / `image` — square grid image and full post image (local path or URL).
  **Both are required by the build.** (The site's render code does fall back to
  whichever one is present — feed thumbnails use `thumb || image`, the post hero uses
  `image || thumb` — but `build-posts.mjs` rejects any post missing either field, so
  in practice you must supply both. Point them at the same file if you only have one.)
- `draft` — optional; `draft: true` (or a date `2099-…` or later) hides the post
  until the Drafts toggle reveals it.
- `pinned` — optional; `pinned: true` sorts the post to the front of every page
  it appears on (homepage grid and/or Writing). To pin it on just one, list the
  page: `pinned: grid`, `pinned: writing`, or `pinned: grid, writing`. On the grid,
  a pinned post shows a small pin marker on its thumbnail. Use `pinOrder: <number>`
  (lower first) to order several pinned posts. Pins only apply on the homepage grid
  — not on the carousel, tag, or search views.
- The Markdown **body** is the post's `content` — write it normally (real line
  breaks, a blank line between paragraphs). No escaping, no `\n` — that's the whole
  point of the move. Headings (`## …`), **bold**, *italics*, and `- lists` all work.
  - **Inline images** use normal Markdown: `![alt text](images/photo.jpg)`. Add a
    quoted **title** to give it a small caption underneath —
    `![alt text](images/photo.jpg "The caption")`. The caption is optional (no
    title = no caption); the `alt text` stays as the accessibility description.
    Images are capped at the reading-column width.

The build **fails loudly** (clear message, non-zero exit — so nothing broken gets
committed) if a file is malformed or missing a required field. The required fields
are `title, date, tags` — plus, for grid posts (the default), `workId` and at least
one of `thumb` / `image` — note that `id` is **not** one of them:
it comes from the filename, not frontmatter. Optional extras (`subtitle`, `draft`,
`pinned`, `pinOrder`, …) are passed through when present.

**Editing / deleting:** edit a post by editing its `.md`; delete one by deleting its
`.md`; then rebuild (or push). The post page still adds previous/next links and a
"More like this" row automatically — no configuration needed.

Tip: for longer posts, draft in Google Docs and use the "Docs to Markdown" add-on,
then paste the Markdown straight into the body — no escaping needed anymore.

## Using your own images

Drop your photos into the `images/` folder and point `thumb`/`image` at them, e.g.
`"image": "images/morning-lemons.jpg"`. See `images/README.md` for the naming
convention and sizing tips.

## Favicons

The browser-tab icon (and the mobile "add to home screen" icons) come from a set of
files in **`images/favicon/`**, wired into the page by hand in the `<head>` of
`index.html` under the `<!-- Favicons -->` comment:

```html
<!-- Favicons -->
<link rel="icon" type="image/x-icon" href="images/favicon/favicon.ico">
<link rel="icon" type="image/png" sizes="16x16" href="images/favicon/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="images/favicon/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="images/favicon/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="images/favicon/android-chrome-192x192.png">
<link rel="icon" type="image/png" sizes="512x512" href="images/favicon/android-chrome-512x512.png">
<link rel="manifest" href="images/favicon/site.webmanifest">
```

The set was generated with a favicon generator (e.g. [favicon.io](https://favicon.io)):
drop your source image in, download the zip, and replace the files in `images/favicon/`
with the ones it produces (same filenames). `site.webmanifest` names the two Android
icons for installable/home-screen use.

**Only `index.html` carries these tags right now** — the icon shows on the homepage
tab. To make every page show the favicon, paste the same `<!-- Favicons -->` block into
the `<head>` of the other HTML pages (`post.html`, `tag.html`, `search.html`,
`precursors.html`, `about.html`, `tags.html`). It's manual because the `<head>` isn't
templated — only the `<body>` header/nav is injected by `js/header.js`.

Right above the favicons in `index.html`'s `<head>` is an **Open Graph / social
preview** block (`og:title`, `og:description`, `og:image`, …) — the tags a link
unfurls into when shared. They're stubbed empty (`content=""`) for now; fill them in to
control the preview card. Same deal as the favicons: hand-placed, and only on
`index.html`.

## Fonts: serif for content, sans for interface

Two fonts, one rule:

- **Georgia (serif) = content.** Anything that *is* your writing or names one of
  your pieces: post text, titles, subtitles, the byline, excerpts, the
  `DATE · TAGS` line (small grey capitals), "More like this" cards, phone
  captions, page titles (*Writing*, *Precursors*) and year headings.
- **Sans-serif = interface.** Anything you use to *operate* the site: the header
  and nav, ← Back and the next-post link, filters, dropdowns, buttons, the
  footer, page descriptions ("Writing beyond the media archive."), section
  labels like MORE LIKE THIS, and empty-state hints.

When adding something new, ask "is this the work, or a tool for getting
around?" and pick the font from that.

## Display modes (light / dark / Minimal)

The site has three display modes, all driven by a `data-theme` attribute on `<html>`
plus a set of CSS variables in `css/styles.css`:

- **Light** (`:root`) — the default warm off-white.
- **Dark** (`[data-theme="dark"]`) — the brown/near-black palette.
- **Minimal** (`[data-theme="minimal"]`) — a flat white background, a plain light
  header, no film grain, and no day/night toggle button.

Normally a floating moon/sun button (bottom-right, injected by `js/theme.js`) toggles
light ↔ dark and remembers the choice per browser.

**Minimal is a code-only switch — there's no button for it.** At the top of
`js/theme.js`:

```js
const MINIMAL = true;   // ← the site is locked to Minimal mode right now
```

When `true`, `theme.js` sets `data-theme="minimal"`, skips building the toggle button,
and ignores any saved or OS preference — so the whole site is Minimal, on every page,
regardless of settings. **Set it to `false` to restore the normal light/dark toggle.**
Nothing is deleted; Minimal just bypasses the toggle and dark theme while it's on.

**Film grain** is a subtle SVG-noise layer (`body::after`) whose strength is the
`--grain-opacity` variable: `0.18` in light, `0.06` in dark, and `0` (off) in Minimal.
Each mode sets it in its own variable block, so adjusting a mode's grain is a one-line
change.

## Hidden & deleted materials — and how to restore them

A few things are hidden or removed: the site is on **Minimal mode**, the header search
box and the Posts and Tags nav links are hidden, the carousel is stashed, and
`posts.html` was deleted. Here's how to bring each back.

**Master switch — Minimal mode** (`const MINIMAL` in `js/theme.js`): forces the white
background + plain header, hides the day/night toggle button, and turns off the grain,
all at once. Restore all of it with `MINIMAL = false`.

**Hidden in `js/header.js`** (still in the file, just not rendered):

| Hidden | How | How to restore |
| --- | --- | --- |
| "Posts" nav link | removed the `<a>` from both navs | re-add `<a class="nav-link" href="index.html">Posts</a>` in `navLinks` and the mobile nav |
| "Tags" nav link | removed the `<a>` from both navs | re-add `<a class="nav-link" href="tags.html">Tags</a>` in both |
| Header search box | removed `${searchMarkup}` from the template | put `${searchMarkup}` back where the comment marks it |

`search.html` / `search.js` and `tags.html` still exist and work if visited directly —
they're just unlinked from the nav.

**Removed — the logo's lemon icon:** the `.logo-dots` button was taken out of the header
in `js/header.js`; only the text wordmark remains. Its squeeze-animation code stays in
`header.js` but is inert (guarded by `if (dots)`). To restore, re-add the `.logo-dots`
button markup inside `.header-brand`.

**Stashed — the carousel:** its markup lives in `snippets/carousel.html` (with a
comment listing what it needs). `js/home.js` and the `.is-carousel` styles are still in
the repo, unused. To put it back on a page, paste the snippet into that page's `<main>`
and load `home.js` after `utils.js`.

**Deleted — `posts.html`:** this one was actually removed (not hidden). Git still has
it:

```bash
git checkout HEAD -- posts.html
```

That restores the last committed version (the original "All posts" grid). The full grid
now lives on `index.html`, so you'd only do this to get the old separate page back.

## The Precursors graph

`precursors.html` is a companion to the photo grid: a force-directed graph
(rendered with D3) of *where* things were discovered and *how* you personally
connect them. It has two views, toggled at the top of the page and both computed
from the same data:

- **Discovery** — every node that records a `discovered_via`, plus the nodes
  named as each discovery `source` (friends, classes, platforms — all ordinary
  nodes), with an edge from each source to what it led you to. An "engaged" discovery (you really sat with it) draws a
  solid edge, labelled *Engagement* on hover; a lighter "aware" one (you'd just
  heard of it) draws dashed, labelled *Awareness*. Nodes are green here.
- **Connections** — the nodes wired together by their `connections`. Each
  connection can carry a `relationship` type, colored per type with a legend;
  directional types (adaptation, influence, authorship) draw an arrow from the
  origin and enlarge the origin node, while the non-directional type (thematic)
  is a plain symmetric line. Nodes are yellow here.

**Graph / List switch.** The Discovery/Connections toggle is hidden (the page is
Discovery-only); in its place a **Graph / List** switch flips the box to a ranked
list of every item in the graph. The list ranks by influence (the same `growth`
score that sizes nodes), can be sorted By date (the default) / By influence / A to Z,
and filtered by a category dropdown built from the `kind` values in
`data/precursors.txt` (most common first, with counts). Kinds can be grouped in
the **`## categories`** block at the top of `data/precursors.txt`
(`People: writer, person, director, philosopher`), which the build copies into
`precursors.json`; any kind not listed there is its own category, so a new kind
still appears on its own. Sorted By date, the list reads like a
diary: small month headings (undated items last), newest first. Within a month:
engaged items with a day (`2026-10-14`), then engaged month-only items, then
aware-only items; influence breaks ties. Each row ends with its date minus the
year ("Apr 15", or "Apr" for month-only), with "aware ·" before it for
aware-only items. The other sorts show "led to N" there instead (and don't
mark aware-only items at all).

**Which date stands for an item** (timeline, list): its *earliest engaged* date
across all its discovery entries; only an item with no engaged date at all falls
back to its earliest aware date. The timeline steps by month, so day dates only
affect ordering inside the list.

In By date, year headings (and in A to Z, letter headings) can be clicked to fold
that group away; a folded group shows its count. In A to Z, a leading "The", "A" or "An" moves
to the end and the title files under its next word ("Stranger, The" under S).

**What "engaged" means:** for a film, the day you watched it; for a book, the day
you *started* reading it (so something that led you elsewhere mid-read still
lines up, and unfinished books still count). The list covers only the graph canvas, so the docked card stays on the
right; tapping a row opens that item's card there (you stay in the list), and the
card's footer has "View in graph →" (in Graph view it has "View in list →",
which jumps to that item's row). Threads and
the timeline clock sit on the right of the toolbar in Graph view; in List view
they hide and the list's category + sort dropdowns take their place.

In both views a node is drawn as a **hub** or a **leaf** by its out-degree (how
much points *out* of it). Hubs are the well-connected origins — larger, hollow
with a dashed outline, and permanently labelled (bold, centered on the node) —
while leaves are solid and reveal their label on hover or once you zoom in close.
A view only shows nodes that actually have data for it, so nothing floats
disconnected: Connections omits nodes with no connections, and Discovery omits
nodes with no `discovered_via`.

Its data lives in its own file, **`data/precursors.txt`** — a human-editable text
format, completely separate from `posts.json`, which it never touches. **Edit the
`.txt`, not the JSON:** running `node scripts/build-precursors.mjs` compiles it
into `data/precursors.json` (the file the site actually reads), exactly the way
`data/posts/*.md` compile into `data/posts.json`. A GitHub Action rebuilds the JSON
on every push automatically, so `data/precursors.json` is **generated** — never
hand-edit it (your changes would be overwritten on the next build). The build
fails loudly on a malformed source (missing `label`/`kind`, a duplicate id, a bad
relationship, an unparseable date, …), so a broken source never ships as broken
JSON.

Every node is added by hand (nothing from `posts.json` becomes a node
automatically). A `### node-id` line starts a node and it runs until the next
`###`; each node carries its *own* connections and discovery events:

```text
### the-trial                    # "### id" starts a node — stable, unique, hand-picked slug
label: The Trial                 # required — display name on the graph
kind: book                       # required — free string: film, book, person, platform, class, album…
creator: Franz Kafka             # optional — shown as the Author/Director line
connections:                     # optional — one "- " item per line
  - to: after-hours, relationship: influence, note: how the two connect
  - to: brazil                   # bare "to" = untyped plain line; relationship/note optional
discovered:                      # optional — one "- " item per line
  - source: dis-philosophy, aware: 2024, engaged: 2026-03, thread: existential fiction, note: Read for class, mechanism: platform-letterboxd
  - engaged: 2026-05             # every field optional, but an entry can't be empty

### four-nights-of-a-dreamer
label: Four Nights of a Dreamer (1971)
kind: film
connections:
  - to: pickpocket               # bare id = untyped, plain line
discovered:
  - source: the-parallax-view, engaged: 2026-03
```

Format rules: blank lines and `#` comments are ignored; a value containing a comma
must be double-quoted (`note: "Girl, so confusing"`); dates are `YYYY`, `YYYY-MM`,
or `YYYY-MM-DD`; a connection `relationship` (if given) must be `adaptation`,
`influence`, `authorship`, or `thematic`; a discovery entry needs at least one
field. `precursors.txt` opens with a commented template using every field as a
cheat-sheet.

The fields below describe both the `.txt` keys and the JSON they compile to
(`connections` → `{ to, relationship?, note? }`; `discovered` → `discovered_via`,
with `aware`/`engaged` becoming `awareDate`/`engagedDate`).

**Node fields:**
- `id` — stable, unique, hand-picked (not auto-generated). It's what `connections`
  and `discovered_via.source` are matched against — and it doubles as the node's
  work id: the detail card lists every post in `posts.json` whose own `workId`
  equals this id — or, when a post's `workId` is an array, contains this id
  (newest first). So once you use one for something real, keep it forever — never
  re-slug it.
- `label` — the display name shown next to the node. Optional: if omitted, it's
  derived from the id by dropping the leading `{type}-` segment and title-casing
  the rest (`class-dis-philosophy` → "Dis Philosophy"), so it stays coupled to
  the id. Set it explicitly when the id doesn't humanize cleanly (most content
  nodes do this — `soren-kierkegaard` → "Soren Kierkegaard").
- `kind` — an open string, not a fixed list (`film`, `book`, `philosopher`,
  `person`, `platform`, `class`, `podcast`, …). New kinds need no code change.
- `creator` — optional string: who made it. Shown on hover and in the detail card
  as the "Director" line (for a `film`) or "Author" line (otherwise). If instead
  another node points at this one with an `authorship` connection, that node is
  used automatically and you can omit this field.
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
  - `source` — **another node's id**: where it came from. Sources are ordinary
    nodes, so friends, classes, and platforms are just nodes too (id convention
    `{type}-{descriptor}`, e.g. `person-danny-h`, `class-dis-philosophy`,
    `platform-letterboxd` — the `{type}-{descriptor}` id humanizes into a label on
    its own, so they usually need only an `id` and `kind`). The id must exist as a
    node — an unknown source draws no edge (and logs a warning). Omit `source`
    for a discovery with no traceable origin — the node still counts as discovered
    (it just draws no edge).
  - `awareDate` / `engagedDate` — optional, each at any precision: `"2024"`,
    `"2026-03"`, or `"2026-03-14"`. An entry can carry either, or both:
    - `awareDate` — when you **first heard of** the thing. On its own it draws a
      dashed edge, labelled *Awareness* on hover, and shows as a bare `<date>` on
      the card. It does **not** count toward a source's size.
    - `engagedDate` — when you **first sat down** with it (read/watched). It draws
      a solid edge, labelled *Engagement* on hover, and counts once toward the
      source's size. Engagement wins visually: an entry with **both** dates draws
      the solid edge and shows the progression `<awareDate> → <engagedDate>` on the
      card (earlier → later).

    Each entry is exactly **one** discovery event — one edge, one "Led to" row,
    one increment toward size — no matter how many dates it carries; a two-date
    entry is never split into two. The timeline scrubber uses `engagedDate` if
    present, else `awareDate`, so it reads as a first-engagement history.
  - `mechanism` — optional. The platform/means you actually found it through
    (e.g. `letterboxd`). Renders as "· found on X" in the detail card (the id is
    humanized, so `letterboxd` → "found on Letterboxd").
  - `thread` — optional. The through-line you were pulling **when you found this
    thing** (`"70s paranoia"`, `"Alain Delon"`). Tag an entry with it only if you
    discovered that thing *while following* the thread — the origin that *started*
    a thread stays untagged (it wasn't found through it). A thing can be found in
    one thread and kick off another: the second thread lives on the entries of the
    things *it* leads to. Rendered as "↳ thread: X" both in the source's "Led to"
    rows (the pull it produced) and on the thing's own "Discovered via". Not a
    node/edge — just a caption for now, to visualize later. Example: The Parallax
    View is untagged (it seeded "70s paranoia"); Le Samouraï's entry is
    `thread: "70s paranoia"` (found via that hunt); Le Samouraï's own children get
    `thread: "lone operator"` (the thread *it* kicked off).
  - `note` — optional free text: the one-off story/circumstance (`"Danish
    bookstore"`). Shown only on the thing's *own* card, not in "Led to" rows.

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
