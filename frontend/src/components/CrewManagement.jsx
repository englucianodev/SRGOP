import { isOnDuty, dutyClock } from '../utils/duty';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { Button, Modal, Select, Textarea } from './UI';
import { militaryLabel } from './PersonalFields';

export default function CrewManagement({ crew }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const motorcycle = crew.type === 'Motocicleta' || crew.shiftMode === 'Motocicleta';
  const [action, setAction] = useState(motorcycle ? 'Saída' : 'Motorista');
  const [member, setMember] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (
    app.user.role === 'Praça' ||
    app.activeAttendance ||
    !crew.members.length ||
    !isOnDuty(crew, app.now)
  )
    return null;
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    await app.run(async () => {
      if (action === 'Disponível' || action === 'Indisponível')
        await api.patch(`/crews/${crew._id}/availability`, { status: action, reason });
      else await api.post(`/crews/${crew._id}/members`, { member, action, reason });
      setOpen(false);
    }, 'Guarnição atualizada com registro de auditoria.');
    setBusy(false);
  }
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true);
          setMember('');
          setReason('');
        }}
      >
        Gerenciar guarnição
      </Button>
      {open && (
        <Modal title={`Gerenciar ${crew.name}`} onClose={() => setOpen(false)}>
          <form onSubmit={save}>
            <Select label="Ação" value={action} onChange={(e) => setAction(e.target.value)}>
              {!motorcycle && <option value="Motorista">Definir motorista atual</option>}
              <option value="Saída">Autorizar saída de policial</option>
              {app.user.role === 'Administrativo' && (
                <>
                  <option value="Indisponível">Marcar como indisponível</option>
                  <option value="Disponível">Marcar como disponível</option>
                </>
              )}
            </Select>
            {['Motorista', 'Saída'].includes(action) && (
              <Select
                label="Policial da guarnição"
                required
                value={member}
                onChange={(e) => setMember(e.target.value)}
              >
                <option value="">Selecione</option>
                {crew.members.map((m) => (
                  <option key={m._id} value={m._id}>
                    {militaryLabel(m)}
                  </option>
                ))}
              </Select>
            )}
            <Textarea
              label="Justificativa"
              required
              minLength={5}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="form-note">
              A saída do último integrante encerra o turno. O responsável por um atendimento ativo
              precisa concluí-lo antes de sair.
            </p>
            <Button type="submit" busy={busy}>
              Autorizar alteração
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
