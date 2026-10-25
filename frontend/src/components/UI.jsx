import { useEffect, useRef, useId } from 'react';
import { X, Search, Inbox, LoaderCircle, ArrowRight, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
export function Button({ children, variant = 'primary', className = '', busy, ...props }) {
  return (
    <button
      className={`button ${variant} ${className}`}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Badge({ children }) {
  const value = String(children);
  const tone = ['Alta', 'Em manutenção', 'Indisponível', 'Cancelada', 'Recusado'].includes(value)
    ? 'red'
    : ['Média', 'Em aberto', 'Pendente', 'Despachada'].includes(value)
      ? 'amber'
      : ['Disponível', 'Encerrada', 'Ativo', 'Autorizado', 'Concluído'].includes(value)
        ? 'green'
        : ['Em atendimento', 'Em operação', 'Oficial', 'Baixa'].includes(value)
          ? 'blue'
          : 'gray';
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  );
}
export function Field({ label, children, hint, required, className = '' }) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required"> *</span>}
      </label>
      {typeof children === 'function' ? children(id) : children}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Input({ label, hint, ...props }) {
  return (
    <Field label={label} hint={hint} required={props.required}>
      {(id) => <input id={id} {...props} />}
    </Field>
  );
}
export function Select({ label, children, hint, ...props }) {
  return (
    <Field label={label} hint={hint} required={props.required}>
      {(id) => (
        <select id={id} {...props}>
          {children}
        </select>
      )}
    </Field>
  );
}
export function Textarea({ label, ...props }) {
  return (
    <Field label={label} required={props.required}>
      {(id) => <textarea id={id} rows={4} {...props} />}
    </Field>
  );
}
export function Modal({ title, children, onClose, wide = false, mandatory = false }) {
  const ref = useRef();
  const id = useId();
  useEffect(() => {
    ref.current.showModal();
    const el = ref.current;
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!mandatory) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={id}>{title}</h2>
        {!mandatory && (
          <button className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X size={20} />
          </button>
        )}
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function GlobalFeedback() {
  const { error, acknowledgeError, toast } = useApp();
  return (
    <>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {error && (
        <Modal title="Não foi possível concluir" mandatory>
          <div className="error-banner">
            <AlertTriangle size={24} />
            <div>
              <strong>{error.origin}</strong>
              <p>{error.message}</p>
            </div>
          </div>
          <p className="muted">
            Após fechar esta mensagem, você será direcionado ao Dashboard. Se a sessão tiver
            expirado, será necessário entrar novamente.
          </p>
          <Button onClick={acknowledgeError}>
            Entendi, continuar <ArrowRight size={16} />
          </Button>
        </Modal>
      )}
    </>
  );
}
export function PageTitle({ eyebrow = 'CENTRAL DE OPERAÇÕES', title, description, children }) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="title-actions">{children}</div>
    </div>
  );
}
export function Panel({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
export function Empty({ text = 'Nenhum registro encontrado.', children }) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <strong>{text}</strong>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} /> Carregando informações…
    </div>
  );
}
export function SearchBox({ value, onChange, placeholder = 'Pesquisar…' }) {
  return (
    <div className="search">
      <Search size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Confirm({ title, message, onClose, onConfirm, busy }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={onConfirm} busy={busy}>
          Confirmar
        </Button>
      </div>
    </Modal>
  );
}
