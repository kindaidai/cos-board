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
  }, onChange:() => {rendered.push(controller.isPending({workspaceId:'w1BB'}));}});
  const first = controller.focus({workspaceId:'w1BB'});
  await Promise.resolve();
  assert.equal(controller.isPending({workspaceId:'w1BB'}), true);
  // 新しく描かれたカードも同じ制御を参照し、別のクリック経路から要求する。
  const redrawnCard = {disabled:controller.isPending({workspaceId:'w1BB'}), click:() => controller.focus({workspaceId:'w1BB'})};
  assert.equal(redrawnCard.disabled, true);
  assert.equal(redrawnCard.click(), first);
  assert.equal(calls, 1);
  finish(); await first;
  assert.equal(controller.isPending({workspaceId:'w1BB'}), false);
  assert.deepEqual(rendered, [true, false]);
});

test('focus失敗でも印を解除し次の要求を送れる', async () => {
  let calls = 0;
  const controller = create({sendFocus:async () => {
    if (++calls === 1) throw new Error('取得失敗');
  }});
  await assert.rejects(controller.focus({workspaceId:'w1BB'}), /取得失敗/);
  assert.equal(controller.isPending({workspaceId:'w1BB'}), false);
  await controller.focus({workspaceId:'w1BB'});
  assert.equal(calls, 2);
});

test('workspaceとpaneは別のキーで、同じpaneへの再送は共有する', async () => {
  const finish = [], calls = [];
  const controller = create({sendFocus:target => {
    calls.push(target); return new Promise(resolve => finish.push(resolve));
  }});
  const workspace = {workspaceId:'w1AV'}, pane = {workspaceId:'w1AV',paneId:'w1AV:p2'};
  const first = controller.focus(workspace), second = controller.focus(pane);
  await Promise.resolve();
  assert.equal(module.focusKey(workspace),'w1AV'); assert.equal(module.focusKey(pane),'w1AV:p2');
  assert.equal(controller.isPending({...workspace}),true); assert.equal(controller.isPending({...pane}),true);
  assert.equal(controller.focus({...pane}),second);
  assert.deepEqual(calls,[workspace,pane]);
  finish[0](); await first;
  assert.equal(controller.isPending(pane),true);
  finish[1](); await second;
  assert.equal(controller.isPending(pane),false);
});
