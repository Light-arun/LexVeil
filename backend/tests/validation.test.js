import { validateTextInput, validateQuestion, sanitizeText } from '../src/utils/validation.js';

describe('validation utils', () => {
  describe('validateTextInput', () => {
    test('rejects non-string input', () => {
      expect(validateTextInput(123)).toEqual({ valid: false, error: 'Text must be a string' });
      expect(validateTextInput(null)).toEqual({ valid: false, error: 'Text must be a string' });
    });

    test('rejects text shorter than 10 characters', () => {
      const result = validateTextInput('short');
      expect(result.valid).toBe(false);
    });

    test('rejects text longer than 500000 characters', () => {
      const result = validateTextInput('a'.repeat(500001));
      expect(result.valid).toBe(false);
    });

    test('accepts text within bounds', () => {
      expect(validateTextInput('a'.repeat(10))).toEqual({ valid: true });
      expect(validateTextInput('a'.repeat(500000))).toEqual({ valid: true });
    });
  });

  describe('validateQuestion', () => {
    test('rejects non-string input', () => {
      expect(validateQuestion(undefined)).toEqual({ valid: false, error: 'Question must be a string' });
    });

    test('rejects questions shorter than 3 characters after trimming', () => {
      expect(validateQuestion('  a  ').valid).toBe(false);
    });

    test('rejects questions longer than 2000 characters', () => {
      expect(validateQuestion('a'.repeat(2001)).valid).toBe(false);
    });

    test('accepts a well-formed question', () => {
      expect(validateQuestion('What is the penalty for late payment?')).toEqual({ valid: true });
    });

    test('treats whitespace-padded questions as valid based on trimmed length', () => {
      expect(validateQuestion('   ok?   ')).toEqual({ valid: true });
    });
  });

  describe('sanitizeText', () => {
    test('returns empty string for non-string input', () => {
      expect(sanitizeText(null)).toBe('');
      expect(sanitizeText(undefined)).toBe('');
    });

    test('trims surrounding whitespace', () => {
      expect(sanitizeText('  hello  ')).toBe('hello');
    });

    test('strips control characters but keeps normal whitespace', () => {
      const withControlChars = 'hello\x00\x01world\ttab\nnewline';
      expect(sanitizeText(withControlChars)).toBe('helloworld\ttab\nnewline');
    });
  });
});
