import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { Modal, Button, Select } from './UI';
import VehicleChecklist, { inspectionBody } from './VehicleChecklist';
import { useInspectionDefaults } from '../hooks/useInspectionDefaults';
import { useData } from '../hooks/useData';
function MotorcycleReceipt({ vehicle, onChange }) {
  const { value, setValue, minimum, loading, error, retry } = useInspectionDefaults(
    vehicle._id,
    vehicle.mileage,
  );
  useEffect(() => {
    onChange({ vehicle: vehicle._id, checklist: inspectionBody(value), ready: !loading });
  }, [value, loading]);
  return (
    <section>
      <h3>
        {vehicle.prefix} · {vehicle.plate}
      </h3>
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
export default function JoinCrewDialog({ crew, onClose }) {
  const app = useApp();
  const [driver, setDriver] = useState(false),
    [period, setPeriod] = useState(crew.dutyPeriod || '');
  const motorcycle = crew.type === 'Motocicleta' || crew.vehicle?.type === 'Motocicleta';
  const {
    value: checklist,
    setValue: setChecklist,
    minimum,
    loading,
    error,
    retry,
  } = useInspectionDefaults(!motorcycle ? crew.vehicle?._id : null, crew.vehicle?.mileage || 0);
  const { data: available } = useData(motorcycle ? `/crews/${crew._id}/motorcycles` : null, []);
  const [selected, setSelected] = useState([]);
  const vehicleSnapshots = useRef({});
  available.forEach((v) => {
    vehicleSnapshots.current[v._id] = v;
  });
  const [receipts, setReceipts] = useState({});
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
              ...(motorcycle ? { dutyPeriod: period } : {}),
              ...(motorcycle && driver
                ? {
                    motorcycles: selected.map((id) => ({
                      vehicle: id,
                      checklist: receipts[id].checklist,
                    })),
                  }
                : {}),
              ...(driver && crew.vehicle && !motorcycle
                ? { checklist: inspectionBody(checklist) }
                : {}),
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
          <option value="true" disabled={!motorcycle && Boolean(crew.driver)}>
            Motorista
          </option>
        </Select>
        {motorcycle ? (
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
        {driver && crew.vehicle && !motorcycle && (
          <>
            <h3>Checklist de recebimento · {crew.vehicle.prefix}</h3>
            <VehicleChecklist value={checklist} onChange={setChecklist} minimum={minimum} />
          </>
        )}
        {motorcycle && driver && (
          <>
            <h3>Motocicletas para o serviço</h3>
            <p>Selecione pelo menos uma motocicleta. Cada uma exige checklist de recebimento.</p>
            {[
              ...available,
              ...selected
                .filter((id) => !available.some((v) => v._id === id))
                .map((id) => vehicleSnapshots.current[id]),
            ]
              .filter(Boolean)
              .map((v) => (
                <label className="checkbox-line" key={v._id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(v._id)}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked ? [...ids, v._id] : ids.filter((id) => id !== v._id),
                      )
                    }
                  />
                  {v.prefix} · {v.plate}
                </label>
              ))}
            {!available.length && <p>Nenhuma motocicleta disponível neste município.</p>}
            {selected.map((id) => (
              <MotorcycleReceipt
                key={id}
                vehicle={vehicleSnapshots.current[id]}
                onChange={(receipt) => setReceipts((r) => ({ ...r, [id]: receipt }))}
              />
            ))}
          </>
        )}
        {error && (
          <p role="alert">
            {error}{' '}
            <Button type="button" onClick={retry}>
              Tentar novamente
            </Button>
          </p>
        )}
        <Button
          type="submit"
          busy={busy}
          disabled={
            (!motorcycle && (crew.vehicle?.provisional || (driver && loading))) ||
            (motorcycle &&
              driver &&
              (!selected.length || selected.some((id) => !receipts[id]?.ready)))
          }
        >
          Confirmar ingresso
        </Button>
      </form>
    </Modal>
  );
}
