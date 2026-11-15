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

export const OCCURRENCE_NUMBER_DIGITS = 5;
const OCCURRENCE_NUMBER_MAX = 10 ** OCCURRENCE_NUMBER_DIGITS - 1;

export async function nextOccurrenceNumber({ year, suffix }, session) {
  const counter = await OccurrenceSequence.findOneAndUpdate(
    { _id: year, value: { $lt: OCCURRENCE_NUMBER_MAX } },
    { $inc: { value: 1 } },
    { new: true, session },
  );
  requireValue(
    counter,
    `Limite anual de ${OCCURRENCE_NUMBER_MAX.toLocaleString('pt-BR')} ocorrências atingido para a numeração de ${OCCURRENCE_NUMBER_DIGITS} dígitos.`,
    422,
  );
  return `${String(counter.value).padStart(OCCURRENCE_NUMBER_DIGITS, '0')}-${suffix}`;
}
