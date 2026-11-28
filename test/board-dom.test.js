import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';

// Minimal DOM adapter: exercises our rendering/event wiring, without emulating browser layout.
class Node {
  constructor(tag,document) {this.tagName=tag;this.document=document;this.children=[];this.dataset={};this.listeners={};this.className='';this.textContent='';this.open=false;this.classList={add:()=>{},toggle:()=>{}};}
  append(...nodes) {for(const n of nodes){n.parent=this;this.children.push(n);}}
  replaceChildren(...nodes) {this.children=[];this.append(...nodes);}
  addEventListener(type,fn) {this.listeners[type]=fn;}
  setAttribute() {}
  focus() {this.document.activeElement=this;}
  showModal() {this.open=true;}
  click() {const event={stopped:false,stopPropagation(){this.stopped=true;}};for(let n=this;n;n=n.parent){n.listeners.click?.(event);if(event.stopped)break;}}
}
const descendants=n=>[n,...n.children.flatMap(descendants)];
test('問い枠はdialogを開き、再描画でカードのボタンのフォーカスを保つ',async t=>{
  const ids=['board','offline','connection','summary','alerts','drafts','turns','focus-status','detail','detail-title','detail-subtitle','detail-body','detail-stale'];
  const doc={hidden:false,listeners:{},activeElement:null,addEventListener(type,fn){this.listeners[type]=fn;},createElement(tag){return new Node(tag,this);},getElementById(id){return this.nodes[id];},querySelectorAll(){return Object.values(this.nodes).flatMap(descendants).filter(n=>n.dataset.focusId);}};
  doc.nodes=Object.fromEntries(ids.map(id=>[id,new Node('div',doc)]));
  const win={listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},getSelection:()=>({isCollapsed:true})};
  const ask={file:'1.md',number:1,answered:false,title:'題',question:'質問',body:'全文',error:null,since:null};
  const turn={key:'ask:T1:1.md',kind:'ask',taskId:'T1',title:'タスク',summary:'題',workspace:{id:'w1',number:1},paneId:null,askFile:'1.md',canFocus:true,direct:false,since:null,sinceSource:null};
  const card={kind:'task',id:'T1',title:'タスク',area:'',type:'',workspace:{id:'w1',number:1},badges:[],asks:[ask],askError:null,state:'あなた待ち',ledgerState:'作業中',ledgerStateRaw:'作業中',repos:[],prs:[],panes:[],canFocus:true};
  const board={generatedAt:'2026-11-27T00:00:00.000Z',ledger:{ok:true,activeCount:1,limit:8},alerts:[],drafts:[],columns:[{key:'your-turn',title:'あなたの番',available:true,cards:[card]}],turns:[turn],cos:null};
  const requests=[];
  t.mock.method(globalThis,'fetch',async(url)=>{requests.push(url);return {ok:true,json:async()=>board};});
  globalThis.document=doc; globalThis.window=win;
  await import('../public/board.js');
  const settle=async()=>{for(let i=0;i<6;i++) await tick();doc.hidden=true;doc.listeners.visibilitychange();};
  t.after(()=>{doc.hidden=true;doc.listeners.visibilitychange();delete globalThis.document;delete globalThis.window;});
  await settle();
  const article=descendants(doc.nodes.board).find(n=>n.tagName==='article');
  const box=descendants(article).find(n=>n.className==='ask-box');
  const button=descendants(box).find(n=>n.tagName==='button');
  const detailIds=doc.querySelectorAll().map(n=>n.dataset.focusId);
  assert.equal(new Set(detailIds).size,detailIds.length,'一覧とカードでフォーカスIDを重複させない');
  button.focus();
  doc.hidden=false;win.listeners.pageshow();await settle();
  assert.ok(descendants(doc.nodes.board).includes(doc.activeElement),'再描画後もカード内のボタン');
  const newBox=descendants(doc.nodes.board).find(n=>n.className==='ask-box');
  newBox.click(); await tick();
  assert.equal(doc.nodes.detail.open,true);
  assert.equal(doc.nodes['detail-body'].textContent,'全文');
  assert.ok(!requests.includes('/api/focus'),'問い枠のクリックを場所へ流さない');
});
