import { gpsAllowed } from '../utils/duty.js';
import { Crew } from '../models/index.js';
import { requireValue } from '../utils/errors.js';
import { transaction } from '../services/operations.js';
import { crewLocationChanged } from '../services/realtime.js';
import { audit } from '../services/audit.js';

const LIVE_MS = 60000;
const SAME_POINT_MS = 10000;
const MAX_LAST_POINTS = 500;

// Last accepted point per crew and user: `${crewId}:${userId}` -> { latitude, longitude, accuracy, at, location }.
const lastPoints = new Map();

const pointKey = (req) => `${req.params.id}:${req.user._id}`;

function isRepeatedPoint(req) {
  const last = lastPoints.get(pointKey(req));
  return Boolean(
    last &&
    Date.now() - last.at < SAME_POINT_MS &&
    last.latitude === req.input.latitude &&
    last.longitude === req.input.longitude &&
    last.accuracy === req.input.accuracy,
  );
}

function rememberPoint(req, location) {
  const key = pointKey(req);
  lastPoints.delete(key); // re-insert so the Map keeps oldest-first order
  lastPoints.set(key, {
    latitude: req.input.latitude,
    longitude: req.input.longitude,
    accuracy: req.input.accuracy,
    at: Date.now(),
    location,
  });
  while (lastPoints.size > MAX_LAST_POINTS) lastPoints.delete(lastPoints.keys().next().value);
}

/**
 * Routine position update from whoever is already sharing: one atomic write instead of a
 * transaction. Returns null when the full path is needed (first fix, takeover, another sharer).
 */
const refreshOwnPosition = (req) =>
  Crew.findOneAndUpdate(
    {
      _id: req.params.id,
      members: req.user._id,
      ...gpsAllowed(),
      status: { $ne: 'Fora de serviço' },
      'location.sharing': true,
      'location.updatedBy': req.user._id,
      'location.locatedAt': { $gt: new Date(Date.now() - LIVE_MS) },
    },
    {
      $set: {
        'location.latitude': req.input.latitude,
        'location.longitude': req.input.longitude,
        'location.accuracy': req.input.accuracy,
        'location.locatedAt': new Date(),
      },
    },
    { new: true, runValidators: true },
  );

export async function location(req, res) {
  // Known trade-off: for up to SAME_POINT_MS a repeated identical point skips the membership/duty check.
  // Same point reported again within seconds: answer from memory, no write, no broadcast.
  if (req.input.enabled && isRepeatedPoint(req)) {
    return res.json(lastPoints.get(pointKey(req)).location);
  }
  const quick = req.input.enabled ? await refreshOwnPosition(req) : null;
  const crew =
    quick ??
    (await transaction(async (session) => {
      const crew = await Crew.findOne({
        _id: req.params.id,
        members: req.user._id,
        ...gpsAllowed(),
        status: { $ne: 'Fora de serviço' },
      }).session(session);
      requireValue(
        crew,
        'Somente integrantes em serviço podem compartilhar o GPS da guarnição.',
        403,
      );
      const previous = crew.location;
      const wasSharing = Boolean(previous?.sharing);
      const owner = String(previous?.updatedBy) === String(req.user._id);
      const live = previous?.sharing && +previous.locatedAt > Date.now() - LIVE_MS;
      requireValue(
        !live || owner,
        'Outro integrante já está compartilhando o GPS desta guarnição.',
        409,
      );
      if (req.input.enabled) {
        crew.location = {
          latitude: req.input.latitude,
          longitude: req.input.longitude,
          accuracy: req.input.accuracy,
          locatedAt: new Date(),
          updatedBy: req.user._id,
          sharing: true,
        };
        if (!live) await audit(req.user, 'GPS ativado', 'Crew', crew._id, '', session);
      } else {
        requireValue(
          !previous?.sharing || owner || !live,
          'Somente quem ativou o GPS pode desligá-lo.',
          403,
        );
        crew.location.sharing = false;
        if (wasSharing) await audit(req.user, 'GPS desativado', 'Crew', crew._id, '', session);
      }
      await crew.save({ session });
      return crew;
    }));
  if (req.input.enabled) rememberPoint(req, crew.location);
  else lastPoints.delete(pointKey(req));
  crewLocationChanged(crew);
  res.json(crew.location);
}
