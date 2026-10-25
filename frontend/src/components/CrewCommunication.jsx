import { useState } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { fmtDateTime } from '../utils/format';
import { Panel, Select, Textarea, Button, Empty } from './UI';

export default function CrewCommunication({ crews }) {
  const app = useApp();
  const { data: messages } = useData('/crew-messages', []);
  const [targetCrew, setTargetCrew] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const active = crews.filter((c) => c.members.length && +new Date(c.shiftEnd) > app.now);
  const canSend =
    app.user.role !== 'Praça' || active.some((c) => c.members.some((m) => m._id === app.user._id));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await app.run(async () => {
      await api.post('/crew-messages', { targetCrew, text });
      setText('');
    }, 'Mensagem enviada à guarnição.');
    setBusy(false);
  }
  return (
    <Panel
      title="Comunicação operacional"
      subtitle="Mensagens entre equipes em serviço e a central"
    >
      <div className="communication-grid">
        <div className="message-list" aria-live="polite">
          {messages.length ? (
            messages.map((m) => (
              <article
                key={m._id}
                className={`message-item ${m.sender?._id === app.user._id ? 'own' : ''}`}
              >
                <header>
                  <strong>
                    {m.sourceCrew?.name || 'Central'} → {m.targetCrew?.name}
                  </strong>
                  <small>{fmtDateTime(m.createdAt)}</small>
                </header>
                <p className="preserve-text">{m.text}</p>
                <small>{m.sender?.name}</small>
              </article>
            ))
          ) : (
            <Empty text="Nenhuma mensagem operacional." />
          )}
        </div>
        <form onSubmit={submit}>
          <div className="communication-heading">
            <MessageSquare size={20} />
            <h3>Enviar mensagem</h3>
          </div>
          <Select
            label="Guarnição destinatária"
            required
            disabled={!canSend}
            value={targetCrew}
            onChange={(e) => setTargetCrew(e.target.value)}
          >
            <option value="">Selecione</option>
            {active.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} · {c.city?.name}
              </option>
            ))}
          </Select>
          <Textarea
            label="Mensagem"
            required
            maxLength={2000}
            disabled={!canSend}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" busy={busy} disabled={!canSend || !active.length}>
            <Send size={16} />
            Enviar mensagem
          </Button>
          {!canSend && (
            <p className="form-note">
              Ingresse em uma guarnição para se comunicar durante o serviço.
            </p>
          )}
          <p className="form-note">
            Mensagens são registradas com autor e horário. Não substituem o despacho formal de
            ocorrências.
          </p>
        </form>
      </div>
    </Panel>
  );
}
