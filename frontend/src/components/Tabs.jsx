import { useState } from 'react';

/** Remembers a choice among `ids` in localStorage; unknown or unreadable values fall back. */
export function useStoredChoice(key, ids, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return ids.includes(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  });
  const choose = (id) => {
    setValue(id);
    try {
      localStorage.setItem(key, id);
    } catch {
      // Storage unavailable: the choice just is not remembered.
    }
  };
  return [value, choose];
}

/** Situation-room tabs: `tabs` is a list of [id, label, Icon?]; arrows move the selection. */
export default function Tabs({ tabs, value, onChange, label, idPrefix }) {
  const move = (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = tabs.findIndex(([id]) => id === value);
    const next = tabs[(index + step + tabs.length) % tabs.length][0];
    onChange(next);
    document.getElementById(`${idPrefix}-tab-${next}`)?.focus();
  };
  return (
    <div className="sr-tabs" role="tablist" aria-label={label} onKeyDown={move}>
      {tabs.map(([id, text, Icon]) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${id}`}
          aria-selected={value === id}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={value === id ? 0 : -1}
          onClick={() => onChange(id)}
        >
          {Icon && <Icon size={16} aria-hidden="true" />}
          {text}
        </button>
      ))}
    </div>
  );
}
