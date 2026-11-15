import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
export default function AppInstallation() {
  const [install, setInstall] = useState(null);
  const [update, setUpdate] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    let active = true;
    const connection = () => setOnline(navigator.onLine);
    const prompt = (event) => {
      event.preventDefault();
      setInstall(event);
    };
    const installed = () => setInstall(null);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);
    if (
      !Capacitor.isNativePlatform() &&
      import.meta.env.PROD &&
      import.meta.env.MODE !== 'android'
    ) {
      import('virtual:pwa-register').then(({ registerSW }) => {
        if (!active) return;
        const applyUpdate = registerSW({
          onNeedRefresh() {
            if (active) setUpdate(() => applyUpdate);
          },
          onRegisterError(error) {
            console.error('Registro PWA:', error);
          },
        });
      });
    }
    return () => {
      active = false;
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  const installApp = async () => {
    try {
      await install.prompt();
      await install.userChoice;
    } finally {
      setInstall(null);
    }
  };
  if (!online)
    return (
      <aside className="app-installation" role="status">
        Sem conexão. Consultas e cadastros precisam de internet.
      </aside>
    );
  if (update)
    return (
      <aside className="app-installation" role="status">
        <span>Nova versão disponível. Salve o que estiver preenchendo antes de atualizar.</span>
        <button onClick={() => update(true)}>Atualizar</button>
      </aside>
    );
  if (!install || dismissed || Capacitor.isNativePlatform()) return null;
  return (
    <aside className="app-installation">
      <span>Instale o SRGOP na tela inicial do celular.</span>
      <button onClick={installApp}>Instalar</button>
      <button aria-label="Fechar aviso de instalação" onClick={() => setDismissed(true)}>
        Agora não
      </button>
    </aside>
  );
}
