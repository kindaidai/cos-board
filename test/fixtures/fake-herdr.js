#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (process.env.FAKE_HERDR_CALLS) appendFileSync(process.env.FAKE_HERDR_CALLS, `${JSON.stringify(args)}\n`);
await new Promise(resolve => setTimeout(resolve, Number(process.env.FAKE_HERDR_DELAY ?? 0)));
if (process.env.FAKE_HERDR_FAIL === args[0] || process.env.FAKE_HERDR_FAIL === 'all') {
  console.log(JSON.stringify({error: {message: 'fixture の取得失敗'}})); process.exit(1);
}
if (args[0] === 'agent' && args[1] === 'read') {
  if (args.length !== 9 || args[3] !== '--source' || args[4] !== 'visible' || args[5] !== '--lines' || !/^(?:[1-9]\d?|1\d\d|200)$/.test(args[6]) || args[7] !== '--format' || args[8] !== 'text') process.exit(2);
  if (process.env.FAKE_HERDR_READ_FAIL) {
    console.log(JSON.stringify({error:{code:'agent_not_found',message:'fixture の pane がありません'}})); process.exit(1);
  }
  console.log(process.env.FAKE_HERDR_SCREEN ?? readFileSync(new URL('./screen-permission.txt',import.meta.url),'utf8'));
} else if (args[0] === 'workspace' && args[1] === 'focus' && args.length === 3) {
  if (process.env.FAKE_HERDR_FOCUS_FAIL) process.exit(1);
  console.log('{}');
} else if (args[0] === 'agent' && args[1] === 'focus' && args.length === 3) {
  if (process.env.FAKE_HERDR_FOCUS_FAIL) {
    console.log(JSON.stringify({error:{code:'agent_not_found',message:`agent target ${args[2]} not found`},id:'cli:agent:focus'})); process.exit(1);
  }
  console.log(JSON.stringify({result:{agent:{pane_id:args[2],focused:true}},type:'agent_info'}));
} else if (args[0] === 'workspace' && args[1] === 'close' && args.length === 3) {
  if (process.env.FAKE_HERDR_CLOSE_FAIL) process.exit(1);
  console.log('{}');
} else if (args.length === 2 && args[1] === 'list' && ['workspace','agent'].includes(args[0])) {
  const kind = args[0] === 'workspace' ? 'workspaces' : 'agents';
  console.log(process.env[`FAKE_HERDR_${kind.toUpperCase()}`] ?? readFileSync(new URL(`./${kind}${process.env.FAKE_HERDR_SET === 'turns' ? '-turns' : ''}.json`, import.meta.url), 'utf8'));
} else process.exit(2);
