import { Occurrence, CrewShift, Vehicle, User } from '../models/index.js';
import { occurrenceFilter, populateOccurrence } from './occurrenceController.js';
import { requireValue } from '../utils/errors.js';
export async function reports(req, res) {
  const filter = occurrenceFilter(req.query);
  const total = await Occurrence.countDocuments(filter);
  requireValue(
    total <= 10000,
    'O relatório excede 10.000 ocorrências. Reduza o período.',
    422,
    'Relatórios',
  );
  const rows = await populateOccurrence(Occurrence.find(filter).sort({ occurredAt: -1 }));
  const [shifts, vehicles, users] = await Promise.all([
    CrewShift.find({
      ...(filter.occurredAt ? { start: filter.occurredAt } : {}),
      ...(filter.crew ? { crew: filter.crew } : {}),
    })
      .populate({ path: 'crew', populate: { path: 'city' } })
      .populate('members endedBy', 'name')
      .sort({ start: -1 })
      .limit(1000),
    Vehicle.find({
      status: 'Em manutenção',
      ...(filter.city ? { city: filter.city } : {}),
      ...(filter.vehicle ? { _id: filter.vehicle } : {}),
    }).populate('city', 'name'),
    User.find({
      active: true,
      ...(filter.city ? { city: filter.city } : {}),
      ...(filter.createdBy ? { _id: filter.createdBy } : {}),
    })
      .select('name city role crew')
      .populate('city', 'name')
      .populate('crew', 'name'),
  ]);
  const grouped = {};
  for (const key of ['city', 'crimeType', 'priority', 'status', 'crew', 'vehicle']) {
    grouped[key] = Object.create(null);
    for (const row of rows) {
      const label = row[key]?.name || row[key]?.prefix || row[key] || 'Não informado';
      grouped[key][label] = (grouped[key][label] || 0) + 1;
    }
  }
  const ended = rows.filter((r) => r.status === 'Encerrada');
  const totals = {
    total,
    closed: ended.length,
    open: rows.filter((r) => !['Encerrada', 'Cancelada'].includes(r.status)).length,
    averageSeconds: ended.length
      ? Math.round(ended.reduce((sum, r) => sum + (r.durationSeconds || 0), 0) / ended.length)
      : 0,
  };
  for (const key of ['weapons', 'recoveredVehicles', 'detained', 'approaches'])
    totals[key] = rows.reduce((s, r) => s + r[key], 0);
  if (req.query.format === 'csv') {
    const escape = (value) =>
      `"${String(value ?? '')
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""')}"`;
    const header = [
      'Protocolo',
      'Data',
      'Cidade',
      'Tipo',
      'Prioridade',
      'Status',
      'Guarnição',
      'Viatura',
      'Responsável',
      'Duração (s)',
      'Armas',
      'Veículos recuperados',
      'Conduzidos',
      'Abordagens',
    ];
    const csv = [
      header,
      ...rows.map((r) => [
        r.protocol,
        r.occurredAt.toISOString(),
        r.city?.name,
        r.crimeType,
        r.priority,
        r.status,
        r.crew?.name,
        r.vehicle?.prefix,
        r.acceptedBy?.name,
        r.durationSeconds,
        r.weapons,
        r.recoveredVehicles,
        r.detained,
        r.approaches,
      ]),
    ]
      .map((row) => row.map(escape).join(';'))
      .join('\r\n');
    return res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="srgop-relatorio.csv"',
      })
      .send('\uFEFF' + csv);
  }
  res.json({
    totals,
    grouped,
    rows,
    shifts: shifts.filter(
      (s) =>
        (!filter.city || String(s.crew?.city?._id) === filter.city) &&
        (!filter.createdBy || s.members.some((m) => String(m._id) === filter.createdBy)),
    ),
    vehicles,
    users,
  });
}
