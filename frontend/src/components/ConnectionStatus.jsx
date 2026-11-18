import { useSyncExternalStore } from 'react';
import { connection } from '../services/connection';

export function useConnectionState(monitor = connection) {
  return useSyncExternalStore(monitor.subscribe, monitor.state);
}

export default function ConnectionStatus({ monitor = connection }) {
  const state = useConnectionState(monitor);
  if (state === 'online') return null;
  return (
    <div className={`connection-status ${state}`} role="status">
      {state === 'reconectando' ? (
        <>
          <span className="reconnect-spinner" aria-hidden="true" />
          Reconectando…
        </>
      ) : (
        'Conexão restabelecida'
      )}
    </div>
  );
}
