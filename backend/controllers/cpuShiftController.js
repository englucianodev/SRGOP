import { CpuShift } from '../models/index.js';
import { requireValue } from '../utils/errors.js';
import { buildShiftReport, analyticCsv } from '../services/cpuShiftReport.js';

const LIST_LIMIT = 200;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const ORIGIN = 'Relatórios do CPU';

const validDay = (value) => {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(+date) && date.toISOString().startsWith(value);
};
const requireDay = (value, name = 'Data') =>
  requireValue(validDay(value), `${name} inválida. Use AAAA-MM-DD.`, 422, ORIGIN);

function sendReport(req, res, report, name) {
  if (req.query.format !== 'csv') return res.json(report);
  return res
    .set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="srgop-${name}.csv"`,
    })
    .send(analyticCsv(report));
}

export async function listCpuShifts(req, res) {
  const { from, to } = req.query;
  if (from !== undefined) requireDay(from, 'Data inicial');
  if (to !== undefined) requireDay(to, 'Data final');
  const day = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const rows = await CpuShift.find(Object.keys(day).length ? { day } : {})
    .populate('officer', 'name')
    .sort({ start: -1 })
    .limit(LIST_LIMIT)
    .lean();
  res.json(
    rows.map((row) => ({
      _id: row._id,
      day: row.day,
      officer: row.officer?.name ?? null,
      start: row.start,
      end: row.end ?? null,
      status: row.status,
      closeReason: row.closeReason ?? null,
    })),
  );
}

export async function cpuShiftReport(req, res) {
  requireValue(OBJECT_ID.test(req.params.id), 'Identificador inválido.', 422, ORIGIN);
  const shift = await CpuShift.findById(req.params.id).lean();
  requireValue(shift, 'Turno do CPU não encontrado.', 404, ORIGIN);
  sendReport(req, res, await buildShiftReport({ day: shift.day, shift }), `turno-cpu-${shift.day}`);
}

export async function dutyDayReport(req, res) {
  requireDay(req.params.day);
  sendReport(req, res, await buildShiftReport({ day: req.params.day }), `dia-${req.params.day}`);
}
