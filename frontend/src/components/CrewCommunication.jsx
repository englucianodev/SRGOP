import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, MessageSquare, Plus, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { fmtDateTime } from '../utils/format';
import { Panel, Select, Input, Textarea, Button, Empty, Modal } from './UI';

export default function CrewCommunication({ crews }) {
  const app = useApp();
  const [query, setQuery] = useSearchParams();
  const admin = app.user.role === 'Administrativo';
  const { data: chats } = useData('/crew-chats', []);
  const [selected, setSelected] = useState('');
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [grant, setGrant] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState([]);
  const end = useRef(null);
  const generation = useRef(0);
  const historyLoaded = useRef(false);
  const active = crews.filter((c) => c.members.length && +new Date(c.shiftEnd) > app.now);
  const mine = active.find((c) => c.members.some((m) => m._id === app.user._id));
  const chat = chats.find((c) => c._id === selected);
  const authorized = !admin || (grant?.chat === selected && grant.expiresAt > app.now);
  const canSend = chat?.canParticipate;
  const options = active.filter(
    (c) =>
      c._id !== mine?._id &&
      (modal !== 'add' || !chat?.memberships.some((m) => m.crew?._id === c._id)),
  );

  useEffect(() => {
    const currentGeneration = ++generation.current;
    if (!selected || !authorized || !chat) {
      setMessages([]);
      setHasMore(false);
      return;
    }
    let current = true;
    api
      .get(`/crew-chats/${selected}/messages`, { quiet: true })
      .then((r) => {
        if (!current || generation.current !== currentGeneration) return;
        setMessages((previous) => {
          const merged = new Map(previous.map((m) => [m._id, m]));
          r.data.items.forEach((m) => merged.set(m._id, m));
          return [...merged.values()].sort((a, b) => a._id.localeCompare(b._id));
        });
        if (!historyLoaded.current) setHasMore(r.data.hasMore);
        setNotice('');
      })
      .catch((e) => {
        if (!current) return;
        setMessages([]);
        setNotice(e.response?.data?.message || 'Não foi possível carregar as mensagens.');
        if (admin && e.response?.status === 403) setGrant(null);
      });
    return () => {
      current = false;
    };
  }, [selected, authorized, Boolean(chat), app.revision, app.chatRevision]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.at(-1)?._id]);

  function select(value) {
    generation.current++;
    historyLoaded.current = false;
    setSelected(value);
    setMessages([]);
    setHasMore(false);
    setGrant(null);
    setReason('');
    setText('');
    setNotice('');
  }
  useEffect(() => {
    const chatId = query.get('chat');
    if (!chatId) return;
    select(chatId);
    setQuery({}, { replace: true });
  }, [query]);
  async function perform(fn, message) {
    setBusy(true);
    try {
      await app.run(fn, message);
    } finally {
      setBusy(false);
    }
  }
  async function older() {
    const currentGeneration = generation.current;
    const chatId = selected;
    await perform(async () => {
      const r = await api.get(`/crew-chats/${chatId}/messages?before=${messages[0]._id}`);
      if (generation.current !== currentGeneration) return;
      historyLoaded.current = true;
      setMessages((previous) => {
        const merged = new Map([...r.data.items, ...previous].map((m) => [m._id, m]));
        return [...merged.values()].sort((a, b) => a._id.localeCompare(b._id));
      });
      setHasMore(r.data.hasMore);
    });
  }
  return (
    <Panel
      className="crew-chat"
      title="Chat entre guarnições"
      subtitle="Conversas restritas aos integrantes em serviço das equipes participantes"
    >
      <div className="chat-toolbar">
        <Select label="Conversa" value={selected} onChange={(e) => select(e.target.value)}>
          <option value="">Selecione uma conversa</option>
          {chats.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button
          disabled={!mine}
          onClick={() => {
            setModal('new');
            setName('');
            setChosen([]);
          }}
        >
          <Plus size={16} />
          Nova conversa
        </Button>
      </div>
      {!mine && <p className="form-note">Para conversar, ingresse em uma guarnição em serviço.</p>}
      {selected && chat && (
        <>
          <div className="chat-toolbar">
            <p>
              <MessageSquare size={16} />{' '}
              {chat.memberships.map((m) => m.crew?.name || 'Guarnição removida').join(' · ')}
            </p>
            {canSend && (
              <Button
                variant="secondary"
                onClick={() => {
                  setModal('add');
                  setChosen([]);
                }}
              >
                Adicionar guarnições
              </Button>
            )}
          </div>
          {admin && !authorized ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const chatId = selected;
                perform(async () => {
                  const r = await api.post(`/crew-chats/${chatId}/access`, { reason });
                  setGrant({ chat: chatId, expiresAt: +new Date(r.data.expiresAt) });
                }, 'Justificativa registrada em auditoria.');
              }}
            >
              <p>
                <ShieldCheck size={18} /> A consulta administrativa exige uma justificativa para
                esta conversa.
              </p>
              <Textarea
                label="Justificativa do acesso"
                required
                minLength={10}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button type="submit" busy={busy}>
                Registrar justificativa e consultar
              </Button>
            </form>
          ) : (
            <>
              {admin && (
                <p className="form-note">
                  Consulta auditada até {new Date(grant.expiresAt).toLocaleTimeString('pt-BR')}. A
                  autorização é restrita a esta sessão.
                </p>
              )}
              {notice && <p role="alert">{notice}</p>}
              <div
                className="message-list chat-messages"
                role="log"
                aria-label="Mensagens da conversa"
                aria-live="polite"
              >
                {hasMore && messages.length > 0 && (
                  <Button variant="secondary" busy={busy} onClick={older}>
                    Carregar mensagens anteriores
                  </Button>
                )}
                {messages.length ? (
                  messages.map((m) => (
                    <article
                      key={m._id}
                      className={`message-item ${m.sender?._id === app.user._id ? 'own' : ''}`}
                    >
                      <header>
                        <strong>
                          {m.sender?.name || 'Usuário removido'} · {m.sourceCrew?.name}
                        </strong>
                        <small>{fmtDateTime(m.createdAt)}</small>
                      </header>
                      <p className="preserve-text">{m.text}</p>
                    </article>
                  ))
                ) : (
                  <Empty text="Nenhuma mensagem nesta conversa." />
                )}
                <div ref={end} />
              </div>
              {canSend ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    perform(async () => {
                      await api.post(`/crew-chats/${selected}/messages`, { text });
                      setText('');
                    });
                  }}
                >
                  <Textarea
                    label="Mensagem"
                    required
                    maxLength={2000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <Button type="submit" busy={busy} disabled={!text.trim()}>
                    <Send size={16} />
                    Enviar
                  </Button>
                </form>
              ) : (
                <p className="form-note">Acesso administrativo somente para consulta.</p>
              )}
            </>
          )}
        </>
      )}
      {modal && (
        <Modal
          title={modal === 'new' ? 'Nova conversa' : 'Adicionar guarnições'}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              perform(async () => {
                if (modal === 'new') {
                  const r = await api.post('/crew-chats', { name, crews: chosen });
                  select(r.data._id);
                } else await api.post(`/crew-chats/${selected}/crews`, { crews: chosen });
                setModal(null);
              }, 'Conversa atualizada.');
            }}
          >
            {modal === 'new' && (
              <Input
                label="Nome da conversa"
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <Select
              label="Guarnições em serviço (selecione uma ou mais)"
              multiple
              required={modal === 'add'}
              size={Math.min(6, Math.max(2, options.length))}
              value={chosen}
              onChange={(e) => setChosen(Array.from(e.target.selectedOptions, (o) => o.value))}
            >
              {options.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} · {c.city?.name}
                </option>
              ))}
            </Select>
            <p className="form-note">
              Sua guarnição participa automaticamente. Equipes adicionadas podem ler o histórico
              desta conversa durante o turno. Novos turnos devem criar outra conversa.
            </p>
            <Button type="submit" busy={busy} disabled={modal === 'add' && !chosen.length}>
              Salvar
            </Button>
          </form>
        </Modal>
      )}
    </Panel>
  );
}
