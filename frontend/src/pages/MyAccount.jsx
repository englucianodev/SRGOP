import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { PageTitle, Panel, Input, Button } from '../components/UI';
import PersonalFields, { personalDefaults } from '../components/PersonalFields';
import UserAvatar from '../components/UserAvatar';

async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024)
    throw new Error('Selecione JPEG ou PNG de até 2 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const size = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 384;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 384, 384);
    context.drawImage(
      bitmap,
      (bitmap.width - size) / 2,
      (bitmap.height - size) / 2,
      size,
      size,
      0,
      0,
      384,
      384,
    );
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível preparar a foto.'))),
        'image/jpeg',
        0.85,
      ),
    );
  } finally {
    bitmap.close();
  }
}
export default function MyAccount() {
  const app = useApp();
  const [form, setForm] = useState(() => ({
    name: app.user.name,
    email: app.user.email,
    ...personalDefaults(app.user),
    currentPassword: '',
  }));
  const [password, setPassword] = useState({
    currentPassword: '',
    password: '',
    confirmPassword: '',
  });
  const [file, setFile] = useState(null),
    [busy, setBusy] = useState(''),
    [notice, setNotice] = useState('');
  const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  async function run(kind, action) {
    setBusy(kind);
    try {
      await app.run(action);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageTitle
        title="Minha conta"
        description="Atualize seus dados pessoais, sua foto e sua senha."
      />
      <div className="account-grid">
        <Panel title="Dados pessoais">
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              run('profile', async () => {
                const body = { ...form };
                if (!body.currentPassword) delete body.currentPassword;
                const r = await api.put('/auth/me', body);
                app.updateUser(r.data.user);
                set('currentPassword', '');
                app.setToast('Dados pessoais atualizados.');
              });
            }}
          >
            <Input
              label="Nome completo"
              required
              minLength={3}
              maxLength={120}
              autoComplete="name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <PersonalFields value={form} onChange={set} />
            <Input
              label="E-mail"
              required
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
            {form.email.toLowerCase() !== app.user.email && (
              <Input
                label="Senha atual para alterar o e-mail"
                type="password"
                required
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(e) => set('currentPassword', e.target.value)}
              />
            )}
            <p className="form-note">
              Município de cadastro: {app.user.city?.name}. Perfil de acesso: {app.user.role}. Esses
              vínculos são administrados pela central.
            </p>
            <Button type="submit" busy={busy === 'profile'} disabled={Boolean(busy)}>
              Salvar dados pessoais
            </Button>
          </form>
        </Panel>
        <div>
          <Panel title="Foto do perfil">
            <div className="account-form">
              <UserAvatar user={app.user} className="account-avatar" />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setNotice('');
                  run('photo', async () => {
                    let image;
                    try {
                      image = await preparePhoto(file);
                    } catch (error) {
                      setNotice(error.message);
                      return;
                    }
                    const body = new FormData();
                    body.append('photo', image, 'perfil.jpg');
                    const r = await api.put('/auth/me/photo', body);
                    app.updateUser(r.data.user);
                    setFile(null);
                    app.setToast('Foto atualizada.');
                  });
                }}
              >
                <Input
                  label="Selecionar foto"
                  key={app.user.avatarVersion}
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => {
                    setFile(e.target.files[0] || null);
                    setNotice('');
                  }}
                  hint="JPEG ou PNG, até 2 MB. A foto será centralizada e ajustada para o perfil."
                />
                {notice && <p role="alert">{notice}</p>}
                <div className="form-actions">
                  <Button type="submit" disabled={!file || Boolean(busy)} busy={busy === 'photo'}>
                    Salvar foto
                  </Button>
                  <Button
                    type="button"
                    variant="danger-ghost"
                    disabled={!app.user.avatarVersion || Boolean(busy)}
                    onClick={() =>
                      run('photo', async () => {
                        const r = await api.delete('/auth/me/photo');
                        app.updateUser(r.data.user);
                        app.setToast('Foto removida.');
                      })
                    }
                  >
                    Remover foto
                  </Button>
                </div>
              </form>
            </div>
          </Panel>
          <Panel title="Alterar minha senha">
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                run('password', async () => {
                  await api.post('/auth/me/password', password);
                  app.finishSession('Senha alterada. Entre novamente com a nova senha.');
                });
              }}
            >
              <Input
                label="Senha atual"
                type="password"
                required
                autoComplete="current-password"
                value={password.currentPassword}
                onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })}
              />
              <Input
                label="Nova senha"
                type="password"
                required
                minLength={10}
                maxLength={72}
                autoComplete="new-password"
                value={password.password}
                onChange={(e) => setPassword({ ...password, password: e.target.value })}
              />
              <Input
                label="Confirmar nova senha"
                type="password"
                required
                minLength={10}
                maxLength={72}
                autoComplete="new-password"
                value={password.confirmPassword}
                onChange={(e) => setPassword({ ...password, confirmPassword: e.target.value })}
              />
              <p className="form-note">
                Mínimo de dez caracteres. Ao alterar a senha, todas as suas sessões serão
                encerradas.
              </p>
              <Button type="submit" busy={busy === 'password'} disabled={Boolean(busy)}>
                Alterar senha
              </Button>
            </form>
          </Panel>
        </div>
      </div>
    </>
  );
}
