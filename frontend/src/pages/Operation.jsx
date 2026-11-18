import { useState } from 'react';
import { Map as MapIcon, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { Empty, Loading, PageTitle } from '../components/UI';
import OperationTab from '../components/operation/OperationTab';
import StaffTab from '../components/operation/StaffTab';

const TAB_KEY = 'srgop-operacao-aba';
const TABS = [
  ['operacao', 'Operação', MapIcon],
  ['efetivo', 'Efetivo', Users],
];

function storedTab() {
  try {
    const value = localStorage.getItem(TAB_KEY);
    return TABS.some(([id]) => id === value) ? value : TABS[0][0];
  } catch {
    return TABS[0][0];
  }
}

export default function Operation() {
  const app = useApp();
  const { data, loading } = useData('/dashboard');
  const { data: cities } = useData('/cities', []);
  const [tab, setTab] = useState(storedTab);
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
  return (
    <div className="situation-room">
      <PageTitle eyebrow="SALA DE SITUAÇÃO" title="Operação e Efetivo" />
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
        {tab === 'operacao' ? (
          <OperationTab data={data} cities={cities} now={app.now} />
        ) : (
          <StaffTab data={data} now={app.now} />
        )}
      </div>
    </div>
  );
}
