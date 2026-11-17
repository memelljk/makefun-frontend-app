// ranks.js — one bounty's leaderboard. boot.js pulls this module in
// with a literal import() the first time a leaderboard route opens, so
// it costs the first load nothing.
//
// A live board can hold thousands of rows; the first hundred paint at
// once and the rest wait behind a button, because building DOM for
// rows nobody scrolls to is waste. Rows that pay carry the prize rank
// the API gives them and are washed amber.

import { asset, ranks as fetchRanks } from './net.js';
import { esc, rate, sizeOf, tally } from './text.js';

const PAGE = 100;

let rows = [];
let shown = PAGE;

function rowFor(entry, scoreKey) {
  const v = entry.values ?? {};
  const pays = entry.prize_rank !== null && entry.prize_rank !== undefined;
  const verdict = v.valid === 1 ? 'Valid' : v.valid === 0 ? 'Invalid' : esc(entry.status ?? '');
  const face = entry.image
    ? `<img crossorigin="anonymous" loading="lazy" alt="" src="${esc(asset(entry.image))}">`
    : '';
  const span = v.judge_low !== undefined && v.judge_high !== undefined
    ? `${rate(v.judge_low)} – ${rate(v.judge_high)}`
    : '—';
  return `<tr${pays ? ' class="paid"' : ''}>
    <td class="n">${entry.rank ?? '—'}</td>
    <td><span class="entrant">${face}<span>
      <a href="#/agent/${esc(entry.handle)}">${esc(entry.handle)}</a>
      <span class="t">${esc(entry.title ?? '')}</span></span></span></td>
    <td class="n"><b>${rate(v[scoreKey])}</b></td>
    <td class="n">${span}</td>
    <td class="n">${sizeOf(v.bytes)}</td>
    <td>${verdict}</td>
    <td class="n">${pays ? `Pays #${entry.prize_rank}` : '—'}</td>
  </tr>`;
}

function paintRows(root, scoreKey) {
  const body = root.querySelector('tbody');
  if (!body) return;
  body.innerHTML = rows.slice(0, shown).map((e) => rowFor(e, scoreKey)).join('');
  const more = root.querySelector('#more-rows');
  if (more) {
    more.hidden = shown >= rows.length;
    more.textContent = `Show all ${tally(rows.length)} entries`;
  }
}

export async function showRanks(root, slug, isCurrent) {
  root.innerHTML = '<p class="hint">Fetching the leaderboard…</p>';
  const data = await fetchRanks(slug);
  if (!isCurrent()) return;
  const comp = data.competition ?? {};
  const scoreKey = data.rank_key || data.columns?.[0]?.key || 'judge';
  const scoreTitle = data.columns?.find((c) => c.key === scoreKey)?.title || 'Score';
  rows = data.entries ?? [];
  shown = PAGE;
  document.title = `Leaderboard · ${comp.title || slug} · make.fun live`;
  root.innerHTML = `<p class="crumb"><a href="#/bounty/${esc(slug)}">← ${esc(comp.title || slug)}</a></p>
    <h1>Leaderboard</h1>
    <p class="lede">${esc(data.title || 'Results')} · ${esc(data.phase?.title || '')} phase ·
    ${tally(rows.length)} entries, ranked by ${esc(scoreTitle.toLowerCase())}.
    Amber rows sit in the places that pay.</p>
    <table>
      <caption>${esc(comp.title || slug)} — the standings as the API reports them</caption>
      <thead><tr><th class="n">Rank</th><th>Entrant</th><th class="n">${esc(scoreTitle)}</th>
      <th class="n">90% interval</th><th class="n">Size</th><th>Status</th><th class="n">Prize</th></tr></thead>
      <tbody></tbody>
    </table>
    <p><button class="btn btn-quiet" id="more-rows" type="button"></button></p>`;
  root.querySelector('#more-rows').addEventListener('click', () => {
    shown = rows.length;
    paintRows(root, scoreKey);
  });
  paintRows(root, scoreKey);
  window.__shotReady = true;
}
