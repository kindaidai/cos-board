import { lstat, open, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { parseLedger } from '../parse/ledger.js';
import { parseHerdr } from '../parse/herdr.js';
import { VALID_ID, VALID_ASK_FILE, VALID_PANE, LIMITS } from '../contract.js';

const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const failure = error => error.code === 'ENOENT' ? {kind:'missing'} : {kind:'error',reason:String(error.message).replace(/[\r\n]+/g,' ')};
async function checkDirectories(root, directories) {
  let directory = resolve(root);
  const checked = [];
  for (const part of ['', ...directories]) {
    directory = resolve(directory, part || '.');
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(directory+': 通常のディレクトリではありません');
    checked.push({path:directory,info});
  }
  return {directory,checked};
}
async function recheck(checked) {
  for (const item of checked) {
    const info = await lstat(item.path);
    if (info.isSymbolicLink() || !info.isDirectory() || !sameFile(info,item.info)) throw new Error(item.path+': 検査中にディレクトリが差し替わりました');
  }
}
export async function listSafe(root, directories) {
  try {
    const {directory,checked} = await checkDirectories(root,directories);
    const names = await readdir(directory);
    await recheck(checked);
    return {kind:'list',names};
  } catch(error) {return failure(error);}
}
export async function readSafe(root, directories, filename, {maxBytes = Infinity} = {}) {
  try {
    const {directory,checked:checkedDirectories} = await checkDirectories(root,directories);
    const path = resolve(directory, filename);
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) return {kind:'error',reason:`${path}: 通常のファイルではありません`};
    // 最終要素のsymlink・FIFOを防ぎ、親が途中で差し替わった場合も内容を読む前に拒否する。
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = await file.stat();
      if (!opened.isFile() || !sameFile(opened, info)) return {kind:'error',reason:`${path}: 検査中にファイルが差し替わりました`};
      await recheck(checkedDirectories);
      const current = await lstat(path);
      if (current.isSymbolicLink() || !current.isFile() || !sameFile(current, opened)) return {kind:'error',reason:`${path}: 検査中にファイルが差し替わりました`};
      if (opened.size > maxBytes) return {kind:'error',reason:path+': 大きすぎて読めません'};
      // サイズ検査後に伸びるファイルでも、上限を超えた本文は読み込まない。
      let text;
      if (Number.isFinite(maxBytes)) {
        const buffer = Buffer.alloc(maxBytes);
        let total=0;
        while (total < maxBytes) {
          const {bytesRead}=await file.read(buffer,total,maxBytes-total,null);
          if (!bytesRead) break;
          total+=bytesRead;
        }
        const extra=Buffer.alloc(1);
        if ((await file.read(extra,0,1,null)).bytesRead) return {kind:'error',reason:path+': 大きすぎて読めません'};
        text=buffer.subarray(0,total).toString('utf8');
      } else text=await file.readFile('utf8');
      return {kind:'text',text,mtime:opened.mtime.toISOString()};
    } finally { await file.close(); }
  } catch (error) {
    return error.code === 'ENOENT' ? {kind:'missing'} : {kind:'error',reason:String(error.message).replace(/[\r\n]+/g, ' ')};
  }
}

export async function readSources({cosRoot, herdr, blockedWatch, now = new Date()}) {
  const commands = Promise.all([herdr.list('workspace'), herdr.list('agent')]);
  const [ledger, cosState] = await Promise.all([readSafe(cosRoot, [], 'ledger.md'), readSafe(cosRoot, [], 'cos.state')]);
  const rows = ledger.kind === 'text' ? parseLedger(ledger.text).value?.rows ?? [] : [];
  const tasks = Object.create(null);
  await Promise.all(rows.map(async row => {
    if (!VALID_ID.test(row.id)) return;
    const directory = ['tasks', row.id];
    const [state, report, lead] = await Promise.all(['state.md','report.log','lead'].map(name => readSafe(cosRoot, directory, name)));
    const brief = await readSafe(cosRoot,directory,'brief.md',{maxBytes:LIMITS.briefBytes});
    const list = await listSafe(cosRoot,[...directory,'ask']);
    let asks = list;
    if (list.kind === 'list') {
      const names=list.names.filter(name=>VALID_ASK_FILE.test(name)).sort((a,b)=>Number.parseInt(b)-Number.parseInt(a) || a.localeCompare(b));
      const files=await Promise.all(names.slice(0,LIMITS.askFiles).map(async name=>({name,source:await readSafe(cosRoot,[...directory,'ask'],name,{maxBytes:LIMITS.askBytes})})));
      asks={kind:'list',files,omitted:Math.max(0,names.length-LIMITS.askFiles)};
    }
    tasks[row.id] = {state, report, lead, brief, asks};
  }));
  const [workspaces, agents] = await commands;
  const blocked = agents.ok ? parseHerdr(agents.stdout,'agents').value.filter(a=>a.agent_status==='blocked') : [];
  const prompts=Object.create(null);
  let reads=0;
  await Promise.all(blocked.map(async a=>{
    if (Object.hasOwn(prompts,a.pane_id)) return;
    prompts[a.pane_id]={ok:false,reason:'画面未読'};
    if (!VALID_PANE.test(a.pane_id)) prompts[a.pane_id]={ok:false,reason:'pane ID が不正です'};
    else if (reads++ >= LIMITS.promptReads) prompts[a.pane_id]={ok:false,reason:'画面の読み取り上限を超えました'};
    else prompts[a.pane_id]=await herdr.read(a.pane_id,{lines:LIMITS.promptLines});
  }));
  const blockedSince=blockedWatch?.observe(blocked,+now) ?? Object.create(null);
  return {ledger, cosState, tasks, workspaces, agents, prompts, blockedSince, home:homedir()};
}

export async function readAssets() {
  const root = fileURLToPath(new URL('../../public/', import.meta.url));
  const assets = {};
  for (const [path, name, type] of [['/', 'index.html','text/html'], ['/board.js','board.js','text/javascript'], ['/poller.js','poller.js','text/javascript'], ['/focus.js','focus.js','text/javascript'], ['/pane-view.js','pane-view.js','text/javascript'], ['/turn-view.js','turn-view.js','text/javascript'], ['/close.js','close.js','text/javascript'], ['/board.css','board.css','text/css']]) {
    const source = await readSafe(root, [], name);
    if (source.kind !== 'text') throw new Error(`画面を読めません: ${name}`);
    assets[path] = {body:source.text, type:`${type}; charset=utf-8`};
  }
  return assets;
}
