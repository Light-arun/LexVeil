import { jest } from '@jest/globals';
import { createSession, getSession, addChatMessage, getChatHistory } from '../src/services/documentStore.js';

describe('documentStore service', () => {
  test('createSession stores original text and analysis under a new id', () => {
    const id = createSession('doc text', { summary: 'sum' });
    const session = getSession(id);
    expect(session).toBeDefined();
    expect(session.originalText).toBe('doc text');
    expect(session.analysis).toEqual({ summary: 'sum' });
    expect(session.chatHistory).toEqual([]);
  });

  test('createSession generates unique ids', () => {
    const idA = createSession('a', {});
    const idB = createSession('b', {});
    expect(idA).not.toBe(idB);
  });

  test('getSession returns undefined for an unknown id', () => {
    expect(getSession('does-not-exist')).toBeUndefined();
  });

  test('addChatMessage appends to history and returns true for a known session', () => {
    const id = createSession('doc text', {});
    const added = addChatMessage(id, 'user', 'What is the fee?', null);
    expect(added).toBe(true);
    expect(getChatHistory(id)).toEqual([
      expect.objectContaining({ role: 'user', content: 'What is the fee?', citations: null })
    ]);
  });

  test('addChatMessage returns false for an unknown session', () => {
    expect(addChatMessage('does-not-exist', 'user', 'hi', null)).toBe(false);
  });

  test('getChatHistory returns null for an unknown session', () => {
    expect(getChatHistory('does-not-exist')).toBeNull();
  });

  test('session expires after the timeout window', () => {
    jest.useFakeTimers();
    try {
      const id = createSession('doc text', {});
      expect(getSession(id)).toBeDefined();

      jest.advanceTimersByTime(60 * 60 * 1000);

      expect(getSession(id)).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});
