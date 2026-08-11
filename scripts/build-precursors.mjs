#!/usr/bin/env node
// Build data/precursors.json from the human-editable data/precursors.txt.
//
// precursors.txt is the hand-edited source; this script compiles it into
// data/precursors.json in the EXACT shape the site already reads (see
// js/precursors.js) — connections as { to, relationship?, note? } and
// discovered_via as { source?, awareDate?, engagedDate?, thread?, note?,
// mechanism? } — so nothing on the site changes. Same relationship as
// data/posts/*.md → data/posts.json (see build-posts.mjs).
//
// Text format (see the commented template at the top of precursors.txt):
//
//   ### node-id                 a "### id" line starts a node; it runs until the
//                               next "###"
//   label: Display Name         required
//   kind: film                  required (free string)
//   creator: Some Person        optional
//   connections:                optional; each item on its own indented "- " line
//     - to: other-id, relationship: influence, note: text
//   discovered:                 optional; each item on its own indented "- " line
//     - source: some-id, aware: 2023-04, engaged: 2026-05, thread: x, note: y, mechanism: z
//
// Blank lines and lines starting with "#" are ignored. A value containing a comma
// must be quoted ("...") so the comma isn't read as a field separator.
//
// Zero dependencies (keeps this vanilla static site dependency-free).
//
// Fails LOUDLY: missing required fields, duplicate ids, bad syntax, an invalid
// relationship value, or an empty discovery entry all throw a clear error and
// exit non-zero, so a broken source never yields a silently broken JSON.
//
// Run:  node scripts/build-precursors.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_FILE = join(ROOT, "data", "precursors.txt");
const OUT_FILE = join(ROOT, "data", "precursors.json");

// The four preset connection relationship types the site knows (see
// RELATIONSHIP_TYPES in js/precursors.js). A bare connection (no relationship) is
// allowed — it draws a plain undirected line.
const RELATIONSHIPS = new Set(["adaptation", "influence", "authorship", "thematic"]);
// A node id / connection target: letters, digits, dot, underscore, hyphen — no
// spaces. (Referential integrity ISN'T enforced: the site tolerates a dangling
// connection target or unknown discovery source, so a work-in-progress id is OK.)
const ID_RE = /^[A-Za-z0-9._-]+$/;
// A date at any precision: YYYY, YYYY-MM, or YYYY-MM-DD.
const DATE_RE = /^\d{4}(?:-\d{2}){0,2}$/;

const CONN_KEYS = ["to", "relationship", "note"];
const DISC_KEYS = ["source", "aware", "engaged", "thread", "note", "mechanism"];

// Strip surrounding double-quotes from a value; leave a bare value as-is (only
// trimmed). A "..."-wrapped value can safely contain commas. Only double-quotes
// are special, so apostrophes in prose (Le Samouraï's …) are literal.
function unquote(raw) {
  const v = raw.trim();
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') return v.slice(1, -1);
  return v;
}

// Split a "- " item's body into its comma-separated fields, but treat commas
// inside "..." as literal. Throws on an unterminated quote.
function splitFields(str, ctx) {
  const parts = [];
  let cur = "", quoted = false;
  for (const ch of str) {
    if (ch === '"') { quoted = !quoted; cur += ch; }
    else if (ch === "," && !quoted) { parts.push(cur); cur = ""; }
    else cur += ch;
  }
  if (quoted) throw new Error(`${ctx}: unterminated " quote`);
  parts.push(cur);
  return parts;
}

// Parse an indented "- key: value, key: value" list item into an object, checking
// every key against the allowed set and rejecting duplicates.
function parseItem(line, allowed, ctx) {
  const body = line.replace(/^-\s*/, "");
  if (!body.trim()) throw new Error(`${ctx}: empty list item ("-" with nothing after it)`);
  const obj = {};
  for (const seg of splitFields(body, ctx)) {
    if (!seg.trim()) continue;   // tolerate a stray/trailing comma
    const idx = seg.indexOf(":");
    if (idx === -1) throw new Error(`${ctx}: malformed "key: value" pair "${seg.trim()}"`);
    const key = seg.slice(0, idx).trim();
    if (!key) throw new Error(`${ctx}: empty key in "${seg.trim()}"`);
    if (!allowed.includes(key)) {
      throw new Error(`${ctx}: unknown key "${key}" (allowed: ${allowed.join(", ")})`);
    }
    if (key in obj) throw new Error(`${ctx}: duplicate key "${key}"`);
    obj[key] = unquote(seg.slice(idx + 1));
  }
  return obj;
}

// Parse the whole file into loosely-structured node records (validated later).
function parse(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const nodes = [];
  let cur = null;    // node being assembled
  let list = null;   // which block indented "- " items attach to
  let seen = false;  // whether any "### id" header has appeared yet

  const finish = () => { if (cur) nodes.push(cur); };

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const ctx = `line ${lineNo}`;
    const trimmed = raw.replace(/\s+$/, "").trim();

    // A node header ("### id") — checked BEFORE the "#" comment rule, since "###"
    // also begins with "#".
    const hdr = /^###\s+(.*)$/.exec(trimmed);
    if (hdr) {
      finish();
      const id = hdr[1].trim();
      if (!id) throw new Error(`${ctx}: "###" with no node id`);
      if (!ID_RE.test(id)) {
        throw new Error(`${ctx}: invalid node id "${id}" (use letters, digits, "." "_" "-"; no spaces)`);
      }
      cur = { id, line: lineNo, connections: [], discovered: [] };
      list = null;
      seen = true;
      return;
    }

    if (!trimmed || trimmed.startsWith("#")) return;   // blank line or comment

    if (!cur) throw new Error(`${ctx}: content before the first "### node-id" header: "${trimmed}"`);

    // An indented "- ..." item belongs to the most recent connections:/discovered: block.
    if (trimmed.startsWith("-")) {
      if (!list) throw new Error(`${ctx}: "-" list item outside a "connections:" or "discovered:" block`);
      if (list === "connections") {
        cur.connections.push({ ...parseItem(trimmed, CONN_KEYS, `${ctx} (${cur.id} connection)`), line: lineNo });
      } else {
        cur.discovered.push({ ...parseItem(trimmed, DISC_KEYS, `${ctx} (${cur.id} discovery)`), line: lineNo });
      }
      return;
    }

    // Otherwise it's a node-level "key: value".
    const idx = trimmed.indexOf(":");
    if (idx === -1) throw new Error(`${ctx}: expected "key: value" (got "${trimmed}")`);
    const key = trimmed.slice(0, idx).trim();
    const val = unquote(trimmed.slice(idx + 1));

    if (key === "connections") {
      if (val) throw new Error(`${ctx}: "connections:" must stand alone (items go on following "- " lines)`);
      list = "connections"; return;
    }
    if (key === "discovered") {
      if (val) throw new Error(`${ctx}: "discovered:" must stand alone (items go on following "- " lines)`);
      list = "discovered"; return;
    }
    if (key === "label" || key === "kind" || key === "creator") {
      if (cur[key] !== undefined) throw new Error(`${ctx}: duplicate "${key}" for node "${cur.id}"`);
      cur[key] = val;
      list = null; return;
    }
    throw new Error(`${ctx}: unknown field "${key}" for node "${cur.id}" (allowed: label, kind, creator, connections, discovered)`);
  });

  finish();
  if (!seen) throw new Error(`no nodes found (expected at least one "### node-id")`);
  return nodes;
}

// Validate each parsed record and assemble the output node in the exact JSON
// shape the site reads.
function build(records) {
  const seen = new Map();   // id -> line, to catch duplicates
  const out = [];

  for (const r of records) {
    const where = `node "${r.id}" (line ${r.line})`;
    if (seen.has(r.id)) throw new Error(`duplicate node id "${r.id}" (lines ${seen.get(r.id)} and ${r.line})`);
    seen.set(r.id, r.line);

    if (!r.label) throw new Error(`${where}: missing required "label"`);
    if (!r.kind) throw new Error(`${where}: missing required "kind"`);

    const node = { id: r.id, label: r.label, kind: r.kind };
    if (r.creator !== undefined) {
      if (!r.creator) throw new Error(`${where}: "creator" is empty (omit the line if there's no creator)`);
      node.creator = r.creator;
    }

    // discovered_via — one entry per "- " line. Every field is optional, but an
    // entry can't be entirely empty. Dates map aware→awareDate, engaged→engagedDate.
    const dvs = [];
    for (const d of r.discovered) {
      const dctx = `${where} discovery (line ${d.line})`;
      const present = DISC_KEYS.filter((k) => d[k] !== undefined && d[k] !== "");
      if (!present.length) {
        throw new Error(`${dctx}: empty discovery entry (needs at least one of ${DISC_KEYS.join("/")})`);
      }
      for (const dk of ["aware", "engaged"]) {
        if (d[dk] && !DATE_RE.test(d[dk])) {
          throw new Error(`${dctx}: invalid ${dk} date "${d[dk]}" (use YYYY, YYYY-MM, or YYYY-MM-DD)`);
        }
      }
      const entry = {};
      if (d.source) entry.source = d.source;
      if (d.aware) entry.awareDate = d.aware;
      if (d.engaged) entry.engagedDate = d.engaged;
      if (d.thread) entry.thread = d.thread;
      if (d.note) entry.note = d.note;
      if (d.mechanism) entry.mechanism = d.mechanism;
      dvs.push(entry);
    }
    if (dvs.length) node.discovered_via = dvs;

    // connections — one entry per "- " line. "to" is required; relationship
    // (optional) must be a known type.
    const conns = [];
    for (const c of r.connections) {
      const cctx = `${where} connection (line ${c.line})`;
      if (!c.to) throw new Error(`${cctx}: connection is missing "to"`);
      if (!ID_RE.test(c.to)) throw new Error(`${cctx}: invalid "to" id "${c.to}"`);
      const entry = { to: c.to };
      if (c.relationship) {
        if (!RELATIONSHIPS.has(c.relationship)) {
          throw new Error(`${cctx}: invalid relationship "${c.relationship}" (must be ${[...RELATIONSHIPS].join(", ")})`);
        }
        entry.relationship = c.relationship;
      }
      if (c.note) entry.note = c.note;
      conns.push(entry);
    }
    if (conns.length) node.connections = conns;

    out.push(node);
  }

  return out;
}

function main() {
  let raw;
  try {
    raw = readFileSync(SRC_FILE, "utf8");
  } catch (err) {
    throw new Error(`can't read ${SRC_FILE}: ${err.message}`);
  }
  const nodes = build(parse(raw));
  writeFileSync(OUT_FILE, JSON.stringify({ nodes }, null, 2) + "\n", "utf8");
  console.log(`✓ built data/precursors.json from ${nodes.length} node${nodes.length === 1 ? "" : "s"}`);
}

try {
  main();
} catch (err) {
  console.error(`\n✗ build-precursors failed: ${err.message}\n`);
  process.exit(1);
}
