import { mkdtemp, cp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const fakeHerdr = fileURLToPath(new URL('./fixtures/fake-herdr.js', import.meta.url));
export async function fixtureDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cos-board-test-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const root = join(directory, 'cos');
  await cp(new URL('./fixtures/cos', import.meta.url), root, {recursive: true});
  const calls = join(directory, 'calls.log');
  return {directory, root, calls, env: {...process.env, FAKE_HERDR_CALLS: calls}};
}
export async function readCalls(file) {
  try {return (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));}
  catch (error) {if (error.code === 'ENOENT') return []; throw error;}
}
