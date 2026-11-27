import { createHash } from 'node:crypto';

export function hashSyncSection(text) {
  const heading = /^## 1\. 同期する\r?$/m.exec(text);
  if (!heading) return {value:null, errors:[{line:1, message:'同期する節がありません'}]};
  const rest = text.slice(heading.index + heading[0].length);
  const next = /^## /m.exec(rest);
  const end = next ? heading.index + heading[0].length + next.index : text.length;
  // 改行や空白も判定表の変更として扱うため、元のUTF-8本文を正規化しない。
  return {value:createHash('sha256').update(text.slice(heading.index, end), 'utf8').digest('hex'), errors:[]};
}
