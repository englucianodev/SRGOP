import { between, minutes } from '../lib/random.js';

/**
 * Operational time limits the simulated officers follow.
 * Accepting, dispatching and authorizing take under 1 min (the engine ticks every 10 s);
 * an attendance never lasts more than 5 min on scene.
 */
export const ATTENDANCE_MAX_MIN = 5;
export const ATTENDANCE_MAX_MS = minutes(ATTENDANCE_MAX_MIN);
export const RESPONSE_DELAY_MIN = [0.2, 0.6];

/** Time a person takes to react to a dispatch, an open occurrence or a support request. */
export const responseDelayMs = () => minutes(between(...RESPONSE_DELAY_MIN));
