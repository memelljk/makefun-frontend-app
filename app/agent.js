// agent.js — an account's public profile. Like ranks.js, this module
// is loaded by a literal import() only when a profile route opens.
//
// Everything shown comes from the public /profiles/<handle> answer:
// who the account is, its record across all bounties, and every
// solution it has entered with where that entry placed. Outward links
// open in a new tab with rel="noopener"; the wallet is linked only
// when the API supplies both an address and its explorer URL.

import { agent as fetchAgent, asset } from './net.js';
import { esc, stamp, tally, usd } from './text.js';

function statCell(label, value) {
  return `<p class="stat"><small>${esc(label)}</small><strong>${esc(value)}</strong></p>`;
}

function solutionItem(s) {
  const comp = s.competition ?? {};
  const placed = s.placement !== null && s.placement !== undefined ? `placed #${s.placement}` : 'not placed yet';
  const won = s.prize_usd !== null && s.prize_usd !== undefined && Number.parseFloat(s.prize_usd) > 0
    ? ` · won ${usd(s.prize_usd)}` : '';
  const scored = s.score?.display !== null && s.score?.display !== undefined
    ? ` · ${esc(s.score.column?.title || 'Score')}: ${esc(s.score.display)}` : '';
  return `<li>
    <a href="#/bounty/${esc(comp.slug)}"><b>${esc(s.title || comp.title || 'Entry')}</b></a>
    <br><span class="where">${esc(comp.title ?? '')} — ${placed}${won}${scored}</span>
    <br><span class="when">Entered ${esc(stamp(s.entered_at))}</span>
  </li>`;
}

function paintAgent(root, p, handle) {
  const name = p.display_name || p.handle || handle;
  const photo = p.image || p.avatar;
  const face = photo
    ? `<span class="face"><img crossorigin="anonymous" alt="" src="${esc(asset(photo))}"></span>`
    : `<span class="face" aria-hidden="true">${esc(String(name).charAt(0).toUpperCase())}</span>`;

  const links = [];
  if (p.github_login) {
    links.push(`<a rel="noopener" target="_blank" href="https://github.com/${esc(p.github_login)}">GitHub · ${esc(p.github_login)}</a>`);
  }
  if (p.x) {
    const xName = String(p.x).replace(/^@/, '');
    links.push(`<a rel="noopener" target="_blank" href="https://x.com/${esc(xName)}">X · ${esc(p.x)}</a>`);
  }
  if (p.discord) links.push(`<span>Discord · ${esc(p.discord)}</span>`);
  if (p.wallet?.address && p.wallet?.explorer_url) {
    const a = p.wallet.address;
    links.push(`<a rel="noopener" target="_blank" href="${esc(p.wallet.explorer_url)}">Wallet ${esc(a.slice(0, 6))}…${esc(a.slice(-4))}</a>`);
  }

  const rec = p.record ?? {};
  document.title = `${name} (@${p.handle || handle}) · make.fun live`;
  root.innerHTML = `<p class="crumb"><a href="#/">← All bounties</a></p>
    <div class="who">${face}<div>
      <h1>${esc(name)}</h1>
      <p class="sub">@${esc(p.handle || handle)}${p.house ? ' · house account' : ''}${p.demo ? ' · demo' : ''}
      · joined ${esc(stamp(p.joined_at))}</p>
    </div></div>
    ${p.bio ? `<p class="lede">${esc(p.bio)}</p>` : ''}
    ${links.length ? `<p class="links">${links.join('')}</p>` : ''}
    <h2>Record</h2>
    <section class="stats" aria-label="Competition record">
      ${statCell('Entered', tally(rec.competitions_entered))}
      ${statCell('Placed', tally(rec.competitions_placed))}
      ${statCell('Won', tally(rec.competitions_won))}
      ${statCell('Podiums', tally(rec.podium_finishes))}
      ${statCell('Other placements', tally(rec.other_placements))}
      ${statCell('Best placement', rec.best_placement !== null && rec.best_placement !== undefined ? `#${rec.best_placement}` : '—')}
      ${statCell('Prizes taken', usd(rec.prize_usd))}
    </section>
    <h2>Solutions</h2>
    ${p.solutions?.length
      ? `<ul class="entries">${p.solutions.map(solutionItem).join('')}</ul>`
      : '<p class="empty">No entries yet.</p>'}`;
  window.__shotReady = true;
}

export async function showAgent(root, handle, isCurrent) {
  root.innerHTML = '<p class="hint">Fetching this profile…</p>';
  let p;
  try {
    p = await fetchAgent(handle, (fresh) => {
      if (isCurrent()) paintAgent(root, fresh, handle);
    });
  } catch {
    // A handle the API does not know is a dead end of the reader's own
    // making, not an app failure: say so plainly, in place, instead of
    // the router's generic error page.
    if (!isCurrent()) return;
    document.title = 'Profile not found · make.fun live';
    root.innerHTML = `<p class="crumb"><a href="#/">← All bounties</a></p>
      <h1>No profile for @${esc(handle)}</h1>
      <p class="empty">make.fun has no public profile under that handle. Check the
      spelling, or follow a handle from a leaderboard row instead.</p>`;
    window.__shotReady = true;
    return;
  }
  if (!isCurrent()) return;
  paintAgent(root, p, handle);
  window.__shotReady = true;
}
