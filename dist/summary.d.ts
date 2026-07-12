import type { ActionInputs } from "./types";
import type { SetResult } from "./run-sets";
/** Write the run's change report to the GitHub Actions step summary. No-op unless
 *  `inputs.summary` is set (default true — see `getInputs`). */
export declare function writeSummary(inputs: ActionInputs, results: SetResult[]): Promise<void>;
