import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Map as MapIcon, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { Empty, Loading, PageTitle } from '../components/UI';
import OperationTab from '../components/operation/OperationTab';
import StaffTab from '../components/operation/StaffTab';
import OccurrencesTab from '../components/operation/OccurrencesTab';

const TAB_KEY = 'srgop-operacao-aba';
const TABS = [
  ['operacao', 'Operação', MapIcon],
  ['efetivo', 'Efetivo', Users],
  ['ocorrencias', 'Ocorrências', FileText],
];
const OBJECT_ID = /^[a-f\d]{24}$/i;

function storedTab() {
  try {
    const value = localStorage.getItem(TAB_KEY);
    return TABS.some(([id]) => id === value) ? value : TABS[0][0];
  } catch {
    return TABS[0][0];
  }
}

const idParam = (query, name) => (OBJECT_ID.test(query.get(name) || '') ? query.get(name) : '');

/** Note shown above the map while it points at a UU emergency. */
function EmergencyNote({ emergency }) {
  return (
    <div className="urgency-map-note" role="status">
      <strong>Urgência UU: {emergency.actorName}</strong> · {emergency.crewName} · {emergency.cityName}
      <p>
        {Number.isFinite(emergency.latitude)
          ? `Última posição disponível, registrada em ${new Date(emergency.locatedAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}.`
          : 'GPS indisponível: o mapa mostra o município informado; mantenha contato com a central.'}
      </p>
    </div>
  );
}

export default function Operation() {
  const app = useApp();
  const [query] = useSearchParams();
  // "Ver localização" (Guarnições) and the UU alert open the operation map focused on the crew.
  const crewParam = idParam(query, 'crew');
  const emergencyId = idParam(query, 'emergency');
  const { data: emergency } = useData(emergencyId ? `/emergencies/${emergencyId}` : null);
  const { data, loading } = useData('/dashboard');
  const { data: cities } = useData('/cities', []);
  const [tab, setTab] = useState(() => (crewParam || emergencyId ? 'operacao' : storedTab()));
  const choose = (id) => {
    setTab(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      // Storage unavailable: the choice just is not remembered.
    }
  };
  if (loading && !data) return <Loading />;
  if (!data) return <Empty text="Não foi possível carregar a operação." />;
  const focusCrew = emergency?.crew || crewParam;
  return (
    <div className="situation-room">
      <PageTitle eyebrow="SALA DE SITUAÇÃO" title="Operação, Efetivo e Ocorrências" />
      <div className="sr-tabs" role="tablist" aria-label="Seções da operação">
        {TABS.map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            id={`operation-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="operation-panel"
            onClick={() => choose(id)}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="operation-panel"
        key={tab}
        className="sr-tabpanel"
        aria-labelledby={`operation-tab-${tab}`}
      >
        {tab === 'operacao' && emergency && <EmergencyNote emergency={emergency} />}
        {tab === 'operacao' && (
          <OperationTab
            data={data}
            cities={cities}
            now={app.now}
            focusCrew={focusCrew}
            emergency={emergency}
          />
        )}
        {tab === 'efetivo' && <StaffTab data={data} now={app.now} />}
        {tab === 'ocorrencias' && <OccurrencesTab crews={data.crews} cities={cities} />}
      </div>
    </div>
  );
}
