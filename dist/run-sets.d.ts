import type { ActionInputs } from "./types";
import type { SyncResponse } from "bffless/lib" with {
    "resolution-mode": "import"
};
export interface SetResult {
    dir: string;
    name: string;
    response: SyncResponse;
}
export interface RunDeps {
    /** Threaded into `PushDeps.fetchImpl` for every set — the sole test seam (no real
     *  network in tests). */
    fetchImpl?: typeof fetch;
}
export declare function runSets(inputs: ActionInputs, deps?: RunDeps): Promise<SetResult[]>;
export interface ActionOutputs {
    ruleSetIds: string;
    ruleSetNames: string;
    changed: boolean;
    report: string;
}
/** Pure mapping from collected `SetResult`s to the action's outputs. `changed` is true
 *  when any set had a non-empty created/updated/deleted bucket; `ruleSetIds`/
 *  `ruleSetNames` are CSVs in the same order as `results`; `report` is a JSON array of
 *  `{name, dir, response}` (one entry per set) for consumers that want the raw detail. */
export declare function toOutputs(results: SetResult[]): ActionOutputs;
