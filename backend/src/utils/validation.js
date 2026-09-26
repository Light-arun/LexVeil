export const validateTextInput = (text) => {
  if (typeof text !== 'string') {
    return { valid: false, error: 'Text must be a string' };
  }
  if (text.length < 10 || text.length > 500000) {
    return { valid: false, error: 'Text length must be between 10 and 500000 characters' };
  }
  return { valid: true };
};

export const validateQuestion = (question) => {
  if (typeof question !== 'string') {
    return { valid: false, error: 'Question must be a string' };
  }
  const trimmed = question.trim();
  if (trimmed.length < 3 || trimmed.length > 2000) {
    return { valid: false, error: 'Question length must be between 3 and 2000 characters' };
  }
  return { valid: true };
};

export const sanitizeText = (text) => {
  if (typeof text !== 'string') return '';
  return text.trim().replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
};
