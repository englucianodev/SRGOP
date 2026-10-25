import { City, Crew, Vehicle } from '../models/index.js';
import { transaction } from './operations.js';
import { requireValue } from '../utils/errors.js';
import { audit } from './audit.js';
export async function provisionDemoCrews(actor = null) {
  return transaction(async (session) => {
    const cities = await City.find({ active: true, deleted: { $ne: true } })
      .sort({ name: 1 })
      .session(session);
    const vehicles = await Vehicle.find({
      city: { $in: cities.map((c) => c._id) },
      type: 'Caminhonete',
    })
      .sort({ city: 1, _id: 1 })
      .session(session);
    requireValue(
      vehicles.length <= 21,
      'Há mais de 21 caminhonetes. A faixa DEMO0100–DEMO0120 e VTR-1800–VTR-1820 é insuficiente.',
      409,
    );
    const others = await Vehicle.find({ _id: { $nin: vehicles.map((v) => v._id) } }).session(
      session,
    );
    const used = new Set();
    for (let i = 0; i <= 20; i++)
      if (
        others.some(
          (v) =>
            v.plate === `DEMO${String(100 + i).padStart(4, '0')}` || v.prefix === `VTR-${1800 + i}`,
        )
      )
        used.add(i);
    const assigned = new Map();
    for (const v of vehicles) {
      const i = Number(v.plate?.slice(4)) - 100;
      if (
        /^DEMO01[012]\d$/.test(v.plate) &&
        i >= 0 &&
        i <= 20 &&
        v.prefix === `VTR-${1800 + i}` &&
        !used.has(i)
      ) {
        assigned.set(String(v._id), i);
        used.add(i);
      }
    }
    for (const v of vehicles)
      if (!assigned.has(String(v._id))) {
        const index = Array.from({ length: 21 }, (_, i) => i).find((i) => !used.has(i));
        requireValue(
          index !== undefined,
          'Faixa de identificadores de demonstração esgotada.',
          409,
        );
        assigned.set(String(v._id), index);
        used.add(index);
      }
    let updatedVehicles = 0,
      createdCrews = 0,
      linkedCrews = 0;
    for (const v of vehicles) {
      const i = assigned.get(String(v._id));
      if (v.prefix !== `VTR-${1800 + i}` || v.plate !== `DEMO${String(100 + i).padStart(4, '0')}`)
        await Vehicle.updateOne(
          { _id: v._id },
          { prefix: `TMP-${v._id}`, plate: `T-${String(v._id).slice(-8)}` },
          { session },
        );
    }
    for (const v of vehicles) {
      const i = assigned.get(String(v._id)),
        prefix = `VTR-${1800 + i}`,
        plate = `DEMO${String(100 + i).padStart(4, '0')}`;
      if (v.prefix !== prefix || v.plate !== plate) {
        const previous = `${v.prefix} / ${v.plate}`;
        v.prefix = prefix;
        v.plate = plate;
        if (v.provisional)
          v.notes =
            'CADASTRO PROVISÓRIO: prefixo e placa DEMO podem ser substituídos pelo Administrativo. Conferir ano e KM reais antes de liberar para serviço.';
        await v.save({ session });
        updatedVehicles++;
        await audit(
          actor,
          'Identificadores de demonstração',
          'Vehicle',
          v._id,
          `${previous} → ${prefix} / ${plate}`,
          session,
        );
      }
    }
    for (const city of cities) {
      const cityVehicles = vehicles.filter((v) => String(v.city) === String(city._id));
      requireValue(
        cityVehicles.length,
        'Município sem caminhonete. Execute primeiro provision:fleet.',
        409,
      );
      let crew = await Crew.findOne({
        city: city._id,
        vehicle: { $in: cityVehicles.map((v) => v._id) },
      }).session(session);
      if (crew) {
        if (crew.type !== 'Viatura Convencional') {
          crew.type = 'Viatura Convencional';
          await crew.save({ session });
        }
        const assignedVehicle = cityVehicles.find((v) => String(v._id) === String(crew.vehicle));
        requireValue(
          !assignedVehicle.crew || String(assignedVehicle.crew) === String(crew._id),
          'Viatura com vínculo inconsistente; revise o cadastro.',
          409,
        );
        await Vehicle.updateOne({ _id: assignedVehicle._id }, { crew: crew._id }, { session });
        continue;
      }
      const vehicle = cityVehicles.find((v) => !v.crew);
      requireValue(
        vehicle,
        'As caminhonetes do município estão vinculadas a outra equipe; revise os vínculos.',
        409,
      );
      crew = await Crew.findOne({
        city: city._id,
        vehicle: null,
        type: { $ne: 'Motocicleta' },
        'members.0': { $exists: false },
        currentOccurrence: null,
      }).session(session);
      if (!crew) {
        const [created] = await Crew.create(
          [
            {
              name: `Guarnição ${city.name}`,
              city: city._id,
              vehicle: vehicle._id,
              type: 'Viatura Convencional',
            },
          ],
          { session },
        );
        crew = created;
        createdCrews++;
      } else {
        crew.vehicle = vehicle._id;
        crew.type = 'Viatura Convencional';
        await crew.save({ session });
        linkedCrews++;
      }
      vehicle.crew = crew._id;
      await vehicle.save({ session });
      await audit(
        actor,
        'Guarnição associada por município',
        'Crew',
        crew._id,
        `${city.name} / ${vehicle.prefix}`,
        session,
      );
    }
    return { cities: cities.length, updatedVehicles, createdCrews, linkedCrews };
  });
}
