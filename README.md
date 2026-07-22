# Sourfruits

A small Instagram-style photo blog as a static website. The homepage is a grid of
square thumbnails; clicking one opens a post with the full image, optional subtitle,
date, tags, and text. You can also browse by tag or search across every post. All
posts live in a single JSON file so adding a new one is a one-block edit.

Extras baked in: a light/dark theme toggle (floating, remembered per browser), an
inline header search box, gentle load-in fade animations (which respect
`prefers-reduced-motion`), and — at the bottom of every post — previous/next links
and a "More like this" row of posts sharing its tags.

## File structure

```
sourfruits-blog/
├── index.html        Homepage — the paginated photo grid
├── post.html         Single post view (reads ?id= from the URL)
├── tag.html          Posts filtered by one tag (reads ?tag= from the URL)
├── tags.html         All tags used across posts, with post counts
├── search.html       Search results (reads ?q= from the URL)
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
│   └── about.js      About page — footer year + back button
├── data/
│   └── posts.json    ← Your content lives here. Add posts here.
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
  "content": "Your text.\n\n## A heading\n\nSome **bold** and *italic* text, plus a list:\n\n- first item\n- second item"
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
- Tip: for longer posts, draft in Google Docs and use the "Docs to Markdown"
  add-on to convert your formatting to Markdown, then paste the result into the
  `content` field.
- `thumb` and `image` can be local paths (e.g. `images/lemon.jpg`) or full URLs.
  If you omit `thumb`, the grid falls back to `image`, and vice versa.
- The starter posts use placeholder images from picsum.photos — swap in your own.

## Using your own images

Drop your photos into the `images/` folder and point `thumb`/`image` at them, e.g.
`"image": "images/morning-lemons.jpg"`. See `images/README.md` for the naming
convention and sizing tips. The starter posts currently use placeholder URLs from
picsum.photos — replace those as you add your own.

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
