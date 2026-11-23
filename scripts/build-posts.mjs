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

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POSTS_DIR = join(ROOT, "data", "posts");
const OUT_FILE = join(ROOT, "data", "posts.json");

// Where a post appears: `show: grid` (homepage photo grid — the default when the
// line is left out), `show: writing` (the Writing page), or `show: grid, writing`
// (both, from the same file). Grid posts need a photo and a workId; writing-only
// posts need neither.
const PLACES = ["grid", "writing"];

// Fields every post must carry in frontmatter. `id` is NOT here — it comes from
// the filename (<id>.md), so renaming a post is just renaming the file. `thumb`
// and `image` aren't here either: the site falls back one to the other
// (thumb || image / image || thumb), so a post needs AT LEAST ONE, not both —
// that's enforced separately in validate(). Optional extras (subtitle, pinned,
// pinOrder, draft, …) are passed through when present.
const REQUIRED = ["title", "date", "tags"];
// Preferred key order in the output objects (tidy, stable diffs). `content`
// always comes last; any unlisted frontmatter keys are appended before it.
const KEY_ORDER = [
  "id", "pinned", "pinOrder", "title", "subtitle", "date", "dateOrder",
  "tags", "show", "postType", "category", "workId", "thumb", "image", "draft",
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
// Normalise `show` to an array of places: "grid, writing" / ["grid","writing"] /
// "writing". Throws on an unknown place or an empty value.
function parseShow(raw, file) {
  const list = (Array.isArray(raw) ? raw : String(raw).split(","))
    .map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  if (!list.length) throw new Error(`${file}: "show" is empty (use grid, writing, or both)`);
  const bad = list.filter((s) => !PLACES.includes(s));
  if (bad.length) throw new Error(`${file}: unknown "show" value "${bad.join(", ")}" (use grid, writing, or both)`);
  return [...new Set(list)];
}

function validate(data, body, file) {
  const missing = REQUIRED.filter((k) => !(k in data));
  if (missing.length) throw new Error(`${file}: missing required field(s): ${missing.join(", ")}`);

  if ("show" in data) data.show = parseShow(data.show, file);
  const inGrid = !("show" in data) || data.show.includes("grid");

  // Grid posts: a photo (thumb or image — the site falls back one to the other)
  // and a workId are required. Writing-only posts may skip both.
  if (inGrid && !("thumb" in data) && !("image" in data)) {
    throw new Error(`${file}: grid posts must have at least one of "thumb" or "image" (or set "show: writing")`);
  }
  if (inGrid && !("workId" in data)) {
    throw new Error(`${file}: grid posts must have a "workId" (or set "show: writing")`);
  }

  const stringFields = ["title", "date"];
  if ("thumb" in data) stringFields.push("thumb");
  if ("image" in data) stringFields.push("image");
  for (const k of stringFields) {
    if (typeof data[k] !== "string") throw new Error(`${file}: "${k}" must be a string`);
  }
  // workId ties a post to one OR MORE Precursors nodes: a single string, or an
  // array of strings (the post then shows on each of those nodes' cards). Either
  // form is accepted; every id must be a non-empty string.
  if ("workId" in data) {
    const workIds = Array.isArray(data.workId) ? data.workId : [data.workId];
    if (!workIds.length || workIds.some((w) => typeof w !== "string" || !w)) {
      throw new Error(`${file}: "workId" must be a non-empty string or an array of non-empty strings`);
    }
  }
  if (!Array.isArray(data.tags) || data.tags.some((t) => typeof t !== "string")) {
    throw new Error(`${file}: "tags" must be an array of strings`);
  }
  if ("subtitle" in data && typeof data.subtitle !== "string") throw new Error(`${file}: "subtitle" must be a string`);
  // pinned: true/false (pinned everywhere the post appears), or the places to
  // pin it in — "grid", "writing", or "grid, writing".
  if ("pinned" in data && typeof data.pinned !== "boolean") {
    try { data.pinned = parseShow(data.pinned, file); }
    catch (err) { throw new Error(`${file}: "pinned" must be true/false or grid / writing / grid, writing`); }
  }
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

// Every .md file under data/posts/, including subfolders (e.g. data/posts/2026/,
// data/posts/drafts/). Folders are purely for organisation — they change nothing
// on the site. Returned as paths relative to POSTS_DIR, sorted.
function listPostFiles(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listPostFiles(full, prefix + name + "/"));
    else if (name.endsWith(".md")) out.push(prefix + name);
  }
  return out.sort();
}

function main() {
  let files;
  try {
    files = listPostFiles(POSTS_DIR);
  } catch (err) {
    throw new Error(`can't read posts directory ${POSTS_DIR}: ${err.message}`);
  }
  if (files.length === 0) throw new Error(`no .md files found in ${POSTS_DIR}`);

  const posts = [];
  const seenIds = new Map();   // id -> file, so the same filename in two folders is caught
  for (const file of files) {
    const id = basename(file, ".md");   // the filename IS the id (its folder doesn't matter)
    if (seenIds.has(id)) {
      throw new Error(`two posts share the filename "${id}.md" (${seenIds.get(id)} and ${file}) — filenames must be unique across all folders`);
    }
    seenIds.set(id, file);
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
