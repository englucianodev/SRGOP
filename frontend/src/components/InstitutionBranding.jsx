import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { Input, Button } from './UI';
import InstitutionLogo from './InstitutionLogo';
async function prepareLogo(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024)
    throw new Error('Selecione JPEG ou PNG de até 2 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível preparar a logo.'))),
        'image/png',
      ),
    );
  } finally {
    bitmap.close();
  }
}
export default function InstitutionBranding() {
  const app = useApp();
  const [file, setFile] = useState(null),
    [preview, setPreview] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [preparing, setPreparing] = useState(false);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <section className="institution-branding">
      <h3>Logo institucional do batalhão</h3>
      <p>
        A imagem aparece no login e na lateral do sistema. JPEG ou PNG de até 2 MB; transparência e
        proporção são preservadas.
      </p>
      <div className="institution-logo-editor">
        {preview ? (
          <img
            className="institution-logo-preview"
            src={preview}
            alt="Prévia da nova logo institucional"
          />
        ) : (
          <InstitutionLogo
            className="institution-logo-preview"
            version={app.settings?.logoVersion}
          />
        )}
        <div>
          <Input
            label="Selecionar logo institucional"
            type="file"
            accept="image/png,image/jpeg"
            disabled={busy || preparing}
            onChange={async (e) => {
              const selected = e.target.files?.[0];
              setError('');
              setFile(null);
              if (!selected) return;
              setPreparing(true);
              try {
                setFile(await prepareLogo(selected));
              } catch (err) {
                setError(err.message || 'Não foi possível ler a imagem.');
              } finally {
                setPreparing(false);
              }
            }}
          />
          {error && <p role="alert">{error}</p>}
          <div className="form-actions">
            <Button
              type="button"
              disabled={!file || preparing}
              busy={busy}
              onClick={async () => {
                setBusy(true);
                await app.run(async () => {
                  const body = new FormData();
                  body.append('logo', file, 'logo-institucional.png');
                  const r = await api.put('/settings/logo', body);
                  app.setSettings(r.data);
                  setFile(null);
                }, 'Logo institucional atualizada.');
                setBusy(false);
              }}
            >
              Salvar logo
            </Button>
            {app.settings?.logoVersion && (
              <Button
                type="button"
                variant="secondary"
                busy={busy}
                onClick={async () => {
                  setBusy(true);
                  await app.run(async () => {
                    const r = await api.delete('/settings/logo');
                    app.setSettings(r.data);
                    setFile(null);
                  }, 'Logo removida. A imagem padrão foi restaurada.');
                  setBusy(false);
                }}
              >
                Remover logo
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
