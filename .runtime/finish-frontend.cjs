const fs = require('node:fs');
function replace(path, from, to) { const source = fs.readFileSync(path, 'utf8'); if (!source.includes(from)) throw new Error(`Trecho ausente: ${path}: ${from.slice(0, 70)}`); fs.writeFileSync(path, source.replace(from, to)); }
replace('frontend/src/pages/Crews.jsx', "import { useState } from 'react';", "import { useState } from 'react';\nimport CrewManagement from '../components/CrewManagement';\nimport CrewCommunication from '../components/CrewCommunication';");
replace('frontend/src/pages/Crews.jsx', "const admin = app.user.role === 'Administrativo'; const manager = app.user.role !== 'Praça';", "const admin = app.user.role === 'Administrativo' && !app.activeAttendance; const manager = app.user.role !== 'Praça' && !app.activeAttendance;");
replace('frontend/src/pages/Crews.jsx', '<div className="attendance-actions">{!app.user.crew', '<div className="attendance-actions"><CrewManagement crew={c}/>{!app.activeAttendance && !app.user.crew');
replace('frontend/src/pages/Crews.jsx', '  {editing && <Modal', '  <CrewCommunication crews={crews}/>\n  {editing && <Modal');
replace('frontend/src/components/Layout.jsx', '18º Batalhão de Polícia Militar <b>·</b> Uso institucional', "{app.settings?.institution || '18º Batalhão de Polícia Militar'} <b>·</b> Uso institucional");
