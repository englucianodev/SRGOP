// Connection monitor: merges the socket state and HTTP network failures into one state.
// 'online' -> 'reconectando' (after RECONNECT_SHOW_DELAY_MS offline) -> 'restabelecida' -> 'online'.
export const RECONNECT_SHOW_DELAY_MS = 3000;
export const RECOVERED_VISIBLE_MS = 2500;
const GATEWAY_FAILURES = [502, 503, 504];

// No response at all, or the host's gateway answering for an unreachable API.
export const isNetworkFailure = (status) => status == null || GATEWAY_FAILURES.includes(status);

export function createConnectionMonitor({
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  probe = null,
} = {}) {
  let socketDown = false;
  let networkFailed = false;
  let current = 'online';
  let announced = false;
  let timer = null;
  let probing = false;
  let probeFn = probe;
  const listeners = new Set();

  const isOffline = () => socketDown || networkFailed;
  const stopTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const transition = (next) => {
    if (next === current) return;
    current = next;
    listeners.forEach((fn) => fn(current));
  };
  // With the socket up, nothing else may clear a failed request while the app is idle:
  // probe the API quietly every RECONNECT_SHOW_DELAY_MS until a request succeeds.
  const canProbe = () => current === 'reconectando' && networkFailed && !socketDown && probeFn;
  // The next probe is only scheduled once the current one settles, so a hung API
  // (20 s request timeout) never piles up requests and exhausts the connection pool.
  const settleProbe = () => {
    probing = false;
    scheduleProbe();
  };
  const runProbe = () => {
    probing = true;
    let result;
    try {
      result = probeFn();
    } catch {
      result = undefined;
    }
    if (result && typeof result.then === 'function') {
      Promise.resolve(result).then(settleProbe, settleProbe);
    } else {
      settleProbe();
    }
  };
  const scheduleProbe = () => {
    if (timer !== null || probing || !canProbe()) return;
    timer = setTimer(() => {
      timer = null;
      if (!canProbe()) return;
      runProbe();
    }, RECONNECT_SHOW_DELAY_MS);
  };
  const startTimer = (ms, next) => {
    stopTimer();
    timer = setTimer(() => {
      timer = null;
      transition(next);
      if (next === 'restabelecida') startTimer(RECOVERED_VISIBLE_MS, 'online');
      else if (next === 'reconectando') scheduleProbe();
    }, ms);
  };

  // Re-evaluates the state after any input changed.
  const evaluate = () => {
    if (isOffline()) {
      if (current === 'restabelecida') {
        stopTimer();
        transition('online');
      }
      if (current === 'online' && timer === null) startTimer(RECONNECT_SHOW_DELAY_MS, 'reconectando');
      else if (current === 'reconectando') scheduleProbe();
      return;
    }
    announced = false;
    if (current === 'reconectando') {
      transition('restabelecida');
      startTimer(RECOVERED_VISIBLE_MS, 'online');
    } else if (current === 'online') {
      stopTimer(); // a blip shorter than the delay never shows anything
    }
  };

  return {
    setSocketOnline(online) {
      socketDown = !online;
      evaluate();
    },
    requestFailed() {
      networkFailed = true;
      evaluate();
    },
    requestSucceeded() {
      networkFailed = false;
      evaluate();
    },
    // Quiet request that reports back through requestSucceeded/requestFailed.
    setProbe(fn) {
      probeFn = fn;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    state: () => current,
    // True at most once per outage, and never while the "reconectando" indicator is visible.
    announceNetworkError() {
      if (current === 'reconectando' || announced) return false;
      announced = true;
      return true;
    },
  };
}

export const connection = createConnectionMonitor();
