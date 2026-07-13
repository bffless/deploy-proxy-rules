/**
 * Post-`ncc` build step: copy the platform esbuild binary into `dist/vendor/esbuild`.
 *
 * Why this exists (see issue #2): bffless >=0.2.0 compiles `.fn.ts` handlers with esbuild's
 * JS API, and that API *cannot be ncc-bundled* — it locates its native executable by a path
 * relative to its own file, so once inlined into `dist/`, esbuild refuses to run at all:
 *
 *   "The esbuild JavaScript API cannot be bundled. Please mark the esbuild package as
 *    external so it's not included in the bundle."
 *
 * That guard is explicitly skipped when `ESBUILD_BINARY_PATH` is set (esbuild `lib/main.js`:
 * `if ((!ESBUILD_BINARY_PATH || false) && ...) throw`), so the bundled API works fine as long
 * as it is handed a real binary. We ship one: this script vendors it, and `src/esbuild-binary.ts`
 * points `ESBUILD_BINARY_PATH` at it at run time.
 *
 * The binary is resolved *through bffless* rather than from this package's root — pnpm's
 * isolated layout means `esbuild` is not resolvable from the repo root at all, and going via
 * bffless's own resolution is what guarantees the vendored binary is the exact version of the
 * esbuild JS API that got bundled. esbuild hard-fails on any API/binary version mismatch, so
 * this coupling is the point, not an accident: bump bffless, rebuild, and the matching binary
 * follows automatically with no version to hand-maintain here.
 *
 * Only `linux-x64` is vendored (~11MB — every consumer downloads `dist/` on every job, so a
 * binary per platform is not free). On any other build host this warns and skips rather than
 * failing, so unit tests still run on e.g. macOS; CI builds `dist/` on ubuntu-latest and its
 * freshness check is the backstop that keeps the committed binary correct.
 */
import { createRequire } from 'node:module';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET_PLATFORM = 'linux-x64';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist', 'vendor');
const outFile = path.join(outDir, 'esbuild');

const require = createRequire(import.meta.url);

/** Resolve through `bffless/lib`, not this package — see the header. */
const requireFromBffless = createRequire(require.resolve('bffless/lib'));

const esbuildMain = requireFromBffless.resolve('esbuild');
const esbuildRoot = path.resolve(path.dirname(esbuildMain), '..');
const esbuildVersion = JSON.parse(
  readFileSync(path.join(esbuildRoot, 'package.json'), 'utf8'),
).version;

let binPath;
try {
  binPath = requireFromBffless.resolve(`@esbuild/${TARGET_PLATFORM}/bin/esbuild`);
} catch {
  console.warn(
    `[vendor-esbuild] @esbuild/${TARGET_PLATFORM} is not installed on this host, so ` +
      `dist/vendor/esbuild was NOT written. The bundled action cannot compile .fn.ts handlers ` +
      `without it. Build dist/ on a ${TARGET_PLATFORM} host (CI does, on ubuntu-latest) before ` +
      `committing.`,
  );
  process.exit(0);
}

// Guaranteed by resolving through bffless, but assert it: a mismatch here would otherwise only
// surface at run time, inside a customer's workflow, as esbuild's version-mismatch panic.
const binVersion = JSON.parse(
  readFileSync(path.join(path.dirname(binPath), '..', 'package.json'), 'utf8'),
).version;
if (binVersion !== esbuildVersion) {
  console.error(
    `[vendor-esbuild] version mismatch: esbuild JS API is ${esbuildVersion} but ` +
      `@esbuild/${TARGET_PLATFORM} is ${binVersion}. esbuild requires these to be identical.`,
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
copyFileSync(binPath, outFile);
chmodSync(outFile, 0o755); // git tracks the exec bit; esbuild spawns this directly

const mb = (statSync(outFile).size / 1024 / 1024).toFixed(1);
console.log(`[vendor-esbuild] dist/vendor/esbuild <- @esbuild/${TARGET_PLATFORM}@${binVersion} (${mb}MB)`);
