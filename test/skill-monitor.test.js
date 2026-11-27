import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fixtureDirectory } from './helpers.js';

const monitor = await import('../src/io/skill-monitor.js').catch(() => null);
async function setup(t) {
  assert.ok(monitor, 'SKILL監視が未実装');
  const f = await fixtureDirectory(t);
  const path = join(f.directory, 'SKILL.md');
  await copyFile(new URL('./fixtures/chief-of-staff.md', import.meta.url), path);
  return {path, check:monitor.createSkillMonitor({path})};
}
test('SKILLは未変更なら結果を再利用し、本文変更と復旧を次の確認で検出する', async t => {
  const {path, check} = await setup(t);
  const original = await readFile(path, 'utf8');
  const first = await check(); assert.equal(first.ok, true);
  assert.equal(await check(), first);
  await writeFile(path, original.replace('全件の同期', '全件の変更'));
  assert.equal((await check()).ok, false);
  await writeFile(path, original);
  assert.equal((await check()).ok, true);
  assert.equal(await readFile(path, 'utf8'), original);
});
test('SKILLの欠落・節欠落・symlinkは失敗として返す', async t => {
  const {path, check} = await setup(t);
  await rm(path); assert.equal((await check()).ok, false);
  await writeFile(path, '# 節なし'); assert.equal((await check()).ok, false);
  await rm(path); await symlink(new URL('./fixtures/chief-of-staff.md', import.meta.url), path);
  assert.equal((await check()).ok, false);
});
