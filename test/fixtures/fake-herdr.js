#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (process.env.FAKE_HERDR_CALLS) appendFileSync(process.env.FAKE_HERDR_CALLS, `${JSON.stringify(args)}\n`);
await new Promise(resolve => setTimeout(resolve, Number(process.env.FAKE_HERDR_DELAY ?? 0)));
if (process.env.FAKE_HERDR_FAIL === args[0] || process.env.FAKE_HERDR_FAIL === 'all') {
  console.log(JSON.stringify({error: {message: 'fixture の取得失敗'}})); process.exit(1);
}
if (args[0] === 'workspace' && args[1] === 'focus' && args.length === 3) {
  if (process.env.FAKE_HERDR_FOCUS_FAIL) process.exit(1);
  console.log('{}');
} else if (args.length === 2 && args[1] === 'list' && ['workspace','agent'].includes(args[0])) {
  const kind = args[0] === 'workspace' ? 'workspaces' : 'agents';
  console.log(process.env[`FAKE_HERDR_${kind.toUpperCase()}`] ?? readFileSync(new URL(`./${kind}.json`, import.meta.url), 'utf8'));
} else process.exit(2);
