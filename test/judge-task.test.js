import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLedger } from '../src/parse/ledger.js';
import { parseTaskState } from '../src/parse/task-state.js';
import { parseReportLog } from '../src/parse/report-log.js';
import { parseHerdr } from '../src/parse/herdr.js';
const judge = await import('../src/judge/judge-task.js').catch(() => null);
const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
function input() {
  const agents = parseHerdr(fixture('agents.json'), 'agents').value;
  agents[0].agent_status = 'idle';
  return {row: parseLedger(fixture('ledger.md')).value.rows[0], state: parseTaskState(fixture('state.md')).value,
    reports: parseReportLog('1\t2026-11-27T15:26:04+0900\t1\tdone\tw1BB:p1\t終了'),
    lead: 'fixture-session', herdr: {ok: true, agents, workspaces: parseHerdr(fixture('workspaces.json'), 'workspaces').value}};
}
const cleanup = d => { d.state.requests[0].summary = '閉じる前の片付け（worktree と作業ファイルを消す）'; };
const run = data => { assert.ok(judge, 'judge-task が未実装'); return judge.judgeTask(data); };
const cases = [
  ['0', 'Herdr失敗は台帳を保つ', d => {d.herdr.ok = false;}, '作業中'],
  ['1', '下書きは照合しない', d => {d.row.ledgerStateRaw = '下書き'; d.state = null;}, '下書き'],
  ['2', 'stateが不明なら保留', d => {d.state = null;}, '作業中'],
  ['3', 'workspaceが不一致なら保留', d => {d.state.workspace = 'other';}, '作業中'],
  ['4', '完了でworkspaceが消えたら片付け待ち', d => {d.row.ledgerStateRaw = '完了'; d.herdr.workspaces = [];}, '完了'],
  ['5', '完了でworkspaceが残っていれば完了', d => {d.row.ledgerStateRaw = '完了';}, '完了'],
  ['6', '主担当がいなければ迷子', d => {d.herdr.agents = [];}, '迷子'],
  ['7', 'unknownは保留', d => {d.herdr.agents[0].agent_status = 'unknown';}, '作業中'],
  ['8', 'blockedはあなた待ち', d => {d.herdr.agents[0].agent_status = 'blocked';}, 'あなた待ち'],
  ['9', 'workingは作業中', d => {d.herdr.agents[0].agent_status = 'working';}, '作業中'],
  ['10a', '依頼表が不明なら保留', d => {d.state.requestsTrusted = false;}, '作業中'],
  ['10b', 'need-userはあなた待ち', d => {d.reports.value[0].state = 'need-user';}, 'あなた待ち'],
  ['10c', 'need-externalは外部待ち', d => {d.reports.value[0].state = 'need-external';}, '外部待ち'],
  ['10d', '片付けの依頼のdoneで未送信なしなら完了', cleanup, '完了'],
  ['10g', '作業の依頼のdoneは作業中のまま', () => {}, '作業中'],
  ['10e', 'doneでも未送信ありなら保留', d => {d.state.requests.push({number: 2, delivery: '未送信'});}, '作業中'],
  ['10f', 'workingの報告なら保留', d => {d.reports.value[0].state = 'working';}, '作業中'],
];
for (const [rule, label, edit, state] of cases) test(`判定 ${rule}: ${label}`, () => {
  const data = input(); edit(data); const result = run(data);
  assert.equal(result.rule, rule); assert.equal(result.state, state);
});
test('判定10: idle/doneだけの集合で報告判定へ進む', () => {
  const d = input(); cleanup(d); d.herdr.agents.push({...d.herdr.agents[0], name: '隣', pane_id: 'w1BB:p2', agent_status: 'done'});
  assert.equal(run(d).rule, '10d');
});
test('unknownはblockedより優先し、blockedはworkingより優先する', () => {
  const d = input(); d.herdr.agents[0].agent_status = 'blocked';
  d.herdr.agents.push({...d.herdr.agents[0], name: '隣', pane_id: 'w1BB:p2', agent_status: 'unknown'});
  assert.equal(run(d).rule, '7'); d.herdr.agents.at(-1).agent_status = 'working'; assert.equal(run(d).rule, '8');
});
test('未知のpane状態もunknownとしてblockedより先に保留する', () => {
  const d = input();
  d.herdr.agents[0].agent_status = 'blocked';
  d.herdr.agents.push({...d.herdr.agents[0], name: '隣', pane_id: 'w1BB:p2', agent_status: 'new-status'});
  const r = judge.judgePanes({...d, panes: d.herdr.agents.filter(a => a.workspace_id === 'w1BB')});
  assert.equal(r.rule, '7');
  assert.equal(r.state, '作業中');
  assert.ok(r.needsCheck);
});
test('重複名・pane違い・agent違い・session違いは主担当と認めない', () => {
  for (const change of [d => d.herdr.agents.push({...d.herdr.agents[0]}), d => {d.herdr.agents[0].pane_id = 'w1BB:p2';},
    d => {d.herdr.agents[0].agent = 'codex';}, d => {d.herdr.agents[0].agent_session = 'other';}]) {
    const d = input(); change(d); assert.equal(run(d).rule, '6');
  }
});
test('依頼2の壊れた行を落として依頼1のdoneを採らない', () => {
  const d = input(); d.state = parseTaskState(fixture('state.md') + '| 2 | 追加 | 壊れた送達 | |\n').value;
  const r = run(d); assert.equal(r.rule, '10a'); assert.notEqual(r.state, '完了'); assert.ok(r.needsCheck);
});
test('依頼表の途中にある区切り風の破損行でも古いdoneを採らない', () => {
  const d = input();
  d.state = parseTaskState(fixture('state.md') + '| --- | --- | --- | --- |\n').value;
  const r = run(d);
  assert.equal(r.rule, '10a');
  assert.equal(r.state, '作業中');
  assert.ok(r.needsCheck);
});
test('報告の最終行が壊れていたら直前のdoneを採らない', () => {
  const d = input(); d.reports.errors.push({line: 2, message: '壊れた行'});
  assert.equal(run(d).rule, '10a');
  d.herdr.agents[0].agent_status = 'working'; assert.ok(run(d).badges.includes('報告に読めない行あり'));
});
test('別workspaceのblockedを採らず、focusも無効にする', () => {
  const d = input(); d.row.workspace = 'w1AV'; d.herdr.agents[2].agent_status = 'blocked';
  const r = run(d); assert.equal(r.rule, '3'); assert.equal(r.canFocus, false); assert.equal(r.state, '作業中');
});
test('paneの空集合は報告判定に進めない', () => {
  assert.ok(judge); const d = input();
  const r = judge.judgePanes({...d, panes: []}); assert.ok(r.needsCheck); assert.notEqual(r.state, '完了');
});
test('現在より前の依頼のdone、noteだけ、現在依頼なしは10f', () => {
  for (const change of [d => {d.state.requests[0].number = 2;}, d => {d.reports.value[0].state = 'note';}, d => {d.state.requests = [];}]) {
    const d = input(); change(d); assert.equal(run(d).rule, '10f');
  }
});
test('不明な台帳状態は作業中の列に保ち要確認にする', () => {
  const d = input(); d.row.ledgerStateRaw = '不明'; d.herdr.ok = false;
  const r = run(d); assert.equal(r.state, null); assert.equal(r.column, 'working'); assert.ok(r.needsCheck);
});
test('中止予定の消失workspaceは片付け待ち、台帳の要確認も保持する', () => {
  const d = input(); d.state.phase = '中止予定'; d.herdr.workspaces = []; d.row.nextAction = '要確認: 理由';
  const r = run(d); assert.equal(r.rule, '4'); assert.equal(r.column, 'done'); assert.ok(r.needsCheck); assert.ok(r.badges.includes('片付け待ち'));
});
test('lead空でagent_sessionありなら迷子にせず要確認にする', () => {
  for (const lead of [null, '', '   ']) {
    const d = input(); d.lead = lead; d.herdr.agents[0].agent_session = 'session';
    const r = run(d);
    assert.equal(r.rule, '6'); assert.equal(r.state, '作業中');
    assert.equal(r.needsCheck, 'lead が読めない');
  }
});
test('agent_sessionがnull・空文字なら省略と同じく主担当として認める', () => {
  for (const session of [null, '']) {
    const d = input(); cleanup(d); d.herdr.agents[0].agent_session = session;
    assert.equal(run(d).rule, '10d');
  }
});
test('leadはsession省略時も読める必要があり、一致しない値は迷子にする', () => {
  const d = input(); d.lead = null;
  assert.equal(run(d).needsCheck, 'lead が読めない');
  d.lead = 'readable'; d.herdr.agents[0].agent_session = 'different';
  assert.equal(run(d).state, '迷子');
});
test('判定4の中止予定は完了列で中止の印を付ける', () => {
  const d = input(); d.state.phase = '中止予定'; d.herdr.workspaces = [];
  const r = run(d);
  assert.equal(r.rule, '4'); assert.equal(r.column, 'done');
  assert.deepEqual(r.badges, ['片付け待ち', '中止']);
  d.state.phase = '稼働'; d.row.ledgerStateRaw = '完了';
  assert.deepEqual(run(d).badges, ['片付け待ち']);
});
test('作業の依頼のdoneは作業中列で、報告を根拠にし、要確認にしない', () => {
  const d = input(); d.row.ledgerStateRaw = '外部待ち';
  const r = run(d);
  assert.equal(r.rule, '10g'); assert.equal(r.state, '作業中'); assert.equal(r.column, 'working');
  assert.equal(r.basis, 'report'); assert.equal(r.needsCheck, null);
});
test('片付けの判定は現在の依頼の中身で見る（前の依頼が片付けでも採らない）', () => {
  const d = input(); cleanup(d);
  d.state.requests.push({number: 2, summary: '追加の修正', delivery: '受領済み'});
  d.reports = parseReportLog('1\t2026-11-27T15:26:04+0900\t1\tdone\tw1BB:p1\t片付け済み\n2\t2026-11-27T16:00:00+0900\t2\tdone\tw1BB:p1\t修正済み');
  assert.equal(run(d).rule, '10g');
  d.state.requests.push({number: 3, summary: '閉じる前の片付け', delivery: '送信済み'});
  d.reports = parseReportLog('1\t2026-11-27T16:10:00+0900\t3\tdone\tw1BB:p1\t片付けた');
  assert.equal(run(d).rule, '10d');
});
test('片付けの語が先頭に無ければ片付けの依頼と見なさない', () => {
  const d = input(); d.state.requests[0].summary = '依頼の後に閉じる前の片付け';
  assert.equal(run(d).rule, '10g');
});

for (const [rule,label,edit] of cases) test('規則11を既存判定 '+rule+' のあとに当てる',()=>{
  const d=input(); edit(d); const before=run(d);
  const after=run({...d,pendingAsks:[{number:2}]});
  if (['working','external'].includes(before.column)) {
    assert.equal(after.rule,'11'); assert.equal(after.state,'あなた待ち');
    assert.equal(after.basis,'ask'); assert.equal(after.needsCheck,before.needsCheck);
    assert.deepEqual(after.badges,before.badges); assert.match(after.reason,new RegExp('規則 '+rule));
  } else assert.deepEqual(after,before);
});
