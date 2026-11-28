import { parseAsk, answeredAskNumbers } from '../parse/ask.js';

export function taskAsks({asks, brief, state}) {
  const errors=[];
  if (asks?.kind === 'error') errors.push(asks.reason);
  if (asks?.omitted) errors.push('古い問いを省きました');
  const files=asks?.kind === 'list' ? asks.files : [];
  const answered=answeredAskNumbers(brief?.kind === 'text' ? brief.text : '');
  if (state?.requestsTrusted) for (const request of state.requests) {
    for (const n of answeredAskNumbers(request.summary)) answered.add(n);
  }
  if (files.length && brief?.kind !== 'text' && !state?.requestsTrusted) errors.push('答え済みを見分けられません（brief.md と state.md が読めません）');
  const values=files.map(({name,source})=>{
    const number=Number.parseInt(name);
    const parsed=source.kind==='text' ? parseAsk(source.text) : {title:'',question:'',options:[],request:null};
    const done=answered.has(number);
    const malformed=source.kind==='text' && (!parsed.title || !parsed.question);
    const error=done ? null : source.kind!=='text' ? source.reason ?? '問いがありません' : malformed ? '問いの形を読めません' : null;
    if (error) errors.push('ask/'+name+': '+error);
    return {file:name,number,answered:done,...parsed,title:parsed.title || 'ask/'+number,
      since:source.mtime ?? null,body:done || error ? null : source.text,error};
  }).sort((a,b)=>a.number-b.number || a.file.localeCompare(b.file));
  return {asks:values,askError:errors.length ? errors.join(' / ') : null};
}
