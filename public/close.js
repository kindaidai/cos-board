// 閉じるは「閉じる → 確定」の 2 回押しにする。印は workspace 単位で持ち、定期描画で消えないようにする。
export function createCloseController({sendClose, onChange = () => {}}) {
  const armed = new Set(), pending = new Map();
  return {
    isArmed: id => armed.has(id),
    isPending: id => pending.has(id),
    arm(id) {armed.add(id); onChange();},
    cancel(id) {armed.delete(id); onChange();},
    confirm(id) {
      if (pending.has(id)) return pending.get(id);
      if (!armed.delete(id)) return Promise.resolve();
      const promise = Promise.resolve().then(() => sendClose(id)).finally(() => {
        pending.delete(id);
        onChange();
      });
      pending.set(id, promise);
      onChange();
      return promise;
    },
  };
}
