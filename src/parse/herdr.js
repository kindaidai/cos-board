import { STATUS, VALID_WORKSPACE } from '../contract.js';

export function parseHerdr(text, kind) {
  const fail = message => ({value: [], errors: [{line: 1, message: message.replace(/[\r\n]+/g, ' ')}]});
  let json;
  try { json = JSON.parse(text); } catch { return fail('Herdr の出力が JSON ではありません'); }
  if (json?.error) return fail(`Herdr: ${json.error.message ?? json.error.code ?? 'エラー'}`);
  const rows = json?.result?.[kind];
  if (!Array.isArray(rows)) return fail(`Herdr の ${kind} 配列がありません`);
  const value = [];
  for (const row of rows) {
    if (!row || typeof row.workspace_id !== 'string' || !VALID_WORKSPACE.test(row.workspace_id)) return fail('Herdr の workspace_id が不正です');
    if (kind === 'workspaces') {
      if (!Number.isSafeInteger(row.number) || row.number < 0 || typeof row.label !== 'string') return fail('Herdr の workspace の形が不正です');
      value.push({...row});
    } else {
      if (typeof row.pane_id !== 'string' || !row.pane_id || typeof row.agent !== 'string') return fail('Herdr の agent の形が不正です');
      value.push({...row, name: typeof row.name === 'string' ? row.name : null,
        agent_status: Object.values(STATUS).includes(row.agent_status) ? row.agent_status : STATUS.UNKNOWN,
        cwd: typeof row.cwd === 'string' ? row.cwd : '', terminal_title_stripped: typeof row.terminal_title_stripped === 'string' ? row.terminal_title_stripped : ''});
    }
  }
  return {value, errors: []};
}
