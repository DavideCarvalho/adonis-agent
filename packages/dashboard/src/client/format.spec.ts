import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatModelLabel,
  formatPercent,
  formatTimestamp,
  formatUsd,
} from './format.js';

describe('formatUsd', () => {
  it('keeps precision for small amounts', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(3.5)).toBe('$3.50');
    expect(formatUsd(0.004)).toBe('<$0.01');
  });
  it('compacts thousands and millions', () => {
    expect(formatUsd(1234)).toBe('$1.23k');
    expect(formatUsd(2_500_000)).toBe('$2.50M');
  });
  it('guards non-finite', () => {
    expect(formatUsd(Number.NaN)).toBe('$0.00');
  });
});

describe('formatCount', () => {
  it('compacts with suffixes', () => {
    expect(formatCount(950)).toBe('950');
    expect(formatCount(1500)).toBe('1.5k');
    expect(formatCount(2_400_000)).toBe('2.4M');
    expect(formatCount(3_100_000_000)).toBe('3.1B');
  });
});

describe('formatPercent', () => {
  it('rounds a ratio to an integer percent', () => {
    expect(formatPercent(0.1234)).toBe('12%');
    expect(formatPercent(1)).toBe('100%');
  });
});

describe('formatModelLabel', () => {
  it('passes plain ids through', () => {
    expect(formatModelLabel('gpt-4o')).toBe('gpt-4o');
  });
  it('shortens a Bedrock inference-profile ARN', () => {
    const arn =
      'arn:aws:bedrock:us-east-1:123:inference-profile/us.anthropic.claude-3-5-sonnet-20241022-v2:0';
    expect(formatModelLabel(arn)).toBe('claude-3-5-sonnet-20241022-v2:0');
  });
});

describe('formatTimestamp', () => {
  it('renders a short UTC label', () => {
    expect(formatTimestamp('2026-03-04T09:07:00.000Z')).toBe('Mar 4, 09:07');
  });
  it('renders — for empty/invalid', () => {
    expect(formatTimestamp('')).toBe('—');
    expect(formatTimestamp('nope')).toBe('—');
  });
});
