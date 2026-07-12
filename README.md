# @bffless/deploy-proxy-rules

GitHub Action: build, validate and push BFFless proxy rule sets from source.

## Build spike: bundling the ESM `bffless/lib` into a CJS ncc action

`bffless` (`repos/ce/packages/cli`) is `"type": "module"` and exposes a side-effect-free
library barrel at `bffless/lib` (`exports["./lib"] = "./dist/lib.js"`). This action is
built with `@vercel/ncc` into a single CJS `dist/index.js` (required by `runs: node20`).
Loading pure ESM from a CJS-emitting bundle needed a working recipe — this is it.

**The working recipe** (no fallback needed — the brief's primary Node16 recipe worked
first try):

- `tsconfig.json`: `"module": "Node16"`, `"moduleResolution": "Node16"`, `"target": "ES2021"`
  (everything else copied from `@bffless/upload-artifact`'s tsconfig). Node16 module
  resolution is what lets `tsc` correctly resolve the ESM `bffless/lib` export-map entry
  and type-check `await import('bffless/lib')` without complaint, while still emitting
  CJS-compatible output for `src/index.ts` itself.
- Import style in `src/index.ts`: a **dynamic `await import('bffless/lib')`**, not a
  static `import { runPushOne } from 'bffless/lib'`. A static import of an ESM package
  from a CJS module is what throws `ERR_REQUIRE_ESM`; `import()` is the interop path
  Node itself supports from CJS, and ncc passes it through unresolved (it does not try
  to inline/rewrite dynamic imports into `require()`).
- No special ncc flags needed. Plain `ncc build src/index.ts -o dist --license licenses.txt`.
  Inspecting `dist/index.js` after build confirms every `require(...)` call resolves to a
  Node builtin (`fs`, `path`, `http`, `crypto`, …) — `bffless/lib` only ever appears inside
  an `import(...)` call, never a `require(...)` call.

**Verified behavior** (`node dist/index.js` after `pnpm build`):

- With no `INPUT_*` env set: `bffless/lib` loads successfully (`typeof runPushOne` logs
  as `"function"`), then `core.getInput('path', { required: true })` throws and is caught
  by `core.setFailed`, printing `::error::Input required and not supplied: path` and
  exiting `1`. No `ERR_REQUIRE_ESM`, no module-resolution error — the only failure is the
  expected, graceful `@actions/core` one.
- With `INPUT_PATH=/nonexistent INPUT_API-URL=... INPUT_API-KEY=...` set: same successful
  `bffless/lib` load, then the spike logs the `path` input and exits `0` (it does not yet
  call anything else in the lib — that's D2+).

D2 onward replaces `src/index.ts` wholesale with the real action logic (`getInputs` →
per-rule-set `validateRuleSet` → `runPushOne` loop → outputs/summary/PR comment), reusing
this same dynamic-import pattern for every `bffless/lib` symbol it needs.

Full usage docs land in D5.
