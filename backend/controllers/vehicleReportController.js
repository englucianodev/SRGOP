import { z } from 'zod';
import { Vehicle, VehicleHandover } from '../models/index.js';
import { id } from '../middlewares/validation.js';
import { dayRange } from '../utils/time.js';
import { requireValue } from '../utils/errors.js';

const parts = [
  ['body', 'Lataria'],
  ['electrical', 'Elétrica'],
  ['suspension', 'Suspensão'],
  ['tires', 'Pneus'],
  ['brakes', 'Freios'],
  ['engine', 'Motor'],
];
const label = (user) =>
  [user?.rank, user?.callSign || user?.name].filter(Boolean).join(' ') || 'Policial não disponível';
export async function vehicleReports(req, res) {
  const { from, to, vehicles, phase = 'all', changesOnly = 'false', format } = req.query;
  requireValue(
    z.iso.date().safeParse(from).success && z.iso.date().safeParse(to).success,
    'Informe datas inicial e final válidas.',
    422,
  );
  requireValue(from <= to, 'A data final deve ser igual ou posterior à data inicial.', 422);
  requireValue(
    vehicles === undefined || typeof vehicles === 'string',
    'Filtro de viaturas inválido.',
    422,
  );
  requireValue(
    ['all', 'intake', 'delivery'].includes(phase) &&
      ['true', 'false'].includes(changesOnly) &&
      (format === undefined || format === 'csv'),
    'Filtro de checklist ou formato inválido.',
    422,
  );
  const ids = vehicles
    ? [
        ...new Set(
          vehicles
            .split(',')
            .filter(Boolean)
            .map((v) => v.toLowerCase()),
        ),
      ]
    : [];
  requireValue(
    ids.length <= 100 && ids.every((value) => id.safeParse(value).success),
    'Selecione até cem viaturas válidas.',
    422,
  );
  const fleet = await Vehicle.find(ids.length ? { _id: { $in: ids } } : {})
    .populate('city', 'name')
    .sort({ prefix: 1 })
    .lean();
  requireValue(
    !ids.length || fleet.length === ids.length,
    'Uma das viaturas selecionadas não existe.',
    422,
  );
  const range = { $gte: dayRange(from).$gte, $lt: dayRange(to).$lt };
  const phases = phase === 'all' ? ['intake', 'delivery'] : [phase];
  const handovers = await VehicleHandover.find({
    vehicle: { $in: fleet.map((v) => v._id) },
    $or: phases.map((key) => ({ [`${key}.at`]: range })),
  })
    .populate('driver', 'name rank callSign')
    .populate('crew', 'name')
    .populate('shift', 'crewName cityName')
    .limit(2001)
    .lean();
  requireValue(
    handovers.length <= 2000,
    'O relatório excede 2.000 registros. Reduza o período ou selecione menos viaturas.',
    422,
  );
  const groups = fleet.map((v) => ({
    _id: String(v._id),
    prefix: v.prefix,
    plate: v.plate,
    brand: v.brand,
    model: v.model,
    year: v.year,
    type: v.type,
    city: v.city?.name || 'Município não disponível',
    checklists: [],
  }));
  const byVehicle = new Map(groups.map((v) => [v._id, v]));
  for (const record of handovers)
    for (const key of phases) {
      const inspection = record[key];
      if (!inspection?.at || +inspection.at < +range.$gte || +inspection.at >= +range.$lt) continue;
      const items = parts.map(([field, name]) => ({
        key: field,
        label: name,
        state: inspection[field]?.state || 'Não registrado',
        observation: inspection[field]?.observation || '',
      }));
      const alterations = items.filter((item) => item.state === 'C/A').length;
      if (changesOnly === 'true' && !alterations) continue;
      byVehicle.get(String(record.vehicle)).checklists.push({
        _id: `${record._id}-${key}`,
        handoverId: String(record._id),
        phase: key,
        moment:
          key === 'intake' ? 'Início do serviço / Recebimento' : 'Término do serviço / Entrega',
        at: inspection.at,
        mileage: inspection.mileage,
        officer: label(record.driver),
        crew: record.shift?.crewName || record.crew?.name || 'Guarnição não disponível',
        serviceCity: record.shift?.cityName || '',
        items,
        alterations,
      });
    }
  for (const group of groups) group.checklists.sort((a, b) => +a.at - +b.at);
  const checklists = groups.flatMap((v) => v.checklists);
  const data = {
    from,
    to,
    phase,
    changesOnly: changesOnly === 'true',
    generatedAt: new Date(),
    vehicles: groups,
    totals: {
      vehicles: groups.length,
      checklists: checklists.length,
      intake: checklists.filter((c) => c.phase === 'intake').length,
      delivery: checklists.filter((c) => c.phase === 'delivery').length,
      withChanges: checklists.filter((c) => c.alterations > 0).length,
      alterations: checklists.reduce((sum, c) => sum + c.alterations, 0),
    },
  };
  if (format === 'csv') {
    const lines = [
      [
        'Prefixo',
        'Placa',
        'Marca',
        'Modelo',
        'Tipo',
        'Município cadastral',
        'Guarnição',
        'Município do serviço',
        'Momento',
        'Data/hora (Fortaleza)',
        'KM registrado',
        'Policial',
        'Item',
        'Condição',
        'Observação',
        'Registro do checklist',
      ],
    ];
    for (const v of groups)
      for (const c of v.checklists)
        for (const item of c.items)
          lines.push([
            v.prefix,
            v.plate,
            v.brand,
            v.model,
            v.type,
            v.city,
            c.crew,
            c.serviceCity,
            c.moment,
            new Date(c.at).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }),
            c.mileage,
            c.officer,
            item.label,
            item.state,
            item.observation,
            c.handoverId,
          ]);
    const escape = (value) => {
      let text = String(value ?? '');
      if (/^\s*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    return res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="srgop-checklists-viaturas.csv"',
      })
      .send('\uFEFF' + lines.map((row) => row.map(escape).join(';')).join('\r\n'));
  }
  res.json(data);
}
