import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../public/focus.js').catch(() => null);
const create = options => {
  assert.ok(module, 'focus制御が未実装');
  return module.createFocusController(options);
};

test('同じworkspaceのfocusは描き直しをまたいでも完了まで1要求だけ送る', async () => {
  let finish, calls = 0;
  const rendered = [];
  const controller = create({sendFocus:() => {
    calls++; return new Promise(resolve => {finish = resolve;});
  }, onChange:() => {rendered.push(controller.isPending('w1BB'));}});
  const first = controller.focus('w1BB');
  await Promise.resolve();
  assert.equal(controller.isPending('w1BB'), true);
  // 新しく描かれたカードも同じ制御を参照し、別のクリック経路から要求する。
  const redrawnCard = {disabled:controller.isPending('w1BB'), click:() => controller.focus('w1BB')};
  assert.equal(redrawnCard.disabled, true);
  assert.equal(redrawnCard.click(), first);
  assert.equal(calls, 1);
  finish(); await first;
  assert.equal(controller.isPending('w1BB'), false);
  assert.deepEqual(rendered, [true, false]);
});

test('focus失敗でも印を解除し次の要求を送れる', async () => {
  let calls = 0;
  const controller = create({sendFocus:async () => {
    if (++calls === 1) throw new Error('取得失敗');
  }});
  await assert.rejects(controller.focus('w1BB'), /取得失敗/);
  assert.equal(controller.isPending('w1BB'), false);
  await controller.focus('w1BB');
  assert.equal(calls, 2);
});
