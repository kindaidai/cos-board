import { execFile } from 'node:child_process';
import { VALID_WORKSPACE } from '../contract.js';

const oneLine = text => String(text).replace(/[\r\n]+/g, ' ').trim();
export function createHerdr({path = 'herdr', env = process.env, timeoutMs = 2000} = {}) {
  const run = args => new Promise(resolve => {
    execFile(path, args, {encoding:'utf8', env, timeout:timeoutMs, killSignal:'SIGKILL', maxBuffer:4 * 1024 * 1024}, (error, stdout, stderr) => {
      if (error) resolve({ok:false, reason:oneLine(`${args.join(' ')}: ${error.killed ? 'タイムアウト' : error.code} ${stderr || stdout || error.message}`)});
      else resolve({ok:true, stdout});
    });
  });
  return {
    list(kind) {
      if (!['workspace','agent'].includes(kind)) throw new Error('一覧の種類が不正です');
      return run([kind, 'list']);
    },
    focus(id) {
      if (typeof id !== 'string' || !VALID_WORKSPACE.test(id)) throw new Error('workspace ID が不正です');
      return run(['workspace', 'focus', id]);
    },
  };
}
