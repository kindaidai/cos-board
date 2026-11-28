import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { fixtureDirectory, fakeHerdr } from './helpers.js';
const cli = await import('../src/io/options.js').catch(() => null);
test('起動引数の既定値・port 0・不正値を検査する', () => {
  assert.ok(cli, 'options が未実装');
  assert.deepEqual(cli.parseOptions([], '/home/test'),{port:4270,cosRoot:'/home/test/develop/.cos',herdrPath:'herdr',skillPath:'/home/test/.claude/skills/chief-of-staff/SKILL.md',terminalApp:undefined});
  assert.equal(cli.parseOptions(['--terminal-app','com.example.term']).terminalApp,'com.example.term');
  assert.equal(cli.parseOptions(['--skill-path','~/custom/SKILL.md'], '/home/test').skillPath, '/home/test/custom/SKILL.md');
  assert.equal(cli.parseOptions(['--port','0','--cos-root','/tmp/fixture','--herdr','/tmp/fake']).port,0);
  for (const args of [['--port','-1'],['--port','65536'],['--port','1e3'],['--port'],['--unknown','1']]) assert.throws(()=>cli.parseOptions(args));
});

async function startFixture(t, extra = []) {
  const f = await fixtureDirectory(t);
  const child = spawn(process.execPath, ['bin/cos-board.js', '--port', '0', '--cos-root', f.root, '--herdr', fakeHerdr, '--skill-path', fileURLToPath(new URL('./fixtures/chief-of-staff.md', import.meta.url)), ...extra], {env:f.env});
  let stderr = '';
  child.stderr.on('data', data => {stderr += data;});
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(); await once(child, 'exit');
    }
  });
  const url = await new Promise((resolve, reject) => {
    child.stdout.once('data', data => resolve(String(data).trim()));
    child.once('exit', code => reject(new Error(`起動失敗 ${code}: ${stderr}`)));
  });
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  return {...f, child, url};
}

test('CLIはフィクスチャで起動し、不正なURLでもプロセスが落ちない', {timeout:5000}, async t => {
  const f = await startFixture(t);
  const status = await new Promise((resolve, reject) => {
    const req = request(f.url, {path:'http://['}, res => {res.resume(); resolve(res.statusCode);});
    req.on('error', reject); req.end();
  });
  assert.equal(status, 400);
  const response = await fetch(`${f.url}/api/board`);
  assert.equal(response.status, 200);
  const board = await response.json();
  assert.equal(board.ledger.ok, true);
  assert.equal(board.herdr.ok, true);
  assert.deepEqual(board.alerts, []);
});
test('CLIのskill-pathで指定した読めないSKILLは200の警告として返す', {timeout:5000}, async t => {
  const f = await startFixture(t, ['--skill-path', '/nonexistent/SKILL.md']);
  const response = await fetch(`${f.url}/api/board`);
  assert.equal(response.status, 200);
  const board = await response.json();
  assert.equal(board.alerts.length, 1);
  assert.match(board.alerts[0].message, /CoS.*判定表/);
});

test('CLIは使用中のポートで理由をstderrに出して終了コード1を返す', {timeout:5000}, async t => {
  const f = await startFixture(t);
  const other = spawn(process.execPath, ['bin/cos-board.js', '--port', new URL(f.url).port, '--cos-root', f.root, '--herdr', fakeHerdr, '--skill-path', fileURLToPath(new URL('./fixtures/chief-of-staff.md', import.meta.url))], {env:f.env});
  let stderr = '', stdout = '';
  other.stderr.on('data', data => {stderr += data;});
  other.stdout.on('data', data => {stdout += data;});
  const [code] = await once(other, 'exit');
  assert.equal(code, 1);
  assert.match(stderr, /使用中/);
  assert.equal(stdout, '');
});

test('空白と日本語を含む配置先から画面のファイルを読める', async t => {
  const f = await fixtureDirectory(t);
  const copy = join(f.directory, '配置 先');
  await mkdir(copy);
  await Promise.all(['src','public'].map(name => cp(new URL(`../${name}`, import.meta.url), join(copy,name), {recursive:true})));
  const {readAssets} = await import(pathToFileURL(join(copy,'src/io/read-sources.js')));
  const assets = await readAssets();
  assert.match(assets['/'].body, /<!doctype html>/i);
  assert.match(assets['/poller.js'].body, /createPoller/);
});
