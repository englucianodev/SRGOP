import { isOnDuty, dutyClock } from '../utils/duty';
import { useEffect, useState } from 'react';
import { Navigation } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { Button } from './UI';

export default function GpsControl() {
  const app = useApp();
  const { data: crews } = useData('/crews', []);
  const crew = crews.find(
    (c) => c.members.some((m) => m._id === app.user._id) && isOnDuty(c, app.now),
  );
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('');
  const crewId = crew?._id;
  const shift = crew?.shift;
  useEffect(() => {
    if (!enabled || !crewId) return;
    let stopped = false;
    let latest;
    let pending;
    let lastSent = 0;
    const report = async () => {
      if (
        stopped ||
        pending ||
        !latest ||
        Date.now() - latest.timestamp > 30000 ||
        Date.now() - lastSent < 10000
      )
        return;
      lastSent = Date.now();
      const { latitude, longitude, accuracy } = latest.coords;
      pending = api.patch(
        `/crews/${crewId}/gps`,
        { enabled: true, latitude, longitude, accuracy },
        { quiet: true },
      );
      try {
        await pending;
        if (!stopped) setStatus(`GPS compartilhado às ${new Date().toLocaleTimeString('pt-BR')}`);
      } catch (e) {
        if (!stopped) {
          setStatus(e.response?.data?.message || 'Falha ao enviar posição. Tentando reconectar…');
          if ([401, 403, 409].includes(e.response?.status)) setEnabled(false);
        }
      } finally {
        pending = null;
      }
    };
    const success = (position) => {
      if (!stopped) {
        latest = position;
        report();
      }
    };
    const failure = (error) => {
      if (stopped) return;
      setStatus(
        error.code === 1
          ? 'Permissão de localização negada. Autorize o GPS nas configurações do navegador.'
          : 'GPS sem posição atual. Verifique o sinal e a localização do aparelho.',
      );
      if (error.code === 1) setEnabled(false);
    };
    const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 };
    setStatus('Aguardando permissão e posição do GPS…');
    const watch = navigator.geolocation.watchPosition(success, failure, options);
    const timer = setInterval(
      () => navigator.geolocation.getCurrentPosition(success, failure, options),
      15000,
    );
    return () => {
      stopped = true;
      clearInterval(timer);
      navigator.geolocation.clearWatch(watch);
      Promise.resolve(pending)
        .catch(() => {})
        .then(() => api.patch(`/crews/${crewId}/gps`, { enabled: false }, { quiet: true }))
        .catch(() => {});
    };
  }, [enabled, crewId, shift]);
  useEffect(() => {
    setEnabled(false);
    setStatus('');
  }, [crewId, shift]);
  if (!crew) return null;
  return (
    <div className="gps-control" role="region" aria-label="Compartilhamento de localização">
      <Navigation size={18} />
      <div>
        <strong>
          {crew.name} · GPS {enabled ? 'ligado' : 'desligado'}
        </strong>
        <small role="status">
          {status || 'Compartilhe a posição da guarnição no mapa durante o serviço.'}
        </small>
      </div>
      <Button
        variant={enabled ? 'danger-ghost' : 'secondary'}
        onClick={() => {
          if (!enabled && (!window.isSecureContext || !navigator.geolocation)) {
            setStatus('O GPS exige HTTPS (ou localhost) e um navegador com localização.');
            return;
          }
          setEnabled((v) => !v);
          if (enabled) setStatus('Compartilhamento encerrado.');
        }}
      >
        {enabled ? 'Desligar GPS' : 'Ligar GPS'}
      </Button>
    </div>
  );
}
