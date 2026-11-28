const labels={ask:'質問に答える',permission:'許可の確認',merge:'PR をマージ',manual:'手作業'};
const format=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});

export function waited(since, nowMs) {
  if (!since || !Number.isFinite(Date.parse(since))) return '時刻不明';
  const minutes=Math.max(0,Math.floor((nowMs-Date.parse(since))/60000));
  if (minutes<1) return '1 分以内';
  if (minutes<60) return minutes+' 分';
  if (minutes<1440) return Math.floor(minutes/60)+' 時間 '+minutes%60+' 分';
  return Math.floor(minutes/1440)+' 日';
}
export function turnView(turn, nowMs) {
  const place=turn.workspace ? '場所 '+(turn.workspace.number ?? turn.workspace.id) : '場所不明';
  const observed=turn.sinceSource==='observed';
  return {kindLabel:labels[turn.kind],
    location:place+(turn.direct ? ' · この pane で直接答える' : ''),
    since:turn.since ? format.format(new Date(turn.since)) : '時刻不明',
    waited:observed && turn.since ? Math.max(0,Math.floor((nowMs-Date.parse(turn.since))/60000))+' 分以上（ボードが気づいてから）' : waited(turn.since,nowMs),
    detailLabel:turn.kind==='permission' ? '画面' : turn.askFile ? '全文' : null,
    focusTarget:turn.canFocus && turn.workspace ? {workspaceId:turn.workspace.id,...(turn.paneId ? {paneId:turn.paneId} : {})} : null};
}
export function detailContent(board, turn) {
  const cards=[...board.drafts,...board.columns.flatMap(c=>c.cards)];
  if (turn.kind==='permission') {
    const pane=cards.flatMap(c=>c.panes).find(p=>p.paneId===turn.paneId);
    return {title:'許可の確認',subtitle:turn.title+' · '+turn.paneId,
      body:pane?.prompt?.ok ? pane.prompt.text : '画面を読めません（'+(pane?.prompt?.reason ?? '見つかりません')+'）'};
  }
  const ask=cards.find(c=>c.id===turn.taskId)?.asks.find(a=>a.file===turn.askFile);
  return {title:ask?.title ?? '問い',subtitle:turn.taskId+' · ask/'+turn.askFile,
    body:ask?.body ?? ask?.error ?? '問いが見つかりません'};
}
