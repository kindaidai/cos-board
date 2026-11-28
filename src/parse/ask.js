import { LIMITS } from '../contract.js';

export function parseAsk(text) {
  const title = /^#{1,6}\s+(.+)$/m.exec(text)?.[1].replace(/^ask\/\d+(?:\s*[:：]\s*|\s+)/, '').trim() ?? '';
  const section = /^## 問い\s*\r?\n([\s\S]*?)(?=^#{1,2}\s|$(?![\s\S]))/m.exec(text)?.[1] ?? '';
  const question = section.trim().split(/\r?\n\s*\r?\n/)[0] ?? '';
  const request = /(?:依頼(?:番号)?\s*[:：#]?\s*)(\d+)/.exec(text);
  return {title:title.slice(0,LIMITS.titleChars),question:question.slice(0,LIMITS.questionChars),request:request ? Number(request[1]) : null};
}

export function answeredAskNumbers(text) {
  const result = new Set();
  for (const line of text.split(/\r?\n/)) {
    const heading = /^\s*#{1,6}\s+/.test(line);
    const content = line.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)?[「『"“]*/, '');
    const expression = /ask\/\d+(?:\.md)?(?:\s*・\s*ask\/\d+(?:\.md)?)*\s+への答え/g;
    for (const match of content.matchAll(expression)) {
      if (!heading && match.index !== 0) continue;
      for (const number of match[0].matchAll(/ask\/(\d+)/g)) result.add(Number(number[1]));
    }
  }
  return result;
}
