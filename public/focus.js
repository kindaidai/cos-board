export function createFocusController({sendFocus, onChange = () => {}}) {
  const pending = new Map();
  return {
    isPending: id => pending.has(id),
    focus(id) {
      if (pending.has(id)) return pending.get(id);
      const promise = Promise.resolve().then(() => sendFocus(id)).finally(() => {
        pending.delete(id);
        onChange();
      });
      pending.set(id, promise);
      onChange();
      return promise;
    },
  };
}
