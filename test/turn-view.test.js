import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('../public/turn-view.js').catch(()=>({}));
const turn={key:'ask:T1:1.md',kind:'ask',taskId:'T1',title:'タスク',summary:'質問',workspace:{id:'w1',number:2},paneId:null,askFile:'1.md',canFocus:true,direct:false,since:'2026-11-27T00:00:00.000Z',sinceSource:'file'};
const now=Date.parse('2026-11-27T02:01:00Z');
test('一覧の文言・場所・経過・ボタンを種別から組む',()=>{
  assert.equal(typeof mod.turnView,'function');
  assert.equal(mod.turnView(turn,now).kindLabel,'質問に答える');
  assert.equal(mod.turnView(turn,now).location,'場所 2');
  assert.deepEqual(mod.turnView(turn,now).focusTarget,{workspaceId:'w1'});
  assert.equal(mod.turnView(turn,now).detailLabel,'全文');
  const permission=mod.turnView({...turn,kind:'permission',paneId:'w1:p1',askFile:null,direct:true,sinceSource:'observed'},now);
  assert.equal(permission.kindLabel,'許可の確認'); assert.equal(permission.detailLabel,'画面');
  assert.match(permission.location,/この pane で直接答える/);
  assert.match(permission.waited,/121 分以上（ボードが気づいてから）/);
  assert.deepEqual(permission.focusTarget,{workspaceId:'w1',paneId:'w1:p1'});
  for (const [kind,label] of [['merge','PR をマージ'],['manual','手作業']]) {
    const v=mod.turnView({...turn,kind,askFile:null,canFocus:false},now);
    assert.equal(v.kindLabel,label); assert.equal(v.detailLabel,null); assert.equal(v.focusTarget,null);
  }
});
test('経過時刻は不明・未来・1分未満を扱う',()=>{
  assert.equal(typeof mod.waited,'function');
  assert.equal(mod.waited(null,now),'時刻不明');
  assert.equal(mod.waited('2026-11-28T00:00:00Z',now),'1 分以内');
  assert.equal(mod.waited('2026-11-27T02:00:40Z',now),'1 分以内');
});
test('dialogは下書き・問い・paneを探して安全な本文を返す',()=>{
  assert.equal(typeof mod.detailContent,'function');
  const card={kind:'task',id:'T1',asks:[{file:'1.md',title:'問いの題',body:'<script>text</script>',error:null}],panes:[{paneId:'w1:p1',prompt:{ok:true,text:'画面全文'}}]};
  const board={drafts:[card],columns:[]};
  assert.equal(mod.detailContent(board,turn).body,'<script>text</script>');
  assert.equal(mod.detailContent(board,{...turn,kind:'permission',paneId:'w1:p1'}).body,'画面全文');
  card.panes[0].prompt={ok:false,reason:'時間切れ'};
  assert.match(mod.detailContent(board,{...turn,kind:'permission',paneId:'w1:p1'}).body,/時間切れ/);
  assert.match(mod.detailContent(board,{...turn,askFile:'2.md'}).body,/見つかりません/);
});
