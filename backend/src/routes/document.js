import express from 'express';
import rateLimit from 'express-rate-limit';
import { upload } from '../middleware/upload.js';
import { extractText } from '../services/pdfParser.js';
import { validateTextInput, validateQuestion, sanitizeText } from '../utils/validation.js';
import { analyzeDocument, askQuestion, generateBrief, initGemini } from '../services/geminiService.js';
import { createSession, getSession, addChatMessage, getChatHistory } from '../services/documentStore.js';

const router = express.Router();

// Every route here triggers a paid, latency-heavy Gemini call, so they share a
// stricter limit than a typical API to bound abuse cost and provider load.
const analysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a few minutes.', code: 429 }
});

router.use(analysisLimiter);

router.post('/upload', upload.single('document'), async (req, res, next) => {
  try {
    let documentText = '';

    if (req.file) {
      const parsed = await extractText(req.file.buffer);
      documentText = parsed.text;
    } else if (req.body && req.body.text) {
      const validation = validateTextInput(req.body.text);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error, code: 400 });
      }
      documentText = sanitizeText(req.body.text);
    } else {
      return res.status(400).json({ error: 'Please provide a PDF file or text content', code: 400 });
    }

    const aiClient = initGemini();
    const analysis = await analyzeDocument(aiClient, documentText);
    
    const sessionId = createSession(documentText, analysis);

    res.json({
      id: sessionId,
      summary: analysis.summary,
      documentType: analysis.documentType,
      clauses: analysis.clauses,
      originalText: documentText
    });

  } catch (error) {
    next(error);
  }
});

router.post('/:id/ask', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { question } = req.body;

    const session = getSession(id);
    if (!session) {
      return res.status(404).json({
        error: 'Document session not found. Please upload the document again.',
        code: 404
      });
    }

    const validation = validateQuestion(question);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error,
        code: 400
      });
    }
    const trimmedQuestion = question.trim();

    const aiClient = initGemini();
    const chatHistory = getChatHistory(id) || [];

    const result = await askQuestion(
      aiClient,
      trimmedQuestion,
      session.originalText,
      chatHistory
    );

    addChatMessage(id, 'user', trimmedQuestion, null);
    addChatMessage(id, 'assistant', result.answer, result.citations);

    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.post('/:id/export', async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = getSession(id);
    if (!session) {
      return res.status(404).json({ error: 'Document session not found. Please upload the document again.', code: 404 });
    }

    const aiClient = initGemini();
    const chatHistory = getChatHistory(id) || [];
    const brief = await generateBrief(aiClient, session.analysis, chatHistory);

    res.setHeader('Content-Disposition', 'attachment; filename="lexveil-brief.json"');
    res.json(brief);
  } catch (error) {
    next(error);
  }
});

export default router;


