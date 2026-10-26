import { Phone, ShieldCheck } from 'lucide-react';
import { useData } from '../hooks/useData';
import { militaryLabel } from './PersonalFields';
import { formatPhone } from '../utils/phone';
export default function ServiceCpu() {
  const { data: cpu } = useData('/service-cpu');
  const phone = cpu?.officer?.phone;
  return (
    <div className="service-cpu" role="region" aria-label="CPU do serviço">
      <ShieldCheck size={20} />
      <div>
        <strong>
          CPU do serviço ·{' '}
          {cpu?.officer ? militaryLabel(cpu.officer) : 'Responsável ainda não definido'}
        </strong>
        <small>
          Serviço das 8h às 8h do dia seguinte
          {cpu?.day ? ` · ${cpu.day.split('-').reverse().join('/')}` : ''}
        </small>
      </div>
      {phone ? (
        <a href={`tel:${phone.replace(/[^+\d]/g, '')}`}>
          <Phone size={16} />
          {formatPhone(phone)}
        </a>
      ) : (
        <span>Telefone não informado</span>
      )}
    </div>
  );
}
