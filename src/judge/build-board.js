import { taskAsks } from './task-asks.js';
import { buildTurns } from './turns.js';
import { parsePromptScreen } from '../parse/prompt-screen.js';
import { COLUMN, COLUMNS, STATE, STATUS, REPORT, ROLE, validateBoard } from '../contract.js';
import { parseLedger } from '../parse/ledger.js';
import { parseTaskState } from '../parse/task-state.js';
import { parseReportLog } from '../parse/report-log.js';
import { parseHerdr } from '../parse/herdr.js';
import { parseCosState } from '../parse/cos-state.js';
import { judgeTask } from './judge-task.js';
import { updatedAt } from './updated-at.js';

const error = (source, name) => source?.reason ?? `${name} がありません`;
const parseFile = (source, parse, name) => source?.kind === 'text' ? parse(source.text) : {value: null, errors: [{line: 1, message: error(source, name)}]};
const parseCommand = (source, kind) => source?.ok ? parseHerdr(source.stdout, kind) : {value: [], errors: [{line: 1, message: error(source, `Herdr ${kind}`)}]};

/** @returns {import('../contract.js').Board} */
export function buildBoard(sources, now) {
  const ledger = parseFile(sources.ledger, parseLedger, '台帳');
  const workspaces = parseCommand(sources.workspaces, 'workspaces');
  const agents = parseCommand(sources.agents, 'agents');
  const herdrErrors = [...workspaces.errors, ...agents.errors];
  const herdr = {ok: herdrErrors.length === 0, workspaces: workspaces.value, agents: agents.value};
  const cos = parseFile(sources.cosState, parseCosState, 'cos.state');
  const board = {generatedAt: now.toISOString(), refreshSeconds: 3,
    ledger: ledger.value ? {ok: true, lastSync: ledger.value.lastSync, limit: ledger.value.limit, activeCount: ledger.value.rows.length} : {ok: false, reason: ledger.errors.map(e => e.message).join(' / ')},
    herdr: herdr.ok ? {ok: true} : {ok: false, reason: herdrErrors.map(e => e.message).join(' / ')},
    turns: [], cos: null, alerts: [], drafts: [], columns: COLUMNS.map(([key, title]) => ({key, title, available: key === COLUMN.UNLISTED ? herdr.ok : Boolean(ledger.value), cards: []}))};
  if (!board.ledger.ok) board.alerts.push({level: 'error', message: `台帳を取得できません: ${board.ledger.reason}。取得できた workspace はすべて台帳に無いセッションとして表示します`});
  else for (const e of ledger.errors) board.alerts.push({level: 'warn', message: `台帳 ${e.line} 行: ${e.message}`});
  if (!board.herdr.ok) board.alerts.push({level: 'error', message: `Herdr を取得できません: ${board.herdr.reason}`});
  if (cos.errors.length) board.alerts.push({level: 'warn', message: `CoS の識別情報: ${cos.errors.map(e => e.message).join(' / ')}`});
  const byWorkspace = new Map(workspaces.value.map(w => [w.workspace_id, w]));
  const associated = new Set();
  const roleOrder = [ROLE.LEAD, ROLE.SIBLING, ROLE.OTHER];
  const panesFor = (id, {lead = null, taskId = null} = {}) => agents.value.filter(a => a.workspace_id === id).map(a => {
    const cwd = sources.home && (a.cwd === sources.home || a.cwd.startsWith(`${sources.home}/`)) ? `~${a.cwd.slice(sources.home.length)}` : a.cwd;
    const role = a.pane_id === lead?.pane && a.name === lead?.name ? ROLE.LEAD :
      taskId && a.name?.startsWith(`${taskId}-`) && a.name.length > taskId.length + 1 ? ROLE.SIBLING : ROLE.OTHER;
    return {paneId:a.pane_id, name:a.name, role, repo:cwd.split('/').filter(Boolean).at(-1) ?? '',
      agent:a.agent, status:a.agent_status, prompt:a.agent_status === STATUS.BLOCKED ? (sources.prompts?.[a.pane_id]?.ok ? {ok:true,...parsePromptScreen(sources.prompts[a.pane_id].stdout)} : {ok:false,reason:sources.prompts?.[a.pane_id]?.reason ?? '画面未読'}) : null,
      blockedSince:a.agent_status === STATUS.BLOCKED ? sources.blockedSince?.[a.pane_id] ?? null : null, cwd, title:a.terminal_title_stripped};
  }).sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || a.paneId.localeCompare(b.paneId, 'en', {numeric:true}));
  for (const row of ledger.value?.rows ?? []) {
    const taskSources = sources.tasks?.[row.id] ?? {};
    const state = parseFile(taskSources.state, parseTaskState, 'state.md');
    const reports = taskSources.report?.kind === 'missing' ? {value: [], errors: []} : parseFile(taskSources.report, parseReportLog, 'report.log');
    reports.value ??= [];
    associated.add(row.workspace);
    if (state.value?.workspace) associated.add(state.value.workspace);
    const lead = taskSources.lead?.kind === 'text' ? taskSources.lead.text.split(/\r?\n/)[0].replace(/\s/g, '') : null;
    const questions = taskAsks({asks:taskSources.asks,brief:taskSources.brief,state:state.value});
    const decision = judgeTask({row, state: state.value, reports, lead, herdr, pendingAsks:questions.asks.filter(a=>!a.answered)});
    const workspace = byWorkspace.get(row.workspace);
    const card = {kind: 'task', id: row.id, title: row.title, area: row.area, type: row.type, repos: row.repos, prs: row.prs,
      nextAction: row.nextAction, state: decision.state, ledgerState: Object.values(STATE).includes(row.ledgerStateRaw) ? row.ledgerStateRaw : null,
      ledgerStateRaw: row.ledgerStateRaw, basis: decision.basis, rule: decision.rule, reason: decision.reason, needsCheck: decision.needsCheck, badges: decision.badges,
      latestReport: reports.value.findLast(r => r.state !== REPORT.NOTE) ?? null, latestNote: reports.value.findLast(r => r.state === REPORT.NOTE) ?? null,
      ...updatedAt(row.ledgerUpdatedRaw, reports.value, now), ledgerUpdatedRaw: row.ledgerUpdatedRaw,
      workspace: row.workspace ? {id: row.workspace, number: workspace?.number ?? null, present: herdr.ok ? Boolean(workspace) : null} : null,
      ...questions, canFocus: decision.canFocus,
      // 閉じてよいのは、台帳で完了し、記録どおりの workspace が残っているタスクだけ
      canClose: row.ledgerStateRaw === STATE.DONE && decision.canFocus, panes: herdr.ok ? panesFor(row.workspace, {lead:state.value?.lead, taskId:row.id}) : []};
    if (decision.column === COLUMN.DRAFTS) board.drafts.push(card);
    else board.columns.find(c => c.key === decision.column).cards.push(card);
  }
  if (herdr.ok) for (const workspace of workspaces.value) {
    if (associated.has(workspace.workspace_id)) continue;
    const panes = panesFor(workspace.workspace_id);
    if (!panes.length && board.ledger.ok) continue;
    const blocked = panes.some(p => p.status === STATUS.BLOCKED);
    const card = {kind: 'session', workspace: {id: workspace.workspace_id, number: workspace.number, label: workspace.label},
      isCos: panes.some(p => p.paneId === cos.value), blocked, panes};
    board.columns.find(c => c.key === (blocked ? COLUMN.USER : COLUMN.UNLISTED)).cards.push(card);
  }
  const compare = (a, b) => {
    if (a.kind !== b.kind) return a.kind === 'task' ? -1 : 1;
    if (a.kind === 'session') return a.workspace.number - b.workspace.number;
    return Number(Boolean(b.needsCheck)) - Number(Boolean(a.needsCheck)) ||
      (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || a.id.localeCompare(b.id, 'en');
  };
  board.drafts.sort(compare);
  board.columns.forEach(c => c.cards.sort(compare));
  board.turns=buildTurns([...board.drafts,...board.columns.flatMap(c=>c.cards)],now);
  const cosAgent=herdr.ok ? agents.value.find(a=>a.pane_id===cos.value && byWorkspace.has(a.workspace_id)) : null;
  board.cos=cosAgent ? {workspaceId:cosAgent.workspace_id,paneId:cosAgent.pane_id,number:byWorkspace.get(cosAgent.workspace_id).number} : null;
  const errors = validateBoard(board);
  if (errors.length) throw new Error(`ボードの契約違反: ${errors.join(' / ')}`);
  return board;
}
