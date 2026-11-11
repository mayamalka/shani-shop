#!/usr/bin/env node
/**
 * Builds apps/api/data/il-addresses.json.gz – every Israeli locality and its streets, for the checkout address dropdowns.
 * Source: data.gov.il (רשות האוכלוסין וההגירה) – the same official registry Israel Post's zip-code search is based on.
 *
 *   npm run addresses:update                       # download from data.gov.il (run every few months)
 *   node scripts/update-addresses.mjs --from-package <dir>   # build from an unpacked @il-address/data package (offline fallback)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'apps/api/data/il-addresses.json.gz');
const RESOURCES = {
  cities: process.env.CITIES_RESOURCE ?? '8f714b6f-c35c-4b40-a0e7-547b675eee0e',
  streets: process.env.STREETS_RESOURCE ?? 'bf185c7f-1a4e-4662-88c5-fa118a244bda',
};

// the registry stores some names in "visual" order: ")צפון-מזרח(" → "(צפון-מזרח)"
const fixParens = (s) => {
  const close = s.indexOf(')');
  const open = s.indexOf('(');
  return close !== -1 && (open === -1 || close < open) ? s.replace(/[()]/g, (c) => (c === '(' ? ')' : '(')) : s;
};
const clean = (s) => fixParens(String(s ?? '').replace(/\s+/g, ' ').trim());
const norm = (k) => k.replace(/[\s_]+/g, '');

async function fetchAll(resourceId) {
  const rows = [];
  for (let offset = 0; ; offset += 32000) {
    const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${resourceId}&limit=32000&offset=${offset}`;
    const res = await fetch(url, { headers: { 'user-agent': 'hadoda-shani-address-import' } });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const { result } = await res.json();
    rows.push(...result.records);
    if (rows.length >= result.total || result.records.length === 0) return rows;
  }
}

/** find a column by its Hebrew name, ignoring spaces/underscores */
function col(row, ...names) {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((x) => norm(x) === norm(n));
    if (k) return k;
  }
  throw new Error(`column not found (${names.join(' / ')}). Columns: ${keys.join(', ')}`);
}

async function fromGov() {
  console.log('downloading localities…');
  const cityRows = await fetchAll(RESOURCES.cities);
  console.log('downloading streets…');
  const streetRows = await fetchAll(RESOURCES.streets);
  const cc = col(cityRows[0], 'סמל_ישוב', 'סמל ישוב'), cn = col(cityRows[0], 'שם_ישוב', 'שם ישוב');
  const sc = col(streetRows[0], 'סמל_ישוב', 'סמל ישוב'), sn = col(streetRows[0], 'שם_רחוב', 'שם רחוב');
  const cities = cityRows.map((r) => [Number(r[cc]), clean(r[cn])]).filter(([c, n]) => c > 0 && n);
  const streets = {};
  for (const r of streetRows) {
    const name = clean(r[sn]);
    if (name) (streets[Number(r[sc])] ??= new Set()).add(name);
  }
  return { cities, streets, source: { ...RESOURCES, via: 'data.gov.il' } };
}

function fromPackage(dir) {
  const gen = path.join(dir, 'generated');
  const cities = JSON.parse(readFileSync(path.join(gen, 'cities.json'), 'utf8')).map((c) => [Number(c.code), clean(c.nameHe)]);
  const streets = {};
  for (const f of readdirSync(path.join(gen, 'streets'))) {
    if (!f.endsWith('.json')) continue;
    const list = JSON.parse(readFileSync(path.join(gen, 'streets', f), 'utf8'));
    streets[Number(f.replace('.json', ''))] = new Set(list.map((s) => clean(s.nameHe)).filter(Boolean));
  }
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  return { cities, streets, source: { cities: manifest.sources.cities.resourceId, streets: manifest.sources.streets.resourceId, via: '@il-address/data (built from data.gov.il)', dataDate: manifest.sources.streets.lastModified } };
}

const i = process.argv.indexOf('--from-package');
const data = i > 0 ? fromPackage(process.argv[i + 1]) : await fromGov();

const collator = new Intl.Collator('he');
const cities = [...new Map(data.cities.map(([c, n]) => [c, n])).entries()].sort((a, b) => collator.compare(a[1], b[1]));
const streets = Object.fromEntries(Object.entries(data.streets).map(([c, set]) => [c, [...set].sort(collator.compare)]));
const out = { generatedAt: new Date().toISOString(), source: data.source, cities, streets };

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, gzipSync(JSON.stringify(out), { level: 9 }));
const streetCount = Object.values(streets).reduce((s, l) => s + l.length, 0);
console.log(`wrote ${path.relative(ROOT, OUT)}: ${cities.length} localities, ${streetCount} streets`);
