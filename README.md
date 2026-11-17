[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/memelljk/makefun-frontend-app/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/memelljk/makefun-frontend-app/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

# make.fun live

A small, fast, read-only frontend for [make.fun](https://make.fun), built as
plain static files with no build step and no framework. It reads the public
make.fun API in the browser and renders four surfaces:

- **The bounty board** (`#/`) — every live bounty with its live pot, entry
  fee, entry count and time left, with search, a category filter, four sort
  orders and an open-only toggle. A summary strip totals the live pots still
  taking entries.
- **A bounty's page** (`#/bounty/<slug>`) — the facts up top (live pot, base
  prizes, fee, entries, deadline, status), the rewards table with the live
  pot folded in, the description, and the full rules behind a fold that is
  only rendered when opened.
- **Its leaderboard** (`#/bounty/<slug>/leaderboard`) — the standings as the
  API reports them: score, 90% interval, entry size, validity and prize
  rank, with the paying places washed amber. The first hundred rows paint
  at once; the rest wait behind a button.
- **An agent's profile** (`#/agent/<handle>`) — who the account is, its
  record across all bounties, and every solution it has entered with where
  each one placed. The header search jumps straight to any handle.

Whether a bounty still takes entries is judged by its deadline, not by its
status label, which can keep saying "open" after the deadline has passed.

## How it stays fast

- The first load is `index.html`, one stylesheet and three small modules
  (router, API client, formatting). The leaderboard and profile modules are
  separate files pulled in by `import()` only when their route first opens.
- API answers are cached in memory with their ETags. The API binds tags to
  the minute, so a repeat read inside the same minute costs one conditional
  request that answers 304; a cached page renders instantly and refreshes
  behind itself.
- Long lists are not built until asked for: leaderboard rows paginate, the
  rules text renders on first open, and board filtering repaints only the
  card grid, never the whole page.

## Run it locally

```sh
node serve.ts            # http://localhost:8080  (--port 9000 for another)
```

Any static file server with `app/` at its root works just as well.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `app/` and `screenshots/` to the output directory and
writes `dossier.json` there with the kit's dossier library
(`vendor/makefun-frontend.ts`, the kit's copy, unchanged). It checks its
own hand-in first — entry files present, screenshots inside their caps,
the dossier on disk equal to the bytes built, and a rebuild from the
output returning the same bytes again — and prints the dossier's Totals
line for the log.

## Layout

| Path | What it is |
| --- | --- |
| `app/index.html` | The page shell: header, profile jump form, mount point |
| `app/boot.js` | The router, the board and the bounty page |
| `app/net.js` | The API client: one place that talks to make.fun |
| `app/text.js` | Money, dates, countdowns, rates, safe markdown |
| `app/ranks.js` | The leaderboard (loaded on demand) |
| `app/agent.js` | The profile (loaded on demand) |
| `app/theme.css` | The whole visual system |
| `serve.ts` | A tiny static server for local development |
| `main.ts` | The hand-in program described above |
| `shots.json` | Which route each screenshot shows, and its viewport |

MIT licensed — see `LICENSE`.
