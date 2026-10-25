import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { Modal, Button } from './UI';
import VehicleChecklist, { blankInspection, inspectionBody } from './VehicleChecklist';
export default function MotorcycleExit({ crew }) {
  const app = useApp(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [checklist, setChecklist] = useState(() => blankInspection(crew.vehicle?.mileage || 0));
  const driver = crew.driver?._id === app.user._id;
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setChecklist(blankInspection(crew.vehicle?.mileage || 0));
          setOpen(true);
        }}
      >
        Encerrar meu serviço de motocicleta
      </Button>
      {open && (
        <Modal title="Saída do serviço de motocicleta" onClose={() => setOpen(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              await app.run(async () => {
                await api.post(
                  `/crews/${crew._id}/leave`,
                  driver && crew.vehicle ? { checklist: inspectionBody(checklist) } : {},
                );
                const r = await api.get('/auth/me');
                app.hydrate(r.data);
                setOpen(false);
              }, 'Saída registrada com horário real e arredondado.');
              setBusy(false);
            }}
          >
            <p>
              O horário real de saída será registrado agora. O relatório também mostrará o valor
              arredondado para a hora mais próxima.
            </p>
            {driver && crew.vehicle && (
              <VehicleChecklist
                value={checklist}
                onChange={setChecklist}
                minimum={crew.vehicle.mileage || 0}
              />
            )}
            <Button type="submit" busy={busy}>
              Registrar saída
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
