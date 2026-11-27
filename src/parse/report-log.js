import { REPORT } from '../contract.js';
import { parseReportTime } from './date.js';

export function parseReportLog(text) {
  const value = [], errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line === '') return;
    const fields = line.split('\t');
    const [seq, time, request, state, pane, message] = fields;
    const at = parseReportTime(time ?? '');
    if (fields.length !== 6 || !/^[1-9]\d*$/.test(seq) || !Number.isSafeInteger(+seq) || !/^[1-9]\d*$/.test(request) ||
      !Number.isSafeInteger(+request) || !Object.values(REPORT).includes(state) || !at) {
      errors.push({line: i + 1, message: '報告を解釈できません'}); return;
    }
    value.push({seq: +seq, at, request: +request, state, pane, text: message});
  });
  return {value, errors};
}
