import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "./styles.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
});

const API = "http://localhost:5000/api";
const MENU_ITEMS = [
  "Dashboard",
  "Ocorrências",
  "Despacho",
  "Guarnições",
  "Viaturas",
  "Mapa",
  "Relatórios",
  "Usuários",
  "Administrativo",
  "Configurações",
  "Sair"
];

const cidadesMapa = [
  { nome: "Belo Horizonte", posicao: [-19.9167, -43.9345] },
  { nome: "Contagem", posicao: [-19.9317, -44.0536] },
  { nome: "Betim", posicao: [-19.9673, -44.1983] },
  { nome: "Santa Luzia", posicao: [-19.7697, -43.8514] }
];

const initialRegister = { nomeCompleto: "", email: "", senha: "", cidade: "" };
const initialLogin = { email: "", senha: "" };
const initialOccurrence = { data: "", hora: "", municipio: "", tipoCrime: "", localizacao: "", prioridade: "Baixa" };
const initialCrew = { nome: "", cidade: "", composicaoTexto: "" };
const initialVehicle = { placa: "", prefixo: "", cidade: "", kilometragem: "", dataRevisao: "" };

function App() {
  const [screen, setScreen] = useState("auth");
  const [authMode, setAuthMode] = useState("login");
  const [activeMenu, setActiveMenu] = useState("Dashboard");
  const [message, setMessage] = useState("");
  const [loggedUser, setLoggedUser] = useState(null);
  const [systemTime, setSystemTime] = useState(new Date());
  const [countdown, setCountdown] = useState(300);
  const [registerData, setRegisterData] = useState(initialRegister);
  const [loginData, setLoginData] = useState(initialLogin);
  const [occurrenceData, setOccurrenceData] = useState(initialOccurrence);
  const [occurrences, setOccurrences] = useState([]);
  const [crewData, setCrewData] = useState(initialCrew);
  const [crews, setCrews] = useState([]);
  const [vehicleData, setVehicleData] = useState(initialVehicle);
  const [vehicles, setVehicles] = useState([]);
  const [theme, setTheme] = useState("dark");
  const [cardsConfig, setCardsConfig] = useState({ mostrarAlertas: true, mostrarCPU: true });

  useEffect(() => {
    const timer = setInterval(() => setSystemTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (screen !== "dashboard") return;
    if (countdown <= 0) {
      handleLogout();
      return;
    }
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, screen]);

  useEffect(() => {
    if (screen === "dashboard") {
      loadOccurrences();
      loadCrews();
      loadVehicles();
    }
  }, [screen]);

  const dashboardCards = useMemo(() => {
    const hoje = occurrences.filter((item) => item.data === new Date().toISOString().slice(0, 10)).length;
    const abertas = occurrences.filter((item) => item.status === "Em Aberto").length;
    const encerradas = occurrences.filter((item) => item.status === "Encerrada").length;
    const cidades = new Set(occurrences.map((item) => item.municipio).filter(Boolean)).size;
    const base = [
      { nome: "Hoje", valor: hoje, cor: "blue" },
      { nome: "Mês", valor: occurrences.length, cor: "violet" },
      { nome: "Ano", valor: occurrences.length, cor: "cyan" },
      { nome: "Encerradas", valor: encerradas, cor: "green" },
      { nome: "Em Aberto", valor: abertas, cor: "orange" },
      { nome: "Alertas", valor: abertas > 0 ? abertas : 0, cor: "red", hide: !cardsConfig.mostrarAlertas },
      { nome: "Viaturas", valor: vehicles.length, cor: "slate" },
      { nome: "Guarnições", valor: crews.length, cor: "indigo" },
      { nome: "Cidades", valor: cidades || cidadesMapa.length, cor: "teal" },
      { nome: "Tempo Médio", valor: "18 min", cor: "amber" },
      { nome: "Operações", valor: 12, cor: "pink" },
      { nome: "Armas Apreendidas", valor: 4, cor: "purple" },
      { nome: "Veículos Recuperados", valor: 7, cor: "emerald" },
      { nome: "Conduzidos", valor: 15, cor: "rose" },
      { nome: "Abordagens", valor: 33, cor: "sky" },
      { nome: "CPU", valor: "89%", cor: "zinc", hide: !cardsConfig.mostrarCPU }
    ];
    return base.filter((item) => !item.hide);
  }, [occurrences, vehicles, crews, cardsConfig]);

  async function loadOccurrences() {
    try {
      const res = await fetch(`${API}/occurrences`);
      const data = await res.json();
      setOccurrences(data);
    } catch {
      setMessage("Não foi possível carregar as ocorrências.");
    }
  }

  async function loadCrews() {
    try {
      const res = await fetch(`${API}/crews`);
      const data = await res.json();
      setCrews(data);
    } catch {}
  }

  async function loadVehicles() {
    try {
      const res = await fetch(`${API}/vehicles`);
      const data = await res.json();
      setVehicles(data);
    } catch {}
  }

  function handleLogout() {
    setLoggedUser(null);
    setScreen("auth");
    setAuthMode("login");
    setActiveMenu("Dashboard");
    setCountdown(300);
    setMessage("Sessão encerrada. Faça login novamente.");
  }

  function formatCountdown(total) {
    const minutes = String(Math.floor(total / 60)).padStart(2, "0");
    const seconds = String(total % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerData)
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "Erro ao cadastrar usuário.");
      return;
    }
    setMessage(data.message);
    setRegisterData(initialRegister);
    setAuthMode("login");
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginData)
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "Erro ao fazer login.");
      return;
    }
    setLoggedUser(data.user);
    setScreen("dashboard");
    setActiveMenu("Dashboard");
    setCountdown(300);
    setMessage("");
    setLoginData(initialLogin);
  }

  async function saveOccurrence(event) {
    event.preventDefault();
    const response = await fetch(`${API}/occurrences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...occurrenceData, status: "Em Aberto" })
    });
    if (response.ok) {
      setOccurrenceData(initialOccurrence);
      loadOccurrences();
      setMessage("Ocorrência registrada com sucesso.");
    }
  }

  async function changeOccurrenceStatus(id, payload) {
    await fetch(`${API}/occurrences/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    loadOccurrences();
  }

  async function saveCrew(event) {
    event.preventDefault();
    const payload = {
      nome: crewData.nome,
      cidade: crewData.cidade,
      composicao: crewData.composicaoTexto.split(",").map((item) => item.trim()).filter(Boolean)
    };
    const response = await fetch(`${API}/crews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      setCrewData(initialCrew);
      loadCrews();
    }
  }

  async function removeCrew(id) {
    await fetch(`${API}/crews/${id}`, { method: "DELETE" });
    loadCrews();
  }

  async function saveVehicle(event) {
    event.preventDefault();
    const response = await fetch(`${API}/vehicles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...vehicleData, kilometragem: Number(vehicleData.kilometragem || 0) })
    });
    if (response.ok) {
      setVehicleData(initialVehicle);
      loadVehicles();
    }
  }

  async function removeVehicle(id) {
    await fetch(`${API}/vehicles/${id}`, { method: "DELETE" });
    loadVehicles();
  }

  if (screen === "auth") {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-header">
            <h1>{authMode === "login" ? "Entrar" : "Criar conta"}</h1>
            <p>
              {authMode === "login"
                ? "Acesse o sistema operacional"
                : "Cadastre nome completo, email, senha e cidade"}
            </p>
          </div>

          {authMode === "login" ? (
            <form className="auth-form" onSubmit={handleLoginSubmit}>
              <label>E-mail<input type="email" name="email" value={loginData.email} onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} required /></label>
              <label>Senha<input type="password" name="senha" value={loginData.senha} onChange={(e) => setLoginData({ ...loginData, senha: e.target.value })} required /></label>
              <button type="submit" className="primary-btn">Entrar</button>
              <p className="switch-line">Não tem uma conta? <button type="button" className="link-btn" onClick={() => { setAuthMode("register"); setMessage(""); }}>Cadastre-se</button></p>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleRegisterSubmit}>
              <label>Nome completo<input type="text" value={registerData.nomeCompleto} onChange={(e) => setRegisterData({ ...registerData, nomeCompleto: e.target.value })} required /></label>
              <label>E-mail<input type="email" value={registerData.email} onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })} required /></label>
              <label>Senha<input type="password" value={registerData.senha} onChange={(e) => setRegisterData({ ...registerData, senha: e.target.value })} required /></label>
              <label>Cidade<input type="text" value={registerData.cidade} onChange={(e) => setRegisterData({ ...registerData, cidade: e.target.value })} required /></label>
              <button type="submit" className="primary-btn">Cadastrar</button>
              <p className="switch-line">Já tem uma conta? <button type="button" className="link-btn" onClick={() => { setAuthMode("login"); setMessage(""); }}>Voltar para login</button></p>
            </form>
          )}

          {message && <p className="message-box">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <div className={`dashboard-layout theme-${theme}`}>
      <aside className="sidebar">
        <div className="brand-box">
          <h2>Sistema COP</h2>
          <span>Operações integradas</span>
        </div>
        <nav className="sidebar-nav">
          {MENU_ITEMS.map((item) => (
            <button
              key={item}
              className={`menu-item ${activeMenu === item ? "active" : ""}`}
              onClick={() => (item === "Sair" ? setActiveMenu("Sair") : setActiveMenu(item))}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h1>{activeMenu}</h1>
            <p>Controle operacional em tempo real</p>
          </div>
          <div className="topbar-right">
            <div className="status-chip">Usuário: <strong>{loggedUser?.nomeCompleto}</strong></div>
            <div className="status-chip">Hora: <strong>{systemTime.toLocaleTimeString("pt-BR")}</strong></div>
            <div className={`status-chip ${countdown < 60 ? "danger" : ""}`}>Auto logoff: <strong>{formatCountdown(countdown)}</strong></div>
          </div>
        </header>

        {activeMenu === "Dashboard" && (
          <section className="content-section">
            <div className="cards-grid">
              {dashboardCards.map((card) => (
                <article key={card.nome} className={`metric-card ${card.cor}`}>
                  <span>{card.nome}</span>
                  <strong>{card.valor}</strong>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeMenu === "Ocorrências" && (
          <section className="content-section two-col">
            <form className="panel-card" onSubmit={saveOccurrence}>
              <h3>Cadastro de ocorrência</h3>
              <div className="form-grid">
                <label>Data<input type="date" value={occurrenceData.data} onChange={(e) => setOccurrenceData({ ...occurrenceData, data: e.target.value })} required /></label>
                <label>Hora<input type="time" value={occurrenceData.hora} onChange={(e) => setOccurrenceData({ ...occurrenceData, hora: e.target.value })} required /></label>
                <label>Município<input type="text" value={occurrenceData.municipio} onChange={(e) => setOccurrenceData({ ...occurrenceData, municipio: e.target.value })} required /></label>
                <label>Tipo de crime<input type="text" value={occurrenceData.tipoCrime} onChange={(e) => setOccurrenceData({ ...occurrenceData, tipoCrime: e.target.value })} required /></label>
                <label>Localização<input type="text" value={occurrenceData.localizacao} onChange={(e) => setOccurrenceData({ ...occurrenceData, localizacao: e.target.value })} required /></label>
                <label>Prioridade<select value={occurrenceData.prioridade} onChange={(e) => setOccurrenceData({ ...occurrenceData, prioridade: e.target.value })}><option>Baixa</option><option>Média</option><option>Alta</option></select></label>
              </div>
              <div className="button-row">
                <button className="primary-btn" type="submit">Registrar</button>
                <button className="secondary-btn" type="button">Alterar</button>
                <button className="danger-btn" type="button" onClick={() => setOccurrenceData(initialOccurrence)}>Cancelar</button>
              </div>
            </form>
            <div className="panel-card">
              <h3>Ocorrências registradas</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Município</th><th>Crime</th><th>Prioridade</th><th>Status</th></tr></thead>
                  <tbody>
                    {occurrences.map((item) => (
                      <tr key={item._id}>
                        <td>{item.data} {item.hora}</td>
                        <td>{item.municipio}</td>
                        <td>{item.tipoCrime}</td>
                        <td>{item.prioridade}</td>
                        <td>{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeMenu === "Despacho" && (
          <section className="content-section">
            <div className="panel-card">
              <h3>Encaminhamento de ocorrências</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Município</th><th>Crime</th><th>Status</th><th>Destino</th><th>Ações</th></tr></thead>
                  <tbody>
                    {occurrences.map((item) => (
                      <tr key={item._id}>
                        <td>{item.municipio}</td>
                        <td>{item.tipoCrime}</td>
                        <td>{item.status}</td>
                        <td>{item.encaminhadaPara || item.guarnicaoDestino || "Pendente"}</td>
                        <td>
                          <div className="inline-actions">
                            <button className="secondary-btn small" onClick={() => changeOccurrenceStatus(item._id, { encaminhadaPara: item.municipio, status: "Despachada" })}>Cidade</button>
                            <button className="primary-btn small" onClick={() => changeOccurrenceStatus(item._id, { guarnicaoDestino: "Guarnição Alfa", status: "Despachada" })}>Guarnição</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel-card mt16">
              <h3>Atendimento</h3>
              <p>Utilize esta área para aceitar, rejeitar, encaminhar para outra cidade e solicitar apoio de outra guarnição.</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Ocorrência</th><th>Status</th><th>Atendimento</th></tr></thead>
                  <tbody>
                    {occurrences.map((item) => (
                      <tr key={`${item._id}-att`}>
                        <td>{item.tipoCrime} - {item.municipio}</td>
                        <td>{item.status}</td>
                        <td>
                          <div className="inline-actions">
                            <button className="primary-btn small" onClick={() => changeOccurrenceStatus(item._id, { status: "Em Atendimento" })}>Aceitar</button>
                            <button className="danger-btn small" onClick={() => changeOccurrenceStatus(item._id, { status: "Rejeitada" })}>Rejeitar</button>
                            <button className="secondary-btn small" onClick={() => changeOccurrenceStatus(item._id, { status: "Encaminhada com Apoio" })}>Pedir apoio</button>
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

        {activeMenu === "Guarnições" && (
          <section className="content-section two-col">
            <form className="panel-card" onSubmit={saveCrew}>
              <h3>Cadastro de guarnição</h3>
              <div className="form-grid">
                <label>Nome da guarnição<input type="text" value={crewData.nome} onChange={(e) => setCrewData({ ...crewData, nome: e.target.value })} required /></label>
                <label>Cidade<input type="text" value={crewData.cidade} onChange={(e) => setCrewData({ ...crewData, cidade: e.target.value })} required /></label>
                <label className="full-width">Composição (separe por vírgula)<input type="text" value={crewData.composicaoTexto} onChange={(e) => setCrewData({ ...crewData, composicaoTexto: e.target.value })} /></label>
              </div>
              <div className="button-row">
                <button className="primary-btn" type="submit">Cadastrar guarnição</button>
                <button className="secondary-btn" type="button">Assumir serviço</button>
                <button className="danger-btn" type="button">Sair da guarnição</button>
              </div>
            </form>
            <div className="panel-card">
              <h3>Lista de guarnições</h3>
              <div className="stack-list">
                {crews.map((crew) => (
                  <div key={crew._id} className="list-card">
                    <div>
                      <strong>{crew.nome}</strong>
                      <p>{crew.cidade}</p>
                      <small>{crew.composicao?.join(", ") || "Sem composição cadastrada"}</small>
                    </div>
                    <button className="danger-btn small" onClick={() => removeCrew(crew._id)}>Remover</button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeMenu === "Viaturas" && (
          <section className="content-section two-col">
            <form className="panel-card" onSubmit={saveVehicle}>
              <h3>Cadastro de viaturas</h3>
              <div className="form-grid">
                <label>Placa<input type="text" value={vehicleData.placa} onChange={(e) => setVehicleData({ ...vehicleData, placa: e.target.value })} required /></label>
                <label>Prefixo<input type="text" value={vehicleData.prefixo} onChange={(e) => setVehicleData({ ...vehicleData, prefixo: e.target.value })} required /></label>
                <label>Cidade<input type="text" value={vehicleData.cidade} onChange={(e) => setVehicleData({ ...vehicleData, cidade: e.target.value })} required /></label>
                <label>Kilometragem<input type="number" value={vehicleData.kilometragem} onChange={(e) => setVehicleData({ ...vehicleData, kilometragem: e.target.value })} /></label>
                <label>Data de revisão<input type="date" value={vehicleData.dataRevisao} onChange={(e) => setVehicleData({ ...vehicleData, dataRevisao: e.target.value })} /></label>
              </div>
              <div className="button-row">
                <button className="primary-btn" type="submit">Salvar viatura</button>
                <button className="secondary-btn" type="button">Alterar</button>
                <button className="danger-btn" type="button">Excluir</button>
              </div>
            </form>
            <div className="panel-card">
              <h3>Administração de viaturas</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Placa</th><th>Prefixo</th><th>Cidade</th><th>KM</th><th>Revisão</th><th></th></tr></thead>
                  <tbody>
                    {vehicles.map((vehicle) => (
                      <tr key={vehicle._id}>
                        <td>{vehicle.placa}</td>
                        <td>{vehicle.prefixo}</td>
                        <td>{vehicle.cidade}</td>
                        <td>{vehicle.kilometragem}</td>
                        <td>{vehicle.dataRevisao}</td>
                        <td><button className="danger-btn small" onClick={() => removeVehicle(vehicle._id)}>Excluir</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeMenu === "Mapa" && (
          <section className="content-section">
            <div className="panel-card">
              <h3>Mapa operacional</h3>
              <p>O mapa exibe cidades, ocorrências e viaturas em tempo real; nesta base inicial os marcadores são atualizados a partir dos cadastros locais. React Leaflet permite renderizar mapas com camadas e marcadores usando OpenStreetMap. [web:140][web:146]</p>
              <div className="map-wrap">
                <MapContainer center={[-19.9167, -43.9345]} zoom={10} style={{ height: "100%", width: "100%" }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {cidadesMapa.map((cidade) => (
                    <Marker key={cidade.nome} position={cidade.posicao}><Popup>{cidade.nome}</Popup></Marker>
                  ))}
                </MapContainer>
              </div>
            </div>
          </section>
        )}

        {activeMenu === "Relatórios" && (
          <section className="content-section two-col">
            <div className="panel-card"><h3>Relatórios</h3><ul className="simple-list"><li>Ocorrências por período</li><li>Guarnições em serviço</li><li>Usuários cadastrados</li><li>Viaturas por cidade</li></ul></div>
            <div className="panel-card"><h3>Resumo atual</h3><p>Total de ocorrências: {occurrences.length}</p><p>Total de guarnições: {crews.length}</p><p>Total de viaturas: {vehicles.length}</p></div>
          </section>
        )}

        {activeMenu === "Usuários" && (
          <section className="content-section">
            <div className="panel-card"><h3>Gerenciamento de usuários</h3><p>Cadastre, consulte e altere permissões dos usuários utilizando a coleção <code>users</code> do MongoDB e a rota <code>/api/auth/register</code>. O schema de usuários contém nome completo, email, senha, cidade e permissão. [web:123][web:129]</p></div>
          </section>
        )}

        {activeMenu === "Administrativo" && (
          <section className="content-section">
            <div className="panel-card"><h3>Administrativo</h3><p>Área para controles internos, supervisão de atendimento, filas, escalas e validações operacionais.</p></div>
          </section>
        )}

        {activeMenu === "Configurações" && (
          <section className="content-section two-col">
            <div className="panel-card">
              <h3>Configurações do sistema</h3>
              <div className="form-grid one-col">
                <label>Tema<select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="dark">Escuro</option><option value="light">Claro</option></select></label>
                <label className="checkbox-line"><input type="checkbox" checked={cardsConfig.mostrarAlertas} onChange={(e) => setCardsConfig({ ...cardsConfig, mostrarAlertas: e.target.checked })} /> Mostrar card de alertas</label>
                <label className="checkbox-line"><input type="checkbox" checked={cardsConfig.mostrarCPU} onChange={(e) => setCardsConfig({ ...cardsConfig, mostrarCPU: e.target.checked })} /> Mostrar card de CPU</label>
              </div>
            </div>
            <div className="panel-card"><h3>Preferências</h3><p>Use esta área para ajustar cor, cards visíveis e futuras configurações globais da página inicial.</p></div>
          </section>
        )}

        {activeMenu === "Sair" && (
          <section className="content-section">
            <div className="panel-card centered-card">
              <h3>Deseja sair do sistema?</h3>
              <p>Ao confirmar, o logoff será realizado e a aplicação retornará para a tela de login.</p>
              <div className="button-row center">
                <button className="danger-btn" onClick={handleLogout}>Sim, sair</button>
                <button className="secondary-btn" onClick={() => setActiveMenu("Dashboard")}>Cancelar</button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
