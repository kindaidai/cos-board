export function createPoller({fetchBoard, onData, onError, clock = globalThis, interval = 3000, timeout = 5000}) {
  let enabled = false, timer = null, flight = null, generation = 0, latestAt = -Infinity;
  function pause() {
    enabled = false;
    generation++;
    clock.clearTimeout(timer);
    flight?.controller.abort();
    flight = null;
  }
  function refresh() {
    if (!enabled) return Promise.resolve();
    if (flight) return flight.promise;
    clock.clearTimeout(timer);
    const token = ++generation;
    const controller = new AbortController();
    let timeoutId;
    const interrupted = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {once:true});
      timeoutId = clock.setTimeout(() => controller.abort(new Error('取得が5秒以内に終わりませんでした')), timeout);
    });
    const promise = Promise.race([Promise.resolve().then(() => fetchBoard(controller.signal)), interrupted]).then(data => {
      if (!enabled || token !== generation) return;
      const at = Date.parse(data.generatedAt);
      if (!Number.isFinite(at)) throw new Error('ボードの日時を解釈できません');
      if (at < latestAt) return;
      latestAt = at;
      onData(data);
    }).catch(error => {
      if (enabled && token === generation) onError(error);
    }).finally(() => {
      clock.clearTimeout(timeoutId);
      if (token !== generation) return;
      flight = null;
      if (enabled) timer = clock.setTimeout(refresh, interval);
    });
    flight = {promise,controller};
    return promise;
  }
  return {pause, refresh, resume() {enabled = true; return refresh();}};
}
