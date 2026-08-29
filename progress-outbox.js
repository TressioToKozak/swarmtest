(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SwarmProgressOutbox = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_KEY = "swarmfall-progress-outbox-v1";
  const MAX_OPERATIONS = 100;
  const MAX_BACKLOG_OPERATIONS = 200;
  const MAX_TOTAL_OPERATIONS = MAX_OPERATIONS + MAX_BACKLOG_OPERATIONS;
  const MAX_PAYLOAD_BYTES = 16 * 1024;
  const MAX_STORAGE_BYTES = 2 * 1024 * 1024;
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

  function readState(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || "[]");
      if (Array.isArray(value))
        return { active: value.filter(validOperation).slice(0, MAX_OPERATIONS), backlog: [] };
      return {
        active: Array.isArray(value?.active)
          ? value.active.filter(validOperation).slice(0, MAX_OPERATIONS)
          : [],
        backlog: Array.isArray(value?.backlog)
          ? value.backlog.filter(validOperation).slice(0, MAX_BACKLOG_OPERATIONS)
          : [],
      };
    } catch {
      return { active: [], backlog: [] };
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
    let state = readState(storage, key);
    let running = null;
    let active = true;
    let serialized = storage.getItem(key);

    const serialize = (candidate) =>
      candidate.active.length || candidate.backlog.length ? JSON.stringify(candidate) : null;
    const persist = (candidate) => {
      const next = serialize(candidate);
      if (next && new TextEncoder().encode(next).byteLength > MAX_STORAGE_BYTES)
        throw Object.assign(new Error("Progress outbox storage limit exceeded"), {
          code: "OUTBOX_FULL",
        });
      if (next === serialized) return false;
      if (next === null && storage.removeItem) storage.removeItem(key);
      else storage.setItem(key, next || "[]");
      serialized = next;
      return true;
    };
    const commit = (candidate) => {
      persist(candidate);
      state = candidate;
    };
    const enqueue = (type, payload = {}, operationId = null) => {
      const operation = { id: operationId || options.createId(), type, payload };
      if (!validOperation(operation)) throw new TypeError("Invalid operation");
      if (
        state.active.some((item) => item.id === operation.id) ||
        state.backlog.some((item) => item.id === operation.id)
      )
        return operation;
      if (state.active.length + state.backlog.length >= MAX_TOTAL_OPERATIONS)
        throw Object.assign(new Error("Progress outbox is full"), {
          code: "OUTBOX_FULL",
        });
      const candidate = { active: state.active.slice(), backlog: state.backlog.slice() };
      if (candidate.backlog.length || candidate.active.length >= MAX_OPERATIONS)
        candidate.backlog.push(operation);
      else candidate.active.push(operation);
      commit(candidate);
      void drain();
      return operation;
    };
    const drain = () => {
      if (running) return running;
      running = (async () => {
        let processed = 0;
        let conflictRetries = 0;
        while (active && state.active.length) {
          const operation = state.active[0];
          try {
            const result = await options.send(operation, options.getRevision());
            options.reconcile(result);
            const candidate = { active: state.active.slice(1), backlog: state.backlog.slice() };
            if (candidate.backlog.length && candidate.active.length < MAX_OPERATIONS)
              candidate.active.push(candidate.backlog.shift());
            commit(candidate);
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
              const candidate = { active: state.active.slice(1), backlog: state.backlog.slice() };
              if (candidate.backlog.length && candidate.active.length < MAX_OPERATIONS)
                candidate.active.push(candidate.backlog.shift());
              commit(candidate);
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

    return {
      key,
      enqueue,
      drain,
      cancel,
      pending: () => [...state.active, ...state.backlog],
      state: () => ({ active: state.active.slice(), backlog: state.backlog.slice() }),
    };
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
    MAX_BACKLOG_OPERATIONS,
    MAX_TOTAL_OPERATIONS,
    MAX_PAYLOAD_BYTES,
    MAX_STORAGE_BYTES,
    OPERATION_TYPES,
  });
});
