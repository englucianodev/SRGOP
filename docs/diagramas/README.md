# Diagramas do SRGOP

Gerados a partir dos schemas Mongoose em `backend/models` e das regras em `backend/services`
(estado de 19/11/2026). As imagens PNG desta pasta foram capturadas de `visualizar.html`
(abra no navegador e use `?n=1` a `?n=6`); ao mudar um diagrama aqui, atualize também a lista
`DIAGRAMS` daquela página.

| Imagem | Conteúdo |
| --- | --- |
| `01-er-visao-geral.png` | Todas as entidades principais e como se ligam |
| `02-er-ocorrencias.png` | Ocorrência, despacho, atendimento, apoio e anexos, com campos |
| `03-er-turnos-frota.png` | Guarnição, turno, CPU, viaturas e checklists, com campos |
| `04-er-comunicacao-seguranca.png` | Chat, mensagens, emergência, notificações, sessão e auditoria |
| `05-fluxo-ocorrencia.png` | Ciclo de vida da ocorrência, incluindo chegada pelo GPS |
| `06-fluxo-turno.png` | Turno da guarnição e encerramento antecipado pelo CPU do dia |

## 1. Visão geral das entidades

```mermaid
---
title: SRGOP — Visão geral das entidades (MongoDB)
---
erDiagram
    City ||--o{ User : "lota"
    City ||--o{ Crew : "sedia"
    City ||--o{ Vehicle : "possui"
    City ||--o{ Occurrence : "localiza"
    User }o--o| Crew : "integra (em turno)"
    Crew |o--o| Vehicle : "opera"
    Crew ||--o{ CrewShift : "registra turnos"
    Crew |o--o| Occurrence : "atende agora"
    Occurrence ||--o{ Dispatch : "é despachada"
    Occurrence ||--o{ Attendance : "é atendida"
    Occurrence ||--o{ SupportRequest : "pede apoio"
    Occurrence ||--o{ Attachment : "tem anexos"
    Dispatch }o--|| Crew : "para"
    Attendance }o--|| Crew : "pela"
    Attendance }o--o| CrewShift : "no turno"
    SupportRequest }o--|| Crew : "apoio de"
    Vehicle ||--o{ VehicleHandover : "checklists"
    VehicleHandover }o--|| CrewShift : "no turno"
    User ||--o{ CpuShift : "assume o CPU"
    User ||--o{ Emergency : "aciona"
    User ||--o{ Notification : "recebe"
    User ||--o{ AuditLog : "gera"
```

## 2. Ocorrências, despachos e atendimentos

```mermaid
---
title: SRGOP — Ocorrências, despachos e atendimentos
---
erDiagram
    Occurrence {
        ObjectId _id PK
        String protocol UK
        Date occurredAt
        ObjectId city FK
        String crimeType
        String address
        Number latitude
        Number longitude
        String priority
        String status "Em aberto, Despachada, Em atendimento, Encerrada, Cancelada"
        ObjectId createdBy FK
        ObjectId crew FK
        ObjectId vehicle FK
        ObjectId acceptedBy FK
        Date dispatchedAt
        Date startedAt
        Date arrivedAt "manual ou pelo GPS"
        Date endedAt
        Number weapons
        Number recoveredVehicles
        Array involved
        Array history
        Boolean deleted
    }
    Dispatch {
        ObjectId _id PK
        ObjectId occurrence FK
        ObjectId crew FK
        ObjectId dispatchedBy FK
        String reason
        Date dispatchedAt
    }
    Attendance {
        ObjectId _id PK
        ObjectId occurrence FK
        ObjectId crew FK
        ObjectId shift FK
        ObjectIdList members FK
        ObjectId acceptedBy FK
        Date startedAt
        Date arrivedAt
        Date endedAt
        Number durationSeconds
        String status
    }
    SupportRequest {
        ObjectId _id PK
        ObjectId occurrence FK
        ObjectId targetCrew FK
        ObjectId requestedBy FK
        ObjectId authorizedBy FK
        ObjectId shift FK
        String status
    }
    Attachment {
        ObjectId _id PK
        ObjectId occurrence FK
        String name
        String mime
        Buffer data
        ObjectId uploadedBy FK
    }
    Crew {
        ObjectId _id PK
        String name
        String status
        ObjectId currentOccurrence FK
    }
    User {
        ObjectId _id PK
        String name
        String role "Administrativo, Oficial, Praça"
    }
    City {
        ObjectId _id PK
        String name
    }
    City ||--o{ Occurrence : "localiza"
    User ||--o{ Occurrence : "registra"
    Crew |o--o{ Occurrence : "responsável"
    Occurrence ||--o{ Dispatch : "despachos"
    Occurrence ||--o{ Attendance : "atendimentos"
    Occurrence ||--o{ SupportRequest : "apoios"
    Occurrence ||--o{ Attachment : "anexos"
    Crew ||--o{ Dispatch : "recebe"
    User ||--o{ Dispatch : "despacha"
    Crew ||--o{ Attendance : "executa"
    User ||--o{ Attendance : "aceita"
    Crew ||--o{ SupportRequest : "presta apoio"
    User ||--o{ Attachment : "envia"
```

## 3. Guarnições, turnos, CPU e frota

```mermaid
---
title: SRGOP — Guarnições, turnos, CPU e frota
---
erDiagram
    User {
        ObjectId _id PK
        String name
        String rank
        String email UK
        String role
        ObjectId city FK
        ObjectId crew FK "vazio fora de serviço"
        Boolean active
    }
    City {
        ObjectId _id PK
        String name
        Number latitude
        Number longitude
        Boolean active
    }
    Crew {
        ObjectId _id PK
        String name
        ObjectId city FK
        ObjectId vehicle FK
        String type "Viatura Convencional, Motocicleta"
        ObjectIdList members FK
        ObjectId driver FK
        Array motorcycleSeats
        String status "Disponível, Em atendimento, Indisponível, Fora de serviço"
        Date shiftStart
        Date shiftEnd
        ObjectId shift FK
        Object location "GPS compartilhado"
        ObjectId endedBy FK
    }
    CrewShift {
        ObjectId _id PK
        ObjectId crew FK
        String dutyDay
        String shiftMode
        ObjectId city FK
        ObjectId vehicle FK
        ObjectIdList members FK
        Array changes "entradas, saídas, motorista"
        Date start
        Date plannedEnd
        Date end
        ObjectId endedBy FK
        String reason
    }
    Vehicle {
        ObjectId _id PK
        String prefix UK
        String plate
        String type
        ObjectId city FK
        Number mileage
        String status "Disponível, Em operação, Em manutenção, Indisponível"
        Boolean inspectionHold
        ObjectId lastDriver FK
        ObjectId crew FK
    }
    VehicleHandover {
        ObjectId _id PK
        ObjectId crew FK
        ObjectId shift FK
        ObjectId vehicle FK
        ObjectId driver FK
        Object intake "checklist de recebimento"
        Object delivery "checklist de entrega"
        Date closedAt
    }
    CpuShift {
        ObjectId _id PK
        ObjectId officer FK
        String day
        Date start
        Date plannedEnd
        Date end
        String status "Aberto, Encerrado"
        ObjectId previous FK
        ObjectId next FK
        Array transfers "passagens de serviço"
    }
    DailyOfficer {
        ObjectId _id PK
        String day
        ObjectId officer FK
        ObjectId modifiedBy FK
    }
    City ||--o{ User : "lota"
    City ||--o{ Crew : "sedia"
    City ||--o{ Vehicle : "possui"
    User }o--o| Crew : "integra"
    Crew |o--o| User : "motorista"
    Crew |o--o| Vehicle : "opera"
    Crew ||--o{ CrewShift : "histórico de turnos"
    CrewShift }o--o| Vehicle : "usou"
    Vehicle ||--o{ VehicleHandover : "checklists"
    Crew ||--o{ VehicleHandover : "entrega e recebe"
    CrewShift ||--o{ VehicleHandover : "no turno"
    User ||--o{ VehicleHandover : "motorista"
    User ||--o{ CpuShift : "oficial do CPU"
    CpuShift |o--o| CpuShift : "anterior e seguinte"
    User ||--o{ DailyOfficer : "oficial do dia"
```

## 4. Comunicação, alertas, sessão e auditoria

```mermaid
---
title: SRGOP — Comunicação, alertas, sessão e auditoria
---
erDiagram
    User {
        ObjectId _id PK
        String name
        String role
    }
    Crew {
        ObjectId _id PK
        String name
    }
    CrewChat {
        ObjectId _id PK
        String name
        ObjectId createdBy FK
        Array memberships "guarnição e turno"
    }
    ChatMessage {
        ObjectId _id PK
        ObjectId chat FK
        ObjectId sender FK
        ObjectId sourceCrew FK
        String text
    }
    ChatAccess {
        ObjectId _id PK
        ObjectId chat FK
        ObjectId actor FK
        ObjectId session FK
        String reason
        Date expiresAt
    }
    CrewMessage {
        ObjectId _id PK
        ObjectId sender FK
        ObjectId sourceCrew FK
        ObjectId targetCrew FK
        ObjectIdList participants FK
        String text
    }
    Emergency {
        ObjectId _id PK
        ObjectId actor FK
        ObjectId crew FK
        ObjectId city FK
        Number latitude
        Number longitude
        ObjectIdList recipients FK
        ObjectIdList acknowledgedBy FK
        Date resolvedAt
        ObjectId resolvedBy FK
    }
    Notification {
        ObjectId _id PK
        ObjectId user FK
        String kind
        String title
        ObjectId occurrence FK
        ObjectId emergency FK
        ObjectId cpuShift FK
        ObjectId chat FK
        ObjectId chatMessage FK
        Boolean read
    }
    Session {
        ObjectId _id PK
        ObjectId user FK
        Date lastActivity
        Date expiresAt
    }
    PushSubscription {
        ObjectId _id PK
        ObjectId user FK
        ObjectId session FK
        String endpoint
    }
    PasswordReset {
        ObjectId _id PK
        ObjectId user FK
        String tokenHash
        Date expiresAt
    }
    ProfilePhoto {
        ObjectId _id PK
        ObjectId user FK
        Buffer data
    }
    AuditLog {
        ObjectId _id PK
        ObjectId actor FK
        String action
        String entity
        String entityId
        String detail
    }
    User ||--o{ ChatMessage : "envia"
    CrewChat ||--o{ ChatMessage : "contém"
    Crew ||--o{ ChatMessage : "origem"
    CrewChat ||--o{ ChatAccess : "acesso excepcional"
    User ||--o{ ChatAccess : "solicita"
    Session ||--o{ ChatAccess : "vale na sessão"
    User ||--o{ CrewMessage : "envia"
    Crew ||--o{ CrewMessage : "destino"
    User ||--o{ Emergency : "aciona"
    Crew |o--o{ Emergency : "envolvida"
    User ||--o{ Notification : "recebe"
    Emergency |o--o{ Notification : "gera"
    CrewChat |o--o{ Notification : "gera"
    User ||--o{ Session : "abre"
    Session ||--o{ PushSubscription : "assina push"
    User ||--o{ PasswordReset : "recupera senha"
    User ||--o| ProfilePhoto : "foto"
    User |o--o{ AuditLog : "registra ações"
```

Coleções sem relacionamento (configuração e proteção): `SystemSetting`, `InstitutionLogo`,
`LoginThrottle` e `OccurrenceSequence` (numeração de protocolos).

## 5. Fluxo da ocorrência

```mermaid
---
title: SRGOP — Fluxo da ocorrência
---
flowchart TD
    A([Cadastro da ocorrência]) --> B{Guarnição em serviço no<br/>município de quem cadastra?}
    B -- Sim --> E[Em atendimento<br/>início automático]
    B -- Não --> C[Em aberto<br/>alerta ao CPU do dia]
    C -- Cancelamento --> X([Cancelada])
    C -- CPU despacha guarnição disponível --> D[Despachada]
    D -- Recusa ou fim do turno --> C
    D -- Reencaminhamento com motivo --> D
    D -- Guarnição aceita --> E
    E --> G{Chegada ao local}
    G -- GPS a até 150 m,<br/>precisão até 100 m --> H[Chegada ao local<br/>registrada]
    G -- Botão manual --> H
    E -. Pedido de apoio .-> S[SupportRequest<br/>autorização da gestão]
    S -. Autorizado .-> E
    H --> F[Encerramento<br/>resumo, apreensões, envolvidos]
    E -- Encerrar sem chegada --> F
    F --> Z([Encerrada<br/>conta em Ocorrências atendidas])
```

## 6. Fluxo do turno da guarnição

```mermaid
---
title: SRGOP — Fluxo do turno da guarnição
---
flowchart TD
    A([Policial ingressa na guarnição]) --> B{Primeiro ingresso<br/>do serviço?}
    B -- Sim --> C[Turno aberto<br/>CrewShift criado, 8h às 8h]
    B -- Não --> D[Entra no turno em andamento]
    C --> M{É o motorista?}
    D --> M
    M -- Sim --> K[Checklist de recebimento<br/>VehicleHandover]
    M -- Não --> O
    K --> O[Em serviço<br/>GPS, despachos, atendimentos]
    O --> P{Saída antecipada<br/>de um policial ou da guarnição}
    P --> Q{Quem pede é o<br/>CPU do dia?}
    Q -- Não --> R[Recusado]
    Q -- Sim --> T{Último integrante ou<br/>guarnição inteira?}
    O -- Motociclista encerra o próprio<br/>serviço com checklist --> T
    T -- Não --> O
    T -- Sim --> U[Turno encerrado<br/>checklist de entrega, viatura liberada]
    O -- 8h do dia seguinte --> V[Encerramento automático<br/>depois do atendimento ativo]
    V --> U
    U --> W([Fora de serviço])
```
