import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Sequence from '../models/OccurrenceSequence.js';
import Occurrence from '../models/Occurrence.js';
import {
  occurrenceNumberDate,
  prepareOccurrenceSequence,
  nextOccurrenceNumber,
} from '../services/occurrenceNumber.js';
let mongo;
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri('occurrence_numbers'));
  await Sequence.init();
});
after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
const allocate = (date) =>
  mongoose.connection.transaction((session) => nextOccurrenceNumber(date, session));
test('date and annual rollover use Fortaleza time', () => {
  assert.deepEqual(occurrenceNumberDate(new Date('2027-01-01T02:59:59Z')), {
    year: 2026,
    suffix: '31122026',
  });
  assert.deepEqual(occurrenceNumberDate(new Date('2027-01-01T03:00:00Z')), {
    year: 2027,
    suffix: '01012027',
  });
});
test('concurrent creation gets unique increasing numbers and keeps counting across days', async () => {
  await Promise.all(Array.from({ length: 8 }, () => prepareOccurrenceSequence(2026)));
  const values = await Promise.all(
    Array.from({ length: 8 }, () => allocate({ year: 2026, suffix: '26102026' })),
  );
  assert.deepEqual(
    values.sort(),
    Array.from({ length: 8 }, (_, i) => `${String(i + 1).padStart(3, '0')}-26102026`),
  );
  assert.equal(await allocate({ year: 2026, suffix: '27102026' }), '009-27102026');
  await prepareOccurrenceSequence(2027);
  assert.equal(await allocate({ year: 2027, suffix: '01012027' }), '001-01012027');
});
test('rollback does not consume a number', async () => {
  await assert.rejects(
    mongoose.connection.transaction(async (session) => {
      await nextOccurrenceNumber({ year: 2027, suffix: '02012027' }, session);
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.equal(await allocate({ year: 2027, suffix: '02012027' }), '002-02012027');
});
test('three digit limit never wraps or duplicates a number', async () => {
  await prepareOccurrenceSequence(2028);
  await Sequence.updateOne({ _id: 2028 }, { value: 998 });
  assert.equal(await allocate({ year: 2028, suffix: '31122028' }), '999-31122028');
  await assert.rejects(allocate({ year: 2028, suffix: '31122028' }), /Limite anual/);
  assert.equal((await Sequence.findById(2028)).value, 999);
});

test('occurrence number cannot be changed through model updates', async () => {
  const ref = new mongoose.Types.ObjectId();
  const row = await Occurrence.create({
    protocol: '001-01012030',
    occurredAt: new Date(),
    city: ref,
    createdBy: ref,
    crimeType: 'Teste',
    address: 'Rua teste',
    description: 'Descrição teste',
    priority: 'Baixa',
  });
  await Occurrence.updateOne(
    { _id: row._id },
    { $set: { protocol: '999-01012030', address: 'Rua alterada' } },
  );
  const saved = await Occurrence.findById(row._id);
  assert.equal(saved.protocol, '001-01012030');
  assert.equal(saved.address, 'Rua alterada');
});
