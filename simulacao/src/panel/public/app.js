// Panel front end. Everything shown comes from /api/painel every few seconds. Text from the
// simulation (some written by AI) is always inserted with textContent, never as HTML.
(() => {
  const REFRESH_MS = 5000;
  const PHASE = {
    entrando: ['entrando', 'Entrando em serviço'],
    'em-servico': ['livre', 'Em serviço'],
    saindo: ['saindo', 'Saindo / troca de turno'],
  };
  const STATUS = { executando: 'Em execução', pausado: 'Pausado', finalizado: 'Finalizado' };
  const photoMode = new URLSearchParams(location.search).has('foto');
  const $ = (id) => document.getElementById(id);

  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) if (child != null) node.append(child);
    return node;
  }
  const officer = (p) => (p ? `${p.rank} ${p.name}` : '—');
  const minutesSince = (ms, now) => Math.max(0, Math.round((now - ms) / 60000));

  if (photoMode) document.body.classList.add('foto');

  // ── Theme ────────────────────────────────────────────────────────
  const THEME_KEY = 'srgop-painel-tema';
  // Tells the panel server which theme is on screen, so its photos come out in the same theme.
  function reportTheme(theme) {
    if (/[?&]foto=/.test(location.search)) return;
    fetch('/api/acao/tema', { method: 'POST', headers: { 'content-type': 'application/json', 'x-painel': '1' }, body: JSON.stringify({ tema: theme }) })
      .catch(() => { /* the next change or reload reports it again */ });
  }
  function setTheme(theme, save) {
    document.documentElement.setAttribute('data-theme', theme);
    $('theme').setAttribute('aria-label', theme === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro');
    reportTheme(theme);
    if (!save) return;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage blocked: the theme still changes for this visit */
    }
  }
  setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark', false);
  $('theme').addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true));

  // ── Map: follows the crews' GPS and zooms in on where they are working ──
  const FOLLOW_MAX_ZOOM = 16; // as close as the area allows: one crew alone fills the street level
  const FIT_PADDING = [70, 70];
  const GLIDE_MS = 1800; // markers slide between GPS fixes instead of jumping
  const TRAIL_POINTS = 14;
  const MIN_SPAN = 0.02; // degrees; keeps a lone crew from producing a zero-size area
  const map = L.map('map', { zoomControl: !photoMode, attributionControl: true, zoomSnap: 0.25, maxZoom: 18 }).setView([-5.3, -44.5], 8);
  // OpenStreetMap tiles (no key needed); the dark theme recolors them with a CSS filter.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; colaboradores do OpenStreetMap' }).addTo(map);
  const layers = { trails: L.layerGroup().addTo(map), links: L.layerGroup().addTo(map), crews: L.layerGroup().addTo(map), targets: L.layerGroup().addTo(map) };
  const crews = new Map(); // crewId → { marker, trail, path, team, kind, glide }
  const targets = new Map(); // protocol → { marker, link }
  let follow = true;
  let region = null; // every place the test has used, so the map never wanders off it
  let lastTeams = [];
  let focused = false;

  function stateOf(team) {
    if (team.attendance) return ['atendendo', 'Em atendimento'];
    return PHASE[team.phase] ?? ['entrando', team.phase];
  }
  const positionOf = (team) => (team.position?.latitude != null ? team.position : team.base);
  const gpsAge = (team, now) => (team.gpsAt ? Math.max(0, Math.round((now - team.gpsAt) / 1000)) : null);

  function popup(entry, now) {
    const { team } = entry;
    const [, label] = stateOf(team);
    const age = gpsAge(team, now);
    const box = h('div', {},
      h('b', { text: `${team.city} · Equipe ${team.team}` }), h('br'),
      document.createTextNode(`Comandante: ${officer(team.commander)}`), h('br'),
      document.createTextNode(`Motorista: ${officer(team.driver)}`), h('br'),
      document.createTextNode(`Situação: ${label}`));
    if (team.attendance) box.append(h('br'), document.createTextNode(`${team.attendance.protocol} · ${team.attendance.crimeType} · há ${minutesSince(team.attendance.startedAt, now)} min`));
    box.append(h('br'), h('span', { class: 'popup-gps', text: age == null ? 'GPS: aguardando o primeiro sinal (posição da base)' : `GPS: último sinal há ${age} s` }));
    return box;
  }

  const crewIcon = (kind) => L.divIcon({ className: '', html: `<div class="crew-pin ${kind}"></div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
  const label = (text) => h('span', { text });

  /** Slides a marker (and the tip of its trail) to the new GPS fix. */
  function glide(entry, to) {
    cancelAnimationFrame(entry.glide);
    const from = entry.marker.getLatLng();
    if (photoMode || from.distanceTo(to) < 1) return entry.marker.setLatLng(to);
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / GLIDE_MS);
      const e = 1 - (1 - k) ** 3;
      const at = L.latLng(from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e);
      entry.marker.setLatLng(at);
      entry.trail.setLatLngs([...entry.path.slice(0, -1), at]);
      if (k < 1) entry.glide = requestAnimationFrame(step);
    };
    entry.glide = requestAnimationFrame(step);
  }

  function upsertCrew(team) {
    const pos = positionOf(team);
    if (pos?.latitude == null) return null;
    const latlng = L.latLng(pos.latitude, pos.longitude);
    const [kind] = stateOf(team);
    let entry = crews.get(team.crewId);
    if (!entry) {
      entry = { path: [latlng], team, kind };
      entry.marker = L.marker(latlng, { icon: crewIcon(kind), riseOnHover: true, keyboard: false })
        .bindTooltip(label(team.city), { permanent: true, direction: 'right', offset: [12, 0], className: 'crew-label' })
        .bindPopup(() => popup(entry, Date.now()));
      entry.trail = L.polyline([latlng], { color: getComputedStyle(document.documentElement).getPropertyValue('--brand-2').trim() || '#00d5ff', weight: 2.5, opacity: 0.7, dashArray: '2 7', lineCap: 'round' });
      layers.crews.addLayer(entry.marker);
      layers.trails.addLayer(entry.trail);
      crews.set(team.crewId, entry);
    }
    entry.team = team;
    if (entry.kind !== kind) entry.marker.setIcon(crewIcon(kind));
    entry.kind = kind;
    const last = entry.path.at(-1);
    if (!last.equals(latlng)) {
      entry.path = [...entry.path, latlng].slice(-TRAIL_POINTS);
      glide(entry, latlng);
    }
    return latlng;
  }

  function upsertTarget(team, from) {
    const a = team.attendance;
    if (a?.latitude == null) return null;
    const at = L.latLng(a.latitude, a.longitude);
    let entry = targets.get(a.protocol);
    if (!entry) {
      entry = {
        marker: L.marker(at, { icon: L.divIcon({ className: '', html: '<div class="pulse"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }), keyboard: false })
          .bindTooltip(label(`${a.protocol} · ${a.crimeType}`), { direction: 'top', offset: [0, -12] }),
        link: L.polyline([from, at], { color: '#ff4d6d', weight: 2.5, dashArray: '8 8', opacity: 0.85 }),
      };
      layers.targets.addLayer(entry.marker);
      layers.links.addLayer(entry.link);
      targets.set(a.protocol, entry);
    }
    entry.link.setLatLngs([from, at]);
    return at;
  }

  function prune(store, alive, remove) {
    for (const [key, entry] of store)
      if (!alive.has(key)) {
        remove(entry);
        store.delete(key);
      }
  }

  const boundsOf = (points) => {
    const bounds = L.latLngBounds(points);
    const center = bounds.getCenter();
    return bounds.extend([center.lat - MIN_SPAN / 2, center.lng - MIN_SPAN / 2]).extend([center.lat + MIN_SPAN / 2, center.lng + MIN_SPAN / 2]);
  };

  /** The map cannot leave the test's region nor zoom out past it. */
  function lockRegion(points) {
    const next = boundsOf(region ? [region.getSouthWest(), region.getNorthEast(), ...points] : points);
    if (region && region.contains(next)) return;
    region = next;
    const limit = region.pad(0.35);
    map.setMaxBounds(limit);
    map.setMinZoom(Math.max(4, Math.floor(map.getBoundsZoom(limit, false))));
  }

  /** Zooms in as far as possible on the area where the crews are now (plus their occurrences). */
  function focus(points, force) {
    if (!points.length) return;
    const bounds = boundsOf(points);
    const zoom = Math.min(FOLLOW_MAX_ZOOM, map.getBoundsZoom(bounds, false, L.point(FIT_PADDING[0] * 2, FIT_PADDING[1] * 2)));
    const view = map.getBounds();
    if (!force && view.contains(bounds) && Math.abs(zoom - map.getZoom()) < 0.75) return;
    const options = { padding: FIT_PADDING, maxZoom: FOLLOW_MAX_ZOOM };
    // The first framing is instant (and every one in photo mode); later ones fly smoothly.
    if (photoMode || !focused) map.fitBounds(bounds, options);
    else map.flyToBounds(bounds, { ...options, duration: 1.1 });
    focused = true;
  }

  function drawMap(teams, now) {
    lastTeams = teams;
    const crewIds = new Set();
    const protocols = new Set();
    const active = [];
    const all = [];
    for (const team of teams) {
      const at = upsertCrew(team);
      if (!at) continue;
      crewIds.add(team.crewId);
      all.push(at, L.latLng(team.base.latitude, team.base.longitude));
      if (team.phase !== 'saindo') active.push(at);
      const target = upsertTarget(team, at);
      if (target) {
        protocols.add(team.attendance.protocol);
        active.push(target);
        all.push(target);
      }
    }
    prune(crews, crewIds, (e) => (cancelAnimationFrame(e.glide), layers.crews.removeLayer(e.marker), layers.trails.removeLayer(e.trail)));
    prune(targets, protocols, (e) => (layers.targets.removeLayer(e.marker), layers.links.removeLayer(e.link)));
    if (all.length) lockRegion(all);
    if (follow || photoMode) focus(active.length ? active : all, false);
    drawGpsBadge(teams, now);
  }

  function drawGpsBadge(teams, now) {
    const tracked = teams.filter((t) => t.gpsAt);
    const badge = $('gps-info');
    if (!tracked.length) {
      badge.textContent = teams.length ? 'GPS: aguardando sinais' : 'GPS: sem guarnições';
      return badge.classList.remove('live');
    }
    const freshest = Math.min(...tracked.map((t) => gpsAge(t, now)));
    badge.textContent = `GPS ativo · ${tracked.length} guarnição(ões) · último sinal há ${freshest} s`;
    badge.classList.add('live');
  }

  function setFollow(on) {
    follow = on;
    $('follow').classList.toggle('on', on);
    $('follow').setAttribute('aria-pressed', String(on));
    $('follow').querySelector('span').textContent = on ? 'Seguindo guarnições' : 'Seguir guarnições';
  }
  // Any manual pan or zoom hands the map to the user until "Seguir" is pressed again.
  map.on('dragstart', () => setFollow(false));
  for (const type of ['wheel', 'dblclick', 'touchstart'])
    map.getContainer().addEventListener(type, () => setFollow(false), { passive: true });
  map.getContainer().addEventListener('click', (event) => {
    if (event.target.closest('.leaflet-control-zoom')) setFollow(false);
  });
  $('follow').addEventListener('click', () => {
    setFollow(true);
    const points = lastTeams.filter((t) => t.phase !== 'saindo').map(positionOf).filter((p) => p?.latitude != null).map((p) => [p.latitude, p.longitude]);
    focus(points, true);
  });
  $('overview').addEventListener('click', () => {
    setFollow(false);
    if (region) map.flyToBounds(region, { padding: [30, 30], duration: 1 });
  });

  // ── Side panels ──────────────────────────────────────────────────
  function drawAttendances(teams, now) {
    const busy = teams.filter((t) => t.attendance).sort((a, b) => a.attendance.startedAt - b.attendance.startedAt);
    const box = $('attendances');
    box.replaceChildren();
    if (!busy.length) return box.append(h('p', { class: 'muted', text: 'Nenhum atendimento em andamento.' }));
    for (const team of busy) {
      const a = team.attendance;
      const progress = a.notesTotal ? Math.round((a.notesDone / a.notesTotal) * 100) : 0;
      box.append(h('article', { class: `card${isNew('a', a.protocol) ? ' novo' : ''}` },
        h('div', { class: 'card-head' }, h('b', { text: `${a.protocol} · ${team.city}` }), h('span', { class: 'muted', text: `há ${minutesSince(a.startedAt, now)} min` })),
        h('div', { class: 'crime', text: a.crimeType }),
        h('div', { class: 'people' }, 'Cmt ', h('strong', { text: officer(team.commander) })),
        h('div', { class: 'people' }, 'Mot ', h('strong', { text: officer(team.driver) })),
        h('div', { class: 'notes', title: `${a.notesDone} de ${a.notesTotal} registros no atendimento` }, h('span', { style: `width:${progress}%` }))));
    }
  }

  // Items seen before are redrawn quietly; only new ones arrive with an animation.
  const seen = new Set();
  let firstDraw = true;
  function isNew(kind, key) {
    const id = `${kind}|${key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return !firstDraw && !photoMode;
  }

  function setCount(id, value) {
    const node = $(id);
    if (node.textContent === String(value)) return;
    node.textContent = value;
    node.classList.remove('bump');
    void node.offsetWidth; // restart the animation
    node.classList.add('bump');
  }

  function drawEvents(events) {
    $('events').replaceChildren(...events.slice(0, photoMode ? 14 : 60).map((e) =>
      h('li', { class: isNew('e', `${e.t}|${e.message}`) ? 'novo' : '' }, h('time', { text: e.time }), h('span', { class: `tag ${e.kind === 'fluxo' ? e.label : e.kind}`, text: e.label }),
        h('span', { text: e.city ? `${e.city}: ${e.message}` : e.message }))));
  }

  function drawHeader(data) {
    const snap = data.snapshot;
    const running = data.process.running;
    let status = data.state?.status ?? 'parado';
    if (status === 'executando' && snap?.wrapUp) status = 'encerrando';
    if (status === 'executando' && !running) status = 'parado';
    const pill = $('status-pill');
    pill.className = `pill ${status}`;
    pill.textContent = status === 'encerrando' ? 'Encerrando' : status === 'parado' ? (data.state ? 'Simulador parado' : 'Nenhum teste') : STATUS[status] ?? status;
    if (snap?.pause && status === 'pausado') pill.textContent = `Pausado: ${snap.pause.reason}`;
    const progress = data.state?.plannedActiveMs ? data.state.activeMs / data.state.plannedActiveMs : 0;
    $('progress-bar').style.width = `${Math.min(100, progress * 100).toFixed(1)}%`;
    $('progress-text').textContent = data.state ? `${(data.state.activeMs / 3600000).toFixed(1)} h de ${(data.state.plannedActiveMs / 3600000).toFixed(0)} h` : '—';
    const can = { iniciar: !running && data.state?.status !== 'finalizado', pausar: running && status === 'executando', retomar: running && status === 'pausado', encerrar: running && status !== 'encerrando' };
    const blocker = data.process.startBlocker;
    if (can.iniciar && blocker) can.iniciar = false;
    for (const [action, enabled] of Object.entries(can)) document.querySelector(`[data-action="${action}"]`).disabled = !enabled;
    document.querySelector('[data-action="iniciar"]').title = !running && blocker ? blocker : '';
    const preparing = Boolean(data.process.jobs?.preparar?.running);
    for (const button of document.querySelectorAll('[data-action="preparar"]')) {
      button.disabled = running || preparing;
      button.textContent = preparing ? 'Preparando…' : 'Preparar efetivo';
    }
    drawPrepMini(data.preparation, running);
  }

  /** Header bar: progress while the roster is prepared, and whether the test can start. */
  function drawPrepMini(prep, running) {
    const box = $('prep-mini');
    const accounts = prep?.accounts ?? [];
    const done = accounts.filter((a) => a.result).length;
    box.classList.toggle('hidden', running && prep?.status !== 'executando');
    box.classList.toggle('ok', prep?.status === 'concluida');
    box.classList.toggle('erro', !prep || prep.status === 'falhou');
    $('prep-mini-bar').style.width = accounts.length ? `${((done / accounts.length) * 100).toFixed(1)}%` : '0';
    $('prep-mini-text').textContent = !prep ? 'Efetivo não preparado'
      : prep.status === 'executando' ? `Preparando efetivo ${done}/${accounts.length}`
      : prep.status === 'concluida' ? 'Efetivo pronto' : 'Preparação falhou';
  }

  const JOB_LABEL = { preparar: 'Preparação do efetivo', limpeza: 'Limpeza dos dados' };
  const jobState = {};
  function drawJobs(jobs) {
    const lines = [];
    for (const [name, job] of Object.entries(jobs)) {
      const label = JOB_LABEL[name] ?? name;
      if (job.running) lines.push(`${label}: em andamento…`);
      else if (job.code === 0 && !job.error) lines.push(`${label}: concluída.${name === 'preparar' ? ' O teste já pode ser iniciado.' : ''}`);
      else lines.push(`${label}: falhou${job.error ? ` (${job.error})` : ''}.\n${job.tail}`);
      if (jobState[name] && !job.running) toast(job.code === 0 && !job.error ? `${label} concluída.` : `${label} falhou. Veja os detalhes na aba Configurar.`, job.code !== 0 || Boolean(job.error));
      jobState[name] = job.running;
    }
    $('jobs').textContent = lines.join('\n');
  }

  // ── Efetivo: preparação das contas e entrada em serviço ──────────
  const DUTY = { comandante: 'Comandante', motorista: 'Motorista', cpu: 'Oficial da CPU' };
  const RESULT = { criada: 'conta criada', atualizada: 'conta atualizada', existente: 'conta já existia' };
  const CITY_STATUS = { aguardando: 'aguardando', preparando: 'criando…', pronta: 'pronta' };
  const PREP_STATUS = { executando: 'Criando e atualizando as contas no sistema publicado…', concluida: 'Preparação concluída', falhou: 'Preparação falhou' };
  const STEPS = [['login', 'Login'], ['liberacao', 'Liberação'], ['recebimento', 'Checklist da viatura'], ['ingresso', 'Ingresso do comandante'], ['pronto', 'Em serviço']];
  const RECENT_ENTRY_MS = 30 * 60000;
  const DOT = { servico: 'livre', entrando: 'entrando', saindo: 'saindo', fora: 'off' };
  const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
  const percent = (part, total) => (total ? `${Math.min(100, (part / total) * 100).toFixed(1)}%` : '0');
  const openOfficers = new Set(); // expanded officers stay open across the 5 s refresh
  let lastView = null;

  const stepIndex = (team) => (team.phase === 'em-servico' ? STEPS.length - 1 : Math.max(0, STEPS.findIndex(([key]) => key === team.stage)));
  function stepsList(team) {
    const current = stepIndex(team);
    const done = team.phase === 'em-servico';
    return h('ol', { class: 'steps' }, STEPS.map(([, label], i) => h('li', { class: done || i < current ? 'ok' : i === current ? 'now' : '', text: label })));
  }

  const crewOf = (person, teams) => teams.find((t) => t.city === person.city && (t.commander?.name === person.name || t.driver?.name === person.name)) ?? null;

  /** [kind, text] of what this officer is doing in the running test. */
  function situationOf(person, team, cpu, now) {
    if (person.duty === 'cpu') {
      if (!cpu || cpu.name !== person.name) return ['fora', 'Fora de serviço'];
      return cpu.phase === 'em-servico' ? ['servico', 'Em serviço na CPU'] : cpu.phase === 'entrando' ? ['entrando', 'Assumindo a CPU'] : ['saindo', 'Saindo da CPU'];
    }
    if (!team) return ['fora', 'Fora de serviço (outra equipe ou teste parado)'];
    if (team.attendance) return ['servico', `Em atendimento (${team.attendance.protocol})`];
    if (team.phase === 'em-servico') return ['servico', 'Em serviço'];
    if (team.phase === 'entrando') return ['entrando', `Entrando: ${STEPS[stepIndex(team)][1]}${team.enterSince ? `, há ${minutesSince(team.enterSince, now)} min` : ''}`];
    return ['saindo', 'Saindo / troca de turno'];
  }

  function visible(person, kind) {
    const query = $('officer-search').value.trim().toLowerCase();
    if (query && !`${person.rank} ${person.name} ${person.city}`.toLowerCase().includes(query)) return false;
    const filter = $('officer-filter').value;
    if (filter === 'pendentes') return !person.result;
    if (filter === 'entrando') return kind === 'entrando';
    if (filter === 'servico') return kind === 'servico';
    return true;
  }

  function officerCard(person, team, kind, label) {
    const key = `${person.city}|${person.name}`;
    const card = h('details', { class: `officer ${kind}` },
      h('summary', {},
        h('i', { class: `dot ${DOT[kind]}` }),
        h('span', { class: 'who' }, document.createTextNode(`${person.rank} ${person.name}`), h('small', { text: ` · ${DUTY[person.duty] ?? person.duty}${person.team ? ` ${person.team}` : ''}` })),
        h('span', { class: `chip ${person.result ?? ''}`, text: person.result ? RESULT[person.result] : 'pendente' })),
      h('dl', {},
        h('dt', { text: 'Função' }), h('dd', { text: DUTY[person.duty] ?? person.duty }),
        h('dt', { text: 'Lotação' }), h('dd', { text: person.duty === 'cpu' ? 'CPU' : `${person.city}, equipe ${person.team ?? '—'}` }),
        h('dt', { text: 'Conta' }), h('dd', { text: person.result ? RESULT[person.result] : 'aguardando a preparação' }),
        h('dt', { text: 'No teste' }), h('dd', { text: label })),
      team && team.phase !== 'saindo' ? stepsList(team) : null);
    card.open = openOfficers.has(key);
    card.addEventListener('toggle', () => (card.open ? openOfficers.add(key) : openOfficers.delete(key)));
    return card;
  }

  function drawPreparation(prep, teams, cpu, now) {
    const box = $('prep-cities');
    const accounts = prep?.accounts ?? [];
    const done = accounts.filter((a) => a.result).length;
    let status = prep ? PREP_STATUS[prep.status] ?? prep.status : 'Nenhuma preparação registrada. Use "Preparar efetivo".';
    if (prep?.status === 'concluida') status += ` às ${clock(prep.finishedAt)}`;
    if (prep?.status === 'falhou' && prep.error) status += `: ${prep.error}`;
    $('prep-status').textContent = status;
    $('prep-count').textContent = accounts.length ? `${done} de ${accounts.length} policiais · ${percent(done, accounts.length)}` : '';
    $('prep-bar').style.width = percent(done, accounts.length);
    if (!accounts.length) return box.replaceChildren(h('p', { class: 'muted', text: 'Nenhum policial preparado ainda.' }));
    const cityStatus = new Map((prep.cities ?? []).map((c) => [c.name, c.status]));
    const cities = [...new Set(accounts.map((a) => a.city))];
    const sections = [];
    for (const city of cities) {
      const people = accounts.filter((a) => a.city === city);
      const cards = [];
      for (const person of people) {
        const team = crewOf(person, teams);
        const [kind, label] = situationOf(person, team, cpu, now);
        if (visible(person, kind)) cards.push(officerCard(person, team, kind, label));
      }
      if (!cards.length) continue;
      const ready = people.filter((p) => p.result).length;
      const state = cityStatus.get(city) ?? (ready === people.length ? 'pronta' : 'aguardando');
      sections.push(h('section', { class: 'city' },
        h('div', { class: 'city-head' }, h('b', { text: city }),
          h('span', { class: 'muted', text: `${ready}/${people.length}` }), h('span', { class: `chip ${state}`, text: CITY_STATUS[state] ?? state })),
        h('div', { class: 'mini-bar' }, h('span', { style: `width:${percent(ready, people.length)}` })),
        h('div', { class: 'people-list' }, cards)));
    }
    box.replaceChildren(...(sections.length ? sections : [h('p', { class: 'muted', text: 'Nenhum policial com esse filtro.' })]));
  }

  function drawEntries(prep, teams, cpu, now) {
    const expected = prep?.cities?.length || teams.length;
    const onDuty = teams.filter((t) => t.phase === 'em-servico').length;
    $('entry-count').textContent = expected ? `${onDuty} de ${expected} guarnições em serviço` : '';
    $('entry-bar').style.width = percent(onDuty, expected);
    $('prep-cpu').textContent = cpu ? `CPU: ${officer(cpu)} (${cpu.phase === 'em-servico' ? 'em serviço' : cpu.phase === 'entrando' ? 'assumindo' : cpu.phase})` : 'CPU: —';
    const shown = teams
      .filter((t) => t.phase === 'entrando' || (t.phase === 'em-servico' && t.enterSince && now - t.enterSince < RECENT_ENTRY_MS))
      .sort((a, b) => (a.phase === 'entrando' ? 0 : 1) - (b.phase === 'entrando' ? 0 : 1) || a.city.localeCompare(b.city));
    const box = $('prep-entries');
    if (!shown.length) return box.replaceChildren(h('p', { class: 'muted', text: 'Nenhuma guarnição entrando em serviço agora.' }));
    box.replaceChildren(...shown.map((t) => {
      const done = t.phase === 'em-servico';
      return h('article', { class: `entry${done ? ' done' : ''}` },
        h('div', { class: 'card-head' }, h('b', { text: `${t.city} · Equipe ${t.team}` }),
          h('span', { class: 'muted', text: done ? 'em serviço' : t.enterSince ? `há ${minutesSince(t.enterSince, now)} min` : '' })),
        h('div', { class: 'people' }, 'Cmt ', h('strong', { text: officer(t.commander) }), ' · Mot ', h('strong', { text: officer(t.driver) })),
        stepsList(t));
    }));
  }

  function drawEfetivo(view) {
    lastView = view;
    drawPreparation(view.prep, view.teams, view.cpu, view.now);
    drawEntries(view.prep, view.teams, view.cpu, view.now);
  }
  for (const id of ['officer-search', 'officer-filter'])
    $(id).addEventListener('input', () => lastView && drawEfetivo(lastView));

  // ── Ready to start: banner, highlighted button, toast and desktop notification ──
  let wasReady = null;
  function drawReady(data) {
    const ready = !data.process.running && !data.process.startBlocker && data.state?.status !== 'finalizado';
    $('ready').classList.toggle('hidden', !ready);
    document.querySelector('.controls [data-action="iniciar"]').classList.toggle('ready', ready);
    if (ready && wasReady === false) {
      toast('Efetivo pronto: o botão "Iniciar" está liberado.');
      notifyDesktop('SRGOP · Pronto para iniciar', 'A preparação do efetivo terminou. A simulação já pode ser iniciada.');
    }
    wasReady = ready;
  }

  function notifyDesktop(title, body) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
    } catch {
      /* notifications unavailable: the toast and banner still show */
    }
  }

  async function refresh() {
    try {
      const response = await fetch('/api/painel', { cache: 'no-store' });
      const data = await response.json();
      const live = data.snapshot && data.now - data.snapshot.t < 60000 && data.snapshot.status !== 'finalizado';
      const teams = live ? data.snapshot.teams : [];
      drawHeader(data);
      drawMap(teams, data.now);
      drawAttendances(teams, data.now);
      drawEvents(data.events);
      setCount('k-servico', teams.filter((t) => t.phase === 'em-servico').length);
      setCount('k-atendimento', teams.filter((t) => t.attendance).length);
      setCount('k-livres', teams.filter((t) => t.phase === 'em-servico' && !t.attendance).length);
      setCount('k-fotos', data.photos.count);
      firstDraw = false;
      drawJobs(data.process.jobs ?? {});
      const cpu = live ? data.snapshot.cpu : null;
      $('cpu').textContent = cpu ? `CPU: ${officer(cpu)} (${cpu.phase === 'em-servico' ? 'em serviço' : cpu.phase})` : 'CPU: —';
      drawEfetivo({ prep: data.preparation, teams, cpu, now: data.now });
      drawReady(data);
    } catch {
      $('status-pill').textContent = 'Painel sem resposta';
    }
  }

  // ── Actions ──────────────────────────────────────────────────────
  const CONFIRM = {
    encerrar: 'Encerrar o teste agora? Todos os atendimentos em andamento serão finalizados imediatamente e o relatório final será gerado.',
    interromper: 'Interromper o processo agora? Não gera relatório. Use só se o simulador travou.',
    'novo-teste': 'Arquivar o teste anterior e começar outro do zero?',
    preparar: 'Sortear nomes e patentes e atualizar as contas da simulação no sistema publicado?',
  };

  function toast(message, error = false) {
    const box = $('toast');
    box.textContent = message;
    box.className = `toast show${error ? ' error' : ''}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (box.className = 'toast'), 6000);
  }

  async function act(action, body = {}) {
    const response = await fetch(`/api/acao/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-painel': '1' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Falha ao executar.');
    return data;
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    let body = {};
    if (action === 'limpar-tudo') {
      const typed = prompt('Isto apaga do banco publicado TODOS os dados criados pelas simulações e os relatórios, eventos e fotos deste computador. Não dá para desfazer.\n\nDigite LIMPAR para confirmar:');
      if (typed === null) return;
      body = { confirmacao: typed.trim().toUpperCase() };
    } else if (CONFIRM[action] && !confirm(CONFIRM[action])) return;
    if (action === 'preparar' && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    button.disabled = true;
    try {
      toast((await act(action, body)).message);
      if (action === 'foto') loadPhotos();
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
      refresh();
    }
  });

  for (const tab of document.querySelectorAll('[data-tab]'))
    tab.addEventListener('click', () => {
      for (const other of document.querySelectorAll('[data-tab]')) {
        other.setAttribute('aria-selected', String(other === tab));
        $(`tab-${other.dataset.tab}`).classList.toggle('hidden', other !== tab);
      }
      if (tab.dataset.tab === 'operacao') {
        map.invalidateSize();
        if (follow) drawMap(lastTeams, Date.now());
      }
      if (tab.dataset.tab === 'configurar') {
        loadSettings();
        loadPhotos();
      }
    });

  async function loadSettings() {
    const { fields, values } = await (await fetch('/api/configuracoes', { cache: 'no-store' })).json();
    $('fields').replaceChildren(...fields.map((f) =>
      h('label', {}, h('span', { text: f.label }), h('input', { type: 'number', name: f.key, min: f.min, max: f.max, step: f.step, value: values[f.key], required: '' }))));
  }

  $('settings').addEventListener('submit', async (event) => {
    event.preventDefault();
    const changes = Object.fromEntries([...new FormData(event.target)].map(([k, v]) => [k, Number(v)]));
    try {
      toast((await act('configuracoes', changes)).message);
    } catch (error) {
      toast(error.message, true);
    }
  });

  async function loadPhotos() {
    const photos = await (await fetch('/api/fotos', { cache: 'no-store' })).json();
    $('photos').replaceChildren(...photos.slice(-12).reverse().map((name) =>
      h('a', { href: `/fotos/${name}`, target: '_blank', rel: 'noopener', title: name }, h('img', { src: `/fotos/${name}`, alt: `Foto do painel ${name}`, loading: 'lazy' }))));
  }

  setInterval(() => ($('clock').textContent = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza' })), 1000);
  refresh();
  setInterval(refresh, REFRESH_MS);
})();
