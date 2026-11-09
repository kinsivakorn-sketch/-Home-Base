/* Collects today's headlines (no summaries) from Google News RSS and writes news.json.
   Runs every morning in GitHub Actions. Needs Node 18+, no packages. */
import { readFileSync, writeFileSync } from 'node:fs';

const wl = JSON.parse(readFileSync(new URL('../watchlist.json', import.meta.url), 'utf8'));
const OUT = new URL('../news.json', import.meta.url);
const FIXTURE = process.env.NEWS_FIXTURE_FILE; /* tests only: read this XML instead of the web */
const TZ = 'Asia/Bangkok';

const dkey = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const unesc = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
  .replace(/&amp;/g, '&');

const tag = (block, name) => {
  const m = block.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>'));
  return m ? unesc(m[1]).trim() : '';
};

export function parse(xml) {
  const items = [], re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    let title = tag(b, 'title');
    const source = tag(b, 'source'), url = tag(b, 'link'), pub = new Date(tag(b, 'pubDate'));
    if (!title || !/^https?:\/\//.test(url)) continue;
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3)).trim();
    items.push({ title, source, url, t: isNaN(pub) ? 0 : pub.getTime() });
  }
  return items;
}

async function fetchItems(q) {
  if (FIXTURE) return parse(readFileSync(FIXTURE, 'utf8'));
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=th&gl=TH&ceid=TH:th';
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; HomeBaseNews/1.0)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return parse(await r.text());
  } finally { clearTimeout(to); }
}

export function pick(lists, max, maxAgeDays, perSource) {
  const seen = new Set(), bySrc = {}, out = [], cutoff = Date.now() - maxAgeDays * 864e5;
  lists.flat().sort((a, b) => b.t - a.t).forEach(it => {
    const k = it.title.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(k) || (it.t && it.t < cutoff)) return;
    if (perSource && (bySrc[it.source] || 0) >= perSource) return;
    seen.add(k); bySrc[it.source] = (bySrc[it.source] || 0) + 1; out.push(it);
  });
  return out.slice(0, max).map(it => ({ source: it.source, date: it.t ? dkey(new Date(it.t)) : '', url: it.url, th: { title: it.title, summary: '' } }));
}

async function safe(q) {
  try { return await fetchItems(q); } catch (e) { console.error('query failed:', q, String(e.message || e)); return []; }
}

async function main() {
  const marketLists = [];
  for (const q of ['ตลาดหุ้นไทย SET Index when:2d', 'หุ้นไทย ปิดตลาด when:2d', 'SET Index หุ้นไทย when:2d']) {
    marketLists.push(await safe(q)); if (!FIXTURE) await sleep(500);
  }
  const market = pick(marketLists, 8, 3, 2);

  const stocks = [];
  for (const sym of wl.symbols) {
    const items = pick([await safe('"' + sym + '" หุ้น when:3d')], 3, 4, 2);
    if (items.length) stocks.push({ sym, items });
    if (!FIXTURE) await sleep(500);
  }

  if (!market.length && !stocks.length) { console.error('Nothing fetched; keeping the old news.json'); process.exit(1); }
  const now = new Date();
  writeFileSync(OUT, JSON.stringify({ date: dkey(now), updatedAt: now.toISOString(), market, stocks, prices: {} }, null, 1) + '\n');
  console.log('news.json written:', market.length, 'market,', stocks.length, 'stocks with news');
}

if (import.meta.url === 'file://' + process.argv[1]) main();
