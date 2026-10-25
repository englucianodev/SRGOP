import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Send,
  Radio,
  UsersRound,
  Car,
  Map,
  ChartNoAxesCombined,
  Users,
  ShieldCheck,
  Settings,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Bell,
  ChevronRight,
  Clock3,
} from 'lucide-react';
import logo from '../assets/logo.svg';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { initials, fmtTime, fmtDateTime } from '../utils/format';
import { Button, Modal, Empty } from './UI';
import { api } from '../services/api';
const links = [
  ['/dashboard', 'Dashboard', LayoutDashboard, 'all'],
  ['/ocorrencias', 'Ocorrências', FileText, 'all'],
  ['/despachos', 'Despachos', Send, 'management'],
  ['/atendimento', 'Atendimento', Radio, 'all'],
  ['/guarnicoes', 'Guarnições', UsersRound, 'all'],
  ['/viaturas', 'Viaturas', Car, 'management'],
  ['/mapa', 'Mapa operacional', Map, 'management'],
  ['/relatorios', 'Relatórios', ChartNoAxesCombined, 'management'],
  ['/usuarios', 'Usuários', Users, 'management'],
  ['/administrativo', 'Administrativo', ShieldCheck, 'admin'],
  ['/configuracoes', 'Configurações', Settings, 'management'],
];
export default function Layout() {
  const app = useApp();
  const [drawer, setDrawer] = useState(false);
  const [exit, setExit] = useState(false);
  const [bell, setBell] = useState(false);
  const { data: notifications } = useData('/notifications', []);
  const location = useLocation();
  const sidebar = useRef(null);
  const [compact, setCompact] = useState(window.matchMedia('(max-width: 960px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 960px)');
    const change = () => setCompact(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!drawer || !compact) return;
    const previous = document.activeElement;
    sidebar.current?.querySelector('button')?.focus();
    const key = (e) => {
      if (e.key === 'Escape') setDrawer(false);
      if (e.key === 'Tab') {
        const nodes = sidebar.current.querySelectorAll('a,button');
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [drawer, compact]);
  const allowed = links
    .filter(
      (l) =>
        l[3] === 'all' ||
        (l[3] === 'management' && app.user.role !== 'Praça') ||
        (l[3] === 'admin' && app.user.role === 'Administrativo'),
    )
    .filter(
      (l) =>
        !app.activeAttendance ||
        ['/dashboard', '/ocorrencias', '/atendimento', '/guarnicoes'].includes(l[0]),
    );
  const title =
    links.find((l) => location.pathname.startsWith(l[0]))?.[1] || 'Central de operações';
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      {drawer && (
        <button
          className="drawer-shade"
          aria-label="Fechar menu"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        ref={sidebar}
        inert={compact && !drawer ? true : undefined}
        aria-hidden={compact && !drawer}
        className={`sidebar ${drawer ? 'open' : ''}`}
      >
        <div className="brand">
          <img src={logo} alt="" />
          <div>
            <strong>
              SRGOP<span>18º BPM · MARANHÃO</span>
            </strong>
          </div>
          <button
            className="icon-button close-nav"
            aria-label="Fechar menu"
            onClick={() => setDrawer(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="unit">
          <span className="unit-mark">18</span>
          <div>
            <strong>Central de operações</strong>
            <span>Polícia Militar do Maranhão</span>
          </div>
        </div>
        <span className="nav-caption">
          {app.user.role === 'Praça' ? 'MEU SERVIÇO' : 'OPERACIONAL'}
        </span>
        <nav aria-label="Menu principal">
          {allowed.map(([path, label, Icon]) => (
            <NavLink key={path} to={path} onClick={() => setDrawer(false)}>
              <Icon size={19} />
              <span>
                {app.user.role === 'Praça' && path === '/guarnicoes' ? 'Minha guarnição' : label}
              </span>
              {path === '/atendimento' && app.ringing && <i className="notification-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="network">
            <span className={`live-dot ${app.online ? '' : 'offline'}`} />
            <span>{app.online ? 'Conectado à central' : 'Reconectando à central'}</span>
          </div>
          <button
            onClick={() => {
              setDrawer(false);
              setExit(true);
            }}
          >
            <LogOut size={18} /> Sair do sistema
          </button>
          <small>SRGOP · Versão 1.0</small>
        </div>
      </aside>
      <div className="workspace" inert={compact && drawer ? true : undefined}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Abrir menu"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <Menu size={21} />
            </button>
            <span>Operacional</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="header-actions">
            <div
              className={`inactivity ${app.remaining < 60 ? 'warning' : ''}`}
              title="Tempo restante até sair por inatividade"
            >
              <Clock3 size={14} />
              <span>
                {Math.floor(app.remaining / 60)}:{String(app.remaining % 60).padStart(2, '0')}
              </span>
            </div>
            <button
              className="icon-button"
              onClick={() => app.setTheme(app.theme === 'light' ? 'dark' : 'light')}
              aria-label="Alternar tema"
            >
              {app.theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <button
              className="icon-button bell"
              aria-label="Notificações"
              onClick={() => setBell(true)}
            >
              <Bell size={19} />
              {notifications.some((n) => !n.read) && <i />}
            </button>
            <div className="user-profile">
              <span className="avatar">{initials(app.user.name)}</span>
              <div>
                <strong>{app.user.name}</strong>
                <small>
                  {app.user.role} · {app.user.city?.name}
                </small>
              </div>
            </div>
          </div>
        </header>
        {app.activeAttendance && (
          <div className="service-banner">
            <Radio size={16} /> Você está em atendimento. As funções essenciais permanecem
            disponíveis.<NavLink to="/atendimento">Abrir atendimento →</NavLink>
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            {app.settings?.institution || '18º Batalhão de Polícia Militar'} <b>·</b> Uso
            institucional
          </span>
          <span>
            {fmtTime(app.now)} <span className="live-dot" /> Horário de Brasília
          </span>
        </footer>
      </div>
      {exit && (
        <Modal title="Sair do sistema" onClose={() => setExit(false)}>
          <p>Deseja realmente sair do sistema?</p>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setExit(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => app.logout()}>
              Sair
            </Button>
          </div>
        </Modal>
      )}
      {bell && (
        <Modal title="Central de notificações" onClose={() => setBell(false)}>
          {!notifications.length ? (
            <Empty text="Nenhuma notificação por enquanto." />
          ) : (
            notifications.map((n) => (
              <div className={`notification-item ${n.read ? 'read' : ''}`} key={n._id}>
                <strong>{n.title}</strong>
                <p>{n.message}</p>
                <small>{fmtDateTime(n.createdAt)}</small>
                {!n.read && (
                  <Button
                    variant="ghost"
                    onClick={() => app.run(() => api.patch(`/notifications/${n._id}/read`))}
                  >
                    Marcar como lida
                  </Button>
                )}
              </div>
            ))
          )}
        </Modal>
      )}
    </div>
  );
}
