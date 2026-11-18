import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import './startup.css';

const SLOW_AFTER_SECONDS = 90;
// A cold start usually takes under a minute; the bar approaches the end without reaching it.
const EXPECTED_SECONDS = 60;
const progressFor = (seconds) => Math.round(95 * (1 - Math.exp(-seconds / (EXPECTED_SECONDS / 2))));

function messageFor(waiting, seconds) {
  if (!waiting) return 'Carregando informações…';
  if (seconds < SLOW_AFTER_SECONDS)
    return 'O servidor está iniciando. O primeiro acesso depois de um período sem uso pode levar até um minuto.';
  return 'Está demorando mais que o normal. Continuamos tentando; confira também sua conexão com a internet.';
}

/** Shown while the session is loaded; replaces the error dialog during a server cold start. */
export default function StartupScreen({ waiting = false }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!waiting) return undefined;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [waiting]);
  return (
    <div className="startup" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={28} aria-hidden="true" />
      <strong>{waiting ? 'Conectando ao servidor…' : 'SRGOP'}</strong>
      <p>{messageFor(waiting, seconds)}</p>
      {waiting && (
        <>
          <div
            className="startup-bar"
            role="progressbar"
            aria-label="Progresso da conexão"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressFor(seconds)}
          >
            <span style={{ width: `${progressFor(seconds)}%` }} />
          </div>
          <small>Aguardando há {seconds} s. Não é preciso recarregar a página.</small>
        </>
      )}
    </div>
  );
}
