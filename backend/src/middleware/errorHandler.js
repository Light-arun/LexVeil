export const errorHandler = (err, req, res, next) => {
  // Full detail (message, stack) stays server-side. Clients only ever see a
  // sanitized message so internal errors can't leak implementation details.
  console.error(err);

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File is too large. Max size is 10MB.', code: 400 });
    }
    return res.status(400).json({ error: err.message, code: 400 });
  }

  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ error: err.message, code: 400 });
  }

  if (err.status) {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({
      error: 'The AI analysis service is temporarily unavailable. Please try again shortly.',
      code: status
    });
  }

  const isClientError = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 500;
  const statusCode = isClientError ? err.statusCode : 500;
  const message = isClientError ? err.message : 'Internal server error. Please try again.';

  res.status(statusCode).json({ error: message, code: statusCode });
};
