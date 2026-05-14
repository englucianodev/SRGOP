import { useState } from "react";
import "./Auth.css";

function AuthPage() {
  const [tela, setTela] = useState("login");
  const [mensagem, setMensagem] = useState("");

  const [loginData, setLoginData] = useState({
    email: "",
    senha: "",
  });

  const [cadastroData, setCadastroData] = useState({
    nomeCompleto: "",
    email: "",
    senha: "",
    cidade: "",
  });

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCadastroChange = (event) => {
    const { name, value } = event.target;
    setCadastroData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setMensagem("");

    try {
      const resposta = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(loginData),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setMensagem(dados.message || "Erro ao fazer login.");
        return;
      }

      setMensagem(`Bem-vindo, ${dados.user.nomeCompleto}!`);
    } catch (error) {
      setMensagem("Erro ao conectar com o servidor.");
    }
  };

  const handleCadastroSubmit = async (event) => {
    event.preventDefault();
    setMensagem("");

    try {
      const resposta = await fetch("http://localhost:5000/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cadastroData),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setMensagem(dados.message || "Erro ao cadastrar.");
        return;
      }

      setMensagem(dados.message);

      setCadastroData({
        nomeCompleto: "",
        email: "",
        senha: "",
        cidade: "",
      });

      setTela("login");
    } catch (error) {
      setMensagem("Erro ao conectar com o servidor.");
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-container">
        <div className="auth-header">
          <h1>{tela === "login" ? "Entrar" : "Criar conta"}</h1>
          <p>
            {tela === "login"
              ? "Acesse sua conta para continuar"
              : "Cadastre seus dados para criar uma conta"}
          </p>
        </div>

        {tela === "login" ? (
          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <div className="form-group">
              <label htmlFor="login-email">E-mail</label>
              <input
                type="email"
                id="login-email"
                name="email"
                placeholder="seuemail@exemplo.com"
                value={loginData.email}
                onChange={handleLoginChange}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-senha">Senha</label>
              <input
                type="password"
                id="login-senha"
                name="senha"
                placeholder="Digite sua senha"
                value={loginData.senha}
                onChange={handleLoginChange}
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" className="auth-button">
              Entrar
            </button>

            <p className="auth-switch">
              Não tem uma conta?{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setMensagem("");
                  setTela("cadastro");
                }}
              >
                Cadastre-se
              </button>
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleCadastroSubmit}>
            <div className="form-group">
              <label htmlFor="nomeCompleto">Nome completo</label>
              <input
                type="text"
                id="nomeCompleto"
                name="nomeCompleto"
                placeholder="Digite seu nome completo"
                value={cadastroData.nomeCompleto}
                onChange={handleCadastroChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="cadastro-email">E-mail</label>
              <input
                type="email"
                id="cadastro-email"
                name="email"
                placeholder="seuemail@exemplo.com"
                value={cadastroData.email}
                onChange={handleCadastroChange}
                autoComplete="email"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="cadastro-senha">Senha</label>
              <input
                type="password"
                id="cadastro-senha"
                name="senha"
                placeholder="Crie uma senha"
                value={cadastroData.senha}
                onChange={handleCadastroChange}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="cidade">Cidade</label>
              <input
                type="text"
                id="cidade"
                name="cidade"
                placeholder="Informe sua cidade"
                value={cadastroData.cidade}
                onChange={handleCadastroChange}
                required
              />
            </div>

            <button type="submit" className="auth-button">
              Cadastrar
            </button>

            <p className="auth-switch">
              Já tem uma conta?{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setMensagem("");
                  setTela("login");
                }}
              >
                Voltar para login
              </button>
            </p>
          </form>
        )}

        {mensagem && <p className="message">{mensagem}</p>}
      </section>
    </main>
  );
}

export default AuthPage;