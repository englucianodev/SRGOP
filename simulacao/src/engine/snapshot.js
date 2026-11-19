// What the local panel (npm run painel) shows: a small JSON with every crew, who is in it,
// where it is and what it is attending. Written by the simulator on each tick.
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const person = (officer) => (officer?.account ? { name: officer.account.name, rank: officer.account.rank } : null);

function attendanceOf(attendance) {
  if (!attendance) return null;
  const { scenario } = attendance;
  return {
    protocol: attendance.protocol,
    crimeType: scenario.crimeType,
    category: scenario.category,
    latitude: scenario.latitude,
    longitude: scenario.longitude,
    startedAt: attendance.startedAt,
    dueAt: attendance.dueAt,
    notesDone: attendance.notesDone,
    notesTotal: scenario.notes?.length ?? 0,
  };
}

const teamRow = (team) => ({
  crewId: team.crewId,
  city: team.city.name,
  base: { latitude: team.city.latitude, longitude: team.city.longitude },
  team: team.team,
  phase: team.phase,
  stage: team.stage ?? null,
  enterSince: team.enterSince ?? null,
  position: team.position,
  gpsAt: team.gpsAt ?? null,
  commander: person(team.commander),
  driver: person(team.driver),
  attendance: attendanceOf(team.attendance),
});

export function buildSnapshot(sim, now = Date.now()) {
  const data = sim.state.data;
  // Teams leaving at the shift change still show while they finish an attendance.
  const teams = [...sim.teams.values(), ...(sim.leaving ?? []).filter((a) => a?.commander)]
    .filter((team, index, all) => all.indexOf(team) === index && team.phase !== 'encerrado')
    .map(teamRow);
  return {
    t: now,
    status: data.status,
    wrapUp: Boolean(data.wrapUp),
    pause: data.pause ? { reason: data.pause.reason, since: data.pause.from } : null,
    startedAt: data.startedAt,
    progress: data.plannedActiveMs ? Math.min(1, data.activeMs / data.plannedActiveMs) : 0,
    day: sim.day,
    cpu: sim.cpu && sim.cpu.phase !== 'encerrado' ? { ...person(sim.cpu.officer), phase: sim.cpu.phase } : null,
    teams,
  };
}

/** Atomic write, so the panel never reads half a file. */
export function writeSnapshot(dataDir, snapshot) {
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'painel.json');
  writeFileSync(`${file}.tmp`, JSON.stringify(snapshot));
  renameSync(`${file}.tmp`, file);
}
