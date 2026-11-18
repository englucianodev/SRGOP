/** Items that keep the CPU shift open after its planned end (08h). */
export default function CpuPendingList({ pending }) {
  const attending = pending?.attending || [];
  const onDuty = pending?.onDuty || [];
  if (!attending.length && !onDuty.length) return null;
  return (
    <ul className="cpu-pending" aria-label="Pendências do turno">
      {attending.map((o) => (
        <li key={o.protocol}>
          Atendimento {o.protocol}
          {o.crew ? ` · ${o.crew}` : ''}
        </li>
      ))}
      {onDuty.map((c, i) => (
        <li key={`${c.crew}-${i}`}>Guarnição em serviço: {c.crew || 'sem nome'}</li>
      ))}
    </ul>
  );
}
