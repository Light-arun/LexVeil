import { PDFParse } from 'pdf-parse';

const PDF_MAGIC_BYTES = Buffer.from('%PDF-');

export const extractText = async (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Invalid or empty PDF buffer provided');
  }

  // Multer's fileFilter only checks the client-supplied mimetype, which is
  // trivial to spoof. Verifying the real PDF signature here stops a
  // mislabeled file from being handed to the PDF parser.
  if (!buffer.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES)) {
    throw new Error('Invalid or empty PDF buffer provided');
  }

  let parser;

  try {
    parser = new PDFParse({
      data: new Uint8Array(buffer)
    });

    const result = await parser.getText();

    const text = result?.text?.trim() ?? '';

    if (!text) {
      throw new Error('No text could be extracted from the PDF');
    }

    return {
      text,
      pageCount: result.total ?? result.pages?.length ?? 0,
      info: result.info ?? null
    };
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error.message}`);
  } finally {
    if (parser) {
      await parser.destroy().catch(() => {});
    }
  }
};
