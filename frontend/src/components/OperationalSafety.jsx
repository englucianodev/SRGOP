import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Siren } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { isOnDuty } from '../utils/duty';
import { fmtDateTime } from '../utils/format';
import { Button, Modal, Textarea } from './UI';
import VehicleChecklist, { blankInspection, inspectionBody } from './VehicleChecklist';
function ReturnChecklist({ record, done }) {
  const [value, setValue] = useState(() => blankInspection(record.vehicle?.mileage || 0));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      title={
        record.pendingIntake
          ? 'Checklist obrigatório de recebimento'
          : 'Checklist obrigatório de entrega'
      }
      mandatory
    >
      <p>
        <strong>{record.vehicle?.prefix}</strong> · {record.crew?.name}
      </p>
      <p>
        {record.pendingIntake
          ? 'Confirme a viatura que está recebendo. Se houver entrega anterior pendente, ela deve ser registrada primeiro.'
          : 'O serviço ou a responsabilidade de motorista terminou. Registre obrigatoriamente como a viatura foi entregue.'}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api.post(`/vehicle-checklists/${record._id}`, inspectionBody(value), {
              quiet: true,
            });
            done(record._id);
          } catch (e) {
            setError(e.response?.data?.message || 'Não foi possível salvar o checklist.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <VehicleChecklist
          value={value}
          onChange={setValue}
          minimum={record.vehicle?.mileage || 0}
        />
        {error && <p role="alert">{error}</p>}
        <Button type="submit" busy={busy}>
          Registrar checklist
        </Button>
      </form>
    </Modal>
  );
}
export default function OperationalSafety() {
  const app = useApp(),
    navigate = useNavigate();
  const { data: crews } = useData('/crews', []);
  const { data: pending, setData: setPending } = useData('/vehicle-checklists/pending', []);
  const { data: emergencies, setData: setEmergencies } = useData('/emergencies', []);
  const mine = crews.find(
    (c) => isOnDuty(c, app.now) && c.members.some((m) => m._id === app.user._id),
  );
  const alert = emergencies.find((e) => !e.acknowledgedBy.includes(app.user._id));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reason, setReason] = useState('');
  const audio = useRef(null);
  useEffect(() => {
    if (!alert) return;
    const unlock = () => {
      try {
        audio.current ||= new (window.AudioContext || window.webkitAudioContext)();
        audio.current.resume().catch(() => {});
      } catch {}
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    unlock();
    const beep = () => {
      const ctx = audio.current;
      if (ctx?.state !== 'running') return;
      [1100, 750, 1100].forEach((frequency, i) => {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain();
        osc.frequency.value = frequency;
        gain.gain.value = 0.13;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.22);
        osc.stop(ctx.currentTime + i * 0.22 + 0.18);
      });
    };
    beep();
    const timer = setInterval(beep, 1400);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [alert?._id]);
  useEffect(
    () => () => {
      audio.current?.close().catch(() => {});
    },
    [],
  );
  async function acknowledge(row, map = false) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/emergencies/${row._id}/acknowledge`, {}, { quiet: true });
      setEmergencies((items) =>
        items.map((e) =>
          e._id === row._id ? { ...e, acknowledgedBy: [...e.acknowledgedBy, app.user._id] } : e,
        ),
      );
      app.refresh();
      if (map) navigate(`/mapa?emergency=${row._id}`);
    } catch (e) {
      setError(e.response?.data?.message || 'Não foi possível registrar a ciência.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {mine && (
        <div className="urgency-toolbar">
          <Button
            variant="danger"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              const position = await Promise.race([
                new Promise((resolve) =>
                  navigator.geolocation
                    ? navigator.geolocation.getCurrentPosition(
                        (p) =>
                          resolve({
                            latitude: p.coords.latitude,
                            longitude: p.coords.longitude,
                            accuracy: p.coords.accuracy,
                          }),
                        () => resolve({}),
                        { enableHighAccuracy: true, timeout: 1500, maximumAge: 10000 },
                      )
                    : resolve({}),
                ),
                new Promise((resolve) => setTimeout(() => resolve({}), 1600)),
              ]);
              try {
                await api.post('/emergencies', position, { quiet: true });
                app.refresh();
              } catch (e) {
                setError(
                  e.response?.data?.message ||
                    'O pedido não foi enviado. Verifique a conexão e acione a central por outro meio.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Siren size={19} />
            Urgência UU
          </Button>
          <span>Apoio urgente para todos os policiais em serviço.</span>
        </div>
      )}
      {!!emergencies.length && (
        <div className="urgency-status">
          Urgência UU ativa:{' '}
          {emergencies.map((e) => (
            <Button
              key={e._id}
              variant="danger-ghost"
              onClick={() =>
                setEmergencies((items) =>
                  items.map((row) =>
                    row._id === e._id
                      ? {
                          ...row,
                          acknowledgedBy: row.acknowledgedBy.filter((id) => id !== app.user._id),
                        }
                      : row,
                  ),
                )
              }
            >
              {e.actorName} · {e.cityName}
            </Button>
          ))}
        </div>
      )}
      {error && !alert && <p role="alert">{error}</p>}
      {alert ? (
        <Modal title="URGÊNCIA UU — PRIORIDADE MÁXIMA" mandatory>
          <div className="urgency-alert" role="alert">
            <Siren size={32} />
            <h2>{alert.actorName}</h2>
            <p>
              {alert.crewName} · {alert.cityName}
            </p>
            <p>Pedido de apoio urgente em {fmtDateTime(alert.createdAt)}.</p>
            <p>
              {Number.isFinite(alert.latitude)
                ? `Localização registrada em ${fmtDateTime(alert.locatedAt)}.`
                : 'Sem coordenadas GPS. O mapa indicará o município, sem inventar a posição da equipe.'}
            </p>
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="form-actions">
            <Button variant="danger" busy={busy} onClick={() => acknowledge(alert, true)}>
              Ver localização no mapa
            </Button>
            <Button variant="secondary" busy={busy} onClick={() => acknowledge(alert)}>
              Dar ciência e silenciar para mim
            </Button>
          </div>
          {(alert.actor === app.user._id || app.user.role !== 'Praça') && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api.post(`/emergencies/${alert._id}/resolve`, { reason }, { quiet: true });
                  setEmergencies((items) => items.filter((row) => row._id !== alert._id));
                  setReason('');
                  app.refresh();
                } catch (e) {
                  setError(e.response?.data?.message || 'Não foi possível encerrar a urgência.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Textarea
                label="Justificativa para encerrar a urgência"
                required
                minLength={5}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button type="submit" busy={busy}>
                Encerrar Urgência UU
              </Button>
            </form>
          )}
        </Modal>
      ) : pending[0] ? (
        <ReturnChecklist
          key={pending[0]._id}
          record={pending[0]}
          done={(id) => {
            setPending((items) => items.filter((row) => row._id !== id));
            app.refresh();
          }}
        />
      ) : null}
    </>
  );
}
