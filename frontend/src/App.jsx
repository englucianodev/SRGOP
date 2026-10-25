import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './context/AppContext';
import { GlobalFeedback, Loading } from './components/UI';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Occurrences from './pages/Occurrences';
import Dispatches from './pages/Dispatches';
import Attendance from './pages/Attendance';
import Crews from './pages/Crews';
import Resources from './pages/Resources';
import MapPage from './pages/MapPage';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Administration from './pages/Administration';
function Protected({ roles }) {
  const { user, ready, activeAttendance } = useApp();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Denied />;
  if (
    activeAttendance &&
    !['/dashboard', '/ocorrencias', '/atendimento', '/guarnicoes'].includes(location.pathname)
  )
    return <Navigate to="/atendimento" replace />;
  return <Outlet />;
}
function Denied({ missing = false }) {
  const { setError } = useApp();
  useEffect(() => {
    setError({
      origin: missing ? 'Navegação' : 'Permissões da interface',
      message: missing
        ? 'Esta página não foi encontrada.'
        : 'Seu perfil não tem acesso a esta área.',
    });
  }, [missing]);
  return null;
}
export default function App() {
  const { ready } = useApp();
  if (!ready) return <Loading />;
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login key="login" />} />
        <Route path="/cadastro" element={<Login key="register" register />} />
        <Route element={<Protected />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/ocorrencias" element={<Occurrences />} />
            <Route path="/atendimento" element={<Attendance />} />
            <Route path="/guarnicoes" element={<Crews />} />
            <Route element={<Protected roles={['Oficial', 'Administrativo']} />}>
              <Route path="/despachos" element={<Dispatches />} />
              <Route path="/viaturas" element={<Resources key="vehicles" type="vehicles" />} />
              <Route path="/mapa" element={<MapPage />} />
              <Route path="/relatorios" element={<Reports />} />
              <Route path="/usuarios" element={<Resources key="users" type="users" />} />
              <Route path="/configuracoes" element={<Settings />} />
            </Route>
            <Route element={<Protected roles={['Administrativo']} />}>
              <Route path="/administrativo" element={<Administration />} />
            </Route>
          </Route>
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Denied missing />} />
      </Routes>
      <GlobalFeedback />
    </>
  );
}
