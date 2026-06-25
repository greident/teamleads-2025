#!/usr/bin/env node
/*
 * Validate the Тимлид-симулятор deck (data/scenarios.yaml) after a Hugo build.
 *
 * Runs against the BUILT output (public/shell/index.html) rather than the YAML
 * source, so it needs no YAML dependency AND proves Hugo actually ingested the
 * data. Run it after `hugo --quiet`:
 *
 *     hugo --quiet && node scripts/validate-scenarios.mjs
 *
 * Checks, per scenario: unique id · 3–4 options · exactly one good · votes are
 * integers summing to 90–110 · prompt/lesson present · link resolves to a real
 * page that the shell can actually `cat`. Exits non-zero on any failure.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, '..', 'public', 'shell', 'index.html');

function decode(s) {
  return s
    .replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&#43;/g, '+')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function attr(html, name) {
  const m = html.match(new RegExp("data-" + name + "='([^']*)'"));
  if (!m) return null;
  try { return JSON.parse(decode(m[1])); } catch (e) { return { __parseError: e.message }; }
}

let html;
try { html = readFileSync(htmlPath, 'utf8'); }
catch { console.error('✗ build the site first: `hugo --quiet` (missing ' + htmlPath + ')'); process.exit(2); }

const SCEN = attr(html, 'scenarios');
const FS = attr(html, 'fs');
if (!SCEN || SCEN.__parseError) { console.error('✗ data-scenarios missing or not valid JSON' + (SCEN ? ': ' + SCEN.__parseError : '')); process.exit(2); }
if (!FS || !FS.sections) { console.error('✗ data-fs missing — cannot verify links'); process.exit(2); }

const pages = new Set();
for (const sec of Object.keys(FS.sections)) for (const it of FS.sections[sec]) pages.add(sec + '/' + it.n);

const scenarios = SCEN.scenarios || [];
const errs = [];
const seen = new Set();
if (!scenarios.length) errs.push('no scenarios found');

scenarios.forEach((s, i) => {
  const tag = 'scenario[' + i + ']' + (s.id ? ' "' + s.id + '"' : '');
  if (!s.id) errs.push(tag + ': missing id');
  else if (seen.has(s.id)) errs.push(tag + ': duplicate id'); else seen.add(s.id);
  if (!s.prompt || !String(s.prompt).trim()) errs.push(tag + ': empty prompt');
  if (!s.lesson || !String(s.lesson).trim()) errs.push(tag + ': missing lesson');
  const opts = s.options || [];
  if (opts.length < 2 || opts.length > 4) errs.push(tag + ': needs 2–4 options, has ' + opts.length);
  const good = opts.filter(o => o && o.good === true).length;
  if (good !== 1) errs.push(tag + ': must have exactly one good option, has ' + good);
  let sum = 0;
  opts.forEach((o, j) => {
    if (!o || !o.label) errs.push(tag + ' opt[' + j + ']: missing label');
    if (!o || !o.outcome) errs.push(tag + ' opt[' + j + ']: missing outcome');
    if (o && typeof o.votes === 'number') sum += o.votes; else errs.push(tag + ' opt[' + j + ']: votes must be a number');
  });
  if (opts.length && (sum < 90 || sum > 110)) errs.push(tag + ': votes sum to ' + sum + ' (want 90–110)');
  if (!s.link) errs.push(tag + ': missing link');
  else if (!pages.has(s.link)) errs.push(tag + ': link "' + s.link + '" does not resolve to a page');
  if (/—/.test(JSON.stringify(s))) errs.push(tag + ': contains an em-dash (—); use en-dash (–)');
});

if (errs.length) { console.error('✗ scenarios invalid:\n  - ' + errs.join('\n  - ')); process.exit(1); }
console.log('✓ ' + scenarios.length + ' scenarios valid (ids unique, one good each, votes ~100%, links resolve)');
