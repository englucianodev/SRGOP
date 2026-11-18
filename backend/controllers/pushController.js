import { requireValue } from '../utils/errors.js';
import { pushConfig, saveSubscription, removeSubscription } from '../services/push.js';

export async function config(req, res) {
  res.json(pushConfig());
}
export async function subscribe(req, res) {
  requireValue(
    pushConfig().enabled,
    'As notificações push não estão configuradas neste servidor.',
    409,
    'Notificações push',
  );
  await saveSubscription(req.user, req.session, req.input);
  res.status(201).json({ subscribed: true });
}
export async function unsubscribe(req, res) {
  res.json({ removed: await removeSubscription(req.user, req.input.endpoint) });
}
