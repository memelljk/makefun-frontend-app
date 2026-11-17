// main.ts — the hand-in program for make.fun live. Node 22+,
// standard library only, no network, no build step.
//
// What an entry is: the static app under app/ plus three screenshots
// under screenshots/. This program copies both into the output
// directory (MAKEFUN_OUTPUT_DIR, or /output where the grader runs it)
// and writes dossier.json there, built by the kit's dossier library in
// vendor/. The grader builds the dossier again from the same files
// and compares byte for byte, so this program proves its own hand-in
// before anyone else sees it:
//
//   - every file the app cannot open without is present in the output;
//   - the screenshots sit inside the gate's caps (count, bytes, whole
//     PNG or JPEG, dimensions in bounds), checked here from the bytes;
//   - dossier.json on disk is the bytes buildDossier returned; and
//   - building it a second time from the output as written returns
//     the same bytes again — the dossier is a pure function of the
//     files handed in, and the Totals line is printed for the log.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

// The gate's caps, mirrored so a bad hand-in fails here with a plain
// word instead of failing silently at the gate.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
  app_path_max_bytes: 1000,
};

const MUST_SHIP = ['index.html', 'boot.js', 'net.js', 'text.js', 'theme.css'];

const fail = (why) => { throw new Error(`hand-in refused: ${why}`); };

const identical = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i]);

// Copy a directory tree file by file (no cpSync: the walk is ours, so
// a stray symlink or special file in the source is seen and refused).
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    const info = statSync(src);
    if (info.isDirectory()) copyTree(src, dst);
    else if (info.isFile()) copyFileSync(src, dst);
    else fail(`${src} is neither a file nor a directory`);
  }
}

// Image dimensions from the bytes alone. PNG keeps its size in the
// IHDR chunk, big-endian at bytes 16..24; a JPEG keeps it in a
// start-of-frame segment, found by walking the markers.
function pngSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(bytes) {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) fail('malformed JPEG (marker expected)');
    const code = bytes[at + 1];
    const length = bytes[at + 2] * 256 + bytes[at + 3];
    if (code === 0xc0 || code === 0xc1 || code === 0xc2) {
      return { width: bytes[at + 7] * 256 + bytes[at + 8], height: bytes[at + 5] * 256 + bytes[at + 6] };
    }
    at += 2 + length;
  }
  fail('no frame header found in JPEG');
}

function checkShots(dir) {
  const names = readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
  if (names.length === 0) fail('screenshots/ holds no image');
  if (names.length > CAPS.screenshots.max) fail(`${names.length} screenshots, the cap is ${CAPS.screenshots.max}`);
  return names.map((name) => {
    const bytes = readFileSync(join(dir, name));
    if (bytes.length > CAPS.screenshots.max_bytes) fail(`${name} is ${bytes.length} bytes, over the cap`);
    const head = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let size;
    if (head.getUint16(0) === 0xffd8) size = jpegSize(bytes);
    else if (head.getUint32(0) === 0x89504e47) size = pngSize(bytes);
    else fail(`${name} is neither a JPEG nor a PNG`);
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long > 1280 || short < 360) fail(`${name} is ${size.width}x${size.height}, outside the bounds`);
    return `${name} ${size.width}x${size.height} ${bytes.length} B`;
  });
}

function main() {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  if (out === root) fail('the output directory must differ from the repository root');
  console.log(`Handing in ${root} -> ${out}`);

  // Clear the output directory's CONTENTS, never the directory itself:
  // where the grader runs this, the output is a mount point on a
  // read-only filesystem, so removing the directory is impossible.
  mkdirSync(out, { recursive: true });
  for (const name of readdirSync(out)) {
    rmSync(join(out, name), { recursive: true, force: true });
  }
  copyTree(join(root, 'app'), join(out, 'app'));
  copyTree(join(root, 'screenshots'), join(out, 'screenshots'));

  for (const name of MUST_SHIP) {
    if (!existsSync(join(out, 'app', name))) fail(`app/${name} missing from the output`);
  }
  console.log(`All ${MUST_SHIP.length} entry files are in the output`);

  const shots = checkShots(join(out, 'screenshots'));
  console.log(`Screenshots inside their caps: ${shots.join('; ')}`);

  const dossier = buildDossier(out, CAPS);
  if (dossier.length === 0) fail('buildDossier returned no bytes');
  writeFileSync(join(out, 'dossier.json'), dossier);

  if (!identical(readFileSync(join(out, 'dossier.json')), dossier)) {
    fail('dossier.json on disk differs from the bytes just built');
  }
  if (!identical(buildDossier(out, CAPS), dossier)) {
    fail('rebuilding the dossier from the output gave different bytes');
  }

  const parsed = JSON.parse(new TextDecoder().decode(dossier));
  const totals = String(parsed.text ?? '').split('\n').find((line) => line.startsWith('Totals:'));
  if (!totals) fail('the dossier text holds no Totals line');
  console.log(`dossier.json: ${dossier.length} bytes`);
  console.log(totals);
}

main();
