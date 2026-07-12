import { describe, expect, it } from 'vitest';
import { run } from '../src/index';

describe('build spike scaffold', () => {
  it('exports run as a function', () => {
    expect(typeof run).toBe('function');
  });
});
