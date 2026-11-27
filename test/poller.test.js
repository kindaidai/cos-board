import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../public/poller.js').catch(() => null);
function clock() {
  let now=0,id=0; const timers=new Map();
  return {setTimeout(fn,ms){timers.set(++id,{at:now+ms,fn});return id;},clearTimeout(id){timers.delete(id);},
    async tick(ms){now+=ms; for(const [id,t] of [...timers].sort((a,b)=>a[1].at-b[1].at)) if(t.at<=now){timers.delete(id);t.fn();} await flush();}};
}
async function flush(){for(let i=0;i<12;i++) await Promise.resolve();}
function create(options) {assert.ok(module,'poller が未実装');return module.createPoller(options);}
const value = n => ({generatedAt:`2026-11-27T07:00:0${n}.000Z`});
test('取得中の追加要求は共有し、終了から3秒後に次の取得を行う', async () => {
  const timer=clock(); let calls=0,resolve; const received=[];
  const poller=create({clock:timer,fetchBoard:()=>{calls++;return new Promise(r=>{resolve=r;});},onData:v=>received.push(v),onError:()=>assert.fail()});
  poller.resume(); await flush(); poller.refresh(); await flush(); assert.equal(calls,1);
  resolve(value(1)); await flush(); assert.equal(received.length,1);
  await timer.tick(2999); assert.equal(calls,1); await timer.tick(1); assert.equal(calls,2); poller.pause();
});
test('5秒で打ち切り通知し、次の回で取得を再開する', async () => {
  const timer=clock(),errors=[]; let signal,calls=0;
  const poller=create({clock:timer,fetchBoard:s=>{signal=s;calls++;return new Promise(()=>{});},onData:()=>assert.fail(),onError:e=>errors.push(e)});
  poller.resume(); await flush(); await timer.tick(4999); assert.equal(errors.length,0);
  await timer.tick(1); assert.equal(signal.aborted,true); assert.equal(errors.length,1);
  await timer.tick(3000); assert.equal(calls,2); poller.pause();
});
test('古いgeneratedAtを採らない', async () => {
  const timer=clock(),received=[]; let count=0;
  const poller=create({clock:timer,fetchBoard:async()=>value(++count===1?2:1),onData:v=>received.push(v),onError:()=>assert.fail()});
  poller.resume(); await flush(); await timer.tick(3000);
  assert.deepEqual(received,[value(2)]); poller.pause();
});
test('失敗しても次の取得で復帰する', async () => {
  const timer=clock(),errors=[],received=[];let count=0;
  const poller=create({clock:timer,fetchBoard:async()=>{if(++count===1)throw new Error('offline');return value(1);},onData:v=>received.push(v),onError:e=>errors.push(e)});
  poller.resume(); await flush(); assert.equal(errors.length,1); await timer.tick(3000); assert.equal(received.length,1); poller.pause();
});
test('非表示時は中断し、復帰直後に取得して旧要求の応答を捨てる', async () => {
  const timer=clock(),received=[],pending=[];
  const poller=create({clock:timer,fetchBoard:()=>new Promise(r=>pending.push(r)),onData:v=>received.push(v),onError:()=>assert.fail()});
  poller.resume(); await flush(); poller.pause(); await timer.tick(10000); assert.equal(pending.length,1);
  poller.resume(); await flush(); assert.equal(pending.length,2);
  pending[1](value(2)); await flush(); pending[0](value(1)); await flush();
  assert.deepEqual(received,[value(2)]); poller.pause();
});
