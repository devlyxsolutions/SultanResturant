import {
  normalizePakistaniPhone,
  isValidPakistaniPhone,
  formatPakistaniDisplayPhone,
  arePhonesEqual,
} from '../phoneNormalization';

// Ambient test declarations for environments without @types/jest installed
declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: (val: any) => { toBe: (expected: any) => void };

describe('Pakistani Phone Number Normalization', () => {
  const expectedNormalized = '+923001234567';

  test('normalizes standard local format with hyphen (0300-1234567)', () => {
    expect(normalizePakistaniPhone('0300-1234567')).toBe(expectedNormalized);
  });

  test('normalizes raw 11 digits (03001234567)', () => {
    expect(normalizePakistaniPhone('03001234567')).toBe(expectedNormalized);
  });

  test('normalizes with spaces and country code (+92 300 1234567)', () => {
    expect(normalizePakistaniPhone('+92 300 1234567')).toBe(expectedNormalized);
  });

  test('normalizes double zero international prefix (00923001234567)', () => {
    expect(normalizePakistaniPhone('00923001234567')).toBe(expectedNormalized);
  });

  test('normalizes 92 prefix without plus (923001234567)', () => {
    expect(normalizePakistaniPhone('923001234567')).toBe(expectedNormalized);
  });

  test('normalizes 10 digits without leading 0 (3001234567)', () => {
    expect(normalizePakistaniPhone('3001234567')).toBe(expectedNormalized);
  });

  test('normalizes landline numbers with area codes', () => {
    expect(normalizePakistaniPhone('051-9261234')).toBe('+92519261234');
    expect(normalizePakistaniPhone('+92 42 35876543')).toBe('+924235876543');
    expect(normalizePakistaniPhone('02134567890')).toBe('+922134567890');
  });

  test('handles null, undefined and empty strings gracefully', () => {
    expect(normalizePakistaniPhone('')).toBe('');
    expect(normalizePakistaniPhone(null)).toBe('');
    expect(normalizePakistaniPhone(undefined)).toBe('');
  });

  test('validates valid Pakistani phone numbers', () => {
    expect(isValidPakistaniPhone('0300-1234567')).toBe(true);
    expect(isValidPakistaniPhone('+92 321 9876543')).toBe(true);
    expect(isValidPakistaniPhone('03451122334')).toBe(true);
    expect(isValidPakistaniPhone('051-2233445')).toBe(true);
    expect(isValidPakistaniPhone('12345')).toBe(false);
    expect(isValidPakistaniPhone('abcdef')).toBe(false);
  });

  test('formats phone for local and international display', () => {
    expect(formatPakistaniDisplayPhone('+923001234567', 'local')).toBe('0300-1234567');
    expect(formatPakistaniDisplayPhone('03001234567', 'local')).toBe('0300-1234567');
    expect(formatPakistaniDisplayPhone('+923001234567', 'international')).toBe('+92 300 1234567');
  });

  test('compares phone numbers regardless of formatting', () => {
    expect(arePhonesEqual('0300-1234567', '+92 300 1234567')).toBe(true);
    expect(arePhonesEqual('00923001234567', '03001234567')).toBe(true);
    expect(arePhonesEqual('0300-1234567', '0300-7654321')).toBe(false);
  });
});
