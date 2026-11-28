import { execFile as nodeExecFile } from 'node:child_process';

// 例: com.googlecode.iterm2 / com.apple.Terminal。open の引数として安全な形だけを通す。
export const VALID_BUNDLE_ID = /^[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/;
const DISABLED = 'none';

/**
 * Herdr の focus のあとで前面に出すアプリの bundle ID を決める。
 * 引数 > COS_BOARD_TERMINAL_APP > ボードを起動した端末アプリ（macOS が子に渡す __CFBundleIdentifier）の順。
 * 明示した値が不正なら起動時に知らせ、受け継いだ値が不正なら黙って使わない。
 */
export function resolveTerminalApp({option, env = process.env, platform = process.platform} = {}) {
  for (const [label, value] of [['--terminal-app', option], ['COS_BOARD_TERMINAL_APP', env.COS_BOARD_TERMINAL_APP]]) {
    if (value === undefined || value === '') continue;
    if (value === DISABLED) return null;
    if (!VALID_BUNDLE_ID.test(value)) throw new Error(`${label} は bundle ID（例: com.apple.Terminal）か none です`);
    return platform === 'darwin' ? value : null;
  }
  const inherited = env.__CFBundleIdentifier;
  return platform === 'darwin' && typeof inherited === 'string' && VALID_BUNDLE_ID.test(inherited) ? inherited : null;
}

export function createActivator({bundleId, execFile = nodeExecFile, timeoutMs = 2000}) {
  return {
    bundleId,
    activate: () => bundleId === null ? Promise.resolve({ok:true, skipped:true}) : new Promise(resolve => {
      execFile('open', ['-b', bundleId], {encoding:'utf8', timeout:timeoutMs, killSignal:'SIGKILL'}, (error, stdout, stderr) => {
        if (error) resolve({ok:false, reason:`open -b ${bundleId}: ${String(stderr || error.message).replace(/[\r\n]+/g, ' ').trim()}`});
        else resolve({ok:true});
      });
    }),
  };
}
