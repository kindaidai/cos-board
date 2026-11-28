export const STATE = Object.freeze({ DRAFT: '下書き', WORKING: '作業中', USER: 'あなた待ち', EXTERNAL: '外部待ち', DONE: '完了', LOST: '迷子' });
export const STATUS = Object.freeze({ IDLE: 'idle', WORKING: 'working', BLOCKED: 'blocked', DONE: 'done', UNKNOWN: 'unknown' });
export const REPORT = Object.freeze({ WORKING: 'working', USER: 'need-user', EXTERNAL: 'need-external', DONE: 'done', NOTE: 'note' });
export const DELIVERY = Object.freeze({ UNSENT: '未送信', SENDING: '送信中', SENT: '送信済み', RECEIVED: '受領済み' });
export const PHASE = Object.freeze({ RESERVED: '予約', WORKSPACE: 'workspace 作成済み', STARTED: '主担当起動済み', RUNNING: '稼働', CANCEL: '中止予定' });
export const COLUMN = Object.freeze({ DRAFTS: 'drafts', USER: 'your-turn', WORKING: 'working', EXTERNAL: 'external', DONE: 'done', LOST: 'lost', UNLISTED: 'unlisted' });
export const COLUMNS = Object.freeze([
  [COLUMN.USER, 'あなたの番'], [COLUMN.WORKING, STATE.WORKING], [COLUMN.EXTERNAL, STATE.EXTERNAL],
  [COLUMN.DONE, STATE.DONE], [COLUMN.LOST, STATE.LOST], [COLUMN.UNLISTED, '台帳に無いセッション'],
].map(Object.freeze));
export const STATE_COLUMN = Object.freeze({ [STATE.DRAFT]: COLUMN.DRAFTS, [STATE.WORKING]: COLUMN.WORKING, [STATE.USER]: COLUMN.USER, [STATE.EXTERNAL]: COLUMN.EXTERNAL, [STATE.DONE]: COLUMN.DONE, [STATE.LOST]: COLUMN.LOST });
export const CLEANUP_REQUEST_PREFIX = '閉じる前の片付け';
export const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,22}$/;
export const VALID_WORKSPACE = /^[A-Za-z0-9]+$/;
export const VALID_PANE = /^[A-Za-z0-9]+:p[A-Za-z0-9]+$/;
export const TURN = Object.freeze({ASK:'ask', PERMISSION:'permission', MERGE:'merge', MANUAL:'manual'});
export const VALID_ASK_FILE = /^\d{1,4}\.md$/;
export const LIMITS = Object.freeze({askFiles:30, askBytes:65536, briefBytes:1048576, promptReads:8, promptLines:40, lineChars:300, summaryChars:200, titleChars:120, questionChars:300});
/** @typedef {{file:string,number:number,answered:boolean,title:string,question:string,request:number|null,since:string|null,body:string|null,error:string|null}} Ask */
/** @typedef {{ok:true,question:string,context:string[],options:string[],text:string}|{ok:false,reason:string}} Prompt */
/** @typedef {'ask'|'permission'|'merge'|'manual'} TurnKind */
/** @typedef {{key:string,kind:TurnKind,taskId:string|null,title:string,summary:string,workspace:{id:string,number:number|null}|null,paneId:string|null,askFile:string|null,canFocus:boolean,direct:boolean,since:string|null,sinceSource:'file'|'report'|'ledger'|'observed'|null}} Turn */
export const ROLE = Object.freeze({LEAD:'lead', SIBLING:'sibling', OTHER:'other'});
export const SYNC_SECTION_SHA256 = '02644635386e4084614c86034fa2b05b43bbd1dd477e1d39243a57fdde7bae02';
export const SKILL_WARNING = 'CoS の判定表の更新、または読み取り失敗を検出しました。cos-board の判定を見直してください';

/** @typedef {'下書き'|'作業中'|'あなた待ち'|'外部待ち'|'完了'|'迷子'} LedgerState */
/** @typedef {'your-turn'|'working'|'external'|'done'|'lost'|'unlisted'} ColumnKey */
/** @typedef {{seq:number, at:string, request:number, state:'working'|'need-user'|'need-external'|'done'|'note', pane:string, text:string}} Report */
/** @typedef {'lead'|'sibling'|'other'} PaneRole */
/** @typedef {{paneId:string, name:string|null, role:PaneRole, repo:string, agent:string, status:'idle'|'working'|'blocked'|'done'|'unknown', cwd:string, title:string,prompt:Prompt|null,blockedSince:string|null}} Pane */
/** @typedef {{workspaceId:string, paneId?:string}} FocusTarget */
/** @typedef {{kind:'task', id:string, title:string, area:string, type:string, repos:string[], prs:string[], nextAction:string, state:LedgerState|null, ledgerState:LedgerState|null, ledgerStateRaw:string, basis:'herdr'|'report'|'ledger'|'ask', rule:string, reason:string, needsCheck:string|null, badges:string[], latestReport:Report|null, latestNote:Report|null, updatedAt:string|null, updatedSource:'ledger'|'report'|null, ledgerUpdatedRaw:string, workspace:{id:string,number:number|null,present:boolean|null}|null, canFocus:boolean, canClose:boolean, panes:Pane[],asks:Ask[],askError:string|null}} TaskCard */
/** @typedef {{kind:'session', workspace:{id:string,number:number,label:string}, isCos:boolean, blocked:boolean, panes:Pane[]}} SessionCard */
/** @typedef {{key:ColumnKey,title:string,available:boolean,cards:(TaskCard|SessionCard)[]}} Column */
/** @typedef {{generatedAt:string,refreshSeconds:number,turns:Turn[],cos:{workspaceId:string,paneId:string,number:number|null}|null,ledger:({ok:true,lastSync:string|null,limit:number|null,activeCount:number}|{ok:false,reason:string}),herdr:({ok:true}|{ok:false,reason:string}),alerts:{level:'error'|'warn',message:string}[],drafts:TaskCard[],columns:Column[]}} Board */

const nullable = (check) => (v, p, errors) => v === null || check(v, p, errors);
const scalar = (test, label) => (v, p, errors) => test(v) || (errors.push(`${p}: ${label}`), false);
const string = scalar(v => typeof v === 'string', '文字列が必要');
const boolean = scalar(v => typeof v === 'boolean', '真偽値が必要');
const integer = scalar(v => Number.isSafeInteger(v) && v >= 0, '非負の整数が必要');
const enumeration = values => scalar(v => values.includes(v), `値は ${values.join(', ')} のいずれか`);
const array = check => (v, p, errors) => {
  if (!Array.isArray(v)) { errors.push(`${p}: 配列が必要`); return false; }
  v.forEach((item, i) => check(item, `${p}[${i}]`, errors));
  return true;
};
const object = fields => (v, p, errors) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) { errors.push(`${p}: オブジェクトが必要`); return false; }
  for (const [key, check] of Object.entries(fields)) check(v[key], `${p}.${key}`, errors);
  return true;
};
const timestamp = scalar(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === (v.length === 20 ? v.replace('Z', '.000Z') : v), '実在する UTC の日時が必要');
const report = object({seq: integer, at: timestamp, request: integer, state: enumeration(Object.values(REPORT)), pane: string, text: string});
const paneShape = object({paneId: string, name: nullable(string), role: enumeration(Object.values(ROLE)), repo: string, agent: string, status: enumeration(Object.values(STATUS)), cwd: string, title: string, prompt: nullable((v,p,e) => { if (object({ok:boolean})(v,p,e)) (v.ok ? object({question:string,context:array(string),options:array(string),text:string}) : object({reason:string}))(v,p,e); }), blockedSince: nullable(timestamp)});
const pane = (v,p,e) => { paneShape(v,p,e); if (v && (v.status === STATUS.BLOCKED ? v.prompt == null : v.prompt !== null || v.blockedSince !== null)) e.push(p + ': blocked と確認画面が一致しません'); };
const ask = (v,p,e) => { object({file:scalar(v=>typeof v==='string' && VALID_ASK_FILE.test(v),'問いの名前が不正'),number:integer,answered:boolean,title:string,question:string,request:nullable(integer),since:nullable(timestamp),body:nullable(string),error:nullable(string)})(v,p,e); if (v && (v.answered ? v.body !== null || v.error !== null : (typeof v.body === 'string') === (typeof v.error === 'string'))) e.push(p+': 問いの本文とエラーが不整合'); };
const turn = (v,p,e) => { object({key:string,kind:enumeration(Object.values(TURN)),taskId:nullable(string),title:string,summary:string,workspace:nullable(object({id:string,number:nullable(integer)})),paneId:nullable(string),askFile:nullable(string),canFocus:boolean,direct:boolean,since:nullable(timestamp),sinceSource:nullable(enumeration(['file','report','ledger','observed']))})(v,p,e); if (!v) return; const expected = v.kind === TURN.PERMISSION ? 'pane:'+v.paneId : v.askFile !== null ? 'ask:'+v.taskId+':'+v.askFile : 'task:'+v.taskId; if ((v.kind === TURN.PERMISSION) !== (typeof v.paneId === 'string') || (v.askFile !== null && (v.kind !== TURN.ASK || !VALID_ASK_FILE.test(v.askFile))) || v.key !== expected) e.push(p+': 種別とキーが不整合'); };
const task = object({kind: enumeration(['task']), id: string, title: string, area: string, type: string, repos: array(string), prs: array(string), nextAction: string,
  state: nullable(enumeration(Object.values(STATE))), ledgerState: nullable(enumeration(Object.values(STATE))), ledgerStateRaw: string,
  basis: enumeration(['herdr', 'report', 'ledger', 'ask']), rule: string, reason: string, needsCheck: nullable(string), badges: array(string),
  latestReport: nullable(report), latestNote: nullable(report), updatedAt: nullable(timestamp), updatedSource: nullable(enumeration(['ledger', 'report'])),
  ledgerUpdatedRaw: string, workspace: nullable(object({id: string, number: nullable(integer), present: nullable(boolean)})), canFocus: boolean, canClose: boolean, asks: array(ask), askError: nullable(string), panes: array(pane)});
const sessionPane = (v, p, errors) => { pane(v, p, errors); enumeration([ROLE.OTHER])(v?.role, `${p}.role`, errors); };
const session = object({kind: enumeration(['session']), workspace: object({id: string, number: integer, label: string}), isCos: boolean, blocked: boolean, panes: array(sessionPane)});
const card = (v, p, errors) => v?.kind === 'session' ? session(v, p, errors) : task(v, p, errors);
const source = extra => (v, p, errors) => {
  if (!object({ok: boolean})(v, p, errors)) return;
  (v.ok ? object(extra) : object({reason: string}))(v, p, errors);
};

/** @param {unknown} board @returns {string[]} */
export function validateBoard(board) {
  const errors = [];
  object({generatedAt: timestamp, refreshSeconds: enumeration([3]), ledger: source({lastSync: nullable(string), limit: nullable(integer), activeCount: integer}),
    herdr: source({}), turns: array(turn), cos: nullable(object({workspaceId:string,paneId:string,number:nullable(integer)})), alerts: array(object({level: enumeration(['error', 'warn']), message: string})), drafts: array(task),
    columns: array(object({key: enumeration(COLUMNS.map(([key]) => key)), title: string, available: boolean, cards: array(card)}))})(board, 'board', errors);
  if (Array.isArray(board?.columns) && (board.columns.length !== COLUMNS.length || board.columns.some((column, i) => column?.key !== COLUMNS[i]?.[0]))) errors.push('board.columns: 6 列を規定の順で指定');
  if (Array.isArray(board?.turns) && new Set(board.turns.map(t=>t?.key)).size !== board.turns.length) errors.push('board.turns: キーが重複');
  return errors;
}
