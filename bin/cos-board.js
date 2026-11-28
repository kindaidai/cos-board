#!/usr/bin/env node
import { createBlockedWatch } from '../src/io/blocked-watch.js';
import { parseOptions } from '../src/io/options.js';
import { createHerdr } from '../src/io/herdr-cli.js';
import { readSources, readAssets } from '../src/io/read-sources.js';
import { buildBoard } from '../src/judge/build-board.js';
import { createApp } from '../src/server/app.js';
import { createSkillMonitor } from '../src/io/skill-monitor.js';
import { resolveTerminalApp, createActivator } from '../src/io/terminal-app.js';

try {
  const options = parseOptions(process.argv.slice(2));
  const blockedWatch = createBlockedWatch();
  const herdr = createHerdr({path:options.herdrPath});
  const terminal = createActivator({bundleId:resolveTerminalApp({option:options.terminalApp})});
  const assets = await readAssets();
  const checkSkill = createSkillMonitor({path:options.skillPath});
  const server = createApp({herdr, terminal, assets, checkSkill, readBoard:async () => buildBoard(await readSources({cosRoot:options.cosRoot,herdr,blockedWatch}),new Date())});
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `ポート ${options.port} は使用中です。--port で変更してください。` : `起動できません: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(options.port,'127.0.0.1',()=>{
    console.log(`http://127.0.0.1:${server.address().port}`);
    console.log(terminal.bundleId ? `移ったあとに前面に出すアプリ: ${terminal.bundleId}` : '移ったあとにアプリを前面に出しません');
  });
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>server.close());
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
