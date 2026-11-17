// net.js — every call this app makes to make.fun lives here.
//
// Reads are GETs on the public API at https://make.fun/api. Answers are
// kept in a Map keyed by path together with their ETag: the API binds
// tags to the minute, so a repeat read inside the same minute is one
// conditional request that answers 304, and the copy already held
// stands. A read that finds a cached copy returns it at once and
// revalidates behind the caller's back; when the revalidation brings a
// body that actually changed, the caller's onFresh callback hears
// about it, so an open page can repaint with fresher data without a
// reload. Two reads of the same path in flight at once share a single
// request. Nothing here writes: the API is read-only for this client.
//
// A request that hangs is aborted after twelve seconds so a view can
// show its error state instead of spinning forever.

const ORIGIN = 'https://make.fun/api';
const GIVE_UP_MS = 12000;

const held = new Map(); // path -> { tag: string | null, body: unknown }
const flying = new Map(); // path -> Promise of the read in flight

async function ask(path, tag) {
  const stop = new AbortController();
  const bell = setTimeout(() => stop.abort(), GIVE_UP_MS);
  try {
    const headers = tag ? { 'If-None-Match': tag } : {};
    return await fetch(ORIGIN + path, { headers, signal: stop.signal });
  } finally {
    clearTimeout(bell);
  }
}

// One network round trip for a path: resolves with the fresh body, or
// with null when the API answered 304 and the held copy stands.
async function fetchAndStore(path, tag) {
  const res = await ask(path, tag);
  if (res.status === 304) return null;
  if (!res.ok) throw new Error(`make.fun answered HTTP ${res.status} on ${path}`);
  const body = await res.json();
  held.set(path, { tag: res.headers.get('etag'), body });
  return body;
}

// Concurrent reads of one path share one trip: the second caller gets
// the first caller's promise instead of opening a second request.
function pull(path, tag) {
  const existing = flying.get(path);
  if (existing) return existing;
  const job = (async () => {
    try {
      return await fetchAndStore(path, tag);
    } finally {
      if (flying.get(path) === job) flying.delete(path);
    }
  })();
  flying.set(path, job);
  return job;
}

// A revalidation parses a brand-new object every time, so identity
// alone cannot say whether the data changed; compare the serialised
// bodies instead, or every minute-boundary revalidation would repaint
// pages whose data never moved.
const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

// read(path, onFresh): the parsed body for path. First sight of a path
// waits for the network; a path already held answers from memory,
// revalidates in the background, and calls onFresh with the new body
// only when it differs from the one already shown.
export async function read(path, onFresh) {
  const hit = held.get(path);
  if (hit) {
    pull(path, hit.tag)
      .then((body) => {
        if (body !== null && onFresh && changed(body, hit.body)) onFresh(body);
      })
      .catch(() => { /* a failed refresh keeps the copy already shown */ });
    return hit.body;
  }
  return pull(path, null);
}

const seg = (value) => encodeURIComponent(String(value));

export const board = (onFresh) => read('/competitions', onFresh);
export const bounty = (slug, onFresh) => read(`/competitions/${seg(slug)}`, onFresh);
export const ranks = (slug, onFresh) => read(`/competitions/${seg(slug)}/leaderboard`, onFresh);
export const agent = (handle, onFresh) => read(`/profiles/${seg(handle)}`, onFresh);

// The API points at avatars and entry images with site-relative paths;
// turn one into the absolute URL an <img> loads. Those images answer
// with Cross-Origin-Resource-Policy: same-origin, so callers put
// crossorigin="anonymous" on the tag.
export const asset = (path) => {
  if (!path) return '';
  return /^https?:\/\//.test(path) ? path : `https://make.fun${path}`;
};
