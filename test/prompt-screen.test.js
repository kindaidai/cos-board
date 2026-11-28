import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const mod=await import('../src/parse/prompt-screen.js').catch(()=>({}));
test('最後の連番選択肢とその確認文・背景を読む',()=>{
  assert.equal(typeof mod.parsePromptScreen,'function');
  const p=mod.parsePromptScreen(readFileSync(new URL('./fixtures/screen-permission.txt',import.meta.url),'utf8'));
  assert.equal(p.question,'このコマンドを実行しますか？');
  assert.deepEqual(p.options,['1. 今回だけ許可','2. 拒否']);
  assert.ok(p.context.includes('$ demo-build --preview'));
  const q=mod.parsePromptScreen('古い質問\n1. 古い\n2. 古い\n新しい質問\n1. はい\n  説明\n2. いいえ\n  説明');
  assert.equal(q.question,'新しい質問'); assert.deepEqual(q.options,['1. はい','2. いいえ']);
});
test('選択肢無しでも末尾40行を渡し、罫線と長い行を処理する',()=>{
  assert.equal(typeof mod.parsePromptScreen,'function');
  const p=mod.parsePromptScreen('─'.repeat(20)+'\n'+Array.from({length:50},(_,i)=>i+':'+ 'a'.repeat(400)).join('\n'));
  assert.equal(p.text.split('\n').length,40);
  assert.ok(p.text.split('\n').every(l=>l.length<=300));
  assert.deepEqual(p.options,[]); assert.equal(p.context.length,0);
});
