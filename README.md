# Sistema SRGOP - Sistema de Recebimento e Gerenciamento de Ocorrências Policiais

Sistema web para gestão operacional com autenticação de usuários, dashboard inicial, cadastro e despacho de ocorrências, controle de guarnições, viaturas, mapa e áreas administrativas. O projeto foi estruturado com **React + Vite** no frontend, **Node.js + Express** no backend e **MongoDB** para persistência de dados.

## Visão geral

O sistema foi desenvolvido para centralizar o fluxo de atendimento operacional em uma única interface, com menu lateral, autenticação, indicadores no dashboard e módulos de cadastro e acompanhamento. A aplicação usa frontend separado do backend, o que facilita desenvolvimento local, publicação e manutenção.

## Funcionalidades

- Login e cadastro de usuários.
- Dashboard com indicadores, hora do sistema e logoff automático por tempo.
- Cadastro e gerenciamento de ocorrências.
- Encaminhamento e acompanhamento de despacho.
- Cadastro de guarnições e composição.
- Cadastro e administração de viaturas.
- Mapa operacional com base em React Leaflet.
- Área de relatórios, usuários, administrativo e configurações.

## Tecnologias

| Camada | Tecnologias |
|---|---|
| Frontend | React, Vite, CSS, React Leaflet |
| Backend | Node.js, Express, Mongoose, bcryptjs, cors, dotenv |
| Banco de dados | MongoDB |
| Publicação sugerida | Vercel (frontend), Render (backend), MongoDB Atlas(banco) |

## Estrutura do projeto

```bash
projeto/
  frontend/
    src/
      App.jsx
      main.jsx
      styles.css
    index.html
    package.json
  backend/
    models/
      User.js
      Occurrence.js
      Crew.js
      Vehicle.js
    routes/
      authRoutes.js
      occurrenceRoutes.js
      dispatchRoutes.js
      crewRoutes.js
      vehicleRoutes.js
    server.js
    package.json
    .env
```

## Requisitos

Antes de executar o projeto, é necessário ter instalado:

- Node.js
- npm
- MongoDB Atlas ou servidor MongoDB acessível
- Git

## Configuração local

### 1. Clonar o repositório

```bash
git clone https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
cd SEU-REPOSITORIO
```

### 2. Configurar o backend

Entre na pasta do backend:

```bash
cd backend
```

Instale as dependências:

```bash
npm install express mongoose cors dotenv bcryptjs
npm install -D nodemon
```

Crie um arquivo `.env` dentro da pasta `backend` com este conteúdo:

```env
MONGO_URI=mongodb+srv://SEU_USUARIO:SUA_SENHA@SEU_CLUSTER.mongodb.net/SEU_BANCO?retryWrites=true&w=majority
PORT=5000
```

A string de conexão deve ficar em variável de ambiente e não deve ser publicada no GitHub.
### 3. Configurar o frontend

Em outro terminal, entre na pasta do frontend:

```bash
cd frontend
```

Instale as dependências:

```bash
npm install
npm install leaflet react-leaflet
```

Se o frontend usar variável de ambiente para a API, crie um arquivo `.env` na pasta `frontend`:

```env
VITE_API_URL=http://localhost:5000/api
```

No Vite, apenas variáveis com prefixo `VITE_` ficam disponíveis no código do cliente via `import.meta.env`.

## Como executar em ambiente local

### Rodar o backend

Na pasta `backend`:

```bash
npm run dev
```

Se estiver tudo certo, o terminal deverá mostrar a conexão com o MongoDB e o servidor rodando na porta configurada.

### Rodar o frontend

Na pasta `frontend`:

```bash
npm run dev
```

O Vite normalmente disponibiliza a aplicação em um endereço como:

```bash
http://localhost:5173
```

## Como usar o sistema

### 1. Cadastro de usuário

Na tela inicial, clique em **Cadastre-se**.

Preencha os campos:
- Nome completo
- E-mail
- Senha
- Cidade

Ao enviar o formulário, o backend salva o usuário no MongoDB pela rota de cadastro e a senha é tratada com hash antes do armazenamento.

### 2. Login

Após o cadastro, volte para a tela de login.

Informe:
- E-mail
- Senha

Se os dados estiverem corretos, o sistema redireciona para a dashboard principal.

### 3. Dashboard

Após autenticar, o sistema exibe:

- Nome do usuário logado
- Hora atual do sistema
- Contador regressivo de 5 minutos
- Cards com indicadores operacionais

Quando o contador chega a zero, o sistema faz logoff automático e retorna para a tela de login.

### 4. Menu lateral

O menu lateral contém os módulos:

- Dashboard
- Ocorrências
- Despacho
- Guarnições
- Viaturas
- Mapa
- Relatórios
- Usuários
- Administrativo
- Configurações
- Sair

### 5. Ocorrências

Na aba **Ocorrências**, é possível cadastrar registros com:

- Data
- Hora
- Município
- Tipo de crime
- Localização
- Prioridade

Também existem botões para registrar, alterar ou cancelar o preenchimento.

### 6. Despacho

Na aba **Despacho**, as ocorrências cadastradas ficam disponíveis para encaminhamento por cidade ou guarnição. Também há uma área de atendimento para aceitar, rejeitar, encaminhar ou solicitar apoio.

### 7. Guarnições

Na aba **Guarnições**, é possível:

- Cadastrar guarnições
- Definir cidade
- Informar composição
- Assumir serviço
- Sair da guarnição

### 8. Viaturas

Na aba **Viaturas**, é possível cadastrar e administrar:

- Placa
- Prefixo
- Cidade
- Kilometragem
- Data de revisão
- Status

### 9. Mapa

A aba **Mapa** exibe um mapa operacional usando React Leaflet e OpenStreetMap, com possibilidade de representar cidades, ocorrências e viaturas por marcadores.

### 10. Sair

Na opção **Sair**, o sistema pergunta se o usuário deseja encerrar a sessão. Ao confirmar, o logoff é realizado e a aplicação retorna para a tela de login.

## Rotas principais da API

| Método | Rota | Função |
|---|---|---|
| POST | `/api/auth/register` | Cadastrar usuário |
| POST | `/api/auth/login` | Fazer login |
| GET | `/api/occurrences` | Listar ocorrências |
| POST | `/api/occurrences` | Criar ocorrência |
| PUT | `/api/occurrences/:id` | Atualizar ocorrência |
| DELETE | `/api/occurrences/:id` | Excluir ocorrência |
| GET | `/api/dispatch` | Listar ocorrências para despacho |
| PUT | `/api/dispatch/:id` | Atualizar status ou encaminhamento |
| GET | `/api/crews` | Listar guarnições |
| POST | `/api/crews` | Criar guarnição |
| PUT | `/api/crews/:id` | Atualizar guarnição |
| DELETE | `/api/crews/:id` | Excluir guarnição |
| GET | `/api/vehicles` | Listar viaturas |
| POST | `/api/vehicles` | Criar viatura |
| PUT | `/api/vehicles/:id` | Atualizar viatura |
| DELETE | `/api/vehicles/:id` | Excluir viatura |

## Publicação na internet

A publicação sugerida para esse projeto é:

- Frontend no Vercel
- Backend no Render
- Banco no MongoDB Atlas

Essa arquitetura é comum para projetos com Vite no cliente e Express no servidor, pois separa claramente build do frontend, execução do backend e persistência de dados.[web:202][web:203]

### Variáveis de ambiente em produção

#### Backend

No serviço do backend, configurar:

```env
MONGO_URI=sua_string_do_mongodb
PORT=5000
```

#### Frontend

No frontend, configurar:

```env
VITE_API_URL=https://seu-backend.onrender.com/api
```

No Vite, as variáveis do cliente devem usar prefixo `VITE_` para ficarem acessíveis no código do navegador.

## Cuidados de segurança

- Nunca publicar o arquivo `.env`.
- Nunca deixar credenciais do MongoDB no frontend.
- Manter `node_modules` fora do repositório.
- Usar hash de senha no backend com bcrypt.
- Restringir CORS para os domínios realmente utilizados em produção.

## Problemas comuns

### Erro `argument handler must be a function`

Esse erro normalmente acontece quando um arquivo de rota não exporta corretamente o router do Express. Todos os arquivos dentro de `backend/routes` devem terminar com:

```js
module.exports = router;
```

### Erro de conexão com MongoDB

Verifique:
- se a `MONGO_URI` está correta;
- se o IP do servidor está liberado no MongoDB Atlas;
- se o usuário e a senha do banco estão corretos.

### Variável não funciona no frontend

No Vite, variáveis sem prefixo `VITE_` não ficam disponíveis no cliente. Use `import.meta.env.VITE_API_URL` em vez de `process.env` no frontend.

## Melhorias futuras

- Autenticação com JWT
- Controle de permissões por perfil
- Integração com localização em tempo real
- Relatórios exportáveis em PDF
- Auditoria de ações do usuário
- Dashboard com indicadores vindos integralmente do banco de dados

## Licença

Defina aqui a licença desejada para o projeto, por exemplo MIT.
