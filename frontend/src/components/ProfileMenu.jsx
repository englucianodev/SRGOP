import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { militaryLabel } from './PersonalFields';
import UserAvatar from './UserAvatar';
export default function ProfileMenu({ onExit }) {
  const app = useApp(),
    location = useLocation(),
    root = useRef(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const close = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return (
    <div
      ref={root}
      className="profile-menu"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!root.current?.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false);
          root.current.querySelector('button')?.focus();
        }
      }}
    >
      <button
        type="button"
        className="user-profile profile-trigger"
        aria-label="Opções da minha conta"
        aria-expanded={open}
        aria-controls="profile-options"
        onClick={() => setOpen(true)}
      >
        <UserAvatar user={app.user} />
        <div>
          <strong>{militaryLabel(app.user)}</strong>
          <small>
            {app.user.role} · {app.user.city?.name}
          </small>
        </div>
      </button>
      {open && (
        <div id="profile-options" className="profile-options">
          <Link to="/minha-conta" onClick={() => setOpen(false)}>
            Minha conta
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onExit();
            }}
          >
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
