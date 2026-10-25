import { useEffect, useState } from 'react';
import { Save, Moon, Sun, Volume2, Bell, Plus, Trash2, Shield } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { dateKey } from '../utils/format';
import { PageTitle, Panel, Button, Input, Select, Textarea, Loading } from '../components/UI';
const modules = [
  'Alertas',
  'Operações',
  'Armas Apreendidas',
  'Veículos Recuperados',
  'Ocorrências atendidas',
  'Em andamento',
  'CPU',
];
export default function Settings() {
  const app = useApp();
  const admin = app.user.role === 'Administrativo';
  const { data } = useData('/settings');
  const [form, setForm] = useState(null);
  const [types, setTypes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) {
      const {
        institution,
        inactivityMinutes,
        alertMinutes,
        soundEnabled,
        notificationsEnabled,
        modules,
        crimeTypes,
        operations,
      } = data;
      setForm({
        institution,
        inactivityMinutes,
        alertMinutes,
        soundEnabled,
        notificationsEnabled,
        modules,
        crimeTypes,
        operations: operations.map(({ name, objective, day }) => ({ name, objective, day })),
      });
      setTypes(crimeTypes.join('\n'));
    }
  }, [data]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    await app.run(async () => {
      const r = await api.put('/settings', {
        ...form,
        crimeTypes: [
          ...new Set(
            types
              .split('\n')
              .map((t) => t.trim())
              .filter(Boolean),
          ),
        ],
      });
      app.setSettings(r.data);
    }, 'Configurações salvas.');
    setBusy(false);
  }
  return (
    <>
      <PageTitle title="Configurações" description="Preferências de uso e parâmetros da central." />
      <Panel title="Seu ambiente" subtitle="Preferências salvas neste dispositivo">
        <div className="preference-row">
          <div>
            <strong>Aparência do sistema</strong>
            <p>Escolha o tema mais confortável para seu turno.</p>
          </div>
          <div className="segmented">
            <button
              className={app.theme === 'light' ? 'selected' : ''}
              onClick={() => app.setTheme('light')}
            >
              <Sun size={17} />
              Claro
            </button>
            <button
              className={app.theme === 'dark' ? 'selected' : ''}
              onClick={() => app.setTheme('dark')}
            >
              <Moon size={17} />
              Escuro
            </button>
          </div>
        </div>
        <div className="preference-row">
          <div>
            <strong>
              <Volume2 size={17} />
              Sons de alerta
            </strong>
            <p>Reproduzir aviso ao receber um despacho. Exige interação prévia com a página.</p>
          </div>
          <label className="switch">
            <input
              aria-label="Ativar sons neste dispositivo"
              type="checkbox"
              checked={app.sound}
              onChange={(e) => app.setSound(e.target.checked)}
            />
            <span />
          </label>
        </div>
        <div className="preference-row">
          <div>
            <strong>
              <Bell size={17} />
              Avisos na tela
            </strong>
            <p>Exibir notificações recebidas pela central.</p>
          </div>
          <label className="switch">
            <input
              aria-label="Ativar notificações neste dispositivo"
              type="checkbox"
              checked={app.notifications}
              onChange={(e) => app.setNotifications(e.target.checked)}
            />
            <span />
          </label>
        </div>
      </Panel>
      {admin ? (
        !form ? (
          <Loading />
        ) : (
          <form onSubmit={save}>
            <Panel
              title="Parâmetros institucionais"
              subtitle="Estas configurações se aplicam a todos os usuários"
            >
              <div className="padded">
                <Input
                  label="Identificação do batalhão"
                  required
                  minLength={3}
                  maxLength={150}
                  value={form.institution}
                  onChange={(e) => set('institution', e.target.value)}
                />
                <div className="form-grid">
                  <Input
                    label="Inatividade até logout (minutos)"
                    type="number"
                    required
                    min="1"
                    max="60"
                    value={form.inactivityMinutes}
                    onChange={(e) => set('inactivityMinutes', Number(e.target.value))}
                  />
                  <Input
                    label="Alerta de ocorrência sem despacho (minutos)"
                    type="number"
                    required
                    min="1"
                    max="120"
                    value={form.alertMinutes}
                    onChange={(e) => set('alertMinutes', Number(e.target.value))}
                  />
                </div>
                <div className="checkbox-row">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={form.soundEnabled}
                      onChange={(e) => set('soundEnabled', e.target.checked)}
                    />
                    Permitir alertas sonoros
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={form.notificationsEnabled}
                      onChange={(e) => set('notificationsEnabled', e.target.checked)}
                    />
                    Permitir avisos de notificação
                  </label>
                </div>
              </div>
            </Panel>
            <div className="two-columns">
              <Panel title="Módulos do Dashboard">
                <div className="module-list">
                  {modules.map((m) => (
                    <label className="checkbox" key={m}>
                      <input
                        type="checkbox"
                        checked={form.modules.includes(m)}
                        onChange={(e) =>
                          set(
                            'modules',
                            e.target.checked
                              ? [...form.modules, m]
                              : form.modules.filter((v) => v !== m),
                          )
                        }
                      />
                      {m}
                    </label>
                  ))}
                </div>
              </Panel>
              <Panel title="Tipos de crime">
                <div className="padded">
                  <Textarea
                    label="Um tipo por linha"
                    required
                    rows={7}
                    value={types}
                    onChange={(e) => setTypes(e.target.value)}
                  />
                  <p className="form-note">Registros antigos mantêm a classificação original.</p>
                </div>
              </Panel>
            </div>
            <Panel
              title="Operações programadas"
              subtitle="Nome e objetivo aparecem no Dashboard na data definida"
              actions={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    set('operations', [
                      ...form.operations,
                      { name: '', objective: '', day: dateKey() },
                    ])
                  }
                >
                  <Plus size={16} />
                  Adicionar
                </Button>
              }
            >
              <div className="padded">
                {form.operations.map((o, i) => (
                  <div className="operation-editor" key={i}>
                    <div className="form-grid">
                      <Input
                        label="Nome da operação"
                        required
                        minLength={2}
                        maxLength={120}
                        value={o.name}
                        onChange={(e) =>
                          set(
                            'operations',
                            form.operations.map((v, j) =>
                              j === i ? { ...v, name: e.target.value } : v,
                            ),
                          )
                        }
                      />
                      <Input
                        label="Data"
                        type="date"
                        required
                        value={o.day}
                        onChange={(e) =>
                          set(
                            'operations',
                            form.operations.map((v, j) =>
                              j === i ? { ...v, day: e.target.value } : v,
                            ),
                          )
                        }
                      />
                    </div>
                    <Textarea
                      label="Objetivo"
                      required
                      minLength={5}
                      maxLength={1000}
                      value={o.objective}
                      onChange={(e) =>
                        set(
                          'operations',
                          form.operations.map((v, j) =>
                            j === i ? { ...v, objective: e.target.value } : v,
                          ),
                        )
                      }
                    />
                    <Button
                      variant="danger-ghost"
                      type="button"
                      onClick={() =>
                        set(
                          'operations',
                          form.operations.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 size={15} />
                      Remover operação
                    </Button>
                  </div>
                ))}
                {!form.operations.length && <p className="muted">Nenhuma operação programada.</p>}
              </div>
            </Panel>
            <div className="form-actions">
              <Button type="submit" busy={busy}>
                <Save size={17} />
                Salvar configurações gerais
              </Button>
            </div>
          </form>
        )
      ) : (
        <div className="info-banner">
          <Shield size={20} />
          Parâmetros institucionais, módulos e cadastros são gerenciados pelo Administrativo.
        </div>
      )}
    </>
  );
}
