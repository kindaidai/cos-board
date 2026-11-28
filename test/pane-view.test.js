import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../public/pane-view.js').catch(() => null);
const pane = {paneId:'w1AV:p2',name:'DEMO-101-frontend',role:'sibling',repo:'frontend',status:'blocked',cwd:'~/develop/frontend',title:'FE の実装'};
const view = value => {assert.ok(module,'pane-view が未実装'); return module.paneView(value);};

test('paneViewは名前・repo・pane IDの優先順で見出しを選ぶ', () => {
  assert.equal(view(pane).heading,'DEMO-101-frontend');
  assert.equal(view({...pane,name:null}).heading,'frontend');
  assert.equal(view({...pane,name:'',repo:''}).heading,'w1AV:p2');
});
test('paneViewは役割・blockedの強調・端末タイトル・cwdを返す', () => {
  assert.deepEqual(view(pane),{heading:'DEMO-101-frontend',roleLabel:'隣の担当',status:'blocked',waiting:true,waitingLabel:'あなた待ち',meta:'frontend · w1AV:p2',title:'FE の実装',tooltip:'~/develop/frontend'});
  assert.equal(view({...pane,role:'lead'}).roleLabel,'主担当');
  assert.equal(view({...pane,role:'other'}).roleLabel,'');
});
test('paneViewはblocked以外にあなた待ちを付けない', () => {
  for (const status of ['idle','working','done','unknown']) {
    const value = view({...pane,status});
    assert.equal(value.status,status); assert.equal(value.waiting,false); assert.equal(value.waitingLabel,'');
  }
});
test('paneViewのmetaは見出しと空欄と重複を除く', () => {
  assert.equal(view({...pane,name:null}).meta,'w1AV:p2');
  assert.equal(view({...pane,name:null,repo:''}).meta,'');
  assert.equal(view({...pane,repo:'w1AV:p2'}).meta,'w1AV:p2');
});
