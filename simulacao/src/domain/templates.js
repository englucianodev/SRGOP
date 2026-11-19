// Fallback texts used when the AI is off or out of quota. Entirely fictitious: no names,
// documents or real addresses. "{local}" is replaced by the generated street and district.
export const TEMPLATES = Object.freeze({
  mariaPenha: {
    descriptions: [
      'Solicitante informa que a companheira está sendo agredida verbalmente e ameaçada pelo convivente na residência em {local}. Há relato de agressões anteriores.',
      'Vítima relata, por telefone, que o ex-companheiro descumpriu medida protetiva e está em frente à residência em {local}, proferindo ameaças.',
      'Vizinhos acionam a guarnição informando gritos de socorro de mulher em residência localizada em {local}.',
    ],
    notes: ['Guarnição no local; vítima separada do suposto agressor.', 'Vítima orientada sobre a rede de proteção e medidas protetivas.'],
    summaries: [
      'Guarnição constatou a situação de violência doméstica. Autor conduzido à delegacia e vítima encaminhada para registro e medidas protetivas.',
      'Partes ouvidas no local. Vítima orientada e encaminhada à delegacia para representação; autor não localizado após buscas nas imediações.',
    ],
  },
  briga: {
    descriptions: [
      'Desentendimento entre vizinhos por causa de som alto e limites de terreno em {local}, com troca de ofensas e ameaça de agressão.',
      'Briga familiar entre irmãos em {local}, com quebra de objetos na residência. Solicitante pede presença policial.',
    ],
    notes: ['Partes separadas e acalmadas pela guarnição.', 'Realizada mediação; ânimos controlados.'],
    summaries: [
      'Conflito mediado no local. Partes orientadas a procurar a delegacia ou o juizado especial, se desejarem representar.',
      'Situação controlada após diálogo. Envolvidos cientificados das consequências legais em caso de reincidência.',
    ],
  },
  acidenteMaterial: {
    descriptions: [
      'Colisão entre automóvel e motocicleta em {local}, sem vítimas, com danos materiais e via parcialmente obstruída.',
      'Abalroamento traseiro entre dois veículos em {local}. Condutores sem lesões aparentes; divergência sobre a responsabilidade.',
    ],
    notes: ['Via sinalizada e trânsito organizado pela guarnição.', 'Condutores identificados; veículos removidos para o acostamento.'],
    summaries: [
      'Acidente sem vítimas. Partes orientadas sobre o registro do boletim; via liberada após a remoção dos veículos.',
    ],
  },
  acidenteFatal: {
    descriptions: [
      'Colisão grave entre motocicleta e caminhão em {local}, com vítima sem sinais vitais no local. SAMU acionado.',
      'Atropelamento em {local} com vítima fatal. Condutor permaneceu no local.',
    ],
    notes: ['Local isolado e preservado para a perícia.', 'Perícia e remoção acionadas; trânsito desviado.', 'Condutor submetido a teste de alcoolemia.'],
    summaries: [
      'Óbito constatado pelo SAMU. Local preservado até a chegada da perícia; corpo removido pelo órgão competente e ocorrência apresentada à delegacia.',
    ],
  },
  mandado: {
    descriptions: [
      'Cumprimento de mandado de prisão em aberto contra indivíduo residente em {local}, conforme consulta ao sistema.',
      'Informação de que procurado pela justiça está em estabelecimento comercial em {local}.',
    ],
    notes: ['Mandado confirmado no banco nacional de mandados.', 'Abordagem realizada com segurança.'],
    summaries: [
      'Mandado cumprido. Conduzido à delegacia sem uso de força, com integridade física preservada.',
      'Diligências no endereço sem localizar o procurado; familiares informados e informação repassada à inteligência.',
    ],
  },
  veiculo: {
    descriptions: [
      'Veículo com restrição de roubo localizado abandonado em {local}, conforme denúncia anônima.',
      'Motocicleta com placa adulterada e queixa de roubo encontrada em {local} durante patrulhamento.',
    ],
    notes: ['Restrição confirmada por consulta ao sistema.', 'Guincho acionado para remoção.'],
    summaries: [
      'Veículo recuperado e apresentado à delegacia para devolução ao proprietário.',
    ],
  },
  armaFogo: {
    descriptions: [
      'Denúncia anônima informa indivíduo portando arma de fogo em via pública em {local}.',
      'Durante patrulhamento em {local}, a guarnição avistou indivíduo em atitude suspeita com volume na cintura, aparentando ser arma de fogo.',
      'Solicitante relata disparos de arma de fogo nas proximidades de {local}; suspeito teria se abrigado em residência.',
    ],
    notes: ['Abordagem realizada com segurança; arma de fogo localizada.', 'Arma desmuniciada e acondicionada para apresentação.'],
    summaries: [
      'Arma de fogo apreendida e apresentada à delegacia juntamente com o conduzido, para os procedimentos legais.',
      'Arma de fogo e munições apreendidas. Suspeito conduzido à delegacia sem uso de força, com integridade física preservada.',
    ],
  },
  cadaver: {
    descriptions: [
      'Moradores informam a presença de corpo em terreno baldio em {local}.',
      'Pescadores relatam ter encontrado um corpo às margens do rio, próximo a {local}.',
    ],
    notes: ['Local isolado para preservação de vestígios.', 'IML e perícia acionados.'],
    summaries: [
      'Local preservado até a chegada da perícia e remoção do corpo pelo IML. Ocorrência apresentada à delegacia.',
    ],
  },
  outros: {
    descriptions: [
      'Solicitante informa ocorrência em {local} e pede o comparecimento da guarnição.',
      'Denúncia de atitude suspeita em {local}.',
    ],
    notes: ['Guarnição no local; situação verificada.'],
    summaries: [
      'Ocorrência atendida; partes orientadas e providências adotadas conforme o caso.',
    ],
  },
});

export const STREETS = Object.freeze([
  'Rua Grande', 'Avenida Principal', 'Rua São José', 'Rua da Paz', 'Travessa Santa Luzia',
  'Rua do Comércio', 'Avenida Getúlio Vargas', 'Rua Rio Branco', 'Rua Nova', 'Estrada Vicinal',
]);

export const DISTRICTS = Object.freeze([
  'Centro', 'Bairro Novo', 'Vila Operária', 'São Francisco', 'Cohab', 'Zona Rural', 'Matadouro', 'Areal',
]);
