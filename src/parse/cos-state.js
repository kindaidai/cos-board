export function parseCosState(text) {
  const match = /^pane=([A-Za-z0-9]+:p[A-Za-z0-9]+)\s*$/m.exec(text);
  return {value: match?.[1] ?? null, errors: match ? [] : [{line: 1, message: 'CoS の pane が読めません'}]};
}
