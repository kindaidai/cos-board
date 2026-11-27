import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { fixtureDirectory, fakeHerdr, readCalls } from './helpers.js';
import { createHerdr } from '../src/io/herdr-cli.js';
import { readSources } from '../src/io/read-sources.js';
import { buildBoard } from '../src/judge/build-board.js';
import { validateBoard } from '../src/contract.js';
import { readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createSkillMonitor } from '../src/io/skill-monitor.js';
const app = await import('../src/server/app.js').catch(() => null);
async function setup(t, env = {}) {
  assert.ok(app, 'server/app が未実装');
  const f = await fixtureDirectory(t);
  const herdr = createHerdr({path:fakeHerdr,env:{...f.env,...env}});
  const server = app.createApp({herdr,readBoard:async () => buildBoard(await readSources({cosRoot:f.root,herdr}),new Date('2026-11-27T07:00:00Z')),
    assets:{'/':{body:'<!doctype html>',type:'text/html'}}});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return {...f,server,url:`http://127.0.0.1:${server.address().port}`};
}
test('GETは契約通り・no-store・127.0.0.1待受で、5要求が一覧取得を共有する', async t => {
  const f = await setup(t,{FAKE_HERDR_DELAY:'70'});
  const responses = await Promise.all(Array.from({length:5}, () => fetch(`${f.url}/api/board`)));
  for (const response of responses) {
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store'); assert.deepEqual(validateBoard(await response.json()),[]);
  }
  assert.equal(f.server.address().address,'127.0.0.1');
  assert.deepEqual((await readCalls(f.calls)).sort(),[['agent','list'],['workspace','list']]);
  await fetch(`${f.url}/api/board`); assert.equal((await readCalls(f.calls)).length,2);
});
test('キャッシュは取得完了から1秒で切れ、失敗後も再試行できる', async t => {
  assert.ok(app); let calls=0, clock=0;
  t.mock.method(console, 'error', () => {});
  const server = app.createApp({now:()=>clock, readBoard:async () => { calls++; if(calls===1) throw new Error('失敗'); return {ok:true}; },herdr:{}});
  server.listen(0,'127.0.0.1'); await once(server,'listening'); t.after(() => new Promise(r=>server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}/api/board`;
  assert.equal((await fetch(url)).status,500);
  assert.equal((await fetch(url)).status,200); clock=999; await fetch(url); assert.equal(calls,2);
  clock=1000; await fetch(url); assert.equal(calls,3);
});
test('予期しない例外は500とともにconsole.errorへ元の例外を残す', async t => {
  const error = new Error('診断用の例外');
  const logged = t.mock.method(console, 'error', () => {});
  const server = app.createApp({readBoard:async () => {throw error;}, herdr:{}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/board`);
  assert.equal(response.status, 500);
  assert.equal(logged.mock.callCount(), 1);
  assert.ok(logged.mock.calls[0].arguments.includes(error));
  assert.doesNotMatch(await response.text(), /診断用/);
});
test('Host、Origin、Content-Type、JSON、IDを検査してからfocusする', async t => {
  const f = await setup(t);
  const badHost = await new Promise((resolve,reject) => {
    const req = request(f.url,{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});
    req.on('error',reject); req.end();
  });
  assert.equal(badHost,403);
  for (const options of [
    {headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:'{"workspaceId":"w1BB"}',status:403},
    {headers:{'Content-Type':'text/plain'},body:'{"workspaceId":"w1BB"}',status:400},
    {headers:{'Content-Type':'application/json'},body:'{',status:400},
    {headers:{'Content-Type':'application/json'},body:'null',status:400},
    {headers:{'Content-Type':'application/json'},body:'{"workspaceId":"--help"}',status:400},
    {headers:{'Content-Type':'application/json'},body:'{"workspaceId":"w999"}',status:404},
  ]) assert.equal((await fetch(`${f.url}/api/focus`,{method:'POST',...options})).status,options.status);
  assert.ok(!(await readCalls(f.calls)).some(args => args[1]==='focus'));
  const response = await fetch(`${f.url}/api/focus`,{method:'POST',headers:{'Content-Type':'application/json',Origin:f.url},body:'{"workspaceId":"w1BB"}'});
  assert.equal(response.status,204); assert.deepEqual((await readCalls(f.calls)).at(-1),['workspace','focus','w1BB']);
  assert.equal((await fetch(`${f.url}/missing`)).status,404);
});
test('focusの一覧取得失敗と実行失敗は502、ボードの材料取得失敗は200', async t => {
  for (const env of [{FAKE_HERDR_FAIL:'workspace'},{FAKE_HERDR_FOCUS_FAIL:'1'}]) {
    const f = await setup(t,env);
    assert.equal((await fetch(`${f.url}/api/focus`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"workspaceId":"w1BB"}'})).status,502);
  }
  const f = await setup(t,{FAKE_HERDR_FAIL:'all'}); const response = await fetch(`${f.url}/api/board`);
  assert.equal(response.status,200); assert.equal((await response.json()).herdr.ok,false);
});
test('Hostの無いHTTP/1.1要求はNode自身が400で拒否する', async t => {
  const f = await setup(t);
  const status = await new Promise((resolve,reject) => {
    const req = request(f.url,{setHost:false},res=>{res.resume();resolve(res.statusCode);}); req.on('error',reject); req.end();
  }); assert.equal(status,400);
});
test('ボードの1秒キャッシュ中でもSKILLの変更・復旧を確認し警告を1件だけ返す', async t => {
  const f = await fixtureDirectory(t);
  const path = join(f.directory, 'SKILL.md');
  await copyFile(new URL('./fixtures/chief-of-staff.md', import.meta.url), path);
  const original = await readFile(path, 'utf8');
  let calls = 0;
  const base = {alerts:[]};
  const server = app.createApp({now:() => 0, herdr:{}, readBoard:async () => {calls++; return base;}, checkSkill:createSkillMonitor({path})});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/board`;
  const get = async () => (await fetch(url)).json();
  assert.deepEqual((await get()).alerts, []);
  await writeFile(path, original.replace('全件の同期', '全件の変更'));
  for (const board of await Promise.all([get(), get(), get()])) {
    assert.equal(board.alerts.length, 1);
    assert.equal(board.alerts[0].level, 'warn');
    assert.match(board.alerts[0].message, /CoS.*判定表.*見直してください/);
  }
  await writeFile(path, original);
  assert.deepEqual((await get()).alerts, []);
  await rm(path);
  assert.equal((await get()).alerts.length, 1);
  assert.equal(calls, 1);
  assert.deepEqual(base.alerts, []);
});
async function markDone(f, id) {
  const path = join(f.root, 'ledger.md');
  const text = await readFile(path, 'utf8');
  await writeFile(path, text.replace(new RegExp(`(\\| ${id} \\|[^|]*\\|[^|]*\\|) [^|]+ \\|`), '$1 完了 |'));
}
const postClose = (f, body, headers = {}) => fetch(`${f.url}/api/close`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
test('台帳で完了したタスクのカードにだけ canClose が付く', async t => {
  const f = await setup(t);
  await markDone(f, 'DEMO-101');
  const board = await (await fetch(`${f.url}/api/board`)).json();
  assert.deepEqual(validateBoard(board), []);
  const cards = [...board.drafts, ...board.columns.flatMap(c => c.cards)];
  assert.deepEqual(cards.filter(c => c.canClose).map(c => c.id), ['DEMO-101']);
  assert.ok(board.columns.find(c => c.key === 'done').cards.some(c => c.id === 'DEMO-101'));
  assert.ok(cards.filter(c => c.kind === 'session').every(c => !c.canClose));
});
test('closeは入力を検査し、台帳で完了したタスクのworkspaceだけを閉じる', async t => {
  const f = await setup(t);
  await markDone(f, 'DEMO-101');
  assert.equal((await postClose(f, '{"workspaceId":"w1AV"}', {Origin:'https://evil.example'})).status, 403);
  assert.equal((await postClose(f, '{"workspaceId":"--help"}')).status, 400);
  // 作業中のタスク・台帳に無いCoSのworkspace・存在しないworkspaceは閉じない
  for (const id of ['w1BB', 'w1BA', 'w999']) assert.equal((await postClose(f, JSON.stringify({workspaceId:id}))).status, 409);
  assert.ok(!(await readCalls(f.calls)).some(args => args[1] === 'close'));
  const response = await postClose(f, '{"workspaceId":"w1AV"}', {Origin:f.url});
  assert.equal(response.status, 204);
  assert.deepEqual((await readCalls(f.calls)).at(-1), ['workspace','close','w1AV']);
});
test('closeの実行失敗は502', async t => {
  const f = await setup(t, {FAKE_HERDR_CLOSE_FAIL:'1'});
  await markDone(f, 'DEMO-101');
  assert.equal((await postClose(f, '{"workspaceId":"w1AV"}')).status, 502);
});
