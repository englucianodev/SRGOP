// The API host sleeps after a period without use and takes up to a minute to wake up.
// Until it answers, requests fail without a response (network error or timeout) or with a
// gateway status. Those are not errors to show the user: the request is simply repeated.
const WAKING_STATUSES = new Set([502, 503, 504]);
const FIRST_WAIT_MS = 1500;
const MAX_WAIT_MS = 6000;

export const isServerWaking = (error) =>
  !error?.response || WAKING_STATUSES.has(error.response.status);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `request` again while the server is waking up. Any other failure (401, 422…) is
 * returned at once. Without `maxAttempts` it keeps trying until cancelled through `signal`.
 */
export async function whenServerReady(
  request,
  { onWaiting, signal, maxAttempts = Infinity, sleep = wait } = {},
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await request();
    } catch (error) {
      if (!isServerWaking(error) || signal?.aborted || attempt >= maxAttempts) throw error;
      onWaiting?.(attempt);
      await sleep(Math.min(FIRST_WAIT_MS * attempt, MAX_WAIT_MS));
    }
  }
}
