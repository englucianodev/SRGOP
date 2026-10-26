import { useEffect, useId, useRef, useState } from 'react';
import { Field } from './UI';
const normalize = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export default function CrimeSelect({
  value = '',
  onChange,
  options = [],
  label = 'Tipo de crime',
  required = false,
  wide = false,
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const listId = useId(),
    ref = useRef(null);
  const matches = options.filter((item) => normalize(item).includes(normalize(value.trim()))),
    visible = matches.slice(0, 50);
  useEffect(() => {
    ref.current?.setCustomValidity(
      value && !options.includes(value) ? 'Selecione um crime cadastrado na lista.' : '',
    );
  }, [value, options]);
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);
  const choose = (item) => {
    onChange(item);
    setOpen(false);
    setActive(0);
  };
  return (
    <Field
      label={label}
      required={required}
      className={`crime-picker ${wide ? 'crime-picker-wide' : ''}`}
      hint="Digite parte do nome para pesquisar, inclusive sem acentos, e selecione uma opção."
    >
      {(id) => (
        <div className="crime-combobox">
          <input
            ref={ref}
            id={id}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={
              open && visible.length
                ? `${listId}-${Math.min(active, visible.length - 1)}`
                : undefined
            }
            autoComplete="off"
            required={required}
            maxLength={200}
            value={value}
            placeholder="Digite para pesquisar o crime"
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(e) => {
              onChange(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen(true);
                setActive((i) => Math.min(visible.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter' && open && visible.length) {
                e.preventDefault();
                choose(visible[Math.max(0, Math.min(active, visible.length - 1))]);
              } else if (e.key === 'Escape' && open) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }
            }}
          />
          {open && (
            <div className="crime-suggestions">
              <ul id={listId} role="listbox" aria-label="Crimes encontrados">
                {visible.map((item, i) => (
                  <li
                    id={`${listId}-${i}`}
                    key={item}
                    role="option"
                    aria-selected={active === i}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(item)}
                  >
                    {item}
                  </li>
                ))}
              </ul>
              {!visible.length && <p>Nenhum crime encontrado. Revise a pesquisa.</p>}
              {matches.length > 50 && (
                <p>{matches.length} resultados. Refine a pesquisa para encontrar o crime.</p>
              )}
            </div>
          )}
        </div>
      )}
    </Field>
  );
}
