import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
export function useData(path, fallback = null) {
  const { revision } = useApp();
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let current = true;
    setLoading(true);
    api
      .get(path)
      .then((r) => {
        if (current) setData(r.data);
      })
      .catch(() => {})
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [path, revision]);
  return { data, loading, setData };
}
