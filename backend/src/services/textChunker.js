export const chunkText = (text, maxChunkSize = 12000) => {
  if (!text) return [];
  if (text.length <= maxChunkSize) {
    return [{ text, startIndex: 0, endIndex: text.length }];
  }

  const chunks = [];
  let currentStart = 0;

  while (currentStart < text.length) {
    let currentEnd = Math.min(currentStart + maxChunkSize, text.length);
    
    if (currentEnd < text.length) {
      let lastPara = text.lastIndexOf('\n\n', currentEnd);
      if (lastPara > currentStart + (maxChunkSize / 2)) {
        currentEnd = lastPara;
      } else {
        let lastSentence = Math.max(
          text.lastIndexOf('. ', currentEnd),
          text.lastIndexOf('? ', currentEnd),
          text.lastIndexOf('! ', currentEnd)
        );
        if (lastSentence > currentStart + (maxChunkSize / 2)) {
          currentEnd = lastSentence + 1;
        }
      }
    }

    chunks.push({
      text: text.substring(currentStart, currentEnd),
      startIndex: currentStart,
      endIndex: currentEnd
    });

    if (currentEnd >= text.length) break;

    currentStart = Math.max(currentEnd - 200, currentStart + 1);
  }

  return chunks;
};

export const findClauseLocations = (sourceText, fullText) => {
  if (!sourceText || !fullText) return null;
  
  const normalize = (t) => t.replace(/\s+/g, ' ').trim();
  const normalizedSource = normalize(sourceText);
  if (!normalizedSource) return null;

  let startIndex = fullText.indexOf(sourceText);
  if (startIndex !== -1) {
    return { startIndex, endIndex: startIndex + sourceText.length };
  }
  
  const escapedSource = sourceText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexibleSourceRegex = new RegExp(escapedSource.replace(/\s+/g, '\\s+'), 'i');
  const match = fullText.match(flexibleSourceRegex);
  
  if (match && match.index !== undefined) {
      return { startIndex: match.index, endIndex: match.index + match[0].length };
  }
  
  return null;
};
