import { CLEANUP_REQUEST_PREFIX, STATE, STATE_COLUMN, STATUS, REPORT, DELIVERY, PHASE, COLUMN } from '../contract.js';

function decision(row, rule, reason, {state, basis = 'ledger', needsCheck = null, badges = [], column} = {}) {
  const ledgerState = Object.values(STATE).includes(row.ledgerStateRaw) ? row.ledgerStateRaw : null;
  const selected = state === undefined ? ledgerState : state;
  return {state: selected, column: column ?? STATE_COLUMN[selected] ?? COLUMN.WORKING, rule, reason, basis,
    needsCheck: needsCheck ?? (row.nextAction.startsWith('要確認:') ? row.nextAction.slice(4).trim() : null) ??
      (ledgerState === null ? '台帳の状態を解釈できない' : null), badges};
}

export function judgePanes({row, state, reports, panes}) {
  const stay = (rule, reason, options = {}) => decision(row, rule, reason, options);
  if (!panes.length) return stay('10', 'pane が見つからない', {needsCheck: 'pane が見つからない'});
  if (panes.some(p => p.agent_status === STATUS.UNKNOWN || !Object.values(STATUS).includes(p.agent_status))) return stay('7', '状態が読めない pane がある', {needsCheck: '状態が読めない pane がある'});
  if (panes.some(p => p.agent_status === STATUS.BLOCKED)) return stay('8', '許可や入力を待っている pane がある', {state: STATE.USER, basis: 'herdr'});
  if (panes.some(p => p.agent_status === STATUS.WORKING)) return stay('9', '作業している pane がある', {state: STATE.WORKING, basis: 'herdr'});
  if (!state.requestsTrusted || reports.errors.length) return stay('10a', '依頼の表または報告を解釈できない', {needsCheck: '依頼の表または報告を解釈できない'});
  const current = state.requests.filter(r => [DELIVERY.SENT, DELIVERY.RECEIVED].includes(r.delivery)).reduce((max, r) => Math.max(max, r.number), 0);
  const report = reports.value.findLast(r => r.request === current && r.state !== REPORT.NOTE);
  if (report?.state === REPORT.USER) return stay('10b', '現在の依頼の報告が need-user', {state: STATE.USER, basis: 'report'});
  if (report?.state === REPORT.EXTERNAL) return stay('10c', '現在の依頼の報告が need-external', {state: STATE.EXTERNAL, basis: 'report'});
  if (report?.state === REPORT.DONE) {
    if (state.requests.some(r => [DELIVERY.UNSENT, DELIVERY.SENDING].includes(r.delivery))) return stay('10e', '完了報告はあるが未送信の依頼がある', {badges: ['未送信の依頼あり']});
    const cleanup = state.requests.find(r => r.number === current)?.summary?.startsWith(CLEANUP_REQUEST_PREFIX);
    if (cleanup) return stay('10d', '閉じる前の片付けの依頼が完了し、未送信の依頼もない', {state: STATE.DONE, basis: 'report'});
    return stay('10g', '作業の依頼が完了。CoS が閉じる前の片付けを送るまで作業中', {state: STATE.WORKING, basis: 'report'});
  }
  const reason = `全部の pane が止まっているが、${current ? `依頼 ${current} の報告が working のまま（または無い）` : '現在の依頼が無い'}`;
  return stay('10f', reason, {needsCheck: reason});
}

export function judgeTask({row, state, reports, lead, herdr, pendingAsks = []}) {
  const stay = (rule, reason, options) => decision(row, rule, reason, options);
  const aligned = Boolean(state?.structureTrusted && row.workspace === state.workspace);
  const present = herdr.ok && herdr.workspaces.some(w => w.workspace_id === row.workspace);
  const canFocus = Boolean(aligned && present && row.workspace);
  let result;
  if (!herdr.ok) result = stay('0', 'Herdr を取得できないため台帳の状態を表示');
  else if (row.ledgerStateRaw === STATE.DRAFT) result = stay('1', '起動途中の下書き', {badges: state?.phase ? [state.phase] : []});
  else if (!state?.structureTrusted) result = stay('2', 'state.md が読めない', {needsCheck: 'state.md が読めない'});
  else if (!aligned) result = stay('3', 'workspace の記録が食い違う', {needsCheck: 'workspace の記録が食い違う'});
  else if ((row.ledgerStateRaw === STATE.DONE || state.phase === PHASE.CANCEL) && !present) result = stay('4', 'workspace が無く片付け待ち', {column: COLUMN.DONE, badges: state.phase === PHASE.CANCEL ? ['片付け待ち', '中止'] : ['片付け待ち']});
  else if (row.ledgerStateRaw === STATE.DONE) result = stay('5', '台帳で完了しており workspace が残っている');
  else if (typeof lead !== 'string' || !lead.trim()) result = stay('6', 'lead が読めない', {needsCheck: 'lead が読めない'});
  else {
    const candidates = herdr.agents.filter(a => a.name === row.id);
    const agent = candidates[0];
    const isLead = candidates.length === 1 && agent.pane_id === state.lead?.pane && agent.workspace_id === state.workspace && agent.agent === 'claude' &&
      (agent.agent_session == null || agent.agent_session === '' || agent.agent_session === lead);
    if (!isLead) result = stay('6', '記録に一致する主担当が居ない', {state: STATE.LOST, basis: 'herdr'});
    else result = judgePanes({row, state, reports, panes: herdr.agents.filter(a => a.workspace_id === row.workspace)});
  }
  if (reports.errors.length) result.badges.push('報告に読めない行あり');
  if ([COLUMN.WORKING,COLUMN.EXTERNAL].includes(result.column) && pendingAsks.length) {
    result={...result,state:STATE.USER,column:COLUMN.USER,basis:'ask',rule:'11',
      reason:`未回答の問いがある（${pendingAsks.map(a=>'ask/'+a.number).join('、')}）。もとの判定: 規則 ${result.rule}（${result.reason}）`};
  }
  return {...result, canFocus};
}
