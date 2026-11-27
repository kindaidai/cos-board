import { lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { parseLedger } from '../parse/ledger.js';
import { VALID_ID } from '../contract.js';

export async function readSafe(root, directories, filename) {
  try {
    let directory = resolve(root);
    const checkedDirectories = [];
    const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
    for (const part of ['', ...directories]) {
      directory = resolve(directory, part || '.');
      const info = await lstat(directory);
      if (info.isSymbolicLink() || !info.isDirectory()) return {kind:'error',reason:`${directory}: 通常のディレクトリではありません`};
      checkedDirectories.push({path:directory, info});
    }
    const path = resolve(directory, filename);
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) return {kind:'error',reason:`${path}: 通常のファイルではありません`};
    // 最終要素のsymlink・FIFOを防ぎ、親が途中で差し替わった場合も内容を読む前に拒否する。
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = await file.stat();
      if (!opened.isFile() || !sameFile(opened, info)) return {kind:'error',reason:`${path}: 検査中にファイルが差し替わりました`};
      for (const checked of checkedDirectories) {
        const current = await lstat(checked.path);
        if (current.isSymbolicLink() || !current.isDirectory() || !sameFile(current, checked.info)) {
          return {kind:'error',reason:`${checked.path}: 検査中にディレクトリが差し替わりました`};
        }
      }
      const current = await lstat(path);
      if (current.isSymbolicLink() || !current.isFile() || !sameFile(current, opened)) return {kind:'error',reason:`${path}: 検査中にファイルが差し替わりました`};
      return {kind:'text',text:await file.readFile('utf8')};
    } finally { await file.close(); }
  } catch (error) {
    return error.code === 'ENOENT' ? {kind:'missing'} : {kind:'error',reason:String(error.message).replace(/[\r\n]+/g, ' ')};
  }
}

export async function readSources({cosRoot, herdr}) {
  const commands = Promise.all([herdr.list('workspace'), herdr.list('agent')]);
  const [ledger, cosState] = await Promise.all([readSafe(cosRoot, [], 'ledger.md'), readSafe(cosRoot, [], 'cos.state')]);
  const rows = ledger.kind === 'text' ? parseLedger(ledger.text).value?.rows ?? [] : [];
  const tasks = Object.create(null);
  await Promise.all(rows.map(async row => {
    if (!VALID_ID.test(row.id)) return;
    const directory = ['tasks', row.id];
    const [state, report, lead] = await Promise.all(['state.md','report.log','lead'].map(name => readSafe(cosRoot, directory, name)));
    tasks[row.id] = {state, report, lead};
  }));
  const [workspaces, agents] = await commands;
  return {ledger, cosState, tasks, workspaces, agents, home:homedir()};
}

export async function readAssets() {
  const root = fileURLToPath(new URL('../../public/', import.meta.url));
  const assets = {};
  for (const [path, name, type] of [['/', 'index.html','text/html'], ['/board.js','board.js','text/javascript'], ['/poller.js','poller.js','text/javascript'], ['/focus.js','focus.js','text/javascript'], ['/board.css','board.css','text/css']]) {
    const source = await readSafe(root, [], name);
    if (source.kind !== 'text') throw new Error(`画面を読めません: ${name}`);
    assets[path] = {body:source.text, type:`${type}; charset=utf-8`};
  }
  return assets;
}
