import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { Modal, Button } from './UI';
import VehicleChecklist, { inspectionBody } from './VehicleChecklist';
import { useInspectionDefaults } from '../hooks/useInspectionDefaults';
function Delivery({ vehicle, onChange }) {
  const { value, setValue, minimum, loading, error, retry } = useInspectionDefaults(
    vehicle._id,
    vehicle.mileage,
  );
  useEffect(() => {
    onChange({ vehicle: vehicle._id, checklist: inspectionBody(value), ready: !loading });
  }, [value, loading]);
  return (
    <section>
      <h3>{vehicle.prefix}</h3>
      {error && (
        <p role="alert">
          {error}{' '}
          <Button type="button" onClick={retry}>
            Tentar novamente
          </Button>
        </p>
      )}
      <VehicleChecklist value={value} onChange={setValue} minimum={minimum} />
    </section>
  );
}
export default function MotorcycleExit({ crew }) {
  const app = useApp(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState({});
  const vehicles = (crew.motorcycleDrivers || [])
    .filter((r) => r.driver?._id === app.user._id)
    .map((r) => r.vehicle);
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setReceipts({});
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
                await api.post(`/crews/${crew._id}/leave`, {
                  checklists: vehicles.map((v) => ({
                    vehicle: v._id,
                    checklist: receipts[v._id].checklist,
                  })),
                });
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
            {vehicles.map((v) => (
              <Delivery
                key={v._id}
                vehicle={v}
                onChange={(receipt) => setReceipts((r) => ({ ...r, [v._id]: receipt }))}
              />
            ))}
            <Button
              type="submit"
              busy={busy}
              disabled={vehicles.some((v) => !receipts[v._id]?.ready)}
            >
              Registrar saída
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
