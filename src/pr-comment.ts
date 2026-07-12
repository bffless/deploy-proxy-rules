import * as core from "@actions/core";
import * as github from "@actions/github";
import type { ActionInputs } from "./types";
import type { SetResult } from "./run-sets";
import { buildReportMarkdown } from "./report";

/**
 * Marker scoped by `nameSuffix` (not `commentHeader`, unlike upload-artifact's
 * alias/basePath scoping) — distinct PR-preview runs of this action (e.g. per-PR
 * `nameSuffix`) get distinct comments instead of clobbering each other.
 */
function getCommentMarker(inputs: ActionInputs): string {
  return `<!-- bffless-deploy-proxy-rules:${inputs.nameSuffix || "default"} -->`;
}

function buildCommentBody(
  inputs: ActionInputs,
  results: SetResult[],
  marker: string,
): string {
  const header = inputs.commentHeader || "🔀 BFFless Proxy Rules";
  const report = buildReportMarkdown(results, { dryRun: inputs.dryRun });
  return `${marker}\n## ${header}\n\n${report}`;
}

/**
 * Post or update a PR comment with the change report. Mirrors upload-artifact's
 * `writePrComment` marker-upsert verbatim (find-by-marker → update else create).
 * Never throws: skips silently when not applicable (not a PR event, or `prComment`
 * false), warns (never fails the run) when the token is missing or the GitHub API
 * call itself fails.
 */
export async function writePrComment(
  inputs: ActionInputs,
  results: SetResult[],
): Promise<void> {
  if (!inputs.prComment) {
    return;
  }

  const context = github.context;
  const prNumber = context.payload.pull_request?.number;

  if (!prNumber) {
    core.info("Not in a PR context, skipping PR comment");
    return;
  }

  if (!inputs.githubToken) {
    core.warning("No GitHub token provided, cannot post PR comment");
    return;
  }

  const marker = getCommentMarker(inputs);
  const body = buildCommentBody(inputs, results, marker);

  const octokit = github.getOctokit(inputs.githubToken);
  const { owner, repo } = context.repo;

  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    const existingComment = comments.find((comment) =>
      comment.body?.includes(marker),
    );

    if (existingComment) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body,
      });
      core.info(`Updated PR comment #${existingComment.id}`);
    } else {
      const { data: newComment } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
      core.info(`Created PR comment #${newComment.id}`);
    }
  } catch (error) {
    core.warning(
      `Failed to post PR comment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
