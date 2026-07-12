import { describe, it, expect, vi, beforeEach } from "vitest";

const mockContext = vi.hoisted(() => ({
  repo: { owner: "test-owner", repo: "test-repo" },
  payload: {} as Record<string, unknown>,
}));

const octokitMocks = vi.hoisted(() => ({
  listComments: vi.fn(),
  updateComment: vi.fn(),
  createComment: vi.fn(),
}));

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@actions/github", () => ({
  context: mockContext,
  getOctokit: vi.fn(() => ({
    rest: {
      issues: {
        listComments: octokitMocks.listComments,
        updateComment: octokitMocks.updateComment,
        createComment: octokitMocks.createComment,
      },
    },
  })),
}));

import * as core from "@actions/core";
import { writePrComment } from "../src/pr-comment";
import type { ActionInputs } from "../src/types";
import type { SetResult } from "../src/run-sets";
import type { SyncResponse } from "bffless/lib" with {
  "resolution-mode": "import",
};

function syncResponse(overrides?: Partial<SyncResponse>): SyncResponse {
  return {
    ruleSetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    created: [{ pathPattern: "/api/new", method: "GET" }],
    updated: [],
    deleted: [],
    unchanged: [],
    pruneCandidates: [],
    schemaResolutions: [],
    missingSecrets: [],
    warnings: [],
    dryRun: false,
    setCreated: false,
    ...overrides,
  };
}

function baseInputs(overrides?: Partial<ActionInputs>): ActionInputs {
  return {
    paths: ["fixtures/basic"],
    apiUrl: "https://api.test",
    apiKey: "test-key",
    project: "p",
    prune: false,
    dryRun: false,
    nameSuffix: undefined,
    strictSchemas: false,
    workingDirectory: ".",
    summary: true,
    summaryTitle: "Proxy Rules Sync",
    prComment: true,
    commentHeader: undefined,
    githubToken: "gh-token",
    ...overrides,
  };
}

const results: SetResult[] = [
  { dir: "/sets/basic", name: "basic", response: syncResponse() },
];

describe("writePrComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.payload = { pull_request: { number: 42 } };
  });

  it("creates a new comment when no existing comment has the marker", async () => {
    octokitMocks.listComments.mockResolvedValue({ data: [] });
    octokitMocks.createComment.mockResolvedValue({ data: { id: 999 } });

    await writePrComment(baseInputs(), results);

    expect(octokitMocks.createComment).toHaveBeenCalledTimes(1);
    expect(octokitMocks.updateComment).not.toHaveBeenCalled();

    const call = octokitMocks.createComment.mock.calls[0][0];
    expect(call.owner).toBe("test-owner");
    expect(call.repo).toBe("test-repo");
    expect(call.issue_number).toBe(42);
    expect(call.body).toContain("<!-- bffless-deploy-proxy-rules:default -->");
    expect(call.body).toContain("## 🔀 BFFless Proxy Rules");
    expect(call.body).toContain("### basic");
    expect(core.info).toHaveBeenCalledWith("Created PR comment #999");
  });

  it("updates the existing comment when a prior comment contains the marker", async () => {
    octokitMocks.listComments.mockResolvedValue({
      data: [
        { id: 1, body: "unrelated comment" },
        {
          id: 7,
          body: "<!-- bffless-deploy-proxy-rules:default -->\nold report",
        },
      ],
    });

    await writePrComment(baseInputs(), results);

    expect(octokitMocks.updateComment).toHaveBeenCalledTimes(1);
    expect(octokitMocks.createComment).not.toHaveBeenCalled();

    const call = octokitMocks.updateComment.mock.calls[0][0];
    expect(call.comment_id).toBe(7);
    expect(call.body).toContain("### basic");
    expect(core.info).toHaveBeenCalledWith("Updated PR comment #7");
  });

  it("uses a nameSuffix-scoped marker and a custom header when provided", async () => {
    octokitMocks.listComments.mockResolvedValue({ data: [] });
    octokitMocks.createComment.mockResolvedValue({ data: { id: 1 } });

    await writePrComment(
      baseInputs({ nameSuffix: "pr-42", commentHeader: "Custom Header" }),
      results,
    );

    const call = octokitMocks.createComment.mock.calls[0][0];
    expect(call.body).toContain("<!-- bffless-deploy-proxy-rules:pr-42 -->");
    expect(call.body).toContain("## Custom Header");
  });

  it("skips silently when not in a PR context", async () => {
    mockContext.payload = {};

    await writePrComment(baseInputs(), results);

    expect(octokitMocks.listComments).not.toHaveBeenCalled();
    expect(octokitMocks.createComment).not.toHaveBeenCalled();
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("skips silently when prComment is disabled", async () => {
    await writePrComment(baseInputs({ prComment: false }), results);

    expect(octokitMocks.listComments).not.toHaveBeenCalled();
    expect(octokitMocks.createComment).not.toHaveBeenCalled();
  });

  it("warns and does not throw when no github token is provided", async () => {
    await writePrComment(baseInputs({ githubToken: undefined }), results);

    expect(core.warning).toHaveBeenCalledWith(
      "No GitHub token provided, cannot post PR comment",
    );
    expect(octokitMocks.listComments).not.toHaveBeenCalled();
  });

  it("warns rather than throws when the GitHub API call fails", async () => {
    octokitMocks.listComments.mockRejectedValue(new Error("API down"));

    await expect(
      writePrComment(baseInputs(), results),
    ).resolves.toBeUndefined();

    expect(core.warning).toHaveBeenCalledWith(
      "Failed to post PR comment: API down",
    );
  });
});
