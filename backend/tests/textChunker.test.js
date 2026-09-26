import { chunkText, findClauseLocations } from '../src/services/textChunker.js';

describe('textChunker service', () => {
  describe('chunkText', () => {
    test('short text returns 1 chunk', () => {
      const text = 'Short text';
      const chunks = chunkText(text, 100);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(text);
      expect(chunks[0].startIndex).toBe(0);
      expect(chunks[0].endIndex).toBe(text.length);
    });

    test('long text returns multiple chunks', () => {
      const text = 'A'.repeat(25000);
      const chunks = chunkText(text, 12000);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].text.length).toBe(12000);
    });

    test('preserves paragraph boundaries', () => {
      const text = 'A'.repeat(11000) + '\n\n' + 'B'.repeat(2000);
      const chunks = chunkText(text, 12000);
      expect(chunks[0].endIndex).toBe(11000);
    });
  });

  describe('findClauseLocations', () => {
    test('finds exact match', () => {
      const full = "This is the full text of the document.";
      const source = "full text";
      const result = findClauseLocations(source, full);
      expect(result).not.toBeNull();
      expect(result.startIndex).toBe(12);
      expect(result.endIndex).toBe(21);
    });

    test('returns null for non-existent text', () => {
      const result = findClauseLocations("missing", "text");
      expect(result).toBeNull();
    });

    test('handles whitespace normalization', () => {
      const full = "This  is\n the full text.";
      const source = "is the full";
      const result = findClauseLocations(source, full);
      expect(result).not.toBeNull();
      expect(full.substring(result.startIndex, result.endIndex).replace(/\s+/g, ' ')).toBe("is the full");
    });
  });
});
