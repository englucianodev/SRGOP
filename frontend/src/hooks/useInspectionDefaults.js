import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { blankInspection, inspectionParts } from '../components/VehicleChecklist';
export function useInspectionDefaults(vehicleId, mileage = 0) {
  const [value, setValue] = useState(() => blankInspection(mileage));
  const [loading, setLoading] = useState(Boolean(vehicleId));
  const [error, setError] = useState('');
  const [minimum, setMinimum] = useState(mileage);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!vehicleId) {
      setLoading(false);
      return;
    }
    let current = true;
    setLoading(true);
    setError('');
    api
      .get(`/vehicle-checklists/defaults?vehicle=${vehicleId}`, { quiet: true })
      .then(({ data }) => {
        if (!current) return;
        const next = blankInspection(data.mileage);
        for (const [key] of inspectionParts)
          if (data.inspection?.[key]) next[key] = { ...data.inspection[key] };
        setValue(next);
        setMinimum(data.mileage);
        setLoading(false);
      })
      .catch(() => {
        if (current) {
          setError('Não foi possível carregar o último checklist. Tente novamente.');
        }
      });
    return () => {
      current = false;
    };
  }, [vehicleId, attempt]);
  return { value, setValue, loading, error, minimum, retry: () => setAttempt((v) => v + 1) };
}
