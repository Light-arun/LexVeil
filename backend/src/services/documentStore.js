import crypto from 'crypto';

const store = new Map();
const SESSION_TIMEOUT = 60 * 60 * 1000;

export const createSession = (originalText, analysis) => {
  const id = crypto.randomUUID();
  const sessionData = {
    id,
    originalText,
    analysis,
    chatHistory: [],
    createdAt: Date.now()
  };
  
  store.set(id, sessionData);

  const expiryTimer = setTimeout(() => {
    store.delete(id);
  }, SESSION_TIMEOUT);
  // Don't let a pending expiry keep the Node process alive (e.g. during tests
  // or graceful shutdown) — the timer still fires normally otherwise.
  expiryTimer.unref?.();

  return id;
};

export const getSession = (id) => {
  return store.get(id);
};

export const addChatMessage = (id, role, content, citations) => {
  const session = store.get(id);
  if (!session) return false;

  session.chatHistory.push({ role, content, citations, timestamp: Date.now() });
  return true;
};

export const getChatHistory = (id) => {
  const session = store.get(id);
  return session ? session.chatHistory : null;
};
