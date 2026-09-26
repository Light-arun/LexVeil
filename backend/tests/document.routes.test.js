import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const analyzeDocument = jest.fn();
const askQuestion = jest.fn();
const generateBrief = jest.fn();
const initGemini = jest.fn(() => ({}));
const extractText = jest.fn();

jest.unstable_mockModule('../src/services/geminiService.js', () => ({
  analyzeDocument,
  askQuestion,
  generateBrief,
  initGemini
}));

jest.unstable_mockModule('../src/services/pdfParser.js', () => ({
  extractText
}));

const { default: documentRoutes } = await import('../src/routes/document.js');
const { errorHandler } = await import('../src/middleware/errorHandler.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/documents', documentRoutes);
  app.use(errorHandler);
  return app;
}

describe('document routes', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
    initGemini.mockReturnValue({});
  });

  describe('POST /api/documents/upload', () => {
    test('analyzes pasted text and creates a session', async () => {
      analyzeDocument.mockResolvedValue({
        summary: 'A lease agreement.',
        documentType: 'Residential Lease',
        clauses: []
      });

      const res = await request(app)
        .post('/api/documents/upload')
        .send({ text: 'This is a sufficiently long lease document body for validation.' });

      expect(res.status).toBe(200);
      expect(res.body.summary).toBe('A lease agreement.');
      expect(typeof res.body.id).toBe('string');
      expect(analyzeDocument).toHaveBeenCalledTimes(1);
    });

    test('rejects text that is too short', async () => {
      const res = await request(app)
        .post('/api/documents/upload')
        .send({ text: 'short' });

      expect(res.status).toBe(400);
      expect(analyzeDocument).not.toHaveBeenCalled();
    });

    test('rejects a request with neither file nor text', async () => {
      const res = await request(app).post('/api/documents/upload').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/PDF file or text/i);
    });

    test('propagates AI service failures as a sanitized error', async () => {
      analyzeDocument.mockRejectedValue(Object.assign(new Error('upstream exploded'), { status: 503 }));

      const res = await request(app)
        .post('/api/documents/upload')
        .send({ text: 'This is a sufficiently long lease document body for validation.' });

      expect(res.status).toBe(503);
      expect(res.body.error).not.toContain('upstream exploded');
    });
  });

  describe('POST /api/documents/:id/ask', () => {
    test('returns 404 for an unknown session', async () => {
      const res = await request(app)
        .post('/api/documents/unknown-id/ask')
        .send({ question: 'What is the penalty?' });

      expect(res.status).toBe(404);
      expect(askQuestion).not.toHaveBeenCalled();
    });

    test('answers a question for a known session', async () => {
      analyzeDocument.mockResolvedValue({ summary: 's', documentType: 't', clauses: [] });
      const uploadRes = await request(app)
        .post('/api/documents/upload')
        .send({ text: 'This is a sufficiently long lease document body for validation.' });
      const { id } = uploadRes.body;

      askQuestion.mockResolvedValue({ answer: 'No penalty was found.', citations: [], canAnswer: true, confidence: 'high' });

      const res = await request(app)
        .post(`/api/documents/${id}/ask`)
        .send({ question: 'Is there a penalty?' });

      expect(res.status).toBe(200);
      expect(res.body.answer).toBe('No penalty was found.');
    });

    test('rejects an invalid question', async () => {
      analyzeDocument.mockResolvedValue({ summary: 's', documentType: 't', clauses: [] });
      const uploadRes = await request(app)
        .post('/api/documents/upload')
        .send({ text: 'This is a sufficiently long lease document body for validation.' });
      const { id } = uploadRes.body;

      const res = await request(app).post(`/api/documents/${id}/ask`).send({ question: 'a' });
      expect(res.status).toBe(400);
      expect(askQuestion).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/documents/:id/export', () => {
    test('returns 404 for an unknown session', async () => {
      const res = await request(app).post('/api/documents/unknown-id/export');
      expect(res.status).toBe(404);
    });

    test('exports a brief with a download filename for a known session', async () => {
      analyzeDocument.mockResolvedValue({ summary: 's', documentType: 't', clauses: [] });
      const uploadRes = await request(app)
        .post('/api/documents/upload')
        .send({ text: 'This is a sufficiently long lease document body for validation.' });
      const { id } = uploadRes.body;

      generateBrief.mockResolvedValue({ title: 'Brief', issueSummary: 'ok', flaggedClauses: [], questionsAsked: [], suggestedLawyerQuestions: [] });

      const res = await request(app).post(`/api/documents/${id}/export`);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('lexveil-brief.json');
      expect(res.body.title).toBe('Brief');
    });
  });
});
