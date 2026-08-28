(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SwarmProgressOutbox = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_KEY = "swarmfall-progress-outbox-v1";
  const MAX_OPERATIONS = 100;
  const MAX_PAYLOAD_BYTES = 16 * 1024;
  const OPERATION_TYPES = new Set([
    "awardCurrency",
    "awardSingleplayerResult",
    "unlockAchievement",
    "purchaseCharacter",
    "completeMap",
  ]);
  const TERMINAL_CODES = new Set(["INVALID_PROGRESSION", "INSUFFICIENT_COINS"]);
  const AUTH_CODES = new Set(["SESSION_EXPIRED", "NOT_AUTHENTICATED"]);

  function keyForAccount(accountId, prefix = DEFAULT_KEY) {
    if (typeof accountId !== "string" || !accountId.trim()) return null;
    return `${prefix}:${accountId}`;
  }

  function validOperation(item) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !OPERATION_TYPES.has(item.type) ||
      !item.payload ||
      typeof item.payload !== "object" ||
      Array.isArray(item.payload)
    )
      return false;
    try {
      return new TextEncoder().encode(JSON.stringify(item.payload)).byteLength <= MAX_PAYLOAD_BYTES;
    } catch {
      return false;
    }
  }

  function readQueue(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || "[]");
      return Array.isArray(value) ? value.filter(validOperation).slice(0, MAX_OPERATIONS) : [];
    } catch {
      return [];
    }
  }

  function errorPolicy(error) {
    if (error?.code === "REVISION_CONFLICT") return "conflict";
    if (AUTH_CODES.has(error?.code)) return "auth";
    if ([408, 425, 429].includes(error?.status) || error?.status >= 500) return "retry";
    if (
      TERMINAL_CODES.has(error?.code) ||
      (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500)
    )
      return "terminal";
    return "retry";
  }

  function create(options) {
    const storage = options.storage;
    const key = options.key || keyForAccount(options.accountId, options.keyPrefix);
    if (!key) throw new TypeError("A stable account id is required");
    const queue = readQueue(storage, key);
    let running = null;
    let active = true;
    let serialized = storage.getItem(key);

    const persist = () => {
      const next = queue.length ? JSON.stringify(queue) : null;
      if (next === serialized) return false;
      if (next === null && storage.removeItem) storage.removeItem(key);
      else storage.setItem(key, next || "[]");
      serialized = next;
      return true;
    };
    const enqueue = (type, payload = {}) => {
      const operation = { id: options.createId(), type, payload };
      if (!validOperation(operation)) throw new TypeError("Invalid operation");
      if (queue.length >= MAX_OPERATIONS)
        throw Object.assign(new Error("Progress outbox is full"), {
          code: "OUTBOX_FULL",
        });
      queue.push(operation);
      persist();
      void drain();
      return operation;
    };
    const drain = () => {
      if (running) return running;
      running = (async () => {
        let processed = 0;
        let conflictRetries = 0;
        while (active && queue.length) {
          const operation = queue[0];
          try {
            const result = await options.send(operation, options.getRevision());
            options.reconcile(result);
            queue.shift();
            persist();
            conflictRetries = 0;
            options.onSuccess?.();
          } catch (error) {
            const policy = errorPolicy(error);
            if (policy === "conflict" && error.progress) {
              options.reconcile({
                revision: error.revision,
                progress: error.progress,
              });
              if (++conflictRetries <= 1) continue;
              options.onRetryable?.(error);
              break;
            }
            if (policy === "terminal") {
              queue.shift();
              persist();
              options.onTerminal?.(operation, error);
            } else if (policy === "auth") {
              active = false;
              options.onAuth?.(error);
              break;
            } else {
              if (policy === "retry") options.onRetryable?.(error);
              break;
            }
          }
          if (++processed % 4 === 0)
            await (options.yieldTask
              ? options.yieldTask()
              : new Promise((resolve) => setTimeout(resolve, 0)));
        }
      })().finally(() => {
        running = null;
      });
      return running;
    };

    const cancel = () => {
      active = false;
    };

    return { key, enqueue, drain, cancel, pending: () => queue.slice() };
  }

  function createAndDrain(options) {
    const outbox = create(options);
    void outbox.drain();
    return outbox;
  }

  return Object.freeze({
    create,
    createAndDrain,
    keyForAccount,
    errorPolicy,
    DEFAULT_KEY,
    MAX_OPERATIONS,
    MAX_PAYLOAD_BYTES,
    OPERATION_TYPES,
  });
});
