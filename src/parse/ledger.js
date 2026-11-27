import { VALID_ID } from '../contract.js';
import { readTable } from './table.js';

export function parseLedger(text) {
  const table = readTable(text, '進行中', ['ID', '状態']);
  if (!table.headers) return {value: null, errors: table.errors};
  const errors = [...table.errors];
  const seen = new Set();
  const rows = [];
  for (const {fields: f, line} of table.rows) {
    if (!VALID_ID.test(f.ID) || seen.has(f.ID)) { errors.push({line, message: 'ID が不正または重複しています'}); continue; }
    seen.add(f.ID);
    rows.push({id: f.ID, ledgerStateRaw: f['状態'], title: f['題'] ?? '', area: f['区画'] ?? '', type: f['種類'] ?? '',
      repos: (f['リポジトリ'] ?? '').split(',').map(s => s.trim()).filter(Boolean), prs: (f.PR ?? '').split(/\s+/).filter(Boolean),
      workspace: f.workspace ?? '', nextAction: f['次の一手（誰が・何を）'] ?? '', ledgerUpdatedRaw: f['更新'] ?? ''});
  }
  const limitText = /^- 同時に動かす上限:\s*(\d+)\s*$/m.exec(text)?.[1];
  const limit = limitText && Number.isSafeInteger(+limitText) ? +limitText : null;
  return {value: {rows, lastSync: /^- 最終同期:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null, limit}, errors};
}
