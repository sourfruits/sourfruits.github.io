# Sourfruits

A small Instagram-style photo blog as a static website. The homepage is a grid of
square thumbnails; clicking one opens a post with the full image, date, tags, and text.
All posts live in a single JSON file so adding a new one is a one-block edit.

## File structure

```
sourfruits-blog/
├── index.html        Homepage — the photo grid
├── post.html         Single post view (reads ?id= from the URL)
├── css/
│   └── styles.css    All styling (shared by both pages)
├── js/
│   ├── main.js       Loads posts.json, builds the grid
│   └── post.js       Loads one post by its id and renders it
├── data/
│   └── posts.json    ← Your content lives here. Add posts here.
└── README.md
```

There is no build step and no framework — just HTML, CSS, and a little vanilla JavaScript.

## Running it

The pages read `data/posts.json` with `fetch()`, which browsers block when you open
an HTML file directly (`file://`). So serve the folder over a local server:

```bash
# From inside the sourfruits-blog folder, pick one:
python -m http.server 8000        # Python 3
npx serve                          # Node (if you have it)
```

Then open http://localhost:8000 in your browser.

## Adding a new post

Open `data/posts.json` and add an object to the array:

```json
{
  "id": "unique-slug",                         // used in the URL: post.html?id=unique-slug
  "title": "Post Title",
  "date": "2026-06-29",                        // YYYY-MM-DD — used for sorting (newest first)
  "tags": ["citrus", "kitchen"],
  "thumb": "images/my-photo-square.jpg",       // square image for the grid
  "image": "images/my-photo-full.jpg",         // full image for the post page
  "content": "Your text.\n\nBlank lines become new paragraphs."
}
```

Notes:
- `id` must be unique — it's how the post page finds the right entry.
- Posts are sorted by `date` automatically, so order in the file doesn't matter.
- `thumb` and `image` can be local paths (e.g. `images/lemon.jpg`) or full URLs.
  If you omit `thumb`, the grid falls back to `image`, and vice versa.
- The starter posts use placeholder images from picsum.photos — swap in your own.

## Using your own images

Drop your photos into the `images/` folder and point `thumb`/`image` at them, e.g.
`"image": "images/morning-lemons.jpg"`. See `images/README.md` for the naming
convention and sizing tips. The starter posts currently use placeholder URLs from
picsum.photos — replace those as you add your own.
