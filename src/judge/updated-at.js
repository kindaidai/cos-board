import { validParts } from '../parse/date.js';

export function ledgerTime(raw, now) {
  const match = /^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(raw);
  let ledger = null;
  if (match) {
    const [, month, day, hour, minute] = match.map(Number);
    const year = new Date(+now + 9 * 3600_000).getUTCFullYear();
    for (const y of [year, year - 1]) {
      const millis = Date.UTC(y, month - 1, day, hour - 9, minute);
      if (validParts(y, month, day, hour, minute) && millis < +now + 86400_000) { ledger = millis; break; }
    }
  }
  return ledger === null ? null : new Date(ledger).toISOString();
}
export function updatedAt(raw, reports, now) {
  const time = ledgerTime(raw,now);
  const ledger = time === null ? null : Date.parse(time);
  const newestReport = reports.reduce((latest, r) => {
    const at = Date.parse(r.at);
    return Number.isFinite(at) ? Math.max(latest, at) : latest;
  }, -Infinity);
  if (Number.isFinite(newestReport) && (ledger === null || newestReport > ledger)) return {updatedAt: new Date(newestReport).toISOString(), updatedSource: 'report'};
  return ledger === null ? {updatedAt: null, updatedSource: null} : {updatedAt: new Date(ledger).toISOString(), updatedSource: 'ledger'};
}
