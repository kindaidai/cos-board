/** @param {import('../src/contract.js').FocusTarget} target */
export const focusKey = target => target.paneId ?? target.workspaceId;

export function createFocusController({sendFocus, onChange = () => {}}) {
  const pending = new Map();
  return {
    isPending: target => pending.has(focusKey(target)),
    focus(target) {
      const key = focusKey(target);
      if (pending.has(key)) return pending.get(key);
      const promise = Promise.resolve().then(() => sendFocus(target)).finally(() => {
        pending.delete(key);
        onChange();
      });
      pending.set(key, promise);
      onChange();
      return promise;
    },
  };
}
