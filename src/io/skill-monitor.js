import { lstat } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { readSafe } from './read-sources.js';
import { hashSyncSection } from '../parse/skill-section.js';
import { SYNC_SECTION_SHA256 } from '../contract.js';

export function createSkillMonitor({path, expectedHash = SYNC_SECTION_SHA256}) {
  let cachedKey = null, cached = null, pending = null;
  return async function checkSkill() {
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) return {ok:false};
      const key = [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(':');
      if (key === cachedKey) return cached;
      if (pending?.key === key) return pending.promise;
      const promise = (async () => {
        const source = await readSafe(dirname(path), [], basename(path));
        const parsed = source.kind === 'text' ? hashSyncSection(source.text) : null;
        const result = {ok:Boolean(parsed && !parsed.errors.length && parsed.value === expectedHash)};
        cachedKey = key; cached = result;
        return result;
      })();
      pending = {key, promise};
      try { return await promise; }
      finally { if (pending?.promise === promise) pending = null; }
    } catch {
      return {ok:false};
    }
  };
}
