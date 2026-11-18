import { isOnDuty } from '../utils/duty';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigation } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { createPositionSource, shouldSend } from '../services/positionSource';
import { Button } from './UI';

const COMMON_TEXT = {
  idle: 'Compartilhe a posição da guarnição no mapa durante o serviço.',
  waiting: 'Aguardando permissão e posição do GPS…',
  unavailable: 'GPS sem posição atual. Verifique o sinal e a localização do aparelho.',
  offDuty: 'Serviço encerrado. Compartilhamento desligado.',
  stopped: 'Compartilhamento encerrado.',
};
// Texts that depend on where the position comes from (see positionSource.js).
const SOURCE_TEXT = {
  browser: {
    ...COMMON_TEXT,
    hint: 'Com a tela bloqueada o envio é interrompido. Para manter a posição, use o aplicativo Android.',
    unsupported: 'O GPS exige HTTPS (ou localhost) e um navegador com localização.',
    denied: 'Permissão de localização negada. Autorize o GPS nas configurações do navegador.',
  },
  native: {
    ...COMMON_TEXT,
    hint: 'O envio continua com a tela bloqueada até você desligar o GPS ou o serviço terminar.',
    unsupported: 'O GPS não está disponível neste aparelho.',
    denied:
      'Localização negada ou desligada no aparelho. Autorize o GPS nas configurações do aplicativo.',
    failed: 'Não foi possível iniciar o GPS do aplicativo. Tente ligar novamente.',
    'notifications-blocked':
      'Notificações bloqueadas: o envio continua, mas o aviso permanente não aparece.',
    stopFailed: 'Não foi possível encerrar o GPS. Feche o aplicativo para interromper o envio.',
  },
};

export default function GpsControl() {
  const app = useApp();
  const { data: crews } = useData('/crews', []);
  const crew = crews.find(
    (c) => c.members.some((m) => m._id === app.user._id) && isOnDuty(c, app.now),
  );
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('');
  const source = useMemo(() => createPositionSource(), []);
  const text = SOURCE_TEXT[source.kind];
  const crewRef = useRef(crew);
  useEffect(() => {
    crewRef.current = crew;
  });
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
        !shouldSend({ fix: latest, lastSentAt: lastSent, busy: Boolean(pending), now: Date.now() })
      )
        return;
      lastSent = Date.now();
      const { latitude, longitude, accuracy } = latest;
      pending = api.patch(
        `/crews/${crewId}/gps`,
        { enabled: true, latitude, longitude, accuracy },
        { quiet: true, retry: true },
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
    const onFix = (fix) => {
      if (stopped) return;
      // The native source keeps delivering with the screen locked, when the
      // interface clock may be throttled: recheck the shift on every fix so
      // nobody is tracked after going off duty.
      if (!isOnDuty(crewRef.current)) {
        setStatus(text.offDuty);
        setEnabled(false);
        return;
      }
      latest = fix;
      report();
    };
    const onError = ({ reason, fatal }) => {
      if (stopped) return;
      setStatus(text[reason]);
      if (fatal) setEnabled(false);
    };
    setStatus(text.waiting);
    const stopSource = source.start({ onFix, onError });
    return () => {
      stopped = true;
      // Stopping the native source also removes its foreground service.
      stopSource().catch(() => setStatus(text.stopFailed));
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
        <small role="status">{status || text.idle}</small>
        <small>{text.hint}</small>
      </div>
      <Button
        variant={enabled ? 'danger-ghost' : 'secondary'}
        onClick={() => {
          if (!enabled && !source.isSupported()) {
            setStatus(text.unsupported);
            return;
          }
          setEnabled((v) => !v);
          if (enabled) setStatus(text.stopped);
        }}
      >
        {enabled ? 'Desligar GPS' : 'Ligar GPS'}
      </Button>
    </div>
  );
}
