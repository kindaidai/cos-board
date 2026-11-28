import test from 'node:test';
import assert from 'node:assert/strict';

const contract = await import('../src/contract.js').catch(() => null);
test('契約モジュールが提供される', () => assert.ok(contract, 'contract.js が未実装'));
test('空の正常なボードを通し、壊れた形を理由付きで拒否する', () => {
  assert.ok(contract, 'contract.js が未実装');
  const board = { generatedAt: '2026-11-27T06:00:00.000Z', refreshSeconds: 3,
    ledger: { ok: true, lastSync: null, limit: 8, activeCount: 0 }, herdr: { ok: true },
    alerts: [], drafts: [], columns: contract.COLUMNS.map(([key, title]) => ({key, title, available: true, cards: []})) };
  assert.deepEqual(contract.validateBoard(board), []);
  for (const bad of [null, {}, {...board, refreshSeconds: 0}, {...board, generatedAt: 'bad'},
    {...board, generatedAt: '2026-02-30T00:00:00.000Z'},
    {...board, columns: []}, {...board, alerts: [{level: 'bad', message: 1}]},
    {...board, ledger: {ok: false}}, {...board, drafts: [{kind: 'session'}]}]) {
    assert.ok(contract.validateBoard(bad).length > 0, JSON.stringify(bad));
  }
});

test('paneのroleとrepoを検査し、sessionはotherだけ、重複leadは許容する', () => {
  const pane = {paneId:'w1AV:p1', name:'DEMO-101', role:'lead', repo:'backend', agent:'claude', status:'idle', cwd:'/backend', title:''};
  const task = {kind:'task', id:'DEMO-101', title:'', area:'', type:'', repos:[], prs:[], nextAction:'', state:'迷子', ledgerState:'作業中', ledgerStateRaw:'作業中', basis:'herdr', rule:'6', reason:'', needsCheck:null, badges:[], latestReport:null, latestNote:null, updatedAt:null, updatedSource:null, ledgerUpdatedRaw:'', workspace:{id:'w1AV',number:1,present:true}, canFocus:true, canClose:false, panes:[pane, {...pane}]};
  const board = {generatedAt:'2026-11-27T06:00:00.000Z', refreshSeconds:3, ledger:{ok:true,lastSync:null,limit:8,activeCount:1}, herdr:{ok:true}, alerts:[], drafts:[task], columns:contract.COLUMNS.map(([key,title])=>({key,title,available:true,cards:[]}))};
  assert.deepEqual(contract.validateBoard(board), []);
  for (const role of ['lead','sibling','other']) {
    task.panes = [{...pane,role}]; assert.deepEqual(contract.validateBoard(board), []);
  }
  for (const bad of [{...pane,role:'owner'}, {...pane,role:undefined}, {...pane,repo:undefined}, {...pane,repo:null}]) {
    task.panes = [bad]; assert.ok(contract.validateBoard(board).length > 0);
  }
  board.drafts = [];
  const session = {kind:'session', workspace:{id:'w1AV',number:1,label:''}, isCos:false, blocked:false, panes:[{...pane,role:'other'}]};
  board.columns[0].cards = [session]; assert.deepEqual(contract.validateBoard(board), []);
  for (const role of ['lead','sibling']) {
    session.panes = [{...pane,role}]; assert.ok(contract.validateBoard(board).length > 0);
  }
});
