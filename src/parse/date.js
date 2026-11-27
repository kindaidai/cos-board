export function validParts(year, month, day, hour, minute, second = 0) {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day &&
    date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === second;
}

export function parseReportTime(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:?\d{2})$/.exec(text);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, offset] = match;
  if (!validParts(...[year, month, day, hour, minute, second].map(Number))) return null;
  if (offset !== 'Z') {
    const digits = offset.replace(':', '');
    if (+digits.slice(1, 3) > 23 || +digits.slice(3) > 59) return null;
  }
  const normalized = text.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}
