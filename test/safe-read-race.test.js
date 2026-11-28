import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { fixtureDirectory } from './helpers.js';
import { readSafe } from '../src/io/read-sources.js';

for (const timing of ['directory', 'file']) {
  test(`検査後の${timing}差し替えで管理外の内容を読まない`, async t => {
    const f = await fixtureDirectory(t);
    const task = join(f.root, 'tasks/cos-board-261127-init');
    const outside = join(f.directory, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(join(outside, 'report.log'), 'OUTSIDE');
    const original = fs.lstat;
    let switched = false;
    const trigger = timing === 'directory' ? task : join(task, 'report.log');
    t.mock.method(fs, 'lstat', async (path, ...args) => {
      const info = await original(path, ...args);
      if (path === trigger && !switched) {
        switched = true;
        await fs.rename(task, `${task}-old`);
        await fs.symlink(outside, task);
      }
      return info;
    });
    syncBuiltinESMExports();
    t.after(() => {t.mock.restoreAll(); syncBuiltinESMExports();});
    const result = await readSafe(f.root, ['tasks', 'cos-board-261127-init'], 'report.log');
    assert.equal(switched, true);
    assert.equal(result.kind, 'error');
    assert.equal(result.text, undefined);
    assert.ok(result.reason);
  });
}

test('列挙直後にaskディレクトリを差し替えても名前を返さない',async t=>{
  const {listSafe}=await import('../src/io/read-sources.js');
  assert.equal(typeof listSafe,'function');
  const f=await fixtureDirectory(t), dir=join(f.root,'tasks/DEMO-101/ask');
  await fs.mkdir(dir); await fs.writeFile(join(dir,'1.md'),'inside');
  const original=fs.readdir;
  t.mock.method(fs,'readdir',async(...args)=>{
    const result=await original(...args);
    if(args[0]===dir) {await fs.rename(dir,dir+'-old'); await fs.mkdir(dir);}
    return result;
  });
  syncBuiltinESMExports(); t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  assert.equal((await listSafe(f.root,['tasks','DEMO-101','ask'])).kind,'error');
});
