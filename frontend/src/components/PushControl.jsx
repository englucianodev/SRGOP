import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BellRing } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { pushSupport, syncPush, enablePush, disablePush } from '../services/push';
import { Button } from './UI';

const DESCRIPTION = {
  on: 'Despacho e Urgência UU chegam a este aparelho mesmo com o aplicativo fechado.',
  off: 'Receba Despacho e Urgência UU mesmo com o aplicativo fechado ou o celular no bolso.',
  denied:
    'Notificações bloqueadas para este site. Libere a permissão de notificações nas configurações do navegador e recarregue a página.',
  ios: 'No iPhone, as notificações só funcionam com o SRGOP instalado na tela inicial: toque em Compartilhar, escolha Adicionar à Tela de Início e abra o aplicativo por lá.',
};
// Shown after a failed attempt to turn notifications on.
const NOT_ENABLED = {
  off: 'A permissão de notificações não foi concedida.',
  unavailable:
    'O aplicativo ainda está sendo preparado neste aparelho. Recarregue a página e tente novamente.',
};
const FAILED = 'Não foi possível concluir. Verifique a conexão e tente novamente.';

export default function PushControl() {
  const app = useApp();
  const location = useLocation();
  const [status, setStatus] = useState('hidden');
  const [publicKey, setPublicKey] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const userId = app.user._id;
  useEffect(() => {
    let active = true;
    const support = pushSupport();
    setStatus('hidden');
    setNote('');
    if (support === 'unsupported') return undefined;
    api
      .get('/push/config', { quiet: true })
      .then(async ({ data }) => {
        if (!active || !data.enabled) return;
        if (support === 'ios-install') {
          setStatus('ios');
          return;
        }
        // A subscription this device already has is bound again to the session that just began.
        const current = await syncPush(data.publicKey).catch(() => 'off');
        if (!active) return;
        setPublicKey(data.publicKey);
        setStatus(current === 'unavailable' ? 'hidden' : current);
      })
      .catch(() => {
        /* Push is optional: without the configuration the control simply stays hidden. */
      });
    return () => {
      active = false;
    };
  }, [userId]);
  const toggle = async () => {
    setBusy(true);
    setNote('');
    try {
      const next = status === 'on' ? await disablePush() : await enablePush(publicKey);
      if (next !== 'unavailable') setStatus(next);
      if (status !== 'on' && NOT_ENABLED[next]) setNote(NOT_ENABLED[next]);
    } catch (error) {
      setNote(error.response?.data?.message || FAILED);
    } finally {
      setBusy(false);
    }
  };
  if (status === 'hidden' || location.pathname !== '/dashboard') return null;
  const enabled = status === 'on';
  return (
    <div className="gps-control" role="region" aria-label="Notificações neste aparelho">
      <BellRing size={18} />
      <div>
        <strong>Notificações {enabled ? 'ativadas' : 'desativadas'} neste aparelho</strong>
        <small role="status">{note || DESCRIPTION[status]}</small>
      </div>
      {(enabled || status === 'off') && (
        <Button variant={enabled ? 'danger-ghost' : 'secondary'} busy={busy} onClick={toggle}>
          {enabled ? 'Desativar' : 'Ativar notificações'}
        </Button>
      )}
    </div>
  );
}
