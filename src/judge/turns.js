import { TURN, LIMITS, STATE, STATUS, REPORT } from '../contract.js';
import { ledgerTime } from './updated-at.js';

export function buildTurns(cards, now) {
  const turns=new Map();
  const add=turn=>{if (!turns.has(turn.key)) turns.set(turn.key,turn);};
  for (const card of cards) {
    const isTask=card.kind==='task';
    const base={taskId:isTask ? card.id : null,title:isTask ? card.title : card.workspace.label,
      workspace:card.workspace ? {id:card.workspace.id,number:card.workspace.number} : null,
      paneId:null,askFile:null,canFocus:isTask ? card.canFocus : true,direct:!isTask,since:null,sinceSource:null};
    const asks=isTask ? card.asks ?? [] : [];
    const pending=asks.filter(a=>!a.answered);
    for (const ask of pending) add({...base,key:'ask:'+card.id+':'+ask.file,kind:TURN.ASK,askFile:ask.file,
      summary:(ask.title || ask.question).slice(0,LIMITS.summaryChars),since:ask.since,sinceSource:ask.since ? 'file' : null});
    const blocked=card.panes.filter(p=>p.status===STATUS.BLOCKED);
    for (const pane of blocked) {
      const summary=pane.prompt?.ok ? pane.prompt.question || '許可や入力を待っています' : '画面を読めません（'+(pane.prompt?.reason ?? '未読')+'）';
      add({...base,key:'pane:'+pane.paneId,kind:TURN.PERMISSION,paneId:pane.paneId,
        summary:((card.isCos ? 'CoS が聞いています: ' : '')+summary).slice(0,LIMITS.summaryChars),
        since:pane.blockedSince,sinceSource:pane.blockedSince ? 'observed' : null});
    }
    if (!isTask) continue;
    const action=/^(?:ユーザー|あなた)[:：]\s*(.*)/.exec(card.nextAction);
    const report=card.latestReport?.state===REPORT.USER ? card.latestReport : null;
    const allFound=text=>{
      const refs=[...text.matchAll(/ask\/(\d+)(?:\.md)?/g)].map(m=>+m[1]);
      return refs.length && refs.every(n=>asks.some(a=>a.number===n));
    };
    // 高い優先順位の元が既存の問いを指すときは、それだけを抑止する。
    const candidates=[action?.[1],report?.text].filter(text=>text!==undefined && text!==null);
    let text=candidates.find(text=>!allFound(text));
    if (text===undefined && !candidates.length && card.ledgerState===STATE.USER && !pending.length && !blocked.length) text=card.nextAction || 'あなたの作業を待っています';
    if (text===undefined) continue;
    const since=report?.at ?? ledgerTime(card.ledgerUpdatedRaw,now);
    const kind=/ask\/\d+/.test(text) ? TURN.ASK : /マージ|merge/i.test(text) ? TURN.MERGE : TURN.MANUAL;
    add({...base,key:'task:'+card.id,kind,summary:text.slice(0,LIMITS.summaryChars),since,sinceSource:since ? report ? 'report' : 'ledger' : null});
  }
  return [...turns.values()].sort((a,b)=>(a.since===null)-(b.since===null) || (Date.parse(a.since)-Date.parse(b.since) || 0) || a.key.localeCompare(b.key));
}
