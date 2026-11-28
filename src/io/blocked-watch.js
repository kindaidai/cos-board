export function createBlockedWatch() {
  const observed = new Map();
  return {observe(blockedAgents, nowMs) {
    const present = new Set();
    const result = Object.create(null);
    for (const agent of blockedAgents) {
      const id=agent.pane_id;
      present.add(id);
      if (!observed.has(id) || observed.get(id).seq !== agent.state_change_seq) {
        observed.set(id,{seq:agent.state_change_seq,since:new Date(nowMs).toISOString()});
      }
      result[id]=observed.get(id).since;
    }
    for (const id of observed.keys()) if (!present.has(id)) observed.delete(id);
    return result;
  }};
}
