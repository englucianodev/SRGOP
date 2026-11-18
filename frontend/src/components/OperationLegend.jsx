import { SITUATION_STYLE } from '../utils/operation';

const SITUATIONS = ['livre', 'atendimento', 'entrando', 'expirado'];
const PRIORITIES = [
  ['red', 'Alta'],
  ['amber', 'Média'],
  ['blue', 'Baixa'],
];

// Legend of crew situations and occurrence priorities; each group can be hidden.
export default function OperationLegend({
  situations = true,
  priorities = true,
  staleNote = false,
}) {
  return (
    <div className="map-legend" aria-label="Legenda do mapa">
      {situations &&
        SITUATIONS.map((key) => (
          <span key={key}>
            <i className="legend-dot" style={{ background: SITUATION_STYLE[key].color }} />
            {SITUATION_STYLE[key].label}
          </span>
        ))}
      {staleNote && (
        <span>
          <i className="legend-dot gray" />
          Cor esmaecida: última posição conhecida
        </span>
      )}
      {priorities &&
        PRIORITIES.map(([tone, label]) => (
          <span key={label}>
            <i className={`legend-dot ${tone}`} />
            {label} prioridade
          </span>
        ))}
    </div>
  );
}
