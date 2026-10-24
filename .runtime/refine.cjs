const fs = require('node:fs');
function edit(path, from, to) { const text = fs.readFileSync(path,'utf8'); if (!text.includes(from)) throw new Error(`Trecho ausente: ${path}`); fs.writeFileSync(path,text.replace(from,to)); }
edit('frontend/src/pages/Dashboard.jsx', "name: 'Ocorrências atendidas', value: closed", "name: 'Ocorrências atendidas', value: data.results?.closed || 0");
edit('frontend/src/pages/Dashboard.jsx', "value: data.counts.reduce((s, r) => s + r.weapons, 0)", "value: data.results?.weapons || 0");
edit('frontend/src/pages/Dashboard.jsx', "value: data.counts.reduce((s, r) => s + r.recoveredVehicles, 0)", "value: data.results?.recoveredVehicles || 0");
edit('backend/controllers/reportController.js', 'grouped[key] = {};', 'grouped[key] = Object.create(null);');
edit('frontend/src/components/Layout.jsx', "import { useState } from 'react';", "import { useEffect, useRef, useState } from 'react';");
edit('frontend/src/components/Layout.jsx', '  const allowed = links.filter', `  const sidebar = useRef(null); const [compact, setCompact] = useState(window.matchMedia('(max-width: 960px)').matches);
  useEffect(() => { const media = window.matchMedia('(max-width: 960px)'); const change = () => setCompact(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  useEffect(() => { if (!drawer || !compact) return; const previous = document.activeElement; sidebar.current?.querySelector('button')?.focus(); const key = e => { if (e.key === 'Escape') setDrawer(false); if (e.key === 'Tab') { const nodes = sidebar.current.querySelectorAll('a,button'); const first = nodes[0]; const last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } }; document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); previous?.focus(); }; }, [drawer, compact]);
  const allowed = links.filter`);
edit('frontend/src/components/Layout.jsx', '<aside className=', '<aside ref={sidebar} inert={compact && !drawer ? true : undefined} aria-hidden={compact && !drawer} className=');
edit('frontend/src/components/Layout.jsx', '<div className="workspace">', '<div className="workspace" inert={compact && drawer ? true : undefined}>');
