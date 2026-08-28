(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SwarmProgressOutbox = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_KEY = "swarmfall-progress-outbox-v1";

  function readQueue(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || "[]");
      return Array.isArray(value)
        ? value.filter(
            (item) =>
              item &&
              typeof item.id === "string" &&
              typeof item.type === "string" &&
              item.payload &&
              typeof item.payload === "object",
          )
        : [];
    } catch {
      return [];
    }
  }

  function create(options) {
    const storage = options.storage;
    const key = options.key || DEFAULT_KEY;
    const queue = readQueue(storage, key);
    let running = null;

    const persist = () => storage.setItem(key, JSON.stringify(queue));
    const enqueue = (type, payload = {}) => {
      const operation = { id: options.createId(), type, payload };
      queue.push(operation);
      persist();
      void drain();
      return operation;
    };
    const drain = () => {
      if (running) return running;
      running = (async () => {
        while (queue.length) {
          const operation = queue[0];
          try {
            const result = await options.send(operation, options.getRevision());
            options.reconcile(result);
            queue.shift();
            persist();
          } catch (error) {
            if (error?.code === "REVISION_CONFLICT" && error.progress) {
              options.reconcile({
                revision: error.revision,
                progress: error.progress,
              });
              continue;
            }
            break;
          }
        }
      })().finally(() => {
        running = null;
      });
      return running;
    };

    return { enqueue, drain, pending: () => queue.slice() };
  }

  return Object.freeze({ create, DEFAULT_KEY });
});
