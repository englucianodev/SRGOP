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
  const [motorcycleRole, setMotorcycleRole] = useState('');
  const hasDriver = !motorcycle && Boolean(crew.driver);
  const effectiveDriver = motorcycle ? motorcycleRole === 'Piloto' : driver && !hasDriver;
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
              driver: effectiveDriver,
              ...(motorcycle
                ? {
                    dutyPeriod: period,
                    motorcycle: selected[0],
                    motorcycleRole,
                    ...(effectiveDriver ? { checklist: receipts[selected[0]].checklist } : {}),
                  }
                : {}),
              ...(effectiveDriver && crew.vehicle && !motorcycle
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
        {motorcycle ? (
          <Select
            label="Função na motocicleta"
            required
            value={motorcycleRole}
            onChange={(e) => {
              setMotorcycleRole(e.target.value);
              setSelected([]);
            }}
          >
            <option value="">Selecione</option>
            <option>Piloto</option>
            <option>Garupa</option>
          </Select>
        ) : (
          <Select
            label="Função na guarnição"
            value={String(effectiveDriver)}
            disabled={hasDriver}
            onChange={(e) => setDriver(e.target.value === 'true')}
          >
            <option value="false">Integrante</option>
            <option value="true" disabled={hasDriver}>
              Motorista
            </option>
          </Select>
        )}
        {hasDriver && (
          <p className="form-note">
            Esta guarnição já possui motorista. Você ingressará automaticamente como integrante.
          </p>
        )}
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
        {effectiveDriver && crew.vehicle && !motorcycle && (
          <>
            <h3>Checklist de recebimento · {crew.vehicle.prefix}</h3>
            <VehicleChecklist value={checklist} onChange={setChecklist} minimum={minimum} />
          </>
        )}
        {!motorcycle && !crew.driver && crew.members.length >= 3 && !effectiveDriver && (
          <p className="form-note">
            A última vaga é reservada ao motorista. Selecione essa função para ingressar.
          </p>
        )}
        {motorcycle && (
          <>
            <Select
              label="Motocicleta para o serviço"
              required
              value={selected[0] || ''}
              onChange={(e) => setSelected(e.target.value ? [e.target.value] : [])}
            >
              <option value="">Selecione uma motocicleta</option>
              {[
                ...available,
                ...selected
                  .filter((id) => !available.some((v) => v._id === id))
                  .map((id) => vehicleSnapshots.current[id]),
              ]
                .filter(Boolean)
                .map((v) => (
                  <option
                    key={v._id}
                    value={v._id}
                    disabled={
                      v.occupants >= 2 ||
                      (motorcycleRole === 'Piloto'
                        ? v.pilotOccupied
                        : motorcycleRole === 'Garupa'
                          ? v.passengerOccupied
                          : false)
                    }
                  >
                    {v.prefix} · {v.plate} · {v.occupants || 0}/2 ocupantes
                  </option>
                ))}
            </Select>
            {!available.length && <p>Nenhuma motocicleta disponível neste município.</p>}
            {effectiveDriver &&
              selected.map((id) => (
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
            (!motorcycle &&
              (crew.members.length >= 4 ||
                (!crew.driver && !effectiveDriver && crew.members.length >= 3) ||
                crew.vehicle?.provisional ||
                (effectiveDriver && loading))) ||
            (motorcycle &&
              (!motorcycleRole ||
                selected.length !== 1 ||
                (effectiveDriver && !receipts[selected[0]]?.ready) ||
                !available.some(
                  (v) =>
                    v._id === selected[0] &&
                    v.occupants < 2 &&
                    !(motorcycleRole === 'Piloto' ? v.pilotOccupied : v.passengerOccupied),
                )))
          }
        >
          Confirmar ingresso
        </Button>
      </form>
    </Modal>
  );
}
