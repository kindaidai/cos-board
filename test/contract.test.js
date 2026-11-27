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
