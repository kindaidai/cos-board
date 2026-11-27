import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureDirectory, fakeHerdr } from './helpers.js';

const up = fileURLToPath(new URL('../bin/cos-board-up', import.meta.url));
const skill = fileURLToPath(new URL('./fixtures/chief-of-staff.md', import.meta.url));

function run(args, env) {
  return new Promise(resolve => {
    execFile(up, args, {env, timeout:15000}, (error, stdout, stderr) => resolve({code:error ? error.code : 0, stdout, stderr}));
  });
}
async function freePort() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const {port} = server.address();
  server.close(); await once(server, 'close');
  return port;
}
async function setup(t) {
  const f = await fixtureDirectory(t);
  const stateDir = await mkdtemp(join(tmpdir(), 'cos-board-up-'));
  t.after(() => rm(stateDir, {recursive:true, force:true}));
  const port = await freePort();
  const env = {...f.env, COS_BOARD_PORT:String(port), COS_BOARD_STATE_DIR:stateDir};
  const args = ['--', '--cos-root', f.root, '--herdr', fakeHerdr, '--skill-path', skill];
  t.after(() => run(['--stop'], env));
  return {env, args, port, stateDir};
}

test('裏で起動し、2 回目は二重に起動せず、--stop で止まる', {timeout:30000}, async t => {
  const s = await setup(t);
  const first = await run(s.args, s.env);
  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stdout, new RegExp(`起動しました.*http://127\\.0\\.0\\.1:${s.port}`));
  const pid = (await readFile(join(s.stateDir, 'board.pid'), 'utf8')).trim();
  const board = await (await fetch(`http://127.0.0.1:${s.port}/api/board`)).json();
  assert.equal(board.ledger.ok, true);

  const second = await run(s.args, s.env);
  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /起動済み/);
  assert.equal((await readFile(join(s.stateDir, 'board.pid'), 'utf8')).trim(), pid);

  const stop = await run(['--stop'], s.env);
  assert.equal(stop.code, 0, stop.stderr);
  assert.match(stop.stdout, /止めました/);
  await assert.rejects(fetch(`http://127.0.0.1:${s.port}/api/board`));
});

test('ポートを別のものが使っていれば、理由とログの場所を出して失敗する', {timeout:30000}, async t => {
  const s = await setup(t);
  const other = createServer((_req, res) => res.end('other')).listen(s.port, '127.0.0.1');
  await once(other, 'listening');
  t.after(() => other.close());
  const result = await run(s.args, s.env);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /使用中/);
  assert.match(result.stderr, /board\.log/);
});

test('止めるボードが無ければ、その旨を出して正常終了する', {timeout:30000}, async t => {
  const s = await setup(t);
  const result = await run(['--stop'], s.env);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /動いていません/);
});
