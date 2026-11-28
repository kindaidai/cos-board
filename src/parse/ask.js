import { LIMITS } from '../contract.js';

export function parseAsk(text) {
  const title = /^#{1,6}\s+(.+)$/m.exec(text)?.[1].replace(/^ask\/\d+(?:\s*[:：]\s*|\s+)/, '').trim() ?? '';
  const heading = /^#{1,6}\s+.+$/m.exec(text);
  const section = /^## 問い[ \t]*\r?(?:\n|$)([\s\S]*?)(?=^#{1,2}\s|$(?![\s\S]))/m.exec(text)?.[1];
  const intro = heading ? text.slice(heading.index + heading[0].length).split(/^##\s/m)[0] : '';
  const paragraph = [];
  for (const line of intro.split(/\r?\n/)) {
    if (!line.trim() || /^\s*[|>]/.test(line)) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(line);
  }
  const question = (section ?? paragraph.join('\n')).trim().split(/\r?\n\s*\r?\n/)[0] ?? '';
  const choices = /^## 選択肢\s*\r?\n([\s\S]*?)(?=^#{1,2}\s|$(?![\s\S]))/m.exec(text)?.[1] ?? '';
  const options = choices.split(/\r?\n/).flatMap(line => {
    const item = /^\s*(?:[-*+]\s+(.+)|(\d+\.\s+.+))$/.exec(line);
    return item ? [(item[1] ?? item[2]).replace(/\*\*/g, '').trim().slice(0,120)] : [];
  }).slice(0,6);
  const request = /(?:依頼(?:番号)?\s*[:：#]?\s*)(\d+)/.exec(text);
  return {title:title.slice(0,LIMITS.titleChars),question:question.slice(0,LIMITS.questionChars),options,request:request ? Number(request[1]) : null};
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
