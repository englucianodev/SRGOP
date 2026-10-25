import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { initials } from '../utils/format';
export default function UserAvatar({ user, className = '' }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let current = true,
      url;
    setSrc('');
    if (user?.avatarVersion)
      api
        .get(`/auth/me/photo?v=${user.avatarVersion}`, { responseType: 'blob', quiet: true })
        .then((r) => {
          if (current) {
            url = URL.createObjectURL(r.data);
            setSrc(url);
          }
        })
        .catch(() => {});
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [user?._id, user?.avatarVersion]);
  return (
    <span className={`avatar ${className}`}>
      {src ? (
        <img src={src} alt="Foto do perfil" onError={() => setSrc('')} />
      ) : (
        initials(user?.name)
      )}
    </span>
  );
}
