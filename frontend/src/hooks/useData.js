import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
export function useData(path, fallback = null) {
  const { revision, chatRevision, notificationRevision } = useApp();
  const resourceRevision = path?.startsWith('/crew-chats')
    ? chatRevision
    : path === '/notifications'
      ? notificationRevision
      : 0;
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
  }, [path, revision, resourceRevision]);
  useEffect(() => {
    if (path !== '/crews' && path !== '/dashboard') return;
    const update = (event) => {
      const { crewId, location, shiftEnd, status } = event.detail;
      const apply = (crew) =>
        crew._id === crewId ? { ...crew, location, shiftEnd, status } : crew;
      setData((previous) =>
        Array.isArray(previous)
          ? previous.map(apply)
          : previous
            ? { ...previous, crews: previous.crews?.map(apply) || [] }
            : previous,
      );
    };
    window.addEventListener('srgop:crew-location', update);
    return () => window.removeEventListener('srgop:crew-location', update);
  }, [path]);
  return { data, loading, setData };
}
