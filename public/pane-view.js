/** @param {import('../src/contract.js').Pane} pane */
export function paneView(pane) {
  const heading = pane.name || pane.repo || pane.paneId;
  const waiting = pane.status === 'blocked';
  return {heading, roleLabel:{lead:'主担当', sibling:'隣の担当', other:''}[pane.role],
    status:pane.status, waiting, waitingLabel:waiting ? 'あなた待ち' : '',
    meta:[...new Set([pane.repo, pane.paneId].filter(value => value && value !== heading))].join(' · '),
    title:pane.title, tooltip:pane.cwd};
}
