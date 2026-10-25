import { City, Vehicle } from '../models/index.js';
import { transaction } from './operations.js';
import { audit } from './audit.js';
export async function provisionDefaultFleet(actor) {
  const cities = await City.find({ active: true, deleted: { $ne: true } });
  let created = 0,
    existing = 0;
  for (const city of cities) {
    const wasCreated = await transaction(async (session) => {
      // A stable technical identifier avoids duplicate drafts; it is never presented as a real plate.
      const prefix = `S10-PEND-${String(city._id).slice(-8).toUpperCase()}`;
      await City.updateOne({ _id: city._id }, { updatedAt: new Date() }, { session });
      const known = await Vehicle.findOne({
        city: city._id,
        type: { $ne: 'Motocicleta' },
        $or: [
          { brand: /^chevrolet$/i, model: /^s10$/i },
          { brand: { $exists: false }, model: { $exists: false } },
        ],
      }).session(session);
      if (known) {
        await Vehicle.updateOne(
          { _id: known._id },
          { brand: 'Chevrolet', model: 'S10', type: 'Caminhonete' },
          { session },
        );
        return false;
      }
      const [vehicle] = await Vehicle.create(
        [
          {
            prefix,
            plate: `P-${String(city._id).slice(-8).toUpperCase()}`,
            city: city._id,
            brand: 'Chevrolet',
            model: 'S10',
            type: 'Caminhonete',
            status: 'Indisponível',
            provisional: true,
            mileage: 0,
            notes:
              'CADASTRO PROVISÓRIO: informar prefixo, placa, ano e KM reais antes de liberar para serviço. O identificador P- não é placa real; KM zero não é leitura confirmada.',
          },
        ],
        { session },
      );
      await audit(
        actor,
        'S10 provisória cadastrada por município',
        'Vehicle',
        vehicle._id,
        city.name,
        session,
      );
      return true;
    });
    if (wasCreated) created++;
    else existing++;
  }
  return { created, existing, cities: cities.length };
}
