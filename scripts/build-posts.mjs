#!/usr/bin/env node
// Build data/posts.json from the individual Markdown files in data/posts/.
//
// Each post is one <id>.md file: a YAML-ish frontmatter block (--- ... ---)
// holding the metadata, then the post's Markdown content as the body. This
// script parses them all and regenerates data/posts.json in the EXACT shape the
// site already expects (same field names/values), so main.js / post.js /
// search.js / tag.js / tags.js keep reading posts.json unchanged.
//
// Zero dependencies (keeps this vanilla static site dependency-free). Frontmatter
// values are read JSON-first — the migration writes them as JSON (quoted
// strings, ["a","b"], true, 1) — with lenient fallbacks for hand-edited files.
//
// Fails LOUDLY: any malformed file or missing/mistyped required field throws a
// clear error and exits non-zero, so a broken post never yields a silently
// broken posts.json.
//
// Run:  node scripts/build-posts.mjs

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POSTS_DIR = join(ROOT, "data", "posts");
const OUT_FILE = join(ROOT, "data", "posts.json");

// Fields every post must carry in frontmatter. `id` is NOT here — it comes from
// the filename (<id>.md), so renaming a post is just renaming the file. Optional
// extras (subtitle, pinned, pinOrder, draft, …) are passed through when present.
const REQUIRED = ["title", "date", "tags", "workId", "thumb", "image"];
// Preferred key order in the output objects (tidy, stable diffs). `content`
// always comes last; any unlisted frontmatter keys are appended before it.
const KEY_ORDER = [
  "id", "pinned", "pinOrder", "title", "subtitle", "date", "dateOrder",
  "tags", "postType", "category", "workId", "thumb", "image", "draft",
];

// A post's date may carry an optional trailing integer that orders posts sharing
// the SAME date (lower first): "2025-03" (no order) or "2025-03 2" / "2025-03, 2"
// (order 2). Splits into the clean date + the order (or undefined). Throws on a
// date that isn't a year / year-month / full ISO date with an optional integer.
function splitDate(raw, file) {
  const m = /^(\d{4}(?:-\d{2}){0,2})(?:[\s,]+(\d+))?$/.exec(String(raw).trim());
  if (!m) throw new Error(`${file}: invalid date "${raw}" (expected e.g. "2025-03" or "2025-03 2")`);
  return { date: m[1], order: m[2] === undefined ? undefined : Number(m[2]) };
}

// Parse one frontmatter scalar. JSON first (what the migration writes), then
// lenient fallbacks so a hand-edited file with bare YAML values still works.
function parseValue(v) {
  if (v === "") return "";
  try { return JSON.parse(v); } catch { /* not strict JSON — fall through */ }
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") return v.slice(1, -1);
  if (v[0] === "[" && v[v.length - 1] === "]") {          // flow array [a, b]
    const inner = v.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((s) => parseValue(s.trim()));
  }
  return v;   // bare string
}

// Split a file into { data, body }. Throws if the frontmatter block is missing.
function parseFile(raw, file) {
  const text = raw.replace(/^﻿/, "");   // strip a leading BOM if present
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/.exec(text);
  if (!m) {
    throw new Error(`${file}: missing or malformed frontmatter (file must start with a "--- … ---" block)`);
  }
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) throw new Error(`${file}: malformed frontmatter line (expected "key: value"): ${line}`);
    const key = line.slice(0, idx).trim();
    if (!key) throw new Error(`${file}: empty key in frontmatter line: ${line}`);
    data[key] = parseValue(line.slice(idx + 1).trim());
  }
  return { data, body: m[2] };
}

// Enforce the shape: required fields, types, non-empty body. (The id isn't
// validated here — it's the filename, so it can't be missing or duplicated.)
function validate(data, body, file) {
  const missing = REQUIRED.filter((k) => !(k in data));
  if (missing.length) throw new Error(`${file}: missing required field(s): ${missing.join(", ")}`);

  for (const k of ["title", "date", "workId", "thumb", "image"]) {
    if (typeof data[k] !== "string") throw new Error(`${file}: "${k}" must be a string`);
  }
  if (!Array.isArray(data.tags) || data.tags.some((t) => typeof t !== "string")) {
    throw new Error(`${file}: "tags" must be an array of strings`);
  }
  if ("subtitle" in data && typeof data.subtitle !== "string") throw new Error(`${file}: "subtitle" must be a string`);
  if ("pinned" in data && typeof data.pinned !== "boolean") throw new Error(`${file}: "pinned" must be true/false`);
  if ("pinOrder" in data && typeof data.pinOrder !== "number") throw new Error(`${file}: "pinOrder" must be a number`);
  if ("draft" in data && typeof data.draft !== "boolean") throw new Error(`${file}: "draft" must be true/false`);
  if (!body.trim()) throw new Error(`${file}: post body (content) is empty`);
}

// Assemble one post object: frontmatter fields in KEY_ORDER, unknown keys after,
// then content (the trimmed body) last.
function toPost(id, data, body, file) {
  const { date, order } = splitDate(data.date, file);
  const merged = { id, ...data, date };   // id (from the filename) always leads
  if (order !== undefined) merged.dateOrder = order;
  const post = {};
  for (const k of KEY_ORDER) if (k in merged) post[k] = merged[k];
  for (const k of Object.keys(merged)) if (!KEY_ORDER.includes(k)) post[k] = merged[k];
  post.content = body.trim();
  return post;
}

function main() {
  let files;
  try {
    files = readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md")).sort();
  } catch (err) {
    throw new Error(`can't read posts directory ${POSTS_DIR}: ${err.message}`);
  }
  if (files.length === 0) throw new Error(`no .md files found in ${POSTS_DIR}`);

  const posts = [];
  for (const file of files) {
    const id = basename(file, ".md");   // the filename IS the id
    const raw = readFileSync(join(POSTS_DIR, file), "utf8");
    const { data, body } = parseFile(raw, file);
    // A stray frontmatter `id` is ignored (the filename wins) — warn if it would
    // have meant something different, so a rename doesn't silently confuse.
    if ("id" in data && data.id !== id) {
      console.warn(`  note: ${file} has "id: ${JSON.stringify(data.id)}" in frontmatter — ignoring it; the id is the filename ("${id}").`);
    }
    delete data.id;
    validate(data, body, file);
    posts.push(toPost(id, data, body, file));
  }

  // Deterministic array order: newest date first, then dateOrder (lower first),
  // then id. (The site re-sorts on load — pinned first, then date, then
  // dateOrder — so this only sets a stable file order.)
  posts.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const oa = Number.isFinite(a.dateOrder) ? a.dateOrder : Infinity;
    const ob = Number.isFinite(b.dateOrder) ? b.dateOrder : Infinity;
    if (oa !== ob) return oa - ob;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  writeFileSync(OUT_FILE, JSON.stringify(posts, null, 2) + "\n", "utf8");
  console.log(`✓ built data/posts.json from ${posts.length} post${posts.length === 1 ? "" : "s"}`);
}

try {
  main();
} catch (err) {
  console.error(`\n✗ build-posts failed: ${err.message}\n`);
  process.exit(1);
}
