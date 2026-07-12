import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @actions/core before importing the module under test.
vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  setSecret: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  setFailed: vi.fn(),
}));

import * as core from '@actions/core';
import { getInputs, splitList } from '../src/inputs';

function mockInputs(inputs: Record<string, string>) {
  vi.mocked(core.getInput).mockImplementation((name: string) => inputs[name] || '');
}

describe('getInputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses required inputs and applies defaults', () => {
    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'test-key-123',
    });

    const result = getInputs();

    expect(result.paths).toEqual(['rule-sets/api']);
    expect(result.apiUrl).toBe('https://assets.example.com');
    expect(result.apiKey).toBe('test-key-123');
    expect(result.project).toBeUndefined();
    expect(result.prune).toBe(false);
    expect(result.dryRun).toBe(false);
    expect(result.nameSuffix).toBeUndefined();
    expect(result.strictSchemas).toBe(false);
    expect(result.workingDirectory).toBe('.');
    expect(result.summary).toBe(true);
    expect(result.summaryTitle).toBe('Proxy Rules Sync');
    expect(result.prComment).toBe(false);
    expect(result.commentHeader).toBeUndefined();
  });

  it('calls core.setSecret with the api key', () => {
    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'super-secret-key',
    });

    getInputs();

    expect(core.setSecret).toHaveBeenCalledWith('super-secret-key');
  });

  it('parses comma-separated paths, trimming whitespace', () => {
    mockInputs({
      path: 'rule-sets/api, rule-sets/webhooks ,rule-sets/analytics',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
    });

    const result = getInputs();

    expect(result.paths).toEqual([
      'rule-sets/api',
      'rule-sets/webhooks',
      'rule-sets/analytics',
    ]);
  });

  it('parses newline-separated paths, trimming whitespace', () => {
    mockInputs({
      path: 'rule-sets/api\n  rule-sets/webhooks  \nrule-sets/analytics',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
    });

    const result = getInputs();

    expect(result.paths).toEqual([
      'rule-sets/api',
      'rule-sets/webhooks',
      'rule-sets/analytics',
    ]);
  });

  it('parses mixed comma AND newline separated paths, dropping empty segments', () => {
    mockInputs({
      path: 'rule-sets/api,\n\nrule-sets/webhooks,, \nrule-sets/analytics',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
    });

    const result = getInputs();

    expect(result.paths).toEqual([
      'rule-sets/api',
      'rule-sets/webhooks',
      'rule-sets/analytics',
    ]);
  });

  it('throws when path resolves to no non-empty segments', () => {
    mockInputs({
      path: ' , ,\n \n',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
    });

    expect(() => getInputs()).toThrow();
  });

  it.each([
    ['True', true],
    ['', false],
    ['false', false],
    ['TRUE', true],
    ['true', true],
  ])('parses prune=%j as %j', (raw, expected) => {
    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
      prune: raw,
    });

    const result = getInputs();
    expect(result.prune).toBe(expected);
  });

  it('parses dry-run and strict-schemas booleans', () => {
    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
      'dry-run': 'true',
      'strict-schemas': 'True',
    });

    const result = getInputs();
    expect(result.dryRun).toBe(true);
    expect(result.strictSchemas).toBe(true);
  });

  it('defaults summary to true unless explicitly "false"', () => {
    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
      summary: 'anything-else',
    });

    expect(getInputs().summary).toBe(true);
  });

  it('parses summary=false as false', () => {
    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
      summary: 'false',
    });

    expect(getInputs().summary).toBe(false);
  });

  it('parses summary=False (case-insensitive) as false', () => {
    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
      summary: 'False',
    });

    expect(getInputs().summary).toBe(false);
  });

  it('parses pr-comment as true/false', () => {
    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
      'pr-comment': 'true',
    });

    expect(getInputs().prComment).toBe(true);
  });

  it('parses optional string inputs (project, name-suffix, summary-title, comment-header, working-directory)', () => {
    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
      project: 'my-project',
      'name-suffix': 'staging',
      'summary-title': 'Custom Title',
      'comment-header': 'Custom Header',
      'working-directory': 'apps/api',
    });

    const result = getInputs();
    expect(result.project).toBe('my-project');
    expect(result.nameSuffix).toBe('staging');
    expect(result.summaryTitle).toBe('Custom Title');
    expect(result.commentHeader).toBe('Custom Header');
    expect(result.workingDirectory).toBe('apps/api');
  });

  // Load-bearing for a later workflow (E5): an explicitly empty name-suffix input
  // must behave the same as an unset one, not as an empty-string suffix (which would
  // otherwise produce "<name>-" on push).
  it('treats an empty name-suffix input as unset (undefined), not empty string', () => {
    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
      'name-suffix': '',
    });

    const result = getInputs();
    expect(result.nameSuffix).toBeUndefined();
  });

  it('reads github-token from input when provided', () => {
    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
      'github-token': 'gh-token-abc',
    });

    expect(getInputs().githubToken).toBe('gh-token-abc');
  });

  it('falls back to GITHUB_TOKEN env var when github-token input is absent', () => {
    const previous = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'env-token-xyz';

    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
    });

    expect(getInputs().githubToken).toBe('env-token-xyz');

    if (previous === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previous;
    }
  });

  it('leaves githubToken undefined when neither input nor env var is set', () => {
    const previous = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    mockInputs({
      path: 'rule-sets/api',
      'api-url': 'https://assets.example.com',
      'api-key': 'key',
    });

    expect(getInputs().githubToken).toBeUndefined();

    if (previous !== undefined) {
      process.env.GITHUB_TOKEN = previous;
    }
  });
});

describe('splitList', () => {
  it('splits on commas', () => {
    expect(splitList('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('splits on newlines', () => {
    expect(splitList('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('splits on a mix of commas and newlines, trims, and drops empties', () => {
    expect(splitList(' a ,\nb,, \n c ')).toEqual(['a', 'b', 'c']);
  });

  it('throws when the result is empty', () => {
    expect(() => splitList(' , ,\n')).toThrow();
  });
});
