import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Button, Modal } from '../UI';

/** Stays open while an unread `turno-cpu` notification exists, so a reload brings it back. */
export default function CpuShiftClosed({ notifications }) {
  const app = useApp();
  const note = notifications.find((n) => n.kind === 'turno-cpu' && !n.read && n.cpuShift);
  if (!note) return null;
  const base = `/relatorios/turno-cpu/${note.cpuShift}`;
  const later = () => app.run(() => api.patch(`/notifications/${note._id}/read`));
  return (
    <Modal title="Turno do CPU encerrado" onClose={later}>
      <p>{note.message || 'O seu turno como CPU foi encerrado.'}</p>
      <p>O relatório do turno continua disponível em Relatórios.</p>
      <div className="form-actions">
        <Link className="button secondary" to={`${base}?modo=sintetico`} onClick={later}>
          Relatório sintético
        </Link>
        <Link className="button secondary" to={`${base}?modo=analitico`} onClick={later}>
          Relatório analítico
        </Link>
        <Button variant="ghost" onClick={later}>
          Depois
        </Button>
      </div>
    </Modal>
  );
}
