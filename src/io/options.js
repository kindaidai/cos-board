import { homedir } from 'node:os';
import { resolve } from 'node:path';

export function parseOptions(args, home = homedir()) {
  const options = {port:4270, cosRoot:`${home}/develop/.cos`, herdrPath:'herdr', skillPath:`${home}/.claude/skills/chief-of-staff/SKILL.md`};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!['--port','--cos-root','--herdr','--skill-path'].includes(key) || !value || value.startsWith('--')) throw new Error(`引数が不正です: ${key}`);
    if (key === '--port') {
      if (!/^\d+$/.test(value) || +value > 65535) throw new Error('port は 0〜65535 の整数です');
      options.port = +value;
    } else {
      const expanded = value === '~' ? home : value.startsWith('~/') ? `${home}/${value.slice(2)}` : value;
      if (key === '--cos-root') options.cosRoot = resolve(expanded);
      else if (key === '--skill-path') options.skillPath = resolve(expanded);
      else options.herdrPath = expanded.includes('/') ? resolve(expanded) : expanded;
    }
  }
  return options;
}
