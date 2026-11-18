import { Clock3 } from 'lucide-react';

export const SHIFT_EXPIRED_TEXT =
  'Seu turno encerrou. Finalize o atendimento o mais rápido possível para a próxima equipe assumir.';

/** Warns a crew still attending after its shift ended; the occurrence is never closed for it. */
export default function ShiftExpiredBanner({ crew, now }) {
  if (!crew || crew.status !== 'Em atendimento' || !crew.shiftEnd) return null;
  if (+new Date(crew.shiftEnd) > now) return null;
  return (
    <div className="service-banner expired" role="alert">
      <Clock3 size={16} /> {SHIFT_EXPIRED_TEXT}
    </div>
  );
}
