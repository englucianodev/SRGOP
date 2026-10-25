import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, ShieldCheck, LockKeyhole } from 'lucide-react';
import logo from '../assets/logo.svg';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { api } from '../services/api';
import { Button, Input, Select, Modal } from '../components/UI';
export default function Login({ register = false }) {
  const app = useApp();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [validation, setValidation] = useState('');
  const { data: cities } = useData(register ? '/auth/cities' : null, []);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    city: '',
    role: 'Praça',
    remember: false,
  });
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  if (app.user) return <Navigate to="/dashboard" replace />;
  async function submit(e) {
    e.preventDefault();
    setValidation('');
    if (register && form.password !== form.confirmPassword) {
      setValidation('As senhas não coincidem.');
      return;
    }
    setBusy(true);
    await app.run(async () => {
      if (register) {
        const { remember, ...data } = form;
        const r = await api.post('/auth/register', data);
        app.setToast(r.data.message);
        navigate('/login');
      } else {
        const r = await api.post('/auth/login', {
          email: form.email,
          password: form.password,
          remember: form.remember,
        });
        app.hydrate(r.data);
        navigate('/dashboard');
      }
    });
    setBusy(false);
  }
  return (
    <div className="auth-page">
      <div className="auth-top">
        <ShieldCheck size={17} />
        <span>POLÍCIA MILITAR DO MARANHÃO</span>
        <b>18º BPM</b>
      </div>
      <main className={`auth-card ${register ? 'register-card' : ''}`}>
        <img className="auth-logo" src={logo} alt="Logotipo SRGOP" />
        <span className="auth-wordmark">SRGOP</span>
        <h1>Sistema de Recebimento e Gerenciamento de Ocorrências Policiais</h1>
        <div className="auth-divider" />
        <h2>{register ? 'Solicitar acesso' : 'Bem-vindo à central'}</h2>
        <p className="muted">
          {register
            ? 'Preencha seus dados para análise do Administrativo.'
            : 'Identifique-se para acessar o ambiente operacional.'}
        </p>
        <form onSubmit={submit}>
          {register && (
            <Input
              label="Nome completo"
              required
              minLength={3}
              maxLength={120}
              autoComplete="name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          )}
          <Input
            label="E-mail"
            type="email"
            placeholder="seu.nome@exemplo.com"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
          <div className="password-field">
            <Input
              label="Senha"
              type={show ? 'text' : 'password'}
              placeholder="Digite sua senha"
              required
              minLength={register ? 10 : 1}
              maxLength={72}
              autoComplete={register ? 'new-password' : 'current-password'}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
            <button
              type="button"
              aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
          {register ? (
            <>
              <Input
                label="Confirmar senha"
                type={show ? 'text' : 'password'}
                required
                minLength={10}
                maxLength={72}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => set('confirmPassword', e.target.value)}
              />
              <div className="form-grid">
                <Select
                  label="Município"
                  required
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                >
                  <option value="">Selecione</option>
                  {cities.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Acesso solicitado"
                  value={form.role}
                  onChange={(e) => set('role', e.target.value)}
                >
                  {['Praça', 'Oficial', 'Administrativo'].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </div>
              <small className="muted">
                O perfil solicitado será verificado antes da ativação da conta.
              </small>
            </>
          ) : (
            <div className="auth-options">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.remember}
                  onChange={(e) => set('remember', e.target.checked)}
                />
                Lembrar de mim
              </label>
              <button className="text-button" type="button" onClick={() => setForgot(true)}>
                Esqueci minha senha
              </button>
            </div>
          )}
          {validation && (
            <p className="field-error" role="alert">
              {validation}
            </p>
          )}
          <Button className="full-width" type="submit" busy={busy}>
            {register ? 'Enviar solicitação' : 'Entrar no sistema'}
            <ArrowRight size={17} />
          </Button>
        </form>
        <p className="auth-switch">
          {register ? 'Já possui acesso?' : 'Primeiro acesso?'}{' '}
          <Link to={register ? '/login' : '/cadastro'}>
            {register ? 'Entrar no sistema' : 'Criar cadastro'}
          </Link>
        </p>
        <div className="secure-note">
          <LockKeyhole size={13} /> Ambiente de acesso restrito e autenticado
        </div>
      </main>
      <footer className="auth-footer">
        18º Batalhão de Polícia Militar <span>•</span> Maranhão
        <br />
        <small>Servir e proteger, com informação e responsabilidade.</small>
      </footer>
      {forgot && (
        <Modal title="Recuperação de acesso" onClose={() => setForgot(false)}>
          <p>
            Solicite a redefinição de senha ao Administrativo do batalhão. A recuperação automática
            por e-mail será disponibilizada em uma versão futura.
          </p>
          <Button onClick={() => setForgot(false)}>Entendi</Button>
        </Modal>
      )}
    </div>
  );
}
