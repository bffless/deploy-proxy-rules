import * as core from '@actions/core';
import { ActionInputs } from './types';

// Split a comma- and/or newline-separated `path` input into a trimmed, non-empty
// string array. Throws (rather than returning an empty array) so a caller's
// try/catch → core.setFailed reports a clear "no rule-set directories" error
// instead of silently syncing nothing.
export function splitList(raw: string): string[] {
  const parts = raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) {
    throw new Error(
      'path: at least one rule-set directory is required (comma or newline separated)',
    );
  }
  return parts;
}

function parseBooleanDefaultFalse(raw: string | undefined): boolean {
  return (raw || 'false').toLowerCase() === 'true';
}

export function getInputs(): ActionInputs {
  const pathRaw = core.getInput('path', { required: true });
  const apiUrl = core.getInput('api-url', { required: true });
  const apiKey = core.getInput('api-key', { required: true });
  core.setSecret(apiKey);

  const paths = splitList(pathRaw);

  const project = core.getInput('project') || undefined;
  const prune = parseBooleanDefaultFalse(core.getInput('prune'));
  const dryRun = parseBooleanDefaultFalse(core.getInput('dry-run'));
  // Empty string ('') is treated as unset, not as an empty suffix — a name-suffix
  // input of '' must not silently produce "<name>-" on push (load-bearing for E5).
  const nameSuffix = core.getInput('name-suffix') || undefined;
  const strictSchemas = parseBooleanDefaultFalse(core.getInput('strict-schemas'));
  const workingDirectory = core.getInput('working-directory') || '.';

  const summaryInput = core.getInput('summary') || 'true';
  const summary = summaryInput.toLowerCase() !== 'false';
  const summaryTitle = core.getInput('summary-title') || 'Proxy Rules Sync';

  const prComment = parseBooleanDefaultFalse(core.getInput('pr-comment'));
  const commentHeader = core.getInput('comment-header') || undefined;
  const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN || undefined;

  return {
    paths,
    apiUrl,
    apiKey,
    project,
    prune,
    dryRun,
    nameSuffix,
    strictSchemas,
    workingDirectory,
    summary,
    summaryTitle,
    prComment,
    commentHeader,
    githubToken,
  };
}
