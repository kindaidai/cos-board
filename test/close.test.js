import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../public/close.js').catch(() => null);
const create = options => {
  assert.ok(module, 'close制御が未実装');
  return module.createCloseController(options);
};

test('閉じるは確認を挟み、確定するまで送らない', async () => {
  const sent = [];
  const controller = create({sendClose:async id => {sent.push(id);}});
  controller.arm('w1AV');
  assert.equal(controller.isArmed('w1AV'), true);
  controller.cancel('w1AV');
  assert.equal(controller.isArmed('w1AV'), false);
  assert.equal(await controller.confirm('w1AV'), undefined);
  assert.deepEqual(sent, []);
  controller.arm('w1AV');
  await controller.confirm('w1AV');
  assert.deepEqual(sent, ['w1AV']);
  assert.equal(controller.isArmed('w1AV'), false);
});

test('送信中は二重に送らず、失敗しても印を解除する', async () => {
  let finish, calls = 0;
  const changes = [];
  const controller = create({sendClose:() => {calls++; return new Promise((resolve, reject) => {finish = calls === 1 ? reject : resolve;});},
    onChange:() => changes.push(controller.isPending('w1AV'))});
  controller.arm('w1AV');
  const first = controller.confirm('w1AV');
  await Promise.resolve();
  assert.equal(controller.isPending('w1AV'), true);
  controller.arm('w1AV');
  assert.equal(controller.confirm('w1AV'), first);
  assert.equal(calls, 1);
  finish(new Error('失敗'));
  await assert.rejects(first, /失敗/);
  assert.equal(controller.isPending('w1AV'), false);
  assert.equal(changes.at(-1), false);
});
