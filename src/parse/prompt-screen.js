import { LIMITS } from '../contract.js';

export function parsePromptScreen(text) {
  const lines = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').split(/\r?\n/)
    .filter(line => !/^[\s─━│┃┌┐└┘├┤┬┴┼╭╮╰╯═║+\-|]+$/.test(line))
    .slice(-LIMITS.promptLines).map(line => line.slice(0,LIMITS.lineChars));
  let start = -1;
  for (let i=0;i<lines.length;i++) if (/^\s*(?:[❯>›]\s*)?1\.\s+/.test(lines[i])) start=i;
  const options=[];
  if (start>=0) {
    for (let i=start;i<lines.length;i++) {
      const match=/^\s*(?:[❯>›]\s*)?(\d+)\.\s+(.+)/.exec(lines[i]);
      if (match) {
        if (+match[1] !== options.length+1) break;
        options.push(match[1]+'. '+match[2]);
      }
    }
  }
  let before=start-1;
  while (before>=0 && !lines[before].trim()) before--;
  return {question:start>=0 ? lines[before]?.trim() ?? '' : '',context:start>=0 ? lines.slice(Math.max(0,before-8),before) : [],options,text:lines.join('\n')};
}
