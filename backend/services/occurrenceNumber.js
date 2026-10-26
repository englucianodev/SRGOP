import OccurrenceSequence from '../models/OccurrenceSequence.js';
import { dayKey } from '../utils/time.js';
import { requireValue } from '../utils/errors.js';

export function occurrenceNumberDate(date = new Date()) {
  const [year, month, day] = dayKey(date).split('-');
  return { year: Number(year), suffix: `${day}${month}${year}` };
}

export async function prepareOccurrenceSequence(year) {
  try {
    await OccurrenceSequence.updateOne(
      { _id: year },
      { $setOnInsert: { value: 0 } },
      { upsert: true },
    );
  } catch (error) {
    // Another request may initialize the year's counter at the same instant.
    if (error.code !== 11000) throw error;
  }
}

export async function nextOccurrenceNumber({ year, suffix }, session) {
  const counter = await OccurrenceSequence.findOneAndUpdate(
    { _id: year, value: { $lt: 999 } },
    { $inc: { value: 1 } },
    { new: true, session },
  );
  requireValue(
    counter,
    'Limite anual de 999 ocorrências atingido para a numeração de três dígitos.',
    422,
  );
  return `${String(counter.value).padStart(3, '0')}-${suffix}`;
}
