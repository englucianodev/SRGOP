import { Crew } from '../models/index.js';
import { requireValue } from '../utils/errors.js';
import { transaction } from '../services/operations.js';
import { crewLocationChanged } from '../services/realtime.js';
import { audit } from '../services/audit.js';

export async function location(req, res) {
  const crew = await transaction(async (session) => {
    const crew = await Crew.findOne({
      _id: req.params.id,
      members: req.user._id,
      shiftEnd: { $gt: new Date() },
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
    const live = previous?.sharing && +previous.locatedAt > Date.now() - 60000;
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
  });
  crewLocationChanged(crew);
  res.json(crew.location);
}
