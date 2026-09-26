import { extractText } from '../src/services/pdfParser.js';

describe('pdfParser service', () => {
  test('throws on null input', async () => {
    await expect(extractText(null)).rejects.toThrow('Invalid or empty PDF buffer provided');
  });

  test('throws on undefined input', async () => {
    await expect(extractText(undefined)).rejects.toThrow('Invalid or empty PDF buffer provided');
  });

  test('throws on empty buffer', async () => {
    await expect(extractText(Buffer.from([]))).rejects.toThrow('Invalid or empty PDF buffer provided');
  });
  
  test('throws on invalid buffer data', async () => {
    await expect(extractText(Buffer.from('not a pdf'))).rejects.toThrow();
  });
});
