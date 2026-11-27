import { DELIVERY, VALID_WORKSPACE } from '../contract.js';
import { readTable } from './table.js';

export function parseTaskState(text) {
  const errors = [];
  const workspaceText = /^- workspace:\s*(.+)$/m.exec(text)?.[1];
  const workspace = workspaceText === '（未作成）' ? '' : /^([A-Za-z0-9]+)(?:（|\s|$)/.exec(workspaceText ?? '')?.[1];
  const leadText = /^- 主担当:\s*(.+)$/m.exec(text)?.[1];
  const leadMatch = /^名前 (\S+) \/ pane (\S+)(?: \/ agent (\S+))? \/ セッションは lead\s*$/.exec(leadText ?? '');
  if (workspace === undefined || (workspace && !VALID_WORKSPACE.test(workspace))) errors.push({scope: 'structure', line: 1, message: 'workspace を解釈できません'});
  const pane = leadMatch?.[2] === '（未起動）' ? '' : leadMatch?.[2];
  if (!leadMatch || (pane && !/^[A-Za-z0-9]+:p[A-Za-z0-9]+$/.test(pane))) errors.push({scope: 'structure', line: 1, message: '主担当を解釈できません'});
  const table = readTable(text, '依頼', ['番号', '送達']);
  errors.push(...table.errors.map(e => ({...e, scope: 'requests'})));
  const requests = [];
  const seen = new Set();
  for (const {fields, line} of table.rows) {
    const number = Number(fields['番号']);
    if (!/^[1-9]\d*$/.test(fields['番号']) || !Number.isSafeInteger(number) || seen.has(number) || !Object.values(DELIVERY).includes(fields['送達'])) {
      errors.push({scope: 'requests', line, message: '依頼番号か送達を解釈できません'}); continue;
    }
    seen.add(number);
    requests.push({number, delivery: fields['送達']});
  }
  return {value: {phase: /^- 段階:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? '', workspace: workspace ?? '',
    lead: leadMatch ? {name: leadMatch[1], pane, agent: leadMatch[3] ?? 'claude'} : null, requests,
    structureTrusted: !errors.some(e => e.scope === 'structure'), requestsTrusted: !errors.some(e => e.scope === 'requests')}, errors};
}
