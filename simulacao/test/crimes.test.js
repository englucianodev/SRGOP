import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCrimeTypes, buildCategoryPool, CATEGORIES, settingsWithCrimeTypes } from '../src/domain/crimes.js';
import { weightedPick } from '../src/lib/random.js';
import { TEMPLATES } from '../src/domain/templates.js';

const SYSTEM_TYPES = [
  'Furto',
  'Roubo',
  'Violência doméstica (Lei Maria da Penha)',
  'Briga familiar / entre vizinhos',
  'Acidente de trânsito com vítima fatal',
  'Acidente de trânsito sem vítima (danos materiais)',
  'Cumprimento de mandado de prisão',
  'Recuperação de veículo roubado',
  'Porte ilegal de arma de fogo',
  'Encontro de cadáver',
  'Outros',
];

test('associa cada categoria ao tipo cadastrado no sistema', () => {
  const { mapping, warnings } = mapCrimeTypes(SYSTEM_TYPES);
  assert.equal(mapping.mariaPenha, 'Violência doméstica (Lei Maria da Penha)');
  assert.equal(mapping.briga, 'Briga familiar / entre vizinhos');
  assert.equal(mapping.acidenteFatal, 'Acidente de trânsito com vítima fatal');
  assert.equal(mapping.acidenteMaterial, 'Acidente de trânsito sem vítima (danos materiais)');
  assert.equal(mapping.mandado, 'Cumprimento de mandado de prisão');
  assert.equal(mapping.veiculo, 'Recuperação de veículo roubado');
  assert.equal(mapping.cadaver, 'Encontro de cadáver');
  assert.equal(mapping.armaFogo, 'Porte ilegal de arma de fogo');
  assert.deepEqual(warnings, []);
});

test('apreensão de arma de fogo tem metade do peso da recuperação de veículos', () => {
  assert.equal(CATEGORIES.armaFogo.weight, CATEGORIES.veiculo.weight / 2);
  const total = Object.values(CATEGORIES).reduce((sum, c) => sum + c.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('porte e posse de arma de fogo dividem o peso da categoria de arma de fogo', () => {
  const types = [...SYSTEM_TYPES, 'Posse de arma de fogo'];
  const { mapping, extras, others } = mapCrimeTypes(types);
  assert.ok(!others.includes('Posse de arma de fogo'));
  const pool = buildCategoryPool(mapping, others, extras);
  const weapons = pool.filter((e) => e.id === 'armaFogo');
  assert.deepEqual(weapons.map((e) => e.crimeType).sort(), ['Porte ilegal de arma de fogo', 'Posse de arma de fogo']);
  const share = weapons.reduce((sum, e) => sum + e.weight, 0);
  assert.ok(Math.abs(share - CATEGORIES.armaFogo.weight) < 1e-9);
});

test('outros tipos com arma de fogo (disparo, omissão de cautela) não contam como apreensão', () => {
  const { mapping, extras, others } = mapCrimeTypes([...SYSTEM_TYPES, 'Posse de arma de fogo', 'Disparo de arma de fogo', 'Omissão de cautela na guarda de arma de fogo']);
  assert.deepEqual([mapping.armaFogo, ...extras.armaFogo], ['Porte ilegal de arma de fogo', 'Posse de arma de fogo']);
  assert.ok(others.includes('Disparo de arma de fogo') && others.includes('Omissão de cautela na guarda de arma de fogo'));
});

test('toda categoria tem textos modelo para quando a IA estiver desligada', () => {
  for (const id of Object.keys(CATEGORIES)) {
    assert.ok(TEMPLATES[id]?.descriptions?.length, `${id} sem descrições`);
    assert.ok(TEMPLATES[id]?.summaries?.length, `${id} sem resumos`);
  }
});

test('ocorrência de arma de fogo registra uma arma apreendida', () => {
  const results = CATEGORIES.armaFogo.results(() => 0.5);
  assert.equal(results.weapons, 1);
});

test('tipos não usados pelas categorias principais formam o grupo "outros"', () => {
  const { others } = mapCrimeTypes(SYSTEM_TYPES);
  assert.deepEqual(others.sort(), ['Furto', 'Outros', 'Roubo']);
});

test('um único "Acidente de trânsito" atende aos dois tipos de acidente', () => {
  const { mapping } = mapCrimeTypes(['Acidente de trânsito', 'Furto']);
  assert.equal(mapping.acidenteFatal, 'Acidente de trânsito');
  assert.equal(mapping.acidenteMaterial, 'Acidente de trânsito');
});

test('categoria sem tipo correspondente gera aviso e o peso vai para "outros"', () => {
  const { mapping, others, warnings } = mapCrimeTypes(['Furto', 'Roubo']);
  assert.equal(mapping.cadaver, null);
  assert.ok(warnings.some((w) => w.includes('cadaver')));
  const pool = buildCategoryPool(mapping, others);
  assert.ok(pool.every((entry) => entry.crimeType));
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  const expected = Object.values(CATEGORIES).reduce((sum, c) => sum + c.weight, 0);
  assert.ok(Math.abs(total - expected) < 1e-9);
});

test('um tipo já usado por Maria da Penha não é reutilizado em "briga"', () => {
  const { mapping } = mapCrimeTypes([
    'Violência doméstica e familiar contra a mulher',
    'Briga entre vizinhos',
  ]);
  assert.equal(mapping.mariaPenha, 'Violência doméstica e familiar contra a mulher');
  assert.equal(mapping.briga, 'Briga entre vizinhos');
});

test('substituições explícitas têm prioridade e são validadas', () => {
  const { mapping } = mapCrimeTypes(SYSTEM_TYPES, { cadaver: 'Outros' });
  assert.equal(mapping.cadaver, 'Outros');
  assert.throws(() => mapCrimeTypes(SYSTEM_TYPES, { cadaver: 'Inexistente' }), /Inexistente/);
});

test('sorteio ponderado respeita os pesos', () => {
  const entries = [
    { id: 'a', weight: 1 },
    { id: 'b', weight: 3 },
  ];
  assert.equal(weightedPick(entries, () => 0.1).id, 'a');
  assert.equal(weightedPick(entries, () => 0.3).id, 'b');
  assert.equal(weightedPick(entries, () => 0.999).id, 'b');
});

test('cadastro de tipos acrescenta só os de arma de fogo que faltam e preserva o resto', () => {
  const current = {
    _id: 'x', key: 'general', institution: '18º BPM', inactivityMinutes: 5, onDutyInactivityMinutes: 360, alertMinutes: 10,
    soundEnabled: true, notificationsEnabled: true, modules: ['Dashboard'], logoVersion: '',
    crimeTypes: ['Furto', 'porte ilegal de ARMA DE FOGO'],
    operations: [{ _id: 'o', name: 'Operação Alfa', objective: 'Patrulhar', day: '2026-11-20' }],
  };
  const body = settingsWithCrimeTypes(current);
  assert.deepEqual(body.crimeTypes, ['Furto', 'porte ilegal de ARMA DE FOGO', 'Posse de arma de fogo']);
  assert.deepEqual(body.operations, [{ name: 'Operação Alfa', objective: 'Patrulhar', day: '2026-11-20' }]);
  assert.equal(body.institution, '18º BPM');
  assert.ok(!('_id' in body) && !('logoVersion' in body) && !('key' in body));
  assert.equal(settingsWithCrimeTypes({ ...current, crimeTypes: [...body.crimeTypes] }), null);
});
