import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { Modal, Button, Select } from './UI';
import VehicleChecklist, { blankInspection, inspectionBody } from './VehicleChecklist';
export default function JoinCrewDialog({ crew, onClose }) {
  const app = useApp();
  const [driver, setDriver] = useState(false),
    [period, setPeriod] = useState(crew.dutyPeriod || '');
  const [checklist, setChecklist] = useState(() => blankInspection(crew.vehicle?.mileage || 0));
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Ingressar em ${crew.name}`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await app.run(async () => {
            await api.post(`/crews/${crew._id}/join`, {
              driver,
              ...(crew.vehicle?.type === 'Motocicleta' ? { dutyPeriod: period } : {}),
              ...(driver && crew.vehicle ? { checklist: inspectionBody(checklist) } : {}),
            });
            const r = await api.get('/auth/me');
            app.hydrate(r.data);
            onClose();
          }, 'Ingresso registrado.');
          setBusy(false);
        }}
      >
        <Select
          label="Função na guarnição"
          value={String(driver)}
          onChange={(e) => setDriver(e.target.value === 'true')}
        >
          <option value="false">Integrante</option>
          <option value="true" disabled={Boolean(crew.driver)}>
            Motorista
          </option>
        </Select>
        {crew.vehicle?.type === 'Motocicleta' ? (
          <>
            <Select
              label="Turno da motocicleta"
              required
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="">Selecione</option>
              {['Manhã', 'Tarde', 'Noite'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
            <p className="form-note">
              O serviço vai da sua entrada até a saída real, com arredondamento para a hora mais
              próxima nos relatórios. Não há encerramento automático de 24 horas.
            </p>
          </>
        ) : (
          <p className="form-note">
            Serviço das 8h às 8h seguintes, independentemente da hora de ingresso.
          </p>
        )}
        {driver && crew.vehicle && (
          <>
            <h3>Checklist de recebimento · {crew.vehicle.prefix}</h3>
            <VehicleChecklist
              value={checklist}
              onChange={setChecklist}
              minimum={crew.vehicle.mileage || 0}
            />
          </>
        )}
        <Button type="submit" busy={busy} disabled={crew.vehicle?.provisional}>
          Confirmar ingresso
        </Button>
      </form>
    </Modal>
  );
}
