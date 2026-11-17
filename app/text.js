// text.js — presenting what the API sends: money, counts, dates,
// countdowns, rates, sizes, and a small safe renderer for the light
// markdown of bounty descriptions.

const DASH = '—';

const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const grouped = new Intl.NumberFormat('en-US');
const dayPart = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const timePart = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

// Money shows up as numbers (rewardAmount) and as decimal strings
// (potUsd, the rewards table). Both are welcome here.
export function usd(value) {
  if (value === null || value === undefined || value === '') return DASH;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return DASH;
  return Number.isInteger(n) ? usdWhole.format(n) : usdCents.format(n);
}

export function tally(value) {
  return value === null || value === undefined ? DASH : grouped.format(value);
}

export function stamp(iso) {
  if (!iso) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : `${dayPart.format(d)}, ${timePart.format(d)}`;
}

// Countdowns in the units a reader scans: "2d 5h left", "7h 3m left",
// "12m left", "40s left"; past a deadline, "closed 2d ago" and kin.
export function left(iso, now = Date.now()) {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(at)) return 'no deadline set';
  const diff = at - now;
  const span = Math.abs(diff);
  const parts = [];
  const days = Math.floor(span / 86400000);
  const hours = Math.floor((span % 86400000) / 3600000);
  const mins = Math.floor((span % 3600000) / 60000);
  const secs = Math.floor((span % 60000) / 1000);
  if (days > 0) parts.push(`${days}d`, `${hours}h`);
  else if (hours > 0) parts.push(`${hours}h`, `${mins}m`);
  else if (mins > 0) parts.push(`${mins}m`);
  else parts.push(`${secs}s`);
  const words = parts.join(' ');
  return diff >= 0 ? `${words} left` : `closed ${words} ago`;
}

// A bounty's status can keep saying "open" after its deadline passes;
// entries are taken only while the deadline is still ahead and the API
// has not shut the door itself.
export function accepting(b, now = Date.now()) {
  if (!b || b.acceptingSubmissions === false) return false;
  if (b.deadline) return Date.parse(b.deadline) > now;
  return b.status === 'open';
}

// Leaderboard scores are micro-units: 956066 is a 95.6066% win rate.
export function rate(micro) {
  if (micro === null || micro === undefined) return DASH;
  return `${(micro / 10000).toFixed(2)}%`;
}

export function sizeOf(bytes) {
  if (bytes === null || bytes === undefined) return DASH;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

// --- safe text and light markdown ---

const ESCAPE_MAP = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP.get(ch));
}

// Inline marks, applied to already-escaped text: **bold**, `code`, and
// [label](https://…) links. Anything else stays literal text.
function inline(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener" target="_blank">$1</a>');
}

const isBullet = (line) => /^\s*[-*]\s+/.test(line);
const isNumbered = (line) => /^\s*\d+[.)]\s+/.test(line);
const stripMark = (line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '');

// md(src): render description prose. Blocks are gathered line by line:
// a heading stands alone, consecutive list lines form one list, and any
// other run of lines becomes a paragraph whose wrapped lines join with
// a space. Every character is escaped before any mark is applied, so
// API prose can never inject markup of its own.
export function md(src) {
  const lines = String(src ?? '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i += 1; continue; }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      out.push(`<h3>${inline(esc(heading[2]))}</h3>`);
      i += 1;
      continue;
    }
    if (isBullet(line) || isNumbered(line)) {
      const tag = isNumbered(line) ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length) {
        const item = lines[i].trim();
        if (!(isBullet(item) || isNumbered(item))) break;
        items.push(`<li>${inline(esc(stripMark(item)))}</li>`);
        i += 1;
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }
    const para = [];
    while (i < lines.length) {
      const part = lines[i].trim();
      if (!part || /^(#{1,4})\s/.test(part) || isBullet(part) || isNumbered(part)) break;
      para.push(part);
      i += 1;
    }
    out.push(`<p>${inline(esc(para.join(' ')))}</p>`);
  }
  return out.join('');
}
