import { jest } from '@jest/globals';
import { errorHandler } from '../src/middleware/errorHandler.js';

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler middleware', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('maps Multer file size errors to a friendly 400', () => {
    const res = mockRes();
    const err = { name: 'MulterError', code: 'LIMIT_FILE_SIZE', message: 'File too large' };
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'File is too large. Max size is 10MB.', code: 400 });
  });

  test('passes through other Multer error messages as 400', () => {
    const res = mockRes();
    const err = { name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE', message: 'Unexpected field' };
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unexpected field', code: 400 });
  });

  test('returns 400 for invalid file type errors', () => {
    const res = mockRes();
    const err = new Error('Invalid file type. Only PDF is allowed.');
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: err.message, code: 400 });
  });

  test('sanitizes upstream (Gemini) errors instead of leaking provider details', () => {
    const res = mockRes();
    const err = Object.assign(new Error('leaked internal detail about the provider'), { status: 429 });
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(429);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).not.toContain('leaked internal detail');
  });

  test('falls back to 502 when the upstream status code is out of range', () => {
    const res = mockRes();
    const err = Object.assign(new Error('bad'), { status: 9999 });
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(502);
  });

  test('passes through client error messages (4xx) unchanged', () => {
    const res = mockRes();
    const err = Object.assign(new Error('Document session not found.'), { statusCode: 404 });
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Document session not found.', code: 404 });
  });

  test('hides unexpected internal error messages behind a generic 500', () => {
    const res = mockRes();
    const err = new TypeError("Cannot read properties of undefined (reading 'foo')");
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('Internal server error. Please try again.');
    expect(payload.error).not.toContain('Cannot read properties');
  });
});
