import { ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function DayOperations() {
  const { settings, now } = useApp();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const operations = settings?.operations?.filter((operation) => operation.day === today) || [];
  return (
    <section className="service-operation" aria-label="Operação do dia">
      <ShieldCheck size={20} aria-hidden="true" />
      <div>
        <strong>Operação do dia</strong>
        {operations.length ? (
          operations.map((operation) => (
            <div key={operation._id || operation.name}>
              <b>{operation.name}</b>
              <p>{operation.objective}</p>
            </div>
          ))
        ) : (
          <p>Nenhuma operação programada para hoje.</p>
        )}
      </div>
    </section>
  );
}
