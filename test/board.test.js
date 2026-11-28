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

const changeAgents = (s, change) => {
  const json = JSON.parse(s.agents.stdout); change(json.result.agents); s.agents.stdout = JSON.stringify(json);
};
const demoCard = b => cards(b).find(c => c.id === 'DEMO-101');
test('paneは主担当・隣の担当・その他の順で同役割は自然順になる', () => {
  const s = sources();
  changeAgents(s, agents => {
    const sibling = agents.find(a => a.pane_id === 'w1AV:p2');
    sibling.name = 'DEMO-101-frontend';
    agents.unshift({...sibling,pane_id:'w1AV:p10',name:'DEMO-101-worker',agent_status:'blocked'});
    for (const [i,name] of ['DEMO-1010-x','DEMO-101-','frontend',null].entries()) agents.push({...sibling,pane_id:`w1AV:p${i+20}`,name});
  });
  const panes = demoCard(build(s)).panes;
  assert.deepEqual(panes.map(p => [p.paneId,p.role]), [['w1AV:p1','lead'],['w1AV:p2','sibling'],['w1AV:p10','sibling'],['w1AV:p20','other'],['w1AV:p21','other'],['w1AV:p22','other'],['w1AV:p23','other']]);
  assert.ok(panes.every(p => !Object.hasOwn(p,'isLead')));
});
test('stateを読めないと主担当にせず、sessionのpaneはすべてotherになる', () => {
  const s = sources(); s.tasks['DEMO-101'].state = {kind:'error',reason:'読めない'};
  assert.ok(demoCard(build(s)).panes.every(p => p.role !== 'lead'));
  s.ledger = {kind:'missing'};
  const sessions = cards(build(s));
  assert.ok(sessions.every(c => c.kind === 'session'));
  assert.ok(sessions.flatMap(c => c.panes).every(p => p.role === 'other'));
});
test('repoはhome置換後のcwd末尾で、空・root・末尾スラッシュを扱う', () => {
  for (const [cwd,display,repo] of [['/Users/example/develop/backend','~/develop/backend','backend'],['/Users/example','~','~'],['','',''],['/','/',''],['/work/frontend///','/work/frontend///','frontend']]) {
    const s = sources(); changeAgents(s, agents => {agents.find(a => a.pane_id === 'w1AV:p1').cwd = cwd;});
    const pane = demoCard(build(s)).panes.find(p => p.paneId === 'w1AV:p1');
    assert.equal(pane.cwd,display); assert.equal(pane.repo,repo);
  }
});
test('重複した主担当行は迷子のカードにleadを2行残して表示する', () => {
  const s = sources(); changeAgents(s, agents => agents.push({...agents.find(a => a.pane_id === 'w1AV:p1')}));
  const b = build(s), task = demoCard(b);
  assert.ok(b.columns.find(c => c.key === 'lost').cards.includes(task));
  assert.equal(task.panes.filter(p => p.role === 'lead').length,2);
  assert.deepEqual(validateBoard(b),[]);
});
test('下書きでもpaneのroleとrepoを生成する', () => {
  const s = sources(); s.ledger.text = s.ledger.text.replace('| 外部待ち |','| 下書き |');
  const task = build(s).drafts[0];
  assert.equal(task.panes.find(p => p.paneId === 'w1AV:p1').role,'lead');
  assert.equal(task.panes.find(p => p.paneId === 'w1AV:p1').repo,'backend');
});

test('briefとstateの回答印を使い、未読の問いも残し、両方読めなければ警告する',()=>{
  const s=sources();
  const t=s.tasks['DEMO-101'];
  t.asks={kind:'list',omitted:2,files:[
    {name:'1.md',source:{kind:'text',text:'# ask/1 題\n## 問い\n質問',mtime:'2026-11-27T06:00:00.000Z'}},
    {name:'2.md',source:{kind:'error',reason:'大きすぎて読めません'}},
    {name:'3.md',source:{kind:'text',text:'# ask/3 別の問い',mtime:'2026-11-27T06:01:00.000Z'}}]};
  t.brief=text('## ask/1 への答え');
  t.state.text=t.state.text.replace('CoS の Kanban 風ボード（読み取り専用の Web 画面）を作る','ask/3 への答え');
  let b=build(s), card=demoCard(b);
  assert.deepEqual(card.asks.map(a=>a.answered),[true,false,true]);
  assert.equal(card.asks[0].body,null); assert.match(card.askError,/古い問い/);
  assert.equal(b.turns.filter(t=>t.kind==='ask').length,1);
  assert.equal(b.cos.paneId,'w1BA:p1');
  t.brief={kind:'error',reason:'読めない'}; t.state={kind:'error',reason:'読めない'};
  card=demoCard(build(s)); assert.ok(card.asks.every(a=>!a.answered)); assert.match(card.askError,/答え済み/);
});
test('blocked paneの画面と観測時刻をカードに結び付ける',()=>{
  const s=sources(); changeAgents(s,a=>{a.find(p=>p.pane_id==='w1AV:p1').agent_status='blocked';});
  s.prompts={'w1AV:p1':{ok:true,stdout:'実行しますか？\n1. はい\n2. いいえ'}};
  s.blockedSince={'w1AV:p1':'2026-11-27T06:00:00.000Z'};
  const b=build(s), pane=demoCard(b).panes.find(p=>p.paneId==='w1AV:p1');
  assert.equal(pane.prompt.question,'実行しますか？');
  assert.equal(pane.blockedSince,'2026-11-27T06:00:00.000Z');
  assert.equal(b.turns.find(t=>t.kind==='permission').sinceSource,'observed');
});
