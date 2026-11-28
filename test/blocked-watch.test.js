import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('../src/io/blocked-watch.js').catch(()=>({}));
test('blockedの時刻は同じseqで保持し、退出・seq変更で更新する',()=>{
  assert.equal(typeof mod.createBlockedWatch,'function');
  const watch=mod.createBlockedWatch(), a={pane_id:'w1:p1',state_change_seq:1};
  assert.equal(watch.observe([a],0)['w1:p1'],'1970-01-01T00:00:00.000Z');
  assert.equal(watch.observe([a],1000)['w1:p1'],'1970-01-01T00:00:00.000Z');
  assert.equal(watch.observe([{...a,state_change_seq:2}],2000)['w1:p1'],'1970-01-01T00:00:02.000Z');
  watch.observe([],3000);
  assert.equal(watch.observe([a],4000)['w1:p1'],'1970-01-01T00:00:04.000Z');
});
