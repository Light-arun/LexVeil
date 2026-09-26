import { GoogleGenAI } from '@google/genai';
import { chunkText, findClauseLocations } from './textChunker.js';

let client = null;

export const initGemini = () => {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
};

const MODEL_CHAIN = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.7-flash',
  'gemini-3.8-flash'
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Bounds how many chunk-analysis calls run concurrently for one document:
// enough to cut wall-clock latency on long documents without bursting past
// what the Gemini rate limits (and our own request budget) can absorb.
const CHUNK_CONCURRENCY = 4;

const mapWithConcurrency = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await mapper(items[current], current);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

const parseJsonResponse = (rawText, context) => {
  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`The AI service returned an unexpected response while ${context}.`);
  }
};

const generateContentWithRetry = async (client, params, maxRetries = 2) => {
  for (const currentModel of MODEL_CHAIN) {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        return await client.models.generateContent({
          ...params,
          model: currentModel
        });
      } catch (error) {
        attempt++;
        const isTransient = error?.status === 503 || error?.status === 429 || 
          error?.message?.includes('503') || error?.message?.includes('429') || 
          error?.message?.includes('high demand') || error?.message?.includes('quota') ||
          error?.message?.includes('RESOURCE_EXHAUSTED') || error?.message?.includes('UNAVAILABLE');
          
        if (isTransient && attempt <= maxRetries) {
          const waitMs = Math.min(Math.pow(2, attempt) * 800 + Math.floor(Math.random() * 400), 5000);
          console.warn(`[Gemini API - ${currentModel}] Transient status (${error.status || error.message}). Retrying in ${waitMs}ms (attempt ${attempt}/${maxRetries})...`);
          await delay(waitMs);
        } else {
          console.warn(`[Gemini API - ${currentModel}] Switching to next model in pool...`);
          break; // Switch to next model
        }
      }
    }
  }
  
  throw new Error('Gemini API service temporarily busy. Please retry in a few seconds.');
};

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Plain-language document summary in 2-4 sentences' },
    documentType: { type: 'string', description: 'Type of document (e.g., residential lease, employment contract)' },
    clauses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string', description: 'Short descriptive title' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
          explanation: { type: 'string', description: 'Plain-English explanation' },
          sourceText: { type: 'string', description: 'Exact verbatim quote from the document' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          reviewRecommended: { type: 'boolean' }
        },
        required: ['id', 'title', 'riskLevel', 'explanation', 'sourceText', 'confidence', 'reviewRecommended']
      }
    }
  },
  required: ['summary', 'documentType', 'clauses']
};

const SYSTEM_PROMPT = `You are a legal document analysis assistant. Your job is to help everyday people (renters, consumers, gig workers) understand contracts and legal documents in plain language.

CRITICAL RULES — follow these exactly:
1. You EXPLAIN what is in the document. You do NOT provide legal advice or legal conclusions.
2. Every claim you make MUST be traceable to a specific, exact quote from the document.
3. When quoting source text, copy it VERBATIM — do not paraphrase or shorten.
4. Be CONSERVATIVE with risk levels:
   - "high" = clearly unusual, one-sided, or potentially costly to the signer (large penalties, liability waivers, auto-renewal with penalties, broad indemnification)
   - "medium" = notable terms the signer should be aware of but are somewhat common (late fees, standard termination clauses, notice requirements)
   - "low" = standard/boilerplate terms that are typical and generally favorable or neutral
5. If a clause is ambiguous, vague, or you are not confident in your interpretation, set reviewRecommended to true and confidence to "low". It is better to flag something for professional review than to guess.
6. NEVER say a clause is "illegal", "unenforceable", or "invalid". Instead say "this is unusual" or "worth discussing with a professional".
7. Focus on clauses that matter to a regular person: fees, penalties, liability, termination, auto-renewal, dispute resolution, indemnification, modification rights, and data/privacy terms.
8. Write explanations at an 8th-grade reading level. No legal jargon.`;

export const analyzeDocument = async (client, text) => {
  const userPrompt = `Analyze the following legal document. Provide:
1. A plain-language summary (2-4 sentences, no jargon)
2. The type of document (e.g., "Residential Lease Agreement")
3. A list of notable clauses with risk assessments

For each clause, include the exact verbatim quote from the document as sourceText.

Document Text:
${text}`;

  const chunks = chunkText(text, 12000);
  
  if (chunks.length === 1) {
    const response = await generateContentWithRetry(client, {
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_SCHEMA
      }
    });
    
    const result = parseJsonResponse(response.text, 'analyzing the document');
    if (result.clauses) {
      result.clauses.forEach(clause => {
        const locations = findClauseLocations(clause.sourceText, text);
        if (locations) {
          clause.startIndex = locations.startIndex;
          clause.endIndex = locations.endIndex;
        }
      });
    }
    return result;
  }

  const allResults = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, async (chunk) => {
    const chunkUserPrompt = `Analyze this portion of a legal document. Identify notable clauses with risk assessments. Include exact verbatim quotes as sourceText.

Document portion:
${chunk.text}`;
    const response = await generateContentWithRetry(client, {
      contents: chunkUserPrompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_SCHEMA
      }
    });
    return parseJsonResponse(response.text, 'analyzing a portion of the document');
  });

  const mergedResult = {
    summary: allResults.map(r => r.summary).join(' '),
    documentType: allResults[0].documentType,
    clauses: []
  };

  allResults.forEach(r => {
    if (r.clauses) mergedResult.clauses.push(...r.clauses);
  });
  
  mergedResult.clauses.forEach(clause => {
    const locations = findClauseLocations(clause.sourceText, text);
    if (locations) {
      clause.startIndex = locations.startIndex;
      clause.endIndex = locations.endIndex;
    }
  });

  return mergedResult;
};

const QA_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'Plain-language answer to the question' },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clauseText: { type: 'string', description: 'Exact verbatim quote from the document that supports this answer' },
          explanation: { type: 'string', description: 'How this clause relates to the question' }
        },
        required: ['clauseText', 'explanation']
      }
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    canAnswer: { type: 'boolean', description: 'Whether the document contains enough information to answer' }
  },
  required: ['answer', 'citations', 'confidence', 'canAnswer']
};

const QA_SYSTEM_PROMPT = `You are a legal document Q&A assistant. A user has uploaded a legal document and is asking questions about it.

CRITICAL RULES — follow these exactly:
1. ONLY answer based on what is explicitly stated in the document provided. Do NOT use general legal knowledge to fill in gaps.
2. If the document does NOT contain enough information to answer the question, you MUST set canAnswer to false and say: "I cannot find information about this in your document. You may want to ask a legal professional about this."
3. Every claim in your answer MUST be supported by an exact verbatim quote from the document, included in the citations array.
4. Be conservative. If you are uncertain, set confidence to "low" and recommend professional review.
5. NEVER state legal conclusions like "this is illegal" or "this is unenforceable." Say "this is unusual" or "worth discussing with a professional."
6. Write at an 8th-grade reading level. No legal jargon.
7. Keep answers concise and focused on the specific question asked.`;

export const askQuestion = async (client, question, documentText, chatHistory = []) => {
  const conversationContext = chatHistory.length > 0
    ? `\n\nPrevious conversation:\n${chatHistory.map(m => `${m.role}: ${m.content}`).join('\n')}`
    : '';

  const userPrompt = `Document text:
${documentText}
${conversationContext}

User question: ${question}

Answer the question based ONLY on the document above. Cite specific clauses.`;

  const response = await generateContentWithRetry(client, {
    contents: userPrompt,
    config: {
      systemInstruction: QA_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: QA_SCHEMA
    }
  });

  const result = parseJsonResponse(response.text, 'answering the question');

  if (result.citations) {
    result.citations.forEach(citation => {
      const locations = findClauseLocations(citation.clauseText, documentText);
      if (locations) {
        citation.startIndex = locations.startIndex;
        citation.endIndex = locations.endIndex;
      }
    });
  }

  return result;
};

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Brief title including document type' },
    issueSummary: { type: 'string', description: 'Executive summary of key issues found' },
    flaggedClauses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          riskLevel: { type: 'string' },
          concern: { type: 'string', description: 'Why this clause is noteworthy' },
          sourceText: { type: 'string', description: 'Exact quote from document' }
        },
        required: ['title', 'riskLevel', 'concern', 'sourceText']
      }
    },
    questionsAsked: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answerSummary: { type: 'string' }
        },
        required: ['question', 'answerSummary']
      }
    },
    suggestedLawyerQuestions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Questions the user should bring to their lawyer based on the flagged issues'
    }
  },
  required: ['title', 'issueSummary', 'flaggedClauses', 'questionsAsked', 'suggestedLawyerQuestions']
};

export const generateBrief = async (client, analysisData, chatHistory = []) => {
  const userQuestions = (chatHistory || []).filter(m => m.role === 'user');
  const assistantAnswers = (chatHistory || []).filter(m => m.role === 'assistant');

  const questionsAsked = userQuestions.map((q, idx) => ({
    question: q.content,
    answerSummary: assistantAnswers[idx]?.content || 'Reviewed during session'
  }));

  try {
    const chatSummary = chatHistory.length > 0
      ? `\n\nQuestions the user asked during their review:\n${userQuestions
          .map((m, i) => `${i + 1}. ${m.content}`)
          .join('\n')}\n\nAnswers provided:\n${assistantAnswers
          .map((m, i) => `${i + 1}. ${m.content}`)
          .join('\n')}`
      : '';

    const userPrompt = `Generate a structured "Prep for My Lawyer" brief based on this document analysis.

Document type: ${analysisData.documentType || 'Unknown'}
Document summary: ${analysisData.summary || 'Not available'}

Flagged clauses:
${(analysisData.clauses || []).map(c => `- [${c.riskLevel.toUpperCase()}] ${c.title}: ${c.explanation}\n  Source: "${c.sourceText}"`).join('\n\n')}
${chatSummary}

Create a brief that a lawyer could skim in two minutes. Focus on actionable concerns and practical questions to ask.`;

    const response = await generateContentWithRetry(client, {
      contents: userPrompt,
      config: {
        systemInstruction: 'You are preparing a structured brief for a client to bring to their lawyer. Be concise, professional, and focused on actionable items. This is NOT legal advice — it is a summary of concerns identified in the document that warrant professional review.',
        responseMimeType: 'application/json',
        responseSchema: BRIEF_SCHEMA
      }
    });

    return parseJsonResponse(response.text, 'generating the brief');
  } catch (error) {
    console.warn('[Brief Generation Fallback] Generating deterministic brief from existing analysis data due to:', error.message);

    // Deterministic fallback using existing high-quality analysis data
    const flaggedClauses = (analysisData.clauses || []).map(c => ({
      title: c.title || 'Notable Clause',
      riskLevel: (c.riskLevel || 'MEDIUM').toUpperCase(),
      concern: c.explanation || 'Flagged for review due to non-standard terms.',
      sourceText: c.sourceText || ''
    }));

    const suggestedLawyerQuestions = (analysisData.clauses || [])
      .filter(c => c.riskLevel?.toLowerCase() === 'high' || c.reviewRecommended)
      .slice(0, 5)
      .map(c => `What is the legal enforceability and practical risk of the "${c.title}" clause in my jurisdiction?`);

    if (suggestedLawyerQuestions.length === 0) {
      suggestedLawyerQuestions.push('Are there any non-standard or unusual obligations in this agreement that I should negotiate before signing?');
    }

    return {
      title: `Prep Brief: ${analysisData.documentType || 'Legal Document'} Review`,
      issueSummary: analysisData.summary || 'Summary of document terms and highlighted risk areas prepared for attorney review.',
      flaggedClauses,
      questionsAsked,
      suggestedLawyerQuestions
    };
  }
};
