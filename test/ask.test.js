import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const mod = await import('../src/parse/ask.js').catch(()=>({}));
test('問いの題の新旧形式・節・依頼番号を読み上限を守る',()=>{
  assert.equal(typeof mod.parseAsk,'function');
  for (const heading of ['# ask/1 題','# ask/1: 題']) {
    assert.deepEqual(mod.parseAsk(heading+'\n\n- 依頼: 3\n\n## 問い\n\n一段落\n続き\n\n二段落'),{title:'題',question:'一段落\n続き',options:[],request:3});
  }
  assert.deepEqual(mod.parseAsk('本文'),{title:'',question:'',options:[],request:null});
  assert.equal(mod.parseAsk('# '+'題'.repeat(150)+'\n## 問い\n'+'問'.repeat(400)).title.length,120);
  assert.equal(mod.parseAsk('## 問い\n'+'問'.repeat(400)).question.length,300);
});
test('答えの印は見出しと行頭だけ数え、数字でない参照や途中の言及を除く',()=>{
  assert.equal(typeof mod.answeredAskNumbers,'function');
  assert.deepEqual([...mod.answeredAskNumbers('# 補足 ask/01.md への答え\n- 「ask/2・ask/003.md への答え」\nask/4 への答え\n途中で ask/5 への答え\nask/<連番> への答え\nask/6 を参照')],[1,2,3,4]);
});

test('問いの節がない実例では冒頭の段落と箇条書きの選択肢を読む',()=>{
  const text=readFileSync(new URL('./fixtures/ask-release.md',import.meta.url),'utf8');
  const result=mod.parseAsk(text);
  assert.equal(result.question,'本番リリース後の確認をタスク一覧に入れますか？\n確認の時間を決めておくと、結果を追いやすくなります。');
  assert.deepEqual(result.options,['A. 入れる（推奨）: 上の内容で入れる','B. 日付を変える: 別の日に確認する','C. 入れない: 今回は登録しない']);
});
test('代替の問いは表・引用・空行で区切り、次の節へ進まない',()=>{
  for (const boundary of ['| 項目 | 値 |','> 引用','']) {
    assert.equal(mod.parseAsk('# 題\n\n| 表 |\n> 引用\n\n最初の段落\n続き\n'+boundary+'\n別の文\n## 選択肢\n1. はい').question,'最初の段落\n続き');
  }
  assert.equal(mod.parseAsk('# 題\n| 表 |\n> 引用\n## 選択肢\n1. はい').question,'');
  assert.equal(mod.parseAsk('# 題\n'+'問'.repeat(400)).question.length,300);
  assert.equal(mod.parseAsk('# 題\n代替\n## 問い\n明示された問い').question,'明示された問い');
});
test('選択肢は番号形式を読み、強調を除き、一行120字・最大6個に制限する',()=>{
  const result=mod.parseAsk('# 題\n## 選択肢\n'+Array.from({length:8},(_,i)=>`${i+1}. **名前（推奨）**: ${'説'.repeat(140)}`).join('\n')+'\n## 補足\n- 取り込まない');
  assert.equal(result.options.length,6);
  assert.ok(result.options.every(o=>o.length===120 && !o.includes('**') && !o.includes('\n')));
  assert.match(result.options[0],/^1\. 名前（推奨）: /);
});

test('空の問いの節があれば冒頭の段落で補わない',()=>{
  assert.equal(mod.parseAsk('# 題\n代替にしない\n## 問い').question,'');
  assert.equal(mod.parseAsk('# 題\r\n代替にしない\r\n## 問い\r\n\r\n## 選択肢\r\n- **A. はい（推奨）**: 進める').question,'');
});
