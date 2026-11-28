import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, symlink, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fixtureDirectory, fakeHerdr, readCalls } from './helpers.js';
import { buildBoard } from '../src/judge/build-board.js';
const io = await import('../src/io/read-sources.js').catch(() => null);
const cli = await import('../src/io/herdr-cli.js').catch(() => null);
async function snapshot(root) {
  const result = {};
  for (const name of await readdir(root, {recursive:true})) {
    const file = join(root, name), info = await stat(file);
    if (info.isFile()) result[name] = {text: await readFile(file,'utf8'), mtime: info.mtimeMs};
  }
  return result;
}
async function setup(t) {
  assert.ok(io, 'read-sources が未実装'); assert.ok(cli, 'herdr-cli が未実装');
  const f = await fixtureDirectory(t);
  return {...f, herdr: cli.createHerdr({path: fakeHerdr, env:f.env})};
}
test('実ファイルと偽物CLIを読み、内容もmtimeも変えない', async t => {
  const f = await setup(t); const before = await snapshot(f.root);
  const sources = await io.readSources({cosRoot:f.root, herdr:f.herdr});
  assert.equal(buildBoard(sources, new Date('2026-11-27T07:00:00Z')).columns[1].cards.length, 2);
  assert.deepEqual(await snapshot(f.root), before);
  assert.deepEqual((await readCalls(f.calls)).sort(), [['agent','list'],['workspace','list']]);
});
for (const scenario of ['task-symlink','report-symlink','report-fifo','root-symlink','tasks-symlink']) {
  test(`通常でない対象を開かない: ${scenario}`, {timeout:3000}, async t => {
    const f = await setup(t); const task = join(f.root,'tasks/cos-board-261127-init');
    let root = f.root;
    if (scenario === 'task-symlink') {await rm(task, {recursive:true}); await symlink(f.directory,task);}
    if (scenario === 'report-symlink') {await rm(join(task,'report.log')); await symlink(join(f.root,'ledger.md'),join(task,'report.log'));}
    if (scenario === 'report-fifo') {await rm(join(task,'report.log')); execFileSync('mkfifo',[join(task,'report.log')]);}
    if (scenario === 'root-symlink') {root = join(f.directory,'alias'); await symlink(f.root,root);}
    if (scenario === 'tasks-symlink') {await rm(join(f.root,'tasks'),{recursive:true}); await symlink(f.directory,join(f.root,'tasks'));}
    const s = await io.readSources({cosRoot:root,herdr:f.herdr});
    if (scenario === 'root-symlink') assert.equal(s.ledger.kind,'error');
    else assert.equal(s.tasks['cos-board-261127-init'][scenario.startsWith('report') ? 'report':'state'].kind,'error');
  });
}
test('ファイルが無いことと読めないことを区別する', async t => {
  const f = await setup(t); await rm(join(f.root,'tasks/cos-board-261127-init/report.log'));
  const s = await io.readSources({cosRoot:f.root,herdr:f.herdr});
  assert.equal(s.tasks['cos-board-261127-init'].report.kind,'missing');
});
test('子プロセスの失敗・不存在・タイムアウトを理由付きで返す', async t => {
  assert.ok(cli, 'herdr-cli が未実装'); const f = await fixtureDirectory(t);
  for (const config of [{path:'/nonexistent'}, {path:fakeHerdr,env:{...f.env,FAKE_HERDR_FAIL:'all'}},
    {path:fakeHerdr,env:{...f.env,FAKE_HERDR_DELAY:'500'}, timeoutMs:30}]) {
    const r = await cli.createHerdr(config).list('workspace'); assert.equal(r.ok,false); assert.ok(r.reason);
  }
});

test('focusPaneは不正なIDを実行前に拒否し、pane IDだけをagent focusに渡す', async t => {
  const f = await setup(t);
  assert.equal(typeof f.herdr.focusPane,'function');
  for (const id of [null,42,{},['w1AV:p2'],'','--help','w1AV','w1AV:p2\n','w1AV:p2 extra']) {
    assert.throws(() => f.herdr.focusPane(id), /pane ID が不正/);
  }
  assert.deepEqual(await readCalls(f.calls),[]);
  const result = await f.herdr.focusPane('w1AV:p2');
  assert.equal(result.ok,true); assert.equal(JSON.parse(result.stdout).result.agent.focused,true);
  assert.deepEqual(await readCalls(f.calls),[['agent','focus','w1AV:p2']]);
});
test('focusPaneのHerdr実行失敗は理由付きで返る', async t => {
  const f = await fixtureDirectory(t);
  const herdr = cli.createHerdr({path:fakeHerdr,env:{...f.env,FAKE_HERDR_FOCUS_FAIL:'1'}});
  assert.equal(typeof herdr.focusPane,'function');
  const result = await herdr.focusPane('w1AV:p9');
  assert.equal(result.ok,false); assert.match(result.reason,/agent_not_found/);
});

test('readAssetsはpane-viewをJavaScriptとして配信する', async () => {
  const assets = await io.readAssets();
  assert.ok(assets['/pane-view.js']);
  assert.equal(assets['/pane-view.js'].type,'text/javascript; charset=utf-8');
  const module = await import(`data:text/javascript;base64,${Buffer.from(assets['/pane-view.js'].body).toString('base64')}`);
  assert.equal(module.paneView({paneId:'w1AV:p2',name:null,repo:'',role:'other',status:'idle',title:'',cwd:''}).heading,'w1AV:p2');
});
