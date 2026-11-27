export function readTable(text, heading, required) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === `## ${heading}`);
  const errors = [];
  if (start < 0) return { headers: null, rows: [], errors: [{line: 1, message: `${heading}の表がありません`}] };
  const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
  let headers = null;
  let separated = false;
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,2} /.test(line)) break;
    if (!line) continue;
    if (!line.startsWith('|')) {
      if (headers) errors.push({line: i + 1, message: '表の行を解釈できません'});
      continue;
    }
    const values = cells(line);
    if (!headers) { headers = values; continue; }
    if (!separated) {
      if (values.length !== headers.length || !values.every(s => /^:?-{3,}:?$/.test(s))) {
        errors.push({line: i + 1, message: '表の見出し直後の区切り行が不正です'});
        return {headers: null, rows: [], errors};
      }
      separated = true;
      continue;
    }
    if (values.length !== headers.length) { errors.push({line: i + 1, message: '列の数が見出しと違います'}); continue; }
    rows.push({line: i + 1, fields: Object.fromEntries(headers.map((key, n) => [key, values[n]]))});
  }
  if (!headers || !separated || required.some(name => !headers.includes(name)) || new Set(headers).size !== headers.length) {
    errors.push({line: start + 1, message: '表の必須見出しがありません、または重複しています'});
    return {headers: null, rows: [], errors};
  }
  return {headers, rows, errors};
}
