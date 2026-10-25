import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { api } from '../services/api';
const Context = createContext(null);
export const useApp = () => useContext(Context);
export function AppProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState('');
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [remaining, setRemaining] = useState(300);
  const [online, setOnline] = useState(false);
  const [ringing, setRinging] = useState(false);
  const [activeAttendance, setActiveAttendance] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('srgop-theme') || 'light');
  const [sound, setSound] = useState(localStorage.getItem('srgop-sound') !== 'false');
  const [notifications, setNotifications] = useState(
    localStorage.getItem('srgop-notifications') !== 'false',
  );
  const last = useRef(Date.now());
  const sent = useRef(0);
  const audio = useRef(null);
  const loggedOut = useRef(false);
  const activityChannel = useRef(null);
  const refresh = () => setRevision((v) => v + 1);
  const hydrate = (data) => {
    setUser(data.user);
    setSettings(data.settings);
    last.current = data.lastActivity ? +new Date(data.lastActivity) : Date.now();
    loggedOut.current = false;
  };
  useEffect(() => {
    api
      .get('/auth/me', { quiet: true })
      .then((r) => hydrate(r.data))
      .catch((e) => {
        if (e.response?.status !== 401)
          setError({
            message: 'Não foi possível carregar a sessão. Verifique se o backend está em execução.',
            origin: 'Inicialização / API',
          });
      })
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    const listener = (e) => setError(e.detail);
    window.addEventListener('srgop:error', listener);
    return () => window.removeEventListener('srgop:error', listener);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('srgop-theme', theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('srgop-sound', sound);
    localStorage.setItem('srgop-notifications', notifications);
  }, [sound, notifications]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  async function logout(automatic = false) {
    if (loggedOut.current) return;
    loggedOut.current = true;
    try {
      await api.post('/auth/logout', {}, { quiet: automatic });
    } catch (e) {
      if (!automatic && e.response?.status !== 401) {
        loggedOut.current = false;
        return;
      }
    }
    setUser(null);
    setActiveAttendance(null);
    setRinging(false);
    navigate('/login', { replace: true });
    if (automatic) setToast('Sua sessão foi encerrada por inatividade. Entre novamente.');
  }
  useEffect(() => {
    if (!user) return;
    let trailing;
    let pending = false;
    const channel =
      typeof BroadcastChannel === 'function' ? new BroadcastChannel('srgop-activity') : null;
    activityChannel.current = channel;
    if (channel)
      channel.onmessage = (event) => {
        if (event.data?.user === user._id && event.data?.at)
          last.current = Math.max(last.current, event.data.at);
      };
    const sendActivity = () => {
      if (pending || loggedOut.current) return;
      sent.current = Date.now();
      pending = true;
      api
        .post('/auth/activity')
        .then((r) => {
          const at = +new Date(r.data.lastActivity);
          last.current = Math.max(last.current, at);
          channel?.postMessage({ user: user._id, at });
        })
        .catch(() => {})
        .finally(() => {
          pending = false;
        });
    };
    const activity = () => {
      last.current = Date.now();
      if (!audio.current) {
        try {
          audio.current = new (window.AudioContext || window.webkitAudioContext)();
        } catch {
          /* Som não disponível neste navegador. */
        }
      }
      audio.current?.resume().catch(() => {});
      clearTimeout(trailing);
      if (Date.now() - sent.current > 15000) sendActivity();
      else trailing = setTimeout(sendActivity, 1000);
    };
    const events = ['mousemove', 'click', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      const left = Math.max(
        0,
        Math.ceil(((settings?.inactivityMinutes || 5) * 60000 - (time - last.current)) / 1000),
      );
      setRemaining(left);
      if (!left) logout(true);
    }, 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(trailing);
      channel?.close();
      events.forEach((e) => window.removeEventListener(e, activity));
    };
  }, [user?._id, settings?.inactivityMinutes]);
  useEffect(() => {
    if (!user) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      withCredentials: true,
    });
    let refreshTimer;
    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 150);
    };
    socket.on('connect', () => {
      setOnline(true);
      scheduleRefresh();
      api
        .get('/attendances')
        .then((r) => {
          if (r.data.some((o) => o.status === 'Despachada' && o.crew?._id === user.crew)) {
            setRinging(true);
            navigate('/atendimento');
          }
        })
        .catch(() => {});
    });
    socket.on('disconnect', (reason) => {
      setOnline(false);
      if (reason === 'io server disconnect' && !loggedOut.current)
        api.get('/auth/me').catch(() => {});
    });
    socket.on('data:changed', scheduleRefresh);
    socket.on('notification', (n) => {
      if (notifications && settings?.notificationsEnabled !== false)
        setToast(`${n.title}: ${n.message}`);
      refresh();
    });
    socket.on('dispatch:new', () => {
      setRinging(true);
      navigate('/atendimento');
      refresh();
    });
    socket.on('attendance:changed', () => {
      setRinging(false);
      refresh();
    });
    return () => {
      clearTimeout(refreshTimer);
      socket.disconnect();
      setOnline(false);
    };
  }, [user?._id, user?.crew, notifications, settings?.notificationsEnabled]);
  useEffect(() => {
    if (!ringing || !sound || settings?.soundEnabled === false) return;
    const beep = () => {
      const ctx = audio.current;
      if (!ctx || ctx.state !== 'running') return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 740;
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.23);
    };
    beep();
    const timer = setInterval(beep, 1800);
    return () => clearInterval(timer);
  }, [ringing, sound, settings?.soundEnabled]);
  useEffect(() => {
    if (!user) return;
    api
      .get('/dashboard')
      .then((r) => setActiveAttendance(r.data.myAttendance))
      .catch(() => {});
    api
      .get('/auth/me')
      .then((r) => {
        setUser(r.data.user);
        setSettings(r.data.settings);
      })
      .catch(() => {});
  }, [revision, user?._id]);
  const run = async (fn, message) => {
    try {
      const result = await fn();
      if (message) setToast(message);
      refresh();
      return result;
    } catch {
      return null;
    }
  };
  const acknowledgeError = () => {
    const expired = error?.status === 401;
    setError(null);
    if (expired) {
      setUser(null);
      setRinging(false);
    }
    navigate('/dashboard', { replace: true });
  };
  return (
    <Context.Provider
      value={{
        user,
        settings,
        setSettings,
        ready,
        hydrate,
        logout,
        error,
        setError,
        acknowledgeError,
        toast,
        setToast,
        run,
        refresh,
        revision,
        now,
        remaining,
        online,
        theme,
        setTheme,
        sound,
        setSound,
        notifications,
        setNotifications,
        ringing,
        setRinging,
        activeAttendance,
      }}
    >
      {children}
    </Context.Provider>
  );
}
