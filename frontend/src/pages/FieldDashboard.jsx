import { Link } from 'react-router-dom';
import { Plus, Shield, Radio, ArrowRight, Clock3 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { duration, fmtDateTime } from '../utils/format';
import { PageTitle, Panel, Badge, Empty } from '../components/UI';

export default function FieldDashboard({ data }) {
  const app = useApp();
  const crew = data.crews.find((c) => c.members.some((m) => m._id === app.user._id));
  const { data: assigned } = useData('/attendances', []);
  const { data: recent } = useData(`/occurrences?createdBy=${app.user._id}&limit=5`, { items: [] });
  return (
    <>
      <PageTitle
        eyebrow="MEU SERVIÇO"
        title={`Bom serviço, ${app.user.name.split(' ')[0]}.`}
        description={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(app.now)}
      >
        <Link className="button primary" to="/ocorrencias?nova=1">
          <Plus size={17} />
          Registrar ocorrência
        </Link>
      </PageTitle>
      <div className="field-welcome">
        <div className="round-icon">
          <Shield size={28} />
        </div>
        <div>
          <span className="eyebrow">SEU TURNO</span>
          <h2>{crew?.name || 'Entre em serviço'}</h2>
          <p>
            {crew
              ? `${crew.city?.name} · ${crew.vehicle?.prefix || 'Sem viatura'}`
              : 'Ingresse em uma guarnição para receber os despachos da central.'}
          </p>
          {crew && (
            <p>
              <Clock3 size={15} /> {duration((+new Date(crew.shiftEnd) - app.now) / 1000)} restantes
              no turno
            </p>
          )}
        </div>
        <Link className="button primary" to="/guarnicoes">
          {crew ? 'Minha guarnição' : 'Ingressar na guarnição'}
          <ArrowRight size={16} />
        </Link>
      </div>
      <Panel
        title="Ocorrências destinadas à sua equipe"
        subtitle={`${assigned.length} atendimento(s) pendente(s) ou em andamento`}
      >
        {assigned.length ? (
          <div className="dispatch-grid">
            {assigned.map((o) => (
              <article key={o._id} className="dispatch-card">
                <div className="card-top">
                  <span className="protocol">{o.protocol}</span>
                  <Badge>{o.priority}</Badge>
                </div>
                <h3>{o.crimeType}</h3>
                <p>
                  {o.city?.name} · {o.address}
                </p>
                <Badge>{o.status}</Badge>
                <div className="form-actions">
                  <Link className="button primary" to="/atendimento">
                    <Radio size={16} />
                    Abrir atendimento
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty text="Nenhum despacho pendente para você." />
        )}
      </Panel>
      <Panel
        title="Seus últimos registros"
        actions={
          <Link className="panel-link" to="/ocorrencias">
            Consultar ocorrências →
          </Link>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ocorrência</th>
                <th>Município</th>
                <th>Situação</th>
                <th>Registro</th>
              </tr>
            </thead>
            <tbody>
              {recent.items.map((o) => (
                <tr key={o._id}>
                  <td>
                    <Link to={`/ocorrencias?ver=${o._id}`}>{o.crimeType}</Link>
                    <small className="cell-sub">{o.protocol}</small>
                  </td>
                  <td>{o.city?.name}</td>
                  <td>
                    <Badge>{o.status}</Badge>
                  </td>
                  <td>{fmtDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!recent.items.length && <Empty text="Você ainda não registrou ocorrências." />}
      </Panel>
    </>
  );
}
