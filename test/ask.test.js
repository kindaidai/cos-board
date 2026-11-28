import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../src/parse/ask.js').catch(()=>({}));
test('問いの題の新旧形式・節・依頼番号を読み上限を守る',()=>{
  assert.equal(typeof mod.parseAsk,'function');
  for (const heading of ['# ask/1 題','# ask/1: 題']) {
    assert.deepEqual(mod.parseAsk(heading+'\n\n- 依頼: 3\n\n## 問い\n\n一段落\n続き\n\n二段落'),{title:'題',question:'一段落\n続き',request:3});
  }
  assert.deepEqual(mod.parseAsk('本文'),{title:'',question:'',request:null});
  assert.equal(mod.parseAsk('# '+'題'.repeat(150)+'\n## 問い\n'+'問'.repeat(400)).title.length,120);
  assert.equal(mod.parseAsk('## 問い\n'+'問'.repeat(400)).question.length,300);
});
test('答えの印は見出しと行頭だけ数え、数字でない参照や途中の言及を除く',()=>{
  assert.equal(typeof mod.answeredAskNumbers,'function');
  assert.deepEqual([...mod.answeredAskNumbers('# 補足 ask/01.md への答え\n- 「ask/2・ask/003.md への答え」\nask/4 への答え\n途中で ask/5 への答え\nask/<連番> への答え\nask/6 を参照')],[1,2,3,4]);
});
