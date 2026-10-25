import { SearchBox, Select, Input, Button } from './UI';
import { useData } from '../hooks/useData';
import { statuses } from '../utils/format';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
export default function OccurrenceFilters({ value, onChange, reports = false }) {
  const { data: cities } = useData('/cities', []);
  const { data: crews } = useData(reports ? '/crews' : null, []);
  const { data: vehicles } = useData(reports ? '/vehicles' : null, []);
  const { data: users } = useData(reports ? '/users' : null, []);
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="filters">
      <div className="filter-search">
        <SlidersHorizontal size={18} />
        <SearchBox
          value={value.search || ''}
          onChange={(v) => set('search', v)}
          placeholder="Pesquisar protocolo, tipo ou endereço"
        />
      </div>
      <div className="filter-fields">
        <Select
          label="Município"
          value={value.city || ''}
          onChange={(e) => set('city', e.target.value)}
        >
          <option value="">Todos os municípios</option>
          {cities.map((c) => (
            <option value={c._id} key={c._id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          label="Prioridade"
          value={value.priority || ''}
          onChange={(e) => set('priority', e.target.value)}
        >
          <option value="">Todas</option>
          {['Alta', 'Média', 'Baixa'].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
        <Select
          label="Status"
          value={value.status || ''}
          onChange={(e) => set('status', e.target.value)}
        >
          <option value="">Todos</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Input
          label="Data inicial"
          type="date"
          value={value.from || ''}
          onChange={(e) => set('from', e.target.value)}
        />
        <Input
          label="Data final"
          type="date"
          value={value.to || ''}
          onChange={(e) => set('to', e.target.value)}
        />
        {reports && (
          <>
            <Select
              label="Guarnição"
              value={value.crew || ''}
              onChange={(e) => set('crew', e.target.value)}
            >
              <option value="">Todas</option>
              {crews.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label="Viatura"
              value={value.vehicle || ''}
              onChange={(e) => set('vehicle', e.target.value)}
            >
              <option value="">Todas</option>
              {vehicles.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.prefix}
                </option>
              ))}
            </Select>
            <Select
              label="Cadastrado por"
              value={value.createdBy || ''}
              onChange={(e) => set('createdBy', e.target.value)}
            >
              <option value="">Todos</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </>
        )}
        <Button variant="ghost" onClick={() => onChange({})}>
          <RotateCcw size={15} />
          Limpar
        </Button>
      </div>
    </div>
  );
}
