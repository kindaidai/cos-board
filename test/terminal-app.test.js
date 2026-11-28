import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../src/io/terminal-app.js').catch(() => null);

test('前面に出すアプリは 引数 > COS_BOARD_TERMINAL_APP > 起動元の __CFBundleIdentifier の順に決まる', () => {
  assert.ok(mod, 'terminal-app が未実装');
  const env = {COS_BOARD_TERMINAL_APP:'com.example.env', __CFBundleIdentifier:'com.example.parent'};
  assert.equal(mod.resolveTerminalApp({option:'com.example.arg', env, platform:'darwin'}), 'com.example.arg');
  assert.equal(mod.resolveTerminalApp({env, platform:'darwin'}), 'com.example.env');
  assert.equal(mod.resolveTerminalApp({env:{__CFBundleIdentifier:'com.example.parent'}, platform:'darwin'}), 'com.example.parent');
  assert.equal(mod.resolveTerminalApp({env:{}, platform:'darwin'}), null);
});
test('none で無効にでき、macOS 以外と不正な値では前面に出さない', () => {
  assert.equal(mod.resolveTerminalApp({option:'none', env:{__CFBundleIdentifier:'com.example.parent'}, platform:'darwin'}), null);
  assert.equal(mod.resolveTerminalApp({env:{COS_BOARD_TERMINAL_APP:'none', __CFBundleIdentifier:'com.example.parent'}, platform:'darwin'}), null);
  assert.equal(mod.resolveTerminalApp({env:{__CFBundleIdentifier:'com.example.parent'}, platform:'linux'}), null);
  for (const bad of ['-a', 'com example', 'com.example;rm', 'noDot', '']) {
    assert.equal(mod.resolveTerminalApp({env:{__CFBundleIdentifier:bad}, platform:'darwin'}), null, bad);
  }
  assert.throws(() => mod.resolveTerminalApp({option:'-x', env:{}, platform:'darwin'}));
  assert.throws(() => mod.resolveTerminalApp({env:{COS_BOARD_TERMINAL_APP:'bad value'}, platform:'darwin'}));
});
test('activate は open -b <bundle id> を引数配列で呼び、失敗を理由付きで返す', async () => {
  const calls = [];
  const ok = mod.createActivator({bundleId:'com.example.term', execFile:(file, args, opts, cb) => {calls.push([file, args]); cb(null, '', '');}});
  assert.deepEqual(await ok.activate(), {ok:true});
  assert.deepEqual(calls, [['open', ['-b', 'com.example.term']]]);
  const ng = mod.createActivator({bundleId:'com.example.term', execFile:(f, a, o, cb) => cb(Object.assign(new Error('x'), {code:1}), '', 'not found\n')});
  const result = await ng.activate();
  assert.equal(result.ok, false); assert.match(result.reason, /not found/);
  const none = mod.createActivator({bundleId:null, execFile:() => assert.fail('呼ばない')});
  assert.deepEqual(await none.activate(), {ok:true, skipped:true});
});
