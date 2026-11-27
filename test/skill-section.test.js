import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const parser = await import('../src/parse/skill-section.js').catch(() => null);
const fixture = readFileSync(new URL('./fixtures/chief-of-staff.md', import.meta.url), 'utf8');
import { SYNC_SECTION_SHA256 as expected } from '../src/contract.js';
// fixture の同期節は実物の SKILL.md と同じ本文にし、契約のハッシュと一致させる
function hash(text) {
  assert.ok(parser, '節ハッシュの解析が未実装');
  return parser.hashSyncSection(text);
}
test('同期節は見出しと末尾の改行を含め次の見出しを除いたUTF-8でハッシュ化する', () => {
  assert.deepEqual(hash(fixture), {value:expected, errors:[]});
  assert.equal(hash(fixture.replace('対象外', '対象外の変更')).value, expected);
  assert.equal(hash(fixture.replace('## 2. 次の節\n対象外', '## 9. 変更\n後続の変更')).value, expected);
  assert.equal(hash(fixture.slice(0, fixture.indexOf('## 2. 次の節'))).value, expected);
});
test('同期節内の変更は検出し、見出しが無い場合はエラーにする', () => {
  assert.notEqual(hash(fixture.replace('全件の同期', '全件の変更')).value, expected);
  const result = hash('# 同期節なし\n## 2. 次の節\n');
  assert.equal(result.value, null); assert.ok(result.errors.length);
});
