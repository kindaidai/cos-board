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

test('readSafeは上限を超えずmtimeを返し、listSafeは名前を列挙する',async t=>{
  const f=await setup(t);
  const result=await io.readSafe(f.root,[],'ledger.md',{maxBytes:1});
  assert.equal(result.kind,'error'); assert.match(result.reason,/大きすぎ/);
  const good=await io.readSafe(f.root,[],'ledger.md',{maxBytes:65536});
  assert.equal(good.mtime,(await stat(join(f.root,'ledger.md'))).mtime.toISOString());
  assert.deepEqual((await io.listSafe(f.root,[])).names.sort(),['cos.state','ledger.md','tasks']);
});
test('問いは名前と番号で絞り新しい30件、異常ファイルも結果に残す',async t=>{
  const {mkdir,writeFile}=await import('node:fs/promises');
  const f=await setup(t), dir=join(f.root,'tasks/DEMO-101/ask');
  await mkdir(dir);
  for(let i=1;i<=32;i++) await writeFile(join(dir,i+'.md'),'# ask/'+i+' 題');
  await writeFile(join(dir,'no.md'),'無視');
  await rm(join(dir,'31.md')); await symlink(join(f.root,'ledger.md'),join(dir,'31.md'));
  await rm(join(dir,'30.md')); execFileSync('mkfifo',[join(dir,'30.md')]);
  const before=await stat(join(dir,'32.md'));
  const s=await io.readSources({cosRoot:f.root,herdr:f.herdr});
  const asks=s.tasks['DEMO-101'].asks;
  assert.equal(asks.omitted,2); assert.equal(asks.files.length,30);
  assert.deepEqual(asks.files.slice(0,3).map(f=>[f.name,f.source.kind]),[['32.md','text'],['31.md','error'],['30.md','error']]);
  assert.equal((await stat(join(dir,'32.md'))).mtimeMs,before.mtimeMs);
  await rm(dir,{recursive:true}); await symlink(f.directory,dir);
  assert.equal((await io.readSources({cosRoot:f.root,herdr:f.herdr})).tasks['DEMO-101'].asks.kind,'error');
});
test('agent readはblockedだけ8件まで、危険なIDは渡さない',async t=>{
  const f=await setup(t);
  const agents=Array.from({length:11},(_,i)=>({workspace_id:'w1',pane_id:i===0?'__proto__':'w1:p'+i,agent:'claude',agent_status:i===10?'working':'blocked'}));
  const herdr=cli.createHerdr({path:fakeHerdr,env:{...f.env,FAKE_HERDR_AGENTS:JSON.stringify({result:{agents}})}});
  const s=await io.readSources({cosRoot:f.root,herdr});
  const reads=(await readCalls(f.calls)).filter(a=>a[1]==='read');
  assert.equal(reads.length,8);
  assert.ok(reads.every(a=>a[2]!=='__proto__' && a[2]!=='w1:p10'));
  assert.equal(s.prompts.__proto__.ok,false); assert.equal(s.prompts['w1:p9'].ok,false);
  assert.equal(s.prompts['w1:p1'].ok,true);
});
test('readは引数を検査し、textを取得し失敗・時間切れも返す',async t=>{
  const f=await setup(t); assert.equal(typeof f.herdr.read,'function');
  for(const id of ['bad','w1:p1\n',null]) assert.throws(()=>f.herdr.read(id,{lines:40}));
  for(const lines of [0,201,1.2,'40']) assert.throws(()=>f.herdr.read('w1:p1',{lines}));
  assert.equal((await f.herdr.read('w1:p1',{lines:40})).ok,true);
  assert.deepEqual(await readCalls(f.calls),[['agent','read','w1:p1','--source','visible','--lines','40','--format','text']]);
  assert.match((await cli.createHerdr({path:fakeHerdr,env:{...f.env,FAKE_HERDR_READ_FAIL:'1'}}).read('w1:p1',{lines:40})).reason,/agent_not_found/);
  assert.match((await cli.createHerdr({path:fakeHerdr,env:{...f.env,FAKE_HERDR_DELAY:'500'},timeoutMs:30}).read('w1:p1',{lines:40})).reason,/タイムアウト/);
});
test('readAssetsはturn-viewを独立したJavaScriptとして配信する',async()=>{
  const assets=await io.readAssets();
  assert.ok(assets['/turn-view.js']); assert.equal(assets['/turn-view.js'].type,'text/javascript; charset=utf-8');
  const mod=await import('data:text/javascript;base64,'+Buffer.from(assets['/turn-view.js'].body).toString('base64'));
  assert.equal(mod.waited(null,0),'時刻不明');
});
test('turns専用fixtureは4種別を揃え元ファイルを変更しない',async()=>{
  const {fileURLToPath}=await import('node:url');
  const root=fileURLToPath(new URL('./fixtures/cos-turns',import.meta.url));
  const before=await snapshot(root);
  const herdr=cli.createHerdr({path:fakeHerdr,env:{...process.env,FAKE_HERDR_SET:'turns'}});
  const board=buildBoard(await io.readSources({cosRoot:root,herdr}),new Date('2026-11-28T00:00:00Z'));
  assert.deepEqual([...new Set(board.turns.map(t=>t.kind))].sort(),['ask','manual','merge','permission']);
  const ask=board.turns.find(t=>t.kind==='ask');
  assert.equal(ask.question,'プレビューはどの作業場所に保存しますか？');
  assert.deepEqual(ask.options,['1. 今の作業場所（推奨）: 手元で確認する','2. 別の作業場所: 分けて確認する']);
  const permission=board.turns.find(t=>t.kind==='permission');
  assert.equal(permission.question,''); assert.ok(permission.summary); assert.ok(permission.options.length>0);
  assert.equal(board.cos?.paneId,'wCOS:p1');
  assert.deepEqual(board.alerts,[]);
  assert.deepEqual(await snapshot(root),before);
});
