import { turnView, waited, detailContent, questionView } from './turn-view.js';
import { createPoller } from './poller.js';
import { createFocusController, focusKey } from './focus.js';
import { createCloseController } from './close.js';
import { paneView } from './pane-view.js';

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
async function sendFocus(target) {
  const feedback = document.getElementById('focus-status');
  feedback.textContent = 'Herdr の場所を開いています…';
  try {
    const response = await fetch('/api/focus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(target)});
    if (!response.ok) {const data = await response.json();throw new Error(data.error || `HTTP ${response.status}`);}
    feedback.textContent = `Herdr の ${focusKey(target)} を開きました`;
  } catch (error) {feedback.textContent = `場所を開けません: ${error.message}`;}
}
// DOMの寿命ではなく対象単位で保持し、定期描画で二重送信の印を失わない。
const focusController = createFocusController({sendFocus, onChange:() => render(state)});
function focus(target) {
  if (!window.getSelection()?.isCollapsed) return;
  void focusController.focus(target);
}
async function sendClose(id) {
  const feedback = document.getElementById('focus-status');
  feedback.textContent = `Herdr の ${id} を閉じています…`;
  try {
    const response = await fetch('/api/close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId:id})});
    if (!response.ok) {const data = await response.json();throw new Error(data.error || `HTTP ${response.status}`);}
    feedback.textContent = `Herdr の ${id} を閉じました`;
  } catch (error) {feedback.textContent = `閉じられません: ${error.message}`;}
}
const closeController = createCloseController({sendClose, onChange:() => render(state)});
function closeButton(text, className, id, onClick) {
  const button = element('button',`open-workspace close-workspace ${className}`,text);
  button.type = 'button'; button.dataset.focusId = `${className}:${id}`;
  button.addEventListener('click',event=>{event.stopPropagation();onClick();});
  return button;
}
// 台帳で完了したタスクだけに出す。押したあと「閉じる（確定）」をもう一度押すまで送らない。
function closeActions(id, label) {
  const actions = element('div','close-actions');
  if (closeController.isPending(id)) {
    const button = closeButton('閉じています…','pending',id,()=>{}); button.disabled = true; actions.append(button);
  } else if (closeController.isArmed(id)) {
    actions.append(closeButton(`場所 ${label} を閉じる（確定）`,'armed',id,()=>void closeController.confirm(id)),
      closeButton('やめる','cancel',id,()=>closeController.cancel(id)));
  } else actions.append(closeButton(`場所 ${label} を閉じる`,'arm',id,()=>closeController.arm(id)));
  return actions;
}
let detailKey=null;
function openDetail(turn) {
  const content=detailContent(state.data,turn);
  document.getElementById('detail-title').textContent=content.title;
  document.getElementById('detail-subtitle').textContent=content.subtitle;
  document.getElementById('detail-body').textContent=content.body;
  document.getElementById('detail-stale').textContent='';
  detailKey=turn.key;
  document.getElementById('detail').showModal();
}
function detailButton(turn,label,scope='list') {
  return closeButton(label,'turn-detail',scope+':'+turn.key,()=>openDetail(turn));
}
function appendQuestion(parent, source) {
  const view=questionView(source);
  if (view.question) parent.append(element('p','turn-question',view.question));
  if (view.options.length) {
    const list=element('ul','turn-options');
    for (const option of view.options) list.append(element('li',option.recommended ? 'recommended' : '',option.text));
    parent.append(list);
  }
}
function turnRow(turn) {
  const view=turnView(turn,Date.now());
  const row=element('div','turn-row');
  const description=element('div','turn-description');
  description.append(element('strong','turn-kind',view.kindLabel),element('p','turn-summary',turn.summary));
  appendQuestion(description,turn);
  description.append(element('p','turn-meta',turn.title+(turn.taskId ? ' · '+turn.taskId : '')+' · '+view.location),
    element('p','turn-meta',view.since+' · '+view.waited));
  const actions=element('div','turn-actions');
  if (view.detailLabel) actions.append(detailButton(turn,view.detailLabel));
  if (view.focusTarget) actions.append(closeButton('場所 '+(turn.workspace.number ?? turn.workspace.id)+' ↗','turn-focus',turn.key,()=>focus(view.focusTarget)));
  row.append(description,actions);
  return row;
}
function renderTurns(data,connected) {
  const section=document.getElementById('turns');
  const heading=element('div','turn-heading');
  heading.append(element('h2','',`あなたの番 ${data.turns.length} 件`),element('p','','答えるのは CoS の画面です'));
  if (data.cos) heading.append(closeButton(`CoS（場所 ${data.cos.number ?? data.cos.workspaceId}）を開く ↗`,'cos-focus',data.cos.paneId,()=>focus({workspaceId:data.cos.workspaceId,paneId:data.cos.paneId})));
  section.replaceChildren(heading,...(data.turns.length ? data.turns.map(turnRow) : [element('p','empty','いま、あなたの番はありません')]));
  section.classList.toggle('stale',connected===false);
  if (document.getElementById('detail').open) {
    document.getElementById('detail-stale').textContent=data.turns.some(t=>t.key===detailKey) ? '' : 'この項目はもう待ちではありません';
  }
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
    for (const ask of value.asks.filter(a=>!a.answered)) {
      const box=element('div','ask-box');
      const turn=state.data.turns.find(t=>t.key===`ask:${value.id}:${ask.file}`);
      box.append(element('strong','',`ask/${ask.number} ${ask.title}`));
      appendQuestion(box,ask);
      if (!ask.question && ask.error) box.append(element('p','',ask.error));
      box.append(element('p','turn-meta',ask.since ? dateTime.format(new Date(ask.since))+' · '+waited(ask.since,Date.now()) : '時刻不明'));
      if (turn) {
        box.append(detailButton(turn,'全文','card'));
        box.addEventListener('click',event=>{event.stopPropagation();openDetail(turn);});
      }
      article.append(box);
    }
    const answered=value.asks.filter(a=>a.answered);
    if (answered.length) article.append(element('p','turn-meta','答え済み: '+answered.map(a=>'ask/'+a.number).join('、')));
    if (value.askError) article.append(element('p','check',value.askError));
    if (value.needsCheck) article.append(element('p','check',`要確認: ${value.needsCheck}`));
    detail(article,'この列の理由',value.reason);
    detail(article,'リポジトリ',value.repos.join(', '));
    detail(article,'PR',value.prs.join(' / '));
    detail(article,'次の一手',value.nextAction);
    report(article,'最新の報告',value.latestReport);
    report(article,'最新のメモ',value.latestNote);
    article.append(element('p','updated',value.updatedAt ? `${dateTime.format(new Date(value.updatedAt))} · ${relative(value.updatedAt)} · ${value.updatedSource === 'ledger' ? '台帳' : '報告'}` : '更新時刻なし'));
  }
  const canFocus = isTask ? value.canFocus : true;
  const cardId = isTask ? value.id : value.workspace.id;
  const panes = element('ul','panes');
  for (const pane of value.panes) {
    const view = paneView(pane);
    const line = element('li',`pane${view.waiting ? ' waiting' : ''}`);
    const row = element(canFocus ? 'button' : 'div','pane-open');
    row.title = view.tooltip;
    for (const [className,text] of [[`pane-state ${view.status}`,view.status],['pane-name',view.heading],['pane-role',view.roleLabel],['pane-wait',view.waitingLabel],['pane-detail',view.meta],['pane-detail pane-title',view.title]]) {
      if (text) row.append(element('span',className,text));
    }
    if (canFocus) {
      const target = {workspaceId:value.workspace.id, paneId:pane.paneId};
      row.type = 'button'; row.dataset.focusId = `pane:${value.kind}:${cardId}:${pane.paneId}`;
      if (focusController.isPending(target)) row.setAttribute('aria-disabled','true');
      row.addEventListener('click',event=>{event.stopPropagation();focus(target);});
    }
    line.append(row);
    if (pane.status==='blocked') {
      const prompt=pane.prompt;
      line.append(element('p','prompt-question',prompt?.ok ? prompt.question || '許可や入力を待っています' : '画面を読めません（'+(prompt?.reason ?? '未読')+'）'));
      if (prompt?.ok) appendQuestion(line,{question:'',options:prompt.options});
      const turn=state.data.turns.find(t=>t.key==='pane:'+pane.paneId);
      if (turn) line.append(detailButton(turn,'画面','card'));
    }
    panes.append(line);
  }
  article.append(panes);
  if (canFocus) {
    const target = {workspaceId:value.workspace.id};
    const button = element('button','open-workspace',`場所 ${value.workspace.number ?? value.workspace.id} を開く ↗`);
    button.type = 'button'; button.dataset.focusId = isTask ? value.id : value.workspace.id;
    if (focusController.isPending(target)) {
      button.setAttribute('aria-disabled','true'); button.textContent = '場所を開いています…';
    }
    button.addEventListener('click',event=>{event.stopPropagation();focus(target);});
    article.addEventListener('click',()=>focus(target));
    article.classList.add('clickable'); article.append(button);
    if (isTask && value.canClose) article.append(closeActions(value.workspace.id, value.workspace.number ?? value.workspace.id));
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
  renderTurns(data,connected);
  document.title = `(${data.turns.length}) CoS ボード`;
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
