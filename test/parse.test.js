import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const modules = {};
for (const name of ['ledger', 'task-state', 'report-log', 'herdr', 'cos-state']) modules[name] = await import(`../src/parse/${name}.js`).catch(() => null);
const call = (file, fn, ...args) => { assert.ok(modules[file], `${file} が未実装`); return modules[file][fn](...args); };

test('台帳を見出しで解析し複数リポジトリとPRを保持する', () => {
  const r = call('ledger', 'parseLedger', fixture('ledger.md'));
  assert.deepEqual(r.errors, []); assert.equal(r.value.rows.length, 2);
  assert.equal(r.value.limit, 8); assert.equal(r.value.lastSync, '2026-11-27 15:20（成功）');
  assert.deepEqual(r.value.rows[1].repos, ['example-backend', 'example-frontend']);
  assert.deepEqual(r.value.rows[1].prs, ['backend#5012', 'frontend#4101']);
  const minimal = call('ledger', 'parseLedger', '## 進行中\n| 状態 | ID |\n| --- | --- |\n| 作業中 | abc |');
  assert.equal(minimal.value.rows[0].id, 'abc'); assert.equal(minimal.value.rows[0].workspace, '');
});
test('表なしは失敗、空の表は成功、壊れた行と不正IDは行番号付きで残る', () => {
  assert.equal(call('ledger', 'parseLedger', '# 空').value, null);
  const header = '## 進行中\n| ID | 状態 |\n| --- | --- |\n';
  assert.deepEqual(call('ledger', 'parseLedger', header).value.rows, []);
  const r = call('ledger', 'parseLedger', header + '| abc |\n| ../x | 作業中 |');
  assert.equal(r.errors.length, 2); assert.equal(r.errors[0].line, 4);
});
test('stateは構造の信頼性と依頼表の信頼性を別々に返す', () => {
  const text = fixture('state.md'); const r = call('task-state', 'parseTaskState', text);
  assert.deepEqual(r.errors, []); assert.equal(r.value.workspace, 'w1BB');
  assert.equal(r.value.lead.pane, 'w1BB:p1'); assert.equal(r.value.requests[0].delivery, '送信済み');
  const broken = call('task-state', 'parseTaskState', text + '| x | 追加 | 不明 | |\n');
  assert.equal(broken.value.structureTrusted, true); assert.equal(broken.value.requestsTrusted, false);
  assert.ok(broken.errors.length);
  assert.equal(call('task-state', 'parseTaskState', text.replace(/^- 主担当:.*$/m, '')).value.structureTrusted, false);
  assert.equal(call('task-state', 'parseTaskState', text.replace(/^- workspace:.*$/m, '')).value.structureTrusted, false);
});
test('予約時の未作成workspaceと未起動paneも解釈できる', () => {
  const r = call('task-state', 'parseTaskState', '- 段階: 予約\n- workspace: （未作成）\n- 主担当: 名前 abc / pane （未起動） / セッションは lead\n## 依頼\n| 番号 | 送達 |\n| --- | --- |\n| 1 | 未送信 |');
  assert.equal(r.value.structureTrusted, true); assert.equal(r.value.workspace, ''); assert.equal(r.value.lead.pane, '');
});
test('報告はタブと日時を解析しnoteを保存する', () => {
  const r = call('report-log', 'parseReportLog', fixture('report.log'));
  assert.deepEqual(r.errors, []); assert.equal(r.value[0].at, '2026-11-27T06:26:04.000Z'); assert.equal(r.value[1].state, 'note');
  assert.deepEqual(call('report-log', 'parseReportLog', '').value, []);
});
test('報告の壊れた末尾、状態、日付、番号は解析エラーになる', () => {
  for (const line of ['broken', '1\t2026-11-27T15:26:04+0900\t1\tbad\tp\t本文', '1\t2026-02-30T15:26:04+0900\t1\tdone\tp\t本文', 'x\t2026-11-27T15:26:04+0900\t1\tdone\tp\t本文']) {
    const r = call('report-log', 'parseReportLog', fixture('report.log') + line);
    assert.equal(r.errors.length, 1); assert.equal(r.value.length, 2);
  }
});
test('herdrの一覧を解析しname省略と未知statusを扱う', () => {
  assert.equal(call('herdr', 'parseHerdr', fixture('workspaces.json'), 'workspaces').value.length, 3);
  const json = JSON.parse(fixture('agents.json')); delete json.result.agents[0].name; json.result.agents[0].agent_status = 'future';
  const r = call('herdr', 'parseHerdr', JSON.stringify(json), 'agents');
  assert.deepEqual(r.errors, []); assert.equal(r.value[0].name, null); assert.equal(r.value[0].agent_status, 'unknown');
});
test('herdrのerror、非JSON、配列欠落、不完全な要素は失敗になる', () => {
  for (const text of ['not json', '{"error":{"message":"停止中"}}', '{"result":{}}', '{"result":{"agents":[{}]}}']) {
    assert.ok(call('herdr', 'parseHerdr', text, 'agents').errors.length > 0);
  }
});
test('cos.stateはpaneを読み、不正な行を通知する', () => {
  assert.equal(call('cos-state', 'parseCosState', fixture('cos.state')).value, 'w1BA:p1');
  assert.ok(call('cos-state', 'parseCosState', 'broken').errors.length);
});
test('Herdrの失敗理由は改行を含む応答でも1行にする', () => {
  const result = call('herdr', 'parseHerdr', JSON.stringify({error:{message:'接続失敗\n再試行\rしてください'}}), 'workspaces');
  assert.equal(result.errors.length, 1);
  assert.doesNotMatch(result.errors[0].message, /[\r\n]/);
});
test('見出し直後の区切り行が欠けるか列数が違えば表を信頼しない', () => {
  for (const separator of ['', '| --- |\n']) {
    const r = call('ledger', 'parseLedger', '## 進行中\n| ID | 状態 |\n' + separator + '| abc | 作業中 |\n');
    assert.equal(r.value, null);
    assert.ok(r.errors.length);
  }
});
test('依頼の表の中身を読み、中身の列が無ければ空にする', () => {
  const text = fixture('state.md');
  const parseTaskState = t => call('task-state', 'parseTaskState', t);
  assert.equal(parseTaskState(text).value.requests[0].summary, 'CoS の Kanban 風ボード（読み取り専用の Web 画面）を作る');
  const cleanup = parseTaskState(text + '| 2 | 閉じる前の片付け（worktree を消す） | 未送信 | |\n').value;
  assert.equal(cleanup.requests[1].summary, '閉じる前の片付け（worktree を消す）');
  const noSummary = parseTaskState(text.replace('| 番号 | 中身（1 行） | 送達 | 送った時刻 |', '| 番号 | 説明 | 送達 | 送った時刻 |')).value;
  assert.equal(noSummary.requestsTrusted, true); assert.equal(noSummary.requests[0].summary, '');
});
