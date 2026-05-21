import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const MENUS = [
  "Dashboard",
  "Ocorrências",
  "Despachos",
  "Atendimento",
  "Guarnições",
  "Viaturas",
  "Mapa",
  "Relatórios",
  "Usuários",
  "Administrativo",
  "Configurações",
  "Sair",
];

const CITY_OPTIONS = [
  "Presidente Dutra",
  "Tuntun",
  "Graça Aranha",
  "Governador Eugênio Barrros",
  "Governador Luis Rocha",
  "Senador Alexandre Costa",
  "Santo Antônio dos Lopes",
  "São Domingos",
  "Santa Filomena",
  "Capinzal do Norte",
  "Dom Pedro",
  "Força Tática",
  "Governador Archer",
  "Joselândia",
  "Gonçalves Dias",
  "São José dos Basílios"
];

const dashboardCardsBase = [
  "Hoje", "Mês", "Ano", "Encerradas", "Em Aberto", "Alertas", "Viaturas", "Guarnições",
  "Cidades", "Tempo Médio", "Operações", "Armas Apreendidas", "Veículos Recuperados", "Conduzidos", "Abordagens", "CPU"
];

const initialRegister = {
  nomeCompleto: "",
  email: "",
  senha: "",
  confirmarSenha: "",
  cidade: "Imperatriz",
  tipoAcesso: "Praça",
};

const initialOccurrence = {
  data: "",
  hora: "",
  municipio: "Imperatriz",
  tipoCrime: "",
  localizacao: "",
  descricao: "",
  prioridade: "Média",
};

const initialCrew = { nome: "", cidade: "Imperatriz", viatura: "", composicao: "" };
const initialVehicle = { placa: "", prefixo: "", cidade: "Imperatriz", kilometragem: 0, dataRevisao: "", ultimoMotorista: "" };
const initialUserForm = {
  nomeCompleto: "",
  email: "",
  senha: "",
  cidade: "Imperatriz",
  tipoAcesso: "Praça",
  guarnicao: "",
  responsavelServico: false,
  dataServico: "",
  ativo: true,
};

function App() {
  const [sessionUser, setSessionUser] = useState(null);
  const [activeMenu, setActiveMenu] = useState("Dashboard");
  const [showRegister, setShowRegister] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", senha: "" });
  const [registerForm, setRegisterForm] = useState(initialRegister);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [clock, setClock] = useState(new Date());
  const [idleSeconds, setIdleSeconds] = useState(300);
  const [occurrences, setOccurrences] = useState([]);
  const [crews, setCrews] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [occurrenceForm, setOccurrenceForm] = useState(initialOccurrence);
  const [crewForm, setCrewForm] = useState(initialCrew);
  const [vehicleForm, setVehicleForm] = useState(initialVehicle);
  const [userForm, setUserForm] = useState(initialUserForm);
  const [userSearch, setUserSearch] = useState("");
  const [editingUserId, setEditingUserId] = useState(null);
  const [dispatchAlert, setDispatchAlert] = useState(null);
  const [attendanceTimer, setAttendanceTimer] = useState(0);
  const [busyOccurrence, setBusyOccurrence] = useState(null);
  const [settings, setSettings] = useState({ temaEscuro: true, mostrarMapa: true, mostrarRelatorios: true });

  function showNotice(text, type = "info") {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => {
      setMessage("");
      setMessageType("info");
    }, 4500);
  }

  async function handleApiResponse(response, fallbackMessage) {
    const data = await response.json();
    if (!response.ok) {
      const origem = data?.origem ? ` Origem: ${data.origem}` : "";
      showNotice((data?.message || fallbackMessage) + origem, "error");
      setActiveMenu("Dashboard");
      throw new Error(data?.message || fallbackMessage);
    }
    return data;
  }

  async function loadOccurrences() {
    const response = await fetch(`${API}/occurrences`);
    const data = await handleApiResponse(response, "Erro ao carregar ocorrências.");
    setOccurrences(Array.isArray(data) ? data : []);
  }

  async function loadCrews() {
    const response = await fetch(`${API}/crews`);
    const data = await handleApiResponse(response, "Erro ao carregar guarnições.");
    setCrews(Array.isArray(data) ? data : []);
  }

  async function loadVehicles() {
    const response = await fetch(`${API}/vehicles`);
    const data = await handleApiResponse(response, "Erro ao carregar viaturas.");
    setVehicles(Array.isArray(data) ? data : []);
  }

  async function loadUsers() {
    const response = await fetch(`${API}/users`);
    const data = await handleApiResponse(response, "Erro ao carregar usuários.");
    setUsers(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    if (!sessionUser) return;
    loadOccurrences().catch(() => {});
    loadCrews().catch(() => {});
    loadVehicles().catch(() => {});
    loadUsers().catch(() => {});
  }, [sessionUser]);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!sessionUser) return;
    const interval = setInterval(() => {
      setIdleSeconds((prev) => {
        if (prev <= 1) {
          showNotice("Sessão encerrada por inatividade.", "error");
          logout(false);
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;
    const reset = () => setIdleSeconds(300);
    ["mousemove", "keydown", "click", "scroll"].forEach((eventName) => window.addEventListener(eventName, reset));
    return () => ["mousemove", "keydown", "click", "scroll"].forEach((eventName) => window.removeEventListener(eventName, reset));
  }, [sessionUser]);

  useEffect(() => {
    if (!busyOccurrence) return;
    const interval = setInterval(() => setAttendanceTimer((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [busyOccurrence]);

  const dashboardStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentYear = new Date().getFullYear().toString();
    const avgSeconds = occurrences.length
      ? Math.round(occurrences.reduce((sum, item) => sum + (item.tempoAtendimentoSegundos || 0), 0) / occurrences.length)
      : 0;
    const cpu = users.find((user) => user.responsavelServico && user.dataServico === today);

    return {
      Hoje: occurrences.filter((item) => item.data === today).length,
      "Mês": occurrences.filter((item) => (item.data || "").startsWith(currentMonth)).length,
      "Ano": occurrences.filter((item) => (item.data || "").startsWith(currentYear)).length,
      Encerradas: occurrences.filter((item) => item.status === "Encerrada").length,
      "Em Aberto": occurrences.filter((item) => item.status !== "Encerrada").length,
      Alertas: occurrences.filter((item) => item.prioridade === "Alta").length,
      Viaturas: vehicles.length,
      Guarnições: crews.length,
      Cidades: CITY_OPTIONS.length,
      "Tempo Médio": `${Math.floor(avgSeconds / 60)}m ${avgSeconds % 60}s`,
      Operações: occurrences.filter((item) => item.status === "Em Atendimento").length,
      "Armas Apreendidas": 0,
      "Veículos Recuperados": 0,
      Conduzidos: 0,
      Abordagens: occurrences.length,
      CPU: cpu ? cpu.nomeCompleto : "Não definido",
    };
  }, [occurrences, vehicles, crews, users]);

  const filteredUsers = users.filter((user) => {
    const term = userSearch.toLowerCase();
    return [user.nomeCompleto, user.email, user.cidade, user.tipoAcesso, user.guarnicao]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(term));
  });

  async function handleLogin(event) {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await handleApiResponse(response, "Erro ao fazer login.");
      setSessionUser(data.user);
      setIdleSeconds(300);
      showNotice("Login realizado com sucesso.", "success");
    } catch {
      return;
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerForm),
      });
      await handleApiResponse(response, "Erro ao cadastrar usuário.");
      showNotice("Cadastro realizado com sucesso. Faça login para continuar.", "success");
      setShowRegister(false);
      setRegisterForm(initialRegister);
    } catch {
      return;
    }
  }

  function logout(showMessage = true) {
    setSessionUser(null);
    setActiveMenu("Dashboard");
    setLoginForm({ email: "", senha: "" });
    setBusyOccurrence(null);
    setAttendanceTimer(0);
    if (showMessage) showNotice("Logoff realizado com sucesso.", "success");
  }

  async function saveOccurrence(event) {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/occurrences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...occurrenceForm, status: "Em Aberto" }),
      });
      await handleApiResponse(response, "Erro ao registrar ocorrência.");
      setOccurrenceForm(initialOccurrence);
      showNotice("Ocorrência registrada com sucesso.", "success");
      loadOccurrences();
    } catch {
      return;
    }
  }

  async function saveCrew(event) {
    event.preventDefault();
    if (sessionUser?.tipoAcesso === "Praça") return showNotice("Usuário do tipo Praça não pode alterar guarnições.", "error");
    try {
      const response = await fetch(`${API}/crews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...crewForm, composicao: crewForm.composicao.split(",").map((item) => item.trim()).filter(Boolean) }),
      });
      await handleApiResponse(response, "Erro ao cadastrar guarnição.");
      setCrewForm(initialCrew);
      showNotice("Guarnição cadastrada com sucesso.", "success");
      loadCrews();
    } catch {
      return;
    }
  }

  async function saveVehicle(event) {
    event.preventDefault();
    if (sessionUser?.tipoAcesso === "Praça") return showNotice("Usuário do tipo Praça não pode alterar viaturas.", "error");
    try {
      const response = await fetch(`${API}/vehicles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vehicleForm),
      });
      await handleApiResponse(response, "Erro ao cadastrar viatura.");
      setVehicleForm(initialVehicle);
      showNotice("Viatura cadastrada com sucesso.", "success");
      loadVehicles();
    } catch {
      return;
    }
  }

  async function saveUser(event) {
    event.preventDefault();
    if (sessionUser?.tipoAcesso === "Praça") return showNotice("Usuário do tipo Praça não pode alterar usuários.", "error");
    try {
      const url = editingUserId ? `${API}/users/${editingUserId}` : `${API}/users`;
      const method = editingUserId ? "PUT" : "POST";
      const payload = { ...userForm };
      if (editingUserId) delete payload.senha;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await handleApiResponse(response, "Erro ao salvar usuário.");
      setUserForm(initialUserForm);
      setEditingUserId(null);
      showNotice(editingUserId ? "Usuário alterado com sucesso." : "Usuário cadastrado com sucesso.", "success");
      loadUsers();
    } catch {
      return;
    }
  }

  async function deleteUser(id) {
    if (sessionUser?.tipoAcesso === "Praça") return showNotice("Usuário do tipo Praça não pode excluir usuários.", "error");
    if (!window.confirm("Deseja realmente excluir este usuário?")) return;
    try {
      const response = await fetch(`${API}/users/${id}`, { method: "DELETE" });
      await handleApiResponse(response, "Erro ao excluir usuário.");
      showNotice("Usuário excluído com sucesso.", "success");
      loadUsers();
    } catch {
      return;
    }
  }

  function editUser(user) {
    setEditingUserId(user._id);
    setUserForm({
      nomeCompleto: user.nomeCompleto || "",
      email: user.email || "",
      senha: "",
      cidade: user.cidade || "Imperatriz",
      tipoAcesso: user.tipoAcesso || "Praça",
      guarnicao: user.guarnicao || "",
      responsavelServico: user.responsavelServico || false,
      dataServico: user.dataServico || "",
      ativo: user.ativo ?? true,
    });
  }

  async function assignDispatch(occurrenceId, guarnicaoDestino) {
    try {
      const response = await fetch(`${API}/dispatch/${occurrenceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guarnicaoDestino, status: "Despachada" }),
      });
      const data = await handleApiResponse(response, "Erro ao encaminhar ocorrência.");
      setDispatchAlert(data);
      showNotice("Ocorrência encaminhada com sucesso.", "success");
      loadOccurrences();
    } catch {
      return;
    }
  }

  function acceptAttendance(item) {
    setBusyOccurrence(item);
    setAttendanceTimer(0);
    setDispatchAlert(null);
    showNotice("Atendimento iniciado. Outras abas foram bloqueadas.", "success");
  }

  async function finishAttendance() {
    if (!busyOccurrence) return;
    try {
      const response = await fetch(`${API}/occurrences/${busyOccurrence._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Encerrada", tempoAtendimentoSegundos: attendanceTimer }),
      });
      await handleApiResponse(response, "Erro ao encerrar atendimento.");
      setBusyOccurrence(null);
      setAttendanceTimer(0);
      showNotice("Atendimento encerrado com sucesso.", "success");
      loadOccurrences();
      setActiveMenu("Dashboard");
    } catch {
      return;
    }
  }

  function canAccessMenu(menu) {
    if (!busyOccurrence) return true;
    return menu === "Atendimento" || menu === "Sair";
  }

  function formatCountdown(totalSeconds) {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  if (!sessionUser) {
    return (
      <div className="auth-shell">
        <div className="auth-brand">
          <div className="brand-badge">18º BPM • Maranhão</div>
          <h1>SRGOP</h1>
          <p>Sistema de Recebimento e Gerenciamento de Ocorrências Policiais com autenticação, dashboard operacional e módulos integrados.</p>
        </div>

        <div className="auth-card">
          <div className="auth-tabs">
            <button className={!showRegister ? "active" : ""} onClick={() => setShowRegister(false)}>Login</button>
            <button className={showRegister ? "active" : ""} onClick={() => setShowRegister(true)}>Cadastro</button>
          </div>

          {message && <div className={`toast ${messageType}`}>{message}</div>}

          {!showRegister ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <label>E-mail<input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} required /></label>
              <label>Senha<input type="password" value={loginForm.senha} onChange={(e) => setLoginForm({ ...loginForm, senha: e.target.value })} required /></label>
              <button className="primary-btn" type="submit">Entrar</button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleRegister}>
              <label>Nome Completo<input type="text" value={registerForm.nomeCompleto} onChange={(e) => setRegisterForm({ ...registerForm, nomeCompleto: e.target.value })} required /></label>
              <label>E-mail<input type="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} required /></label>
              <label>Senha<input type="password" value={registerForm.senha} onChange={(e) => setRegisterForm({ ...registerForm, senha: e.target.value })} required /></label>
              <label>Confirmar Senha<input type="password" value={registerForm.confirmarSenha} onChange={(e) => setRegisterForm({ ...registerForm, confirmarSenha: e.target.value })} required /></label>
              <label>Cidade<select value={registerForm.cidade} onChange={(e) => setRegisterForm({ ...registerForm, cidade: e.target.value })}>{CITY_OPTIONS.map((city) => <option key={city}>{city}</option>)}</select></label>
              <label>Tipo de Acesso<select value={registerForm.tipoAcesso} onChange={(e) => setRegisterForm({ ...registerForm, tipoAcesso: e.target.value })}><option>Administrativo</option><option>Oficial</option><option>Praça</option></select></label>
              <button className="primary-btn" type="submit">Cadastrar</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={settings.temaEscuro ? "app-shell dark" : "app-shell"}>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">S</div>
          <div>
            <strong>SRGOP</strong>
            <span>18º BPM • MA</span>
          </div>
        </div>

        <nav className="menu-list">
          {MENUS.map((menu) => (
            <button
              key={menu}
              className={activeMenu === menu ? "menu-item active" : "menu-item"}
              onClick={() => {
                if (menu === "Sair") return window.confirm("Deseja sair do sistema?") && logout();
                if (!canAccessMenu(menu)) return showNotice("Atendimento em andamento. Finalize o atendimento para acessar outras abas.", "error");
                setActiveMenu(menu);
              }}
            >
              {menu}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h2>{activeMenu}</h2>
            <p>Recebimento e gerenciamento de ocorrências policiais</p>
          </div>
          <div className="topbar-meta">
            <div><span>Usuário</span><strong>{sessionUser.nomeCompleto}</strong></div>
            <div><span>Hora do sistema</span><strong>{clock.toLocaleTimeString("pt-BR")}</strong></div>
            <div><span>Tempo de sessão</span><strong>{formatCountdown(idleSeconds)}</strong></div>
          </div>
        </header>

        {message && <div className={`toast inline ${messageType}`}>{message}</div>}
        {dispatchAlert && <audio autoPlay src="https://actions.google.com/sounds/v1/alarms/beep_short.ogg" />}

        {busyOccurrence && (
          <section className="alert-panel">
            <div>
              <h3>Atendimento em andamento</h3>
              <p>Ocorrência: {busyOccurrence.tipoCrime} • {busyOccurrence.municipio} • {busyOccurrence.localizacao}</p>
            </div>
            <div className="attendance-timer">{formatCountdown(attendanceTimer)}</div>
            <button className="primary-btn" onClick={finishAttendance}>Encerrar atendimento</button>
          </section>
        )}

        {activeMenu === "Dashboard" && (
          <section className="dashboard-grid">
            {dashboardCardsBase.map((card, index) => (
              <article key={card} className={`stat-card tone-${(index % 6) + 1}`}>
                <span>{card}</span>
                <strong>{dashboardStats[card]}</strong>
              </article>
            ))}
          </section>
        )}

        {activeMenu === "Ocorrências" && (
          <section className="content-split">
            <form className="panel-card" onSubmit={saveOccurrence}>
              <h3>Cadastro de Ocorrências</h3>
              <div className="form-grid two-columns">
                <label>Data<input type="date" value={occurrenceForm.data} onChange={(e) => setOccurrenceForm({ ...occurrenceForm, data: e.target.value })} required /></label>
                <label>Hora<input type="time" value={occurrenceForm.hora} onChange={(e) => setOccurrenceForm({ ...occurrenceForm, hora: e.target.value })} required /></label>
                <label>Município<select value={occurrenceForm.municipio} onChange={(e) => setOccurrenceForm({ ...occurrenceForm, municipio: e.target.value })}>{CITY_OPTIONS.map((city) => <option key={city}>{city}</option>)}</select></label>
                <label>Tipo de crime<input type="text" value={occurrenceForm.tipoCrime} onChange={(e) => setOccurrenceForm({ ...occurrenceForm, tipoCrime: e.target.value })} required /></label>
                <label>Localização<input type="text" value={occurrenceForm.localizacao} onChange={(e) => setOccurrenceForm({ ...occurrenceForm, localizacao: e.target.value })} required /></label>
                <label>Prioridade<select value={occurrenceForm.prioridade} onChange={(e) => setOccurrenceForm({ ...occurrenceForm, prioridade: e.target.value })}><option>Alta</option><option>Média</option><option>Baixa</option></select></label>
                <label className="full-width">Descrição<textarea rows="5" value={occurrenceForm.descricao} onChange={(e) => setOccurrenceForm({ ...occurrenceForm, descricao: e.target.value })} /></label>
                <label className="full-width">Anexar arquivo<input type="file" /></label>
              </div>
              <div className="button-row">
                <button className="primary-btn" type="submit">Registrar</button>
                <button className="secondary-btn" type="button" onClick={() => setOccurrenceForm(initialOccurrence)}>Cancelar</button>
              </div>
            </form>
            <div className="panel-card">
              <h3>Últimas ocorrências registradas</h3>
              <div className="stack-list">
                {occurrences.slice(0, 8).map((item) => (
                  <div className="list-row" key={item._id}>
                    <div>
                      <strong>{item.tipoCrime}</strong>
                      <p>{item.municipio} • {item.data} {item.hora}</p>
                    </div>
                    <div className="inline-actions">
                      <button className="secondary-btn small">Visualizar</button>
                      <button className="secondary-btn small" onClick={() => window.print()}>Imprimir</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeMenu === "Despachos" && (
          <section className="panel-card">
            <h3>Encaminhamento para guarnições</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ocorrência</th><th>Município</th><th>Prioridade</th><th>Status</th><th>Guarnição</th><th>Ação</th></tr></thead>
                <tbody>
                  {occurrences.map((item) => (
                    <tr key={item._id}>
                      <td>{item.tipoCrime}</td>
                      <td>{item.municipio}</td>
                      <td>{item.prioridade}</td>
                      <td>{item.status}</td>
                      <td>
                        <select defaultValue={item.guarnicaoDestino || ""} onChange={(e) => assignDispatch(item._id, e.target.value)}>
                          <option value="">Selecione</option>
                          {crews.map((crew) => <option key={crew._id} value={crew.nome}>{crew.nome}</option>)}
                        </select>
                      </td>
                      <td><button className="primary-btn small" onClick={() => assignDispatch(item._id, item.guarnicaoDestino || crews[0]?.nome || "")}>Encaminhar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeMenu === "Atendimento" && (
          <section className="panel-card">
            <h3>Atendimento operacional</h3>
            <div className="stack-list">
              {occurrences.filter((item) => item.status === "Despachada" || item.status === "Em Atendimento").map((item) => (
                <div className="list-row wide" key={item._id}>
                  <div>
                    <strong>{item.tipoCrime}</strong>
                    <p>{item.municipio} • {item.localizacao} • Guarnição: {item.guarnicaoDestino || "Não definida"}</p>
                  </div>
                  <div className="inline-actions">
                    <button className="primary-btn small" onClick={() => acceptAttendance(item)}>Aceitar</button>
                    <button className="secondary-btn small">Rejeitar</button>
                    <button className="secondary-btn small">Encaminhar</button>
                    <button className="secondary-btn small">Pedir apoio</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeMenu === "Guarnições" && (
          <section className="content-split">
            <form className="panel-card" onSubmit={saveCrew}>
              <h3>Cadastro de Guarnições</h3>
              <div className="form-grid">
                <label>Nome<input type="text" value={crewForm.nome} onChange={(e) => setCrewForm({ ...crewForm, nome: e.target.value })} required /></label>
                <label>Cidade<select value={crewForm.cidade} onChange={(e) => setCrewForm({ ...crewForm, cidade: e.target.value })}>{CITY_OPTIONS.map((city) => <option key={city}>{city}</option>)}</select></label>
                <label>Associar viatura<select value={crewForm.viatura} onChange={(e) => setCrewForm({ ...crewForm, viatura: e.target.value })}><option value="">Selecione</option>{vehicles.map((vehicle) => <option key={vehicle._id} value={vehicle.prefixo}>{vehicle.prefixo} • {vehicle.placa}</option>)}</select></label>
                <label>Composição<input type="text" value={crewForm.composicao} onChange={(e) => setCrewForm({ ...crewForm, composicao: e.target.value })} placeholder="Separe por vírgula" /></label>
              </div>
              <div className="button-row">
                <button className="primary-btn" type="submit">Cadastrar</button>
                <button className="secondary-btn" type="button" onClick={() => showNotice("Ingressando na guarnição. Informe se é motorista ao implementar o modal específico.", "info")}>Ingressar</button>
              </div>
            </form>
            <div className="panel-card">
              <h3>Lista de guarnições</h3>
              <div className="stack-list">
                {crews.map((crew) => (
                  <div className="list-row" key={crew._id}>
                    <div>
                      <strong>{crew.nome}</strong>
                      <p>{crew.cidade} • Viatura: {crew.viatura || "Não associada"}</p>
                    </div>
                    <button className="secondary-btn small">Visualizar</button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeMenu === "Viaturas" && (
          <section className="content-split">
            <form className="panel-card" onSubmit={saveVehicle}>
              <h3>Cadastro de Viaturas</h3>
              <div className="form-grid">
                <label>Placa<input type="text" value={vehicleForm.placa} onChange={(e) => setVehicleForm({ ...vehicleForm, placa: e.target.value.toUpperCase() })} required /></label>
                <label>Prefixo<input type="text" value={vehicleForm.prefixo} onChange={(e) => setVehicleForm({ ...vehicleForm, prefixo: e.target.value })} required /></label>
                <label>Cidade<select value={vehicleForm.cidade} onChange={(e) => setVehicleForm({ ...vehicleForm, cidade: e.target.value })}>{CITY_OPTIONS.map((city) => <option key={city}>{city}</option>)}</select></label>
                <label>Kilometragem<input type="number" value={vehicleForm.kilometragem} onChange={(e) => setVehicleForm({ ...vehicleForm, kilometragem: Number(e.target.value) })} /></label>
                <label>Data de revisão<input type="date" value={vehicleForm.dataRevisao} onChange={(e) => setVehicleForm({ ...vehicleForm, dataRevisao: e.target.value })} /></label>
                <label>Último motorista<input type="text" value={vehicleForm.ultimoMotorista} onChange={(e) => setVehicleForm({ ...vehicleForm, ultimoMotorista: e.target.value })} /></label>
              </div>
              <button className="primary-btn" type="submit">Salvar viatura</button>
            </form>
            <div className="panel-card">
              <h3>Viaturas cadastradas</h3>
              <div className="stack-list">
                {vehicles.map((vehicle) => (
                  <div className="list-row" key={vehicle._id}>
                    <div>
                      <strong>{vehicle.prefixo} • {vehicle.placa}</strong>
                      <p>{vehicle.cidade} • {vehicle.kilometragem} km • Último motorista: {vehicle.ultimoMotorista || "Não informado"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeMenu === "Mapa" && settings.mostrarMapa && (
          <section className="panel-card map-panel">
            <h3>Mapa operacional</h3>
            <div className="map-frame">
              <MapContainer center={[-5.5264, -47.4918]} zoom={8} scrollWheelZoom>
                <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[-5.5264, -47.4918]}>
                  <Popup>18º BPM • Área base</Popup>
                </Marker>
                {occurrences.slice(0, 5).map((item, index) => (
                  <Marker key={item._id} position={[-5.52 + index * 0.08, -47.49 + index * 0.06]}>
                    <Popup>{item.tipoCrime} • {item.municipio}</Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </section>
        )}

        {activeMenu === "Relatórios" && (
          <section className="panel-card">
            <h3>Relatórios</h3>
            <div className="report-grid">
              <article><strong>Ocorrências por data</strong><p>{occurrences.length} registros disponíveis para filtragem.</p></article>
              <article><strong>Guarnições</strong><p>{crews.length} guarnições cadastradas.</p></article>
              <article><strong>Usuários</strong><p>{users.length} usuários cadastrados.</p></article>
              <article><strong>Viaturas</strong><p>{vehicles.length} viaturas cadastradas.</p></article>
            </div>
          </section>
        )}

        {activeMenu === "Usuários" && (
          <section className="content-split users-page">
            <form className="panel-card" onSubmit={saveUser}>
              <h3>{editingUserId ? "Alterar usuário" : "Cadastrar novo usuário"}</h3>
              <div className="form-grid">
                <label>Nome completo<input type="text" value={userForm.nomeCompleto} onChange={(e) => setUserForm({ ...userForm, nomeCompleto: e.target.value })} required /></label>
                <label>E-mail<input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} required /></label>
                {!editingUserId && <label>Senha<input type="password" value={userForm.senha} onChange={(e) => setUserForm({ ...userForm, senha: e.target.value })} required /></label>}
                <label>Cidade<select value={userForm.cidade} onChange={(e) => setUserForm({ ...userForm, cidade: e.target.value })}>{CITY_OPTIONS.map((city) => <option key={city}>{city}</option>)}</select></label>
                <label>Tipo de Acesso<select value={userForm.tipoAcesso} onChange={(e) => setUserForm({ ...userForm, tipoAcesso: e.target.value })}><option>Administrativo</option><option>Oficial</option><option>Praça</option></select></label>
                <label>Guarnição<input type="text" value={userForm.guarnicao} onChange={(e) => setUserForm({ ...userForm, guarnicao: e.target.value })} /></label>
                <label className="checkbox-line"><input type="checkbox" checked={userForm.responsavelServico} onChange={(e) => setUserForm({ ...userForm, responsavelServico: e.target.checked })} />Responsável pelo serviço diário</label>
                <label>Data do serviço<input type="date" value={userForm.dataServico} onChange={(e) => setUserForm({ ...userForm, dataServico: e.target.value })} /></label>
              </div>
              <div className="button-row">
                <button className="primary-btn" type="submit">{editingUserId ? "Salvar alterações" : "Cadastrar usuário"}</button>
                <button className="secondary-btn" type="button" onClick={() => { setUserForm(initialUserForm); setEditingUserId(null); }}>Limpar</button>
              </div>
            </form>

            <div className="panel-card">
              <h3>Consulta de usuários</h3>
              <label>Pesquisar<input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Nome, e-mail, cidade, acesso ou guarnição" /></label>
              <div className="table-wrap top-gap">
                <table>
                  <thead><tr><th>Nome</th><th>E-mail</th><th>Cidade</th><th>Acesso</th><th>Guarnição</th><th>CPU</th><th>Ações</th></tr></thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user._id}>
                        <td>{user.nomeCompleto}</td>
                        <td>{user.email}</td>
                        <td>{user.cidade}</td>
                        <td>{user.tipoAcesso}</td>
                        <td>{user.guarnicao || "-"}</td>
                        <td>{user.responsavelServico ? `Sim (${user.dataServico || "sem data"})` : "Não"}</td>
                        <td>
                          <div className="inline-actions">
                            <button className="secondary-btn small" onClick={() => editUser(user)}>Alterar</button>
                            <button className="danger-btn small" onClick={() => deleteUser(user._id)}>Excluir</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeMenu === "Administrativo" && (
          <section className="panel-card">
            <h3>Administrativo</h3>
            <p>Módulo reservado para fluxos de auditoria, autorizações especiais e liberação de encerramento de serviço antes de 24h.</p>
          </section>
        )}

        {activeMenu === "Configurações" && (
          <section className="panel-card">
            <h3>Configurações</h3>
            <div className="settings-grid">
              <label className="checkbox-line"><input type="checkbox" checked={settings.temaEscuro} onChange={(e) => setSettings({ ...settings, temaEscuro: e.target.checked })} />Tema escuro</label>
              <label className="checkbox-line"><input type="checkbox" checked={settings.mostrarMapa} onChange={(e) => setSettings({ ...settings, mostrarMapa: e.target.checked })} />Mostrar mapa no sistema</label>
              <label className="checkbox-line"><input type="checkbox" checked={settings.mostrarRelatorios} onChange={(e) => setSettings({ ...settings, mostrarRelatorios: e.target.checked })} />Exibir relatórios</label>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;