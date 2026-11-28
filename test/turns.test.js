import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('../src/judge/turns.js').catch(()=>({}));
const now=new Date('2026-11-27T10:00:00Z');
const task=()=>({kind:'task',id:'T1',title:'タスク',nextAction:'',ledgerState:'作業中',ledgerUpdatedRaw:'11-27 18:00',workspace:{id:'w1',number:2,present:true},canFocus:true,asks:[],panes:[],latestReport:null});
const ask={file:'1.md',number:1,answered:false,title:'選択',question:'どちら？',options:[],since:'2026-11-27T07:00:00.000Z'};
const pane={paneId:'w1:p1',status:'blocked',prompt:{ok:true,question:'実行？',options:[]},blockedSince:'2026-11-27T08:00:00.000Z'};
test('4種別、報告優先の時刻、古い順、固有キー',()=>{
  assert.equal(typeof mod.buildTurns,'function');
  const a={...task(),asks:[ask],panes:[pane],nextAction:'ユーザー: PRをマージ',latestReport:{state:'need-user',text:'確認',at:'2026-11-27T08:30:00.000Z'}};
  const b={...task(),id:'T2',nextAction:'あなた：場所を閉じる'};
  const rows=mod.buildTurns([a,b],now);
  assert.deepEqual(rows.map(r=>r.kind),['ask','permission','merge','manual']);
  assert.equal(rows[2].sinceSource,'report'); assert.equal(rows[3].sinceSource,'ledger');
  assert.equal(new Set(rows.map(r=>r.key)).size,4);
});
test('問いを参照する台帳・報告は既存ファイルが全てあれば抑止する',()=>{
  assert.equal(typeof mod.buildTurns,'function');
  for (const answered of [true,false]) {
    const a={...task(),asks:[{...ask,answered}],nextAction:'ユーザー: ask/1.md へ回答',ledgerState:'あなた待ち',latestReport:{state:'need-user',text:'ask/1 を確認',at:'2026-11-27T08:00:00.000Z'}};
    assert.equal(mod.buildTurns([a],now).length,answered?0:1);
  }
  const missing={...task(),nextAction:'ユーザー: ask/2 を確認'};
  assert.equal(mod.buildTurns([missing],now)[0].kind,'ask');
  const mixed={...task(),asks:[ask],nextAction:'ユーザー: ask/1・ask/2 を確認'};
  assert.equal(mod.buildTurns([mixed],now).length,2);
});
test('台帳だけの待ち、報告のみ、note除外後の報告と時刻無しの順',()=>{
  assert.equal(typeof mod.buildTurns,'function');
  const a={...task(),ledgerState:'あなた待ち',ledgerUpdatedRaw:''};
  const b={...task(),id:'T2',latestReport:{state:'need-user',text:'手作業',at:'2026-11-27T08:00:00.000Z'}};
  assert.deepEqual(mod.buildTurns([a,b],now).map(r=>r.taskId),['T2','T1']);
  assert.equal(mod.buildTurns([{...a,panes:[pane]}],now).length,1);
});
test('台帳に無いセッションとCoSの確認は直接回答を案内し重複paneを除く',()=>{
  assert.equal(typeof mod.buildTurns,'function');
  const s={kind:'session',workspace:{id:'w1',number:2,label:'独立'},isCos:true,panes:[pane,pane]};
  const rows=mod.buildTurns([s],now);
  assert.equal(rows.length,1); assert.equal(rows[0].direct,true);
  assert.equal(rows[0].title,'独立'); assert.match(rows[0].summary,/CoS が聞いています/);
});

test('一覧は問いと選択肢を元データから渡し、それ以外や読めない画面は空にする',()=>{
  const a={...task(),asks:[{...ask,options:['A. 進める（推奨）','B. 待つ']}],panes:[{...pane,prompt:{...pane.prompt,options:['1. Yes','2. No']}}],nextAction:'ユーザー: PRをマージ'};
  const rows=mod.buildTurns([a,{...task(),id:'T2',nextAction:'ユーザー: ask/9 に回答'},{...task(),id:'T3',nextAction:'ユーザー: 手作業'}],now);
  assert.deepEqual(rows.map(({question,options})=>({question,options})),[
    {question:'どちら？',options:['A. 進める（推奨）','B. 待つ']},
    {question:'',options:['1. Yes','2. No']},
    {question:'',options:[]},{question:'',options:[]},{question:'',options:[]}
  ]);
  for (const prompt of [null,{ok:false,reason:'読めない'}]) {
    const [row]=mod.buildTurns([{...task(),panes:[{...pane,prompt}]}],now);
    assert.equal(row.question,''); assert.deepEqual(row.options,[]);
  }
});
