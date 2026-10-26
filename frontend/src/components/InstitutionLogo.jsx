import { useState } from 'react';
import { api } from '../services/api';
import defaultLogo from '../assets/logo.svg';
export default function InstitutionLogo({
  version = '',
  className = '',
  alt = 'Logo institucional do batalhão',
}) {
  const [failed, setFailed] = useState('');
  const custom = version && failed !== version;
  return (
    <img
      className={className}
      src={
        custom
          ? `${api.defaults.baseURL.replace(/\/$/, '')}/branding/logo?v=${encodeURIComponent(version)}`
          : defaultLogo
      }
      alt={alt}
      onError={() => {
        if (custom) setFailed(version);
      }}
    />
  );
}
