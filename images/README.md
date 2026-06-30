# images/

Put your own photos here, then point a post's `thumb` and `image` at them in
`data/posts.json`.

## Suggested convention

For each post, add two files named after the post's `id`:

```
images/
├── morning-lemons.jpg        full image  (large, e.g. 1400×1400)
└── morning-lemons-thumb.jpg  square thumbnail (e.g. 600×600)
```

Then in `data/posts.json`:

```json
{
  "id": "morning-lemons",
  "thumb": "images/morning-lemons-thumb.jpg",
  "image": "images/morning-lemons.jpg",
  ...
}
```

## Tips

- The grid crops thumbnails to a square automatically (CSS `object-fit: cover`),
  so a square `thumb` looks best but isn't required.
- If you only have one size, you can point both `thumb` and `image` at the same
  file — or omit `thumb` entirely and the grid falls back to `image`.
- Any web image format works (`.jpg`, `.png`, `.webp`, `.gif`).
- Keep full images reasonably sized (long edge ~1400px) so pages load fast.
