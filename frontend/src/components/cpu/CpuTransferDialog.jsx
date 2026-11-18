import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useData } from '../../hooks/useData';
import { api } from '../../services/api';
import { Button, Modal, Select, Textarea } from '../UI';

/** Current CPU picks an active Oficial to receive the shift, with an optional reason. */
export default function CpuTransferDialog({ onClose }) {
  const app = useApp();
  const { data: users } = useData('/users', []);
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const officers = users.filter((u) => u.active && u.role === 'Oficial' && u._id !== app.user._id);
  const send = async () => {
    setBusy(true);
    const body = { to, ...(reason.trim() ? { reason: reason.trim() } : {}) };
    const sent = await app.run(
      () => api.post('/cpu/transfer', body),
      'Passagem enviada. Aguardando o aceite.',
    );
    setBusy(false);
    if (sent) onClose();
  };
  return (
    <Modal title="Passar serviço" onClose={onClose}>
      <Select label="Oficial que assumirá o CPU" value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">Selecione…</option>
        {officers.map((u) => (
          <option key={u._id} value={u._id}>
            {u.name}
          </option>
        ))}
      </Select>
      <Textarea
        label="Motivo (opcional)"
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={send} busy={busy} disabled={!to}>
          Enviar passagem
        </Button>
      </div>
    </Modal>
  );
}
