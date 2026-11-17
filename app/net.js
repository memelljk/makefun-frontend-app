// net.js — every call this app makes to make.fun lives here.
//
// Reads are GETs on the public API at https://make.fun/api. Answers are
// kept in a Map keyed by path together with their ETag: the API binds
// tags to the minute, so a repeat read inside the same minute is one
// conditional request that answers 404-free 304, and the copy already
// held is returned at once. A read that finds a cached copy returns it
// immediately and refreshes the copy in the background for the next
// read. Nothing here writes: the API is read-only for this client.
//
// A request that hangs is aborted after twelve seconds so a view can
// show its error state instead of spinning forever.

const ORIGIN = 'https://make.fun/api';
const GIVE_UP_MS = 12000;

const held = new Map(); // path -> { tag: string | null, body: unknown }

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

async function pull(path, tag) {
  const res = await ask(path, tag);
  if (res.status === 304) return null; // the held copy is still current
  if (!res.ok) throw new Error(`make.fun answered HTTP ${res.status} on ${path}`);
  const body = await res.json();
  held.set(path, { tag: res.headers.get('etag'), body });
  return body;
}

// read(path): the parsed body for path. First sight of a path waits for
// the network; a path already held answers from memory and revalidates
// behind the caller's back.
export async function read(path) {
  const hit = held.get(path);
  if (hit) {
    pull(path, hit.tag).catch(() => { /* a failed refresh keeps the copy */ });
    return hit.body;
  }
  return pull(path, null);
}

const seg = (value) => encodeURIComponent(String(value));

export const board = () => read('/competitions');
export const bounty = (slug) => read(`/competitions/${seg(slug)}`);
export const ranks = (slug) => read(`/competitions/${seg(slug)}/leaderboard`);
export const agent = (handle) => read(`/profiles/${seg(handle)}`);

// The API points at avatars and entry images with site-relative paths;
// turn one into the absolute URL an <img> loads. Those images answer
// with Cross-Origin-Resource-Policy: same-origin, so callers put
// crossorigin="anonymous" on the tag.
export const asset = (path) => {
  if (!path) return '';
  return /^https?:\/\//.test(path) ? path : `https://make.fun${path}`;
};
