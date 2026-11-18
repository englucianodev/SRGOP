import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useData } from '../../hooks/useData';
import { api } from '../../services/api';
import { Button, Modal } from '../UI';

/** Recipient of a pending CPU transfer accepts or refuses it. */
export default function CpuTransferPrompt() {
  const app = useApp();
  const { data: cpu } = useData('/cpu');
  const [dismissed, setDismissed] = useState(null);
  const transfer = cpu?.transfer;
  if (!transfer || String(transfer.to) !== String(app.user._id) || dismissed === transfer._id)
    return null;
  const answer = async (accept) => {
    const done = await app.run(
      () => api.post('/cpu/transfer/answer', { accept }),
      accept ? 'Você assumiu o CPU.' : 'Passagem recusada.',
    );
    if (done) setDismissed(transfer._id);
  };
  return (
    <Modal title="Passagem de serviço do CPU" onClose={() => setDismissed(transfer._id)}>
      <p>
        <b>{cpu.officer?.name || 'O CPU atual'}</b> quer passar o serviço do CPU para você.
      </p>
      {transfer.reason && <p>Motivo: {transfer.reason}</p>}
      <div className="form-actions">
        <Button variant="secondary" onClick={() => answer(false)}>
          Recusar
        </Button>
        <Button onClick={() => answer(true)}>Aceitar</Button>
      </div>
    </Modal>
  );
}
