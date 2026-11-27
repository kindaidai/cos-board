import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBoard } from '../src/contract.js';
const dates = await import('../src/judge/updated-at.js').catch(() => null);
const boards = await import('../src/judge/build-board.js').catch(() => null);
const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const text = text => ({kind: 'text', text});
function sources() {
  return {ledger: text(fixture('ledger.md')), cosState: text(fixture('cos.state')), home: '/Users/example',
    workspaces: {ok: true, stdout: fixture('workspaces.json')}, agents: {ok: true, stdout: fixture('agents.json')},
    tasks: Object.fromEntries(['cos-board-261127-init', 'DEMO-101'].map(id => [id, {
      state: text(fixture(`cos/tasks/${id}/state.md`)), report: text(fixture(`cos/tasks/${id}/report.log`)), lead: text('session\n')}]))};
}
function build(s = sources()) { assert.ok(boards, 'build-board が未実装'); return boards.buildBoard(s, new Date('2026-11-27T07:00:00.000Z')); }
const cards = board => [...board.drafts, ...board.columns.flatMap(c => c.cards)];
test('東京の台帳時刻をUTCへ変換し最新の出どころを選ぶ', () => {
  assert.ok(dates, 'updated-at が未実装'); const now = new Date('2026-11-27T07:00:00Z');
  assert.deepEqual(dates.updatedAt('11-27 15:26', [], now), {updatedAt:'2026-11-27T06:26:00.000Z', updatedSource:'ledger'});
  assert.deepEqual(dates.updatedAt('', [{at:'2026-11-27T06:30:00.000Z'}], now), {updatedAt:'2026-11-27T06:30:00.000Z', updatedSource:'report'});
  assert.equal(dates.updatedAt('11-27 15:26', [{at:'2026-11-27T06:25:00.000Z'}], now).updatedSource, 'ledger');
  assert.equal(dates.updatedAt('11-27 15:26', [{at:'2026-11-27T06:27:00.000Z'}], now).updatedSource, 'report');
});
test('年またぎと存在しない日時を扱う', () => {
  assert.ok(dates);
  assert.equal(dates.updatedAt('12-31 23:59', [], new Date('2026-12-31T16:00:00Z')).updatedAt, '2026-12-31T14:59:00.000Z');
  for (const value of ['13-40 25:99','02-30 10:00','02-29 10:00','bad']) assert.equal(dates.updatedAt(value, [], new Date('2026-11-27T00:00:00Z')).updatedAt, null);
});
test('UNIX epochの報告も有効な更新時刻として採る', () => {
  assert.deepEqual(dates.updatedAt('', [{at:'1970-01-01T00:00:00.000Z'}], new Date('2026-11-27T00:00:00Z')),
    {updatedAt:'1970-01-01T00:00:00.000Z', updatedSource:'report'});
});
test('組み立ては6列・契約・CoS・最新note・workspaceを保持する', () => {
  const b = build(); assert.deepEqual(validateBoard(b), []);
  assert.deepEqual(b.columns.map(c => c.key), ['your-turn','working','external','done','lost','unlisted']);
  assert.equal(b.ledger.activeCount, 2); assert.equal(b.columns[1].cards.length, 2);
  assert.equal(b.columns[5].cards[0].isCos, true);
  const task = cards(b).find(c => c.id === 'cos-board-261127-init');
  assert.equal(task.latestNote.state, 'note'); assert.equal(task.canFocus, true); assert.equal(task.workspace.number, 9);
  for (const bad of [{...task, canFocus: 'yes'}, {...task, panes: [{}]}, {...task, latestReport: {}}]) {
    assert.ok(validateBoard({...b, drafts: [bad]}).length > 0);
  }
});
test('Herdr失敗は空と区別して台帳状態を維持する', () => {
  const s = sources(); s.agents = {ok:false, reason:'タイムアウト'};
  const b = build(s); assert.equal(b.herdr.ok, false); assert.ok(b.alerts.length);
  assert.equal(b.columns[5].available, false);
  assert.equal(cards(b).find(c => c.id === 'DEMO-101').state, '外部待ち');
  assert.equal(cards(b)[0].workspace.present, null); assert.deepEqual(validateBoard(b), []);
});
test('台帳取得失敗時は全workspaceをセッションとして出す（blockedはあなたの番）', () => {
  const s = sources(); s.ledger = {kind:'missing'};
  const json = JSON.parse(s.agents.stdout); json.result.agents[0].agent_status = 'blocked'; s.agents.stdout = JSON.stringify(json);
  const b = build(s); assert.equal(b.ledger.ok,false); assert.equal(b.columns[0].available, false);
  assert.equal(b.columns[0].cards[0].kind, 'session'); assert.equal(cards(b).length, 3); assert.deepEqual(validateBoard(b), []);
});
test('下書き、壊れた台帳行、state不一致、並び順を扱う', () => {
  const s = sources(); s.ledger.text += '| 壊れた行 |\n';
  s.ledger.text = s.ledger.text.replace('| 外部待ち |','| 下書き |');
  const b = build(s); assert.equal(b.drafts.length, 1); assert.ok(b.alerts.some(a => /行/.test(a.message)));
  const t = sources(); t.tasks['DEMO-101'].state = {kind:'error',reason:'読めない'};
  t.ledger.text = t.ledger.text.replace('| 外部待ち |','| 作業中 |');
  const broken = build(t); assert.equal(broken.columns[1].cards[0].id, 'DEMO-101');
  const u = sources(); u.tasks['cos-board-261127-init'].state.text = u.tasks['cos-board-261127-init'].state.text.replaceAll('w1BB', 'w1AV');
  const mismatch = build(u); assert.equal(cards(mismatch).find(c => c.id === 'cos-board-261127-init').canFocus, false);
});
test('stateが参照するworkspaceも台帳外カードとして二重表示しない', () => {
  const s = sources(); s.tasks['cos-board-261127-init'].state.text = s.tasks['cos-board-261127-init'].state.text.replaceAll('w1BB','w1BA');
  assert.equal(build(s).columns[5].cards.length, 0);
});
