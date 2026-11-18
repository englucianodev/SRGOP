import { useRef } from 'react';

/** Situation-room counter; it bumps whenever its value changes after the page opened. */
export default function Kpi({ value, label, tone = '' }) {
  const initial = useRef(value);
  return (
    <div className={`kpi ${tone}`}>
      <b key={value} className={value !== initial.current ? 'bump' : ''}>
        {value}
      </b>
      <span>{label}</span>
    </div>
  );
}
