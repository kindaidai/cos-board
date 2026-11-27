import { createPoller } from './poller.js';
import { createFocusController } from './focus.js';

const state = {data:null, fetchedAt:null, connected:null};
const time = new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const dateTime = new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const badge = text => element('span','badge',text);
function relative(at) {
  const seconds = Math.floor((Date.now()-Date.parse(at))/1000);
  if (seconds < 0) return 'まもなく';
  if (seconds < 60) return '1 分以内';
  if (seconds < 3600) return `${Math.floor(seconds/60)} 分前`;
  if (seconds < 86400) return `${Math.floor(seconds/3600)} 時間前`;
  return `${Math.floor(seconds/86400)} 日前`;
}
function detail(parent,label,text) {
  if (!text) return;
  const section = element('div','detail');
  section.append(element('span','detail-label',label),element('p','',text)); parent.append(section);
}
function report(parent,label,value) {
  if (!value) return;
  detail(parent,`${label} · ${value.state} · 依頼 ${value.request} · ${dateTime.format(new Date(value.at))}`,value.text);
}
async function sendFocus(id) {
  const feedback = document.getElementById('focus-status');
  feedback.textContent = 'Herdr の場所を開いています…';
  try {
    const response = await fetch('/api/focus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId:id})});
    if (!response.ok) {const data = await response.json();throw new Error(data.error || `HTTP ${response.status}`);}
    feedback.textContent = `Herdr の ${id} を開きました`;
  } catch (error) {feedback.textContent = `場所を開けません: ${error.message}`;}
}
// DOMの寿命ではなくworkspace単位で保持し、定期描画で二重送信の印を失わない。
const focusController = createFocusController({sendFocus, onChange:() => render(state)});
function focus(id) {
  if (!window.getSelection()?.isCollapsed) return;
  void focusController.focus(id);
}
function card(value) {
  const isTask = value.kind === 'task';
  const article = element('article',`card ${value.needsCheck ? 'needs-check' : ''}`);
  const heading = element('div','card-heading');
  heading.append(element('span','identifier',isTask ? value.id : `WORKSPACE ${value.workspace.number}`));
  article.append(heading,element('h3','',isTask ? value.title || value.id : value.workspace.label));
  const badges = element('div','badges');
  if (isTask) {
    badges.append(badge(`${value.area} / ${value.type}`));
    if (value.workspace) badges.append(badge(`場所 ${value.workspace.number ?? value.workspace.id}`));
    for (const text of value.badges) badges.append(badge(text));
    if (value.state !== value.ledgerState) badges.append(badge(`台帳は ${value.ledgerStateRaw}`));
  } else {
    badges.append(badge('台帳に無い')); if (value.isCos) badges.append(badge('CoS'));
  }
  article.append(badges);
  if (isTask) {
    if (value.needsCheck) article.append(element('p','check',`要確認: ${value.needsCheck}`));
    detail(article,'この列の理由',value.reason);
    detail(article,'リポジトリ',value.repos.join(', '));
    detail(article,'PR',value.prs.join(' / '));
    detail(article,'次の一手',value.nextAction);
    report(article,'最新の報告',value.latestReport);
    report(article,'最新のメモ',value.latestNote);
    article.append(element('p','updated',value.updatedAt ? `${dateTime.format(new Date(value.updatedAt))} · ${relative(value.updatedAt)} · ${value.updatedSource === 'ledger' ? '台帳' : '報告'}` : '更新時刻なし'));
  }
  const panes = element('ul','panes');
  for (const pane of value.panes) {
    const line = element('li');
    line.append(element('span',`pane-state ${pane.status}`,pane.status),element('span','pane-name',`${pane.name || pane.paneId}${pane.isLead ? ' · 主担当' : ''}`));
    if (!isTask) {
      line.append(element('span','pane-detail',pane.cwd),element('span','pane-detail',pane.title));
    }
    panes.append(line);
  }
  article.append(panes);
  const canFocus = isTask ? value.canFocus : true;
  if (canFocus) {
    const button = element('button','open-workspace',`場所 ${value.workspace.number ?? value.workspace.id} を開く ↗`);
    button.type = 'button'; button.dataset.focusId = isTask ? value.id : value.workspace.id;
    button.disabled = focusController.isPending(value.workspace.id);
    if (button.disabled) button.textContent = '場所を開いています…';
    button.addEventListener('click',event=>{event.stopPropagation();focus(value.workspace.id);});
    article.addEventListener('click',()=>focus(value.workspace.id));
    article.classList.add('clickable'); article.append(button);
  } else article.append(element('p','unavailable',value.workspace?.present === null ? '場所を確認できません' : '開ける場所がありません'));
  return article;
}

function render({data,fetchedAt,connected}) {
  const board = document.getElementById('board'), offline = document.getElementById('offline');
  offline.hidden = connected !== false;
  offline.textContent = connected === false ? `サーバーに繋がりません。${fetchedAt ? `${time.format(fetchedAt)} の内容です` : 'まだ取得できていません'}` : '';
  board.classList.toggle('stale',connected === false);
  document.getElementById('connection').textContent = connected === false ? '接続を確認しています' : fetchedAt ? `最終取得 ${time.format(fetchedAt)}` : '取得しています…';
  if (!data) return;
  const focusedId = document.activeElement?.dataset.focusId;
  document.getElementById('summary').textContent = data.ledger.ok ? `進行中 ${data.ledger.activeCount} / 上限 ${data.ledger.limit ?? '不明'}　 台帳の最終同期 ${data.ledger.lastSync ?? '不明'}` : '台帳を取得できません';
  const alerts = document.getElementById('alerts');
  alerts.replaceChildren(...data.alerts.map(a=>element('p',`alert ${a.level}`,a.message)));
  const drafts = document.getElementById('drafts'); drafts.hidden = data.drafts.length === 0;
  drafts.classList.toggle('stale',connected === false);
  drafts.replaceChildren(element('h2','',`下書き ${data.drafts.length}`),...data.drafts.map(card));
  board.replaceChildren(...data.columns.map(column=>{
    const section = element('section',`column ${column.key}`);
    const heading = element('h2','column-heading'); heading.append(element('span','',column.title),element('span','count',String(column.cards.length)));
    section.append(heading);
    if (!column.available) section.append(element('p','empty','取得できません'));
    else if (!column.cards.length) section.append(element('p','empty','なし'));
    section.append(...column.cards.map(card)); return section;
  }));
  document.title = `(${data.columns[0].cards.length}) CoS ボード`;
  if (focusedId) [...document.querySelectorAll('[data-focus-id]')].find(n=>n.dataset.focusId === focusedId)?.focus({preventScroll:true});
}
const poller = createPoller({
  fetchBoard:async signal=>{
    const response = await fetch('/api/board',{signal,cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  onData:data=>{Object.assign(state,{data,fetchedAt:new Date(),connected:true});render(state);},
  onError:()=>{state.connected=false;render(state);},
});
document.addEventListener('visibilitychange',()=>document.hidden ? poller.pause() : void poller.resume());
window.addEventListener('pagehide',()=>poller.pause());
window.addEventListener('pageshow',()=>{if (!document.hidden) void poller.resume();});
if (!document.hidden) void poller.resume();
