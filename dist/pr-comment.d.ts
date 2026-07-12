import type { ActionInputs } from "./types";
import type { SetResult } from "./run-sets";
/**
 * Post or update a PR comment with the change report. Mirrors upload-artifact's
 * `writePrComment` marker-upsert verbatim (find-by-marker → update else create).
 * Never throws: skips silently when not applicable (not a PR event, or `prComment`
 * false), warns (never fails the run) when the token is missing or the GitHub API
 * call itself fails.
 */
export declare function writePrComment(inputs: ActionInputs, results: SetResult[]): Promise<void>;
