/**
 * Build spike (Task D1): prove that an ncc-bundled CJS action can import the ESM
 * `bffless/lib` barrel and reference its exports at runtime, without throwing
 * ERR_REQUIRE_ESM or any module-resolution error.
 *
 * D2+ replaces this wholesale with the real action entry point (getInputs → per-set
 * validate/push loop → outputs/summary/PR comment). Keep `run()` as the single
 * exported entry so that replacement is a drop-in.
 */
import * as core from '@actions/core';

export async function run(): Promise<void> {
  try {
    // Dynamic import: `bffless/lib` is a pure ESM barrel (package.json `"type": "module"`,
    // exports map `"./lib": "./dist/lib.js"`). ncc bundles this call unresolved and Node
    // performs it at runtime — the only way to load ESM from a CJS-emitting bundle.
    const lib = await import('bffless/lib');
    core.info(`bffless/lib loaded. typeof runPushOne = ${typeof lib.runPushOne}`);

    // Read the one required input the real action will need first, so the spike also
    // exercises the "fail gracefully via @actions/core" path when run outside Actions
    // (no INPUT_PATH env set): core.getInput throws, we catch below and setFailed.
    const path = core.getInput('path', { required: true });
    core.info(`path input: ${path}`);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

if (require.main === module) {
  void run();
}
