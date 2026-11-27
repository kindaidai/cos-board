import { createServer } from 'node:http';
import { VALID_WORKSPACE, SKILL_WARNING } from '../contract.js';
import { parseHerdr } from '../parse/herdr.js';

export function createApp({readBoard, herdr, assets = {}, now = Date.now, checkSkill}) {
  let pending = null, cached = null, completedAt = -Infinity;
  function board() {
    if (pending) return pending;
    if (cached && now() - completedAt < 1000) return Promise.resolve(cached);
    pending = Promise.resolve().then(readBoard).then(value => {cached = value; completedAt = now(); return value;}).finally(() => {pending = null;});
    return pending;
  }
  const send = (res, status, body = '', type = 'application/json; charset=utf-8') => {
    res.writeHead(status, {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'"});
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    const port = server.address().port;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host)) return send(res,403,{error:'Host が不正です'});
    let path;
    try { path = new URL(req.url, `http://${req.headers.host}`).pathname; }
    catch { return send(res,400,{error:'URL が不正です'}); }
    try {
      if (req.method === 'GET' && path === '/api/board') {
        // ボードのキャッシュを汚さず、SKILLの更新はHTTP取得ごとに確認する。
        const [value, skill] = await Promise.all([board(), checkSkill?.()]);
        return send(res,200,skill && !skill.ok ? {...value, alerts:[...value.alerts, {level:'warn', message:SKILL_WARNING}]} : value);
      }
      if (req.method === 'GET' && Object.hasOwn(assets,path)) return send(res,200,assets[path].body,assets[path].type);
      if (req.method !== 'POST' || !['/api/focus','/api/close'].includes(path)) return send(res,404,{error:'見つかりません'});
      if (req.headers.origin && !hosts.map(host=>`http://${host}`).includes(req.headers.origin)) return send(res,403,{error:'Origin が不正です'});
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return send(res,400,{error:'application/json が必要です'});
      const chunks = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 4096) return send(res,400,{error:'本文が大きすぎます'});
        chunks.push(chunk);
      }
      let input;
      try {input = JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {return send(res,400,{error:'JSON が不正です'});}
      if (typeof input?.workspaceId !== 'string' || !VALID_WORKSPACE.test(input.workspaceId)) return send(res,400,{error:'workspaceId が不正です'});
      const id = input.workspaceId;
      let result;
      if (path === '/api/focus') {
        // キャッシュではなく現在の一覧で確認し、閉じたworkspaceへは送らない。
        const listed = await herdr.list('workspace');
        if (!listed.ok) return send(res,502,{error:listed.reason});
        const workspaces = parseHerdr(listed.stdout,'workspaces');
        if (workspaces.errors.length) return send(res,502,{error:workspaces.errors[0].message});
        if (!workspaces.value.some(w=>w.workspace_id === id)) return send(res,404,{error:'workspace が見つかりません'});
        result = await herdr.focus(id);
      } else {
        // キャッシュを使わず今の台帳と一覧で判定し、台帳で完了したタスクの workspace だけを閉じる。
        const current = await readBoard();
        const closable = current.columns.flatMap(c => c.cards).some(c => c.kind === 'task' && c.canClose && c.workspace?.id === id);
        if (!closable) return send(res,409,{error:'閉じられるのは、台帳で完了したタスクの workspace だけです'});
        result = await herdr.close(id);
        cached = null;
      }
      const verb = path === '/api/focus' ? 'focus' : 'close';
      if (!result.ok) return send(res,502,{error:result.reason});
      try {
        if (JSON.parse(result.stdout)?.error) return send(res,502,{error:`Herdr の ${verb} が失敗しました`});
      } catch {return send(res,502,{error:'Herdr の応答を解釈できません'});}
      return send(res,204);
    } catch (error) {
      console.error(error);
      return send(res,500,{error:'ボードの取得に失敗しました'});
    }
  });
  server.requestTimeout = 5000;
  return server;
}
