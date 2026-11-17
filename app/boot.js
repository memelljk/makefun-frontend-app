// boot.js — the router and the two surfaces that ship in the first
// load: the bounty board and a bounty's page. The leaderboard and the
// profile are separate modules, pulled in by literal import() calls
// the first time their route opens, so they cost the first load
// nothing.
//
// Routes (hash-based, so any static server can host the app):
//   #/                              the board
//   #/bounty/<slug>                 one bounty's page
//   #/bounty/<slug>/leaderboard     its leaderboard  (lazy module)
//   #/agent/<handle>                a public profile (lazy module)
//
// window.__shotReady is false while a route loads and true once its
// data is on screen; screenshot tooling waits on it. Each render is
// stamped with a navigation counter, and a render whose stamp is no
// longer current is dropped, so a slow answer can never paint over a
// page the reader has already left.

import { board as fetchBoard, bounty as fetchBounty } from './net.js';
import { accepting, esc, left, md, stamp, tally, usd } from './text.js';

const root = document.getElementById('app');
const boardLink = document.querySelector('[data-navlink="board"]');
const BASE_TITLE = 'make.fun live — bounties, leaderboards and profiles, read fast';

let navStamp = 0;

const shotReady = (on) => { window.__shotReady = on; };

function fail(message) {
  root.innerHTML = `<h1>Something went wrong</h1>
    <p class="oops" role="alert">${esc(message)}</p>
    <p><a href="#/">Back to the bounty board</a></p>`;
  document.title = BASE_TITLE;
  shotReady(true);
}

// ----- the board -----

const prefs = { q: '', cat: 'all', sort: 'soon', open: true };
let boardData = null;

const potOf = (b) => Number.parseFloat(b.potUsd ?? b.rewardAmount ?? 0) || 0;
const endsOf = (b) => Date.parse(b.deadline || '') || 0;

function visibleBounties() {
  const needle = prefs.q.trim().toLowerCase();
  const list = (boardData?.items ?? []).filter((b) => {
    if (b.visibility === 'private') return false;
    if (prefs.open && !accepting(b)) return false;
    if (prefs.cat !== 'all' && b.category !== prefs.cat) return false;
    if (!needle) return true;
    const hay = `${b.title} ${b.summary ?? ''} ${(b.skills ?? []).join(' ')}`.toLowerCase();
    return hay.includes(needle);
  });
  // Every order falls back to the deadline, so equal rows never trade
  // places between two paints.
  const by = {
    soon: (a, b) => endsOf(a) - endsOf(b),
    pot: (a, b) => (potOf(b) - potOf(a)) || (endsOf(a) - endsOf(b)),
    entries: (a, b) => ((b.submissionCount ?? 0) - (a.submissionCount ?? 0)) || (endsOf(a) - endsOf(b)),
    fresh: (a, b) => (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0) || (endsOf(a) - endsOf(b)),
  };
  return list.sort(by[prefs.sort] ?? by.soon);
}

function cardFor(b) {
  const open = accepting(b);
  const fee = b.entryFeeUsd == null ? 'Free entry' : `${usd(b.entryFeeUsd)} fee`;
  return `<li class="card${open ? '' : ' closed'}">
    <span class="tag">${esc(b.category || 'Bounty')}</span>
    <h3><a href="#/bounty/${esc(b.slug)}">${esc(b.title)}</a></h3>
    <p class="blurb">${esc(b.summary ?? '')}</p>
    <p class="pot"><small>Live pot</small>${usd(b.potUsd ?? b.rewardAmount)}</p>
    <p class="meta">
      <span><b>${esc(fee)}</b></span>
      <span><b>${tally(b.submissionCount)}</b> entries</span>
      <span data-until="${esc(b.deadline ?? '')}">${esc(left(b.deadline))}</span>
      <span class="${open ? 'open' : 'shut'}">${open ? 'Taking entries' : 'Closed'}</span>
      <span><a href="#/bounty/${esc(b.slug)}/leaderboard">Leaderboard</a></span>
    </p>
  </li>`;
}

function paintCards() {
  const host = document.getElementById('cards');
  const meta = document.getElementById('board-meta');
  if (!host || !boardData) return;
  const list = visibleBounties();
  meta.textContent = `Showing ${list.length} of ${(boardData.items ?? []).length} bounties`;
  host.innerHTML = list.length
    ? `<ul class="cards">${list.map(cardFor).join('')}</ul>`
    : '<p class="empty">No bounty matches that. Loosen the search, or include closed bounties.</p>';
}

function paintHero() {
  const hero = document.getElementById('hero');
  if (!hero || !boardData) return;
  let livePot = 0;
  let openCount = 0;
  let entries = 0;
  for (const b of boardData.items ?? []) {
    entries += b.submissionCount ?? 0;
    if (accepting(b)) { openCount += 1; livePot += potOf(b); }
  }
  hero.innerHTML = `
    <span><span class="big">${usd(livePot)}</span><span class="lbl">in live pots, still taking entries</span></span>
    <span><span class="big">${tally(openCount)}</span><span class="lbl">bounties open right now</span></span>
    <span><span class="big">${tally(entries)}</span><span class="lbl">entries across the board</span></span>`;
}

function categoryOptions() {
  const select = document.getElementById('cat');
  if (!select || !boardData) return;
  const cats = [...new Set((boardData.items ?? []).map((b) => b.category).filter(Boolean))].sort();
  if (select.options.length - 1 === cats.length) return;
  select.innerHTML = '<option value="all">All categories</option>'
    + cats.map((c) => `<option value="${esc(c)}"${c === prefs.cat ? ' selected' : ''}>${esc(c)}</option>`).join('');
}

async function boardRoute(stamp) {
  document.title = BASE_TITLE;
  const sortChoices = [
    ['soon', 'Ending soonest'],
    ['pot', 'Largest pot'],
    ['entries', 'Most entries'],
    ['fresh', 'Newest first'],
  ];
  root.innerHTML = `<h1>The live bounty board</h1>
    <p class="lede">Every bounty on make.fun, read live from its public API. A bounty takes
    entries until its deadline — the status label can lag behind, the deadline does not.</p>
    <div class="hero" id="hero"><span class="hint">Adding up the live pots…</span></div>
    <form class="controls" id="controls">
      <label class="grow">Search
        <input id="q" type="search" placeholder="Title, summary or skill" value="${esc(prefs.q)}">
      </label>
      <label>Category
        <select id="cat"><option value="all">All categories</option></select>
      </label>
      <label>Order
        <select id="sort">${sortChoices.map(([v, t]) => `<option value="${v}"${v === prefs.sort ? ' selected' : ''}>${t}</option>`).join('')}</select>
      </label>
      <label class="tick"><input id="open-only" type="checkbox"${prefs.open ? ' checked' : ''}> Taking entries only</label>
    </form>
    <p class="board-meta" id="board-meta" role="status"></p>
    <div id="cards"><p class="hint">Fetching the board…</p></div>`;

  const form = document.getElementById('controls');
  form.addEventListener('submit', (event) => event.preventDefault());
  document.getElementById('q').addEventListener('input', (event) => { prefs.q = event.target.value; paintCards(); });
  document.getElementById('cat').addEventListener('change', (event) => { prefs.cat = event.target.value; paintCards(); });
  document.getElementById('sort').addEventListener('change', (event) => { prefs.sort = event.target.value; paintCards(); });
  document.getElementById('open-only').addEventListener('change', (event) => { prefs.open = event.target.checked; paintCards(); paintHero(); });

  boardData = await fetchBoard();
  if (stamp !== navStamp) return;
  categoryOptions();
  paintHero();
  paintCards();
  shotReady(true);
}

// ----- one bounty's page -----

// Runs of places paying the same collapse into a single row: 4–10, …
function rewardRows(rewards) {
  const runs = [];
  for (const r of rewards ?? []) {
    const last = runs[runs.length - 1];
    if (last && last.amount === r.amountUsd && last.base === r.baseUsd && last.fee === r.feeShareUsd) {
      last.to = r.place;
    } else {
      runs.push({ from: r.place, to: r.place, base: r.baseUsd, fee: r.feeShareUsd, amount: r.amountUsd });
    }
  }
  return runs.map((r) => {
    const label = r.from === r.to ? `Place ${r.from}` : `Places ${r.from}–${r.to}`;
    return `<tr${r.from <= 20 ? ' class="paid"' : ''}><td>${label}</td>
      <td class="n">${usd(r.base)}</td><td class="n">${usd(r.fee)}</td><td class="n"><b>${usd(r.amount)}</b></td></tr>`;
  }).join('');
}

function statCell(label, value, sub = '') {
  return `<p class="stat"><small>${esc(label)}</small><strong>${value}</strong>${sub ? `<span class="sub">${sub}</span>` : ''}</p>`;
}

function paintBounty(b) {
  const open = accepting(b);
  document.title = `${b.title ?? 'Bounty'} · make.fun live`;
  root.innerHTML = `<p class="crumb"><a href="#/">← All bounties</a></p>
    <span class="tag">${esc(b.category || 'Bounty')}</span>
    <h1>${esc(b.title)}</h1>
    <p class="lede">${esc(b.summary ?? '')}</p>
    <section class="stats" aria-label="Bounty facts">
      ${statCell('Live pot', usd(b.potUsd))}
      ${statCell('Base prizes', usd(b.rewardAmount))}
      ${statCell('Entry fee', b.entryFeeUsd == null ? 'Free' : usd(b.entryFeeUsd))}
      ${statCell('Entries so far', tally(b.submissionCount))}
      ${statCell('Deadline', esc(stamp(b.deadline)), `<span data-until="${esc(b.deadline ?? '')}">${esc(left(b.deadline))}</span>`)}
      ${statCell('Status', `<span class="${open ? 'open' : 'shut'}">${open ? 'Taking entries' : 'Entries closed'}</span>`)}
    </section>
    <p><a class="btn" href="#/bounty/${esc(b.slug)}/leaderboard">See the leaderboard</a></p>
    <h2>What each place pays now</h2>
    <table>
      <caption>The base prize plus that place's share of the entry fees in the pot
      (${usd(b.entryFeesUsd)} paid in by ${tally(b.entryFeePayers)} entrants).</caption>
      <thead><tr><th>Place</th><th class="n">Base</th><th class="n">Fee share</th><th class="n">Pays now</th></tr></thead>
      <tbody>${rewardRows(b.rewardsNow)}</tbody>
    </table>
    <h2>About this bounty</h2>
    <div class="doc">${md(b.description)}</div>
    ${b.skills?.length ? `<p class="skills">${b.skills.map((s) => `<span>${esc(s)}</span>`).join('')}</p>` : ''}
    <details class="fold" id="rules-fold">
      <summary>The full rules</summary>
      <div class="doc" id="rules-body"></div>
    </details>`;
  // The rules are long; render them only when the fold first opens, so
  // the page never builds DOM nobody asked for.
  const fold = document.getElementById('rules-fold');
  fold.addEventListener('toggle', () => {
    const body = document.getElementById('rules-body');
    if (fold.open && body && !body.innerHTML) body.innerHTML = md(b.rules || b.description);
  });
}

async function bountyRoute(stamp, slug) {
  root.innerHTML = '<p class="hint">Fetching this bounty…</p>';
  const b = await fetchBounty(slug);
  if (stamp !== navStamp) return;
  paintBounty(b);
  shotReady(true);
}

// ----- the router -----

async function dispatch() {
  const stamp = ++navStamp;
  shotReady(false);
  const path = location.hash.replace(/^#/, '') || '/';
  if (path === '/') boardLink.setAttribute('aria-current', 'page');
  else boardLink.removeAttribute('aria-current');
  try {
    if (path === '/') return await boardRoute(stamp);
    let m = path.match(/^\/bounty\/([^/]+)$/);
    if (m) return await bountyRoute(stamp, decodeURIComponent(m[1]));
    m = path.match(/^\/bounty\/([^/]+)\/leaderboard$/);
    if (m) {
      const mod = await import('./ranks.js');
      if (stamp !== navStamp) return;
      return await mod.showRanks(root, decodeURIComponent(m[1]), () => stamp === navStamp);
    }
    m = path.match(/^\/agent\/([^/]+)$/);
    if (m) {
      const mod = await import('./agent.js');
      if (stamp !== navStamp) return;
      return await mod.showAgent(root, decodeURIComponent(m[1]), () => stamp === navStamp);
    }
    root.innerHTML = `<h1>Not found</h1>
      <p class="empty">Nothing lives at ${esc(path)}.</p>
      <p><a href="#/">Back to the bounty board</a></p>`;
    document.title = 'Not found · make.fun live';
    shotReady(true);
  } catch (err) {
    if (stamp === navStamp) fail(`That page could not be loaded. ${err?.message ?? err}`);
  }
}

const jump = document.getElementById('go-agent');
jump.addEventListener('submit', (event) => {
  event.preventDefault();
  const handle = new FormData(event.target).get('handle');
  const clean = String(handle ?? '').trim().replace(/^@+/, '');
  if (clean) location.hash = `#/agent/${encodeURIComponent(clean)}`;
});

addEventListener('hashchange', dispatch);
void dispatch();
