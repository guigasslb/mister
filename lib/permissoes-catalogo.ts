// Catálogo de capacidades e perfis de arranque (secção 6 da bíblia).
// Módulo PURO (sem imports de auth/prisma/next) — usável no seed e no cliente.

export const CAPACIDADES = [
  // Estrutura do clube (sempre nível clube)
  "CLUBE_BRANDING",
  "CLUBE_ESCALOES",
  "CLUBE_EPOCAS",
  "CLUBE_UTILIZADORES",
  "CLUBE_PERFIS",
  "CATALOGO_METRICAS",
  "CATALOGO_HABILIDADES",
  // Secção (âmbito SECCAO — §6.9): gestão de escalões dentro da(s) secção(ões)
  // coordenada(s), sem conceder o CLUBE_ESCALOES (que é sempre de nível clube).
  "SECCAO_ESCALOES_GERIR",
  // Dados de equipa (sujeitas ao âmbito do perfil)
  "PLANTEL_GERIR",
  "TREINOS_GERIR",
  "PRESENCAS_MARCAR",
  "PERIODIZACAO_GERIR",
  "MODELO_JOGO_GERIR",
  "JOGOS_GERIR",
  "CONVOCATORIA_GERIR",
  "ESTATISTICAS_GERIR",
  "COMPETICOES_GERIR",
  "SCOUTING_GERIR",
  "CADERNETA_GERIR",
  "REUNIOES_GERIR",
  // Transversais
  "EXERCICIOS_GERIR",
  "RELATORIOS_VER",
  // Operações avançadas (F0) — sujeitas a overrides por membro
  "PROMOVER_ATLETAS", // promover atleta à equipa principal
  "COMUNICACOES_GERIR", // gerir comunicações / templates de WhatsApp
  "LEMBRETES_EQUIPA_GERIR", // criar lembretes para a equipa
  // "FATURACAO_GERIR",  // FUTURO — faturação/mensalidades. Presente na arquitetura, ainda não ativa.
] as const;

export type Capacidade = (typeof CAPACIDADES)[number];

/**
 * Capacidades efetivas de um membro (secção 6.4, overrides F0):
 *   base (capacidades do perfil) + capacidadesExtra − capacidadesRevogadas.
 *
 * Função pura, definida neste módulo (e reexportada por `lib/permissoes.ts`)
 * para poder ser usada também no cliente — o editor de overrides precisa de
 * aplicar exatamente a mesma regra que o servidor.
 *
 * Só considera chaves válidas do catálogo ativo — chaves desconhecidas ou
 * futuras (ex.: FATURACAO_GERIR) são ignoradas, garantindo que overrides
 * antigos ou inválidos não concedem capacidades inexistentes.
 */
export function capacidadesEfetivas(
  base: readonly string[],
  extra: readonly string[],
  revogadas: readonly string[],
): Set<Capacidade> {
  const catalogo = new Set<string>(CAPACIDADES);
  const efetivas = new Set<Capacidade>();
  for (const cap of base) {
    if (catalogo.has(cap)) efetivas.add(cap as Capacidade);
  }
  for (const cap of extra) {
    if (catalogo.has(cap)) efetivas.add(cap as Capacidade);
  }
  for (const cap of revogadas) {
    efetivas.delete(cap as Capacidade);
  }
  return efetivas;
}

// FUTURO — capacidade de faturação. Definida à parte para não entrar no catálogo ativo
// (não é atribuível nem verificável enquanto o módulo não existir), mas presente na
// arquitetura para referência. Só ADMIN a terá quando for ativada.
export const CAPACIDADE_FUTURA_FATURACAO = "FATURACAO_GERIR" as const;

// Rótulos pt-PT para a UI de perfis.
export const LABEL_CAPACIDADE: Record<Capacidade, string> = {
  CLUBE_BRANDING: "Branding (cores e logótipo)",
  CLUBE_ESCALOES: "Gerir escalões",
  CLUBE_EPOCAS: "Gerir épocas",
  CLUBE_UTILIZADORES: "Gerir utilizadores",
  CLUBE_PERFIS: "Gerir perfis",
  CATALOGO_METRICAS: "Gerir métricas",
  CATALOGO_HABILIDADES: "Gerir habilidades",
  SECCAO_ESCALOES_GERIR: "Gerir escalões da secção",
  PLANTEL_GERIR: "Gerir plantel",
  TREINOS_GERIR: "Gerir treinos",
  PRESENCAS_MARCAR: "Marcar presenças",
  PERIODIZACAO_GERIR: "Gerir periodização",
  MODELO_JOGO_GERIR: "Gerir modelo de jogo",
  JOGOS_GERIR: "Gerir jogos",
  CONVOCATORIA_GERIR: "Gerir convocatórias",
  ESTATISTICAS_GERIR: "Registar estatísticas",
  COMPETICOES_GERIR: "Gerir competições",
  SCOUTING_GERIR: "Observação de adversários",
  CADERNETA_GERIR: "Gerir caderneta",
  REUNIOES_GERIR: "Gerir reuniões",
  EXERCICIOS_GERIR: "Gerir exercícios",
  RELATORIOS_VER: "Ver relatórios",
  PROMOVER_ATLETAS: "Promover atletas à equipa principal",
  COMUNICACOES_GERIR: "Gerir comunicações",
  LEMBRETES_EQUIPA_GERIR: "Gerir lembretes da equipa",
};

export const CAPACIDADES_ESTRUTURA: Capacidade[] = [
  "CLUBE_BRANDING",
  "CLUBE_ESCALOES",
  "CLUBE_EPOCAS",
  "CLUBE_UTILIZADORES",
  "CLUBE_PERFIS",
  "CATALOGO_METRICAS",
  "CATALOGO_HABILIDADES",
];

// Capacidades cujo alcance é limitado pelo âmbito PROPRIOS_ESCALOES.
export const CAPACIDADES_POR_ESCALAO: Capacidade[] = [
  "PLANTEL_GERIR",
  "TREINOS_GERIR",
  "PRESENCAS_MARCAR",
  "PERIODIZACAO_GERIR",
  "MODELO_JOGO_GERIR",
  "JOGOS_GERIR",
  "CONVOCATORIA_GERIR",
  "ESTATISTICAS_GERIR",
  "COMPETICOES_GERIR",
  "SCOUTING_GERIR",
  "CADERNETA_GERIR",
  "REUNIOES_GERIR",
];

const CAPACIDADES_DADOS_EQUIPA = CAPACIDADES_POR_ESCALAO;

export type PerfilArranque = {
  nome: string;
  descricao: string;
  // 🔁 v7 (§6.9): âmbito SECCAO para o Coordenador de Secção.
  ambito: "TODO_CLUBE" | "SECCAO" | "PROPRIOS_ESCALOES";
  capacidades: Capacidade[];
};

// Modelos de arranque editáveis criados com cada clube (secção 6.5).
export const PERFIS_ARRANQUE: PerfilArranque[] = [
  {
    nome: "Administrador",
    descricao: "Controlo total do clube.",
    ambito: "TODO_CLUBE",
    capacidades: [...CAPACIDADES],
  },
  {
    nome: "Diretor Técnico",
    descricao:
      "Escreve em todos os escalões e gere utilizadores/treinadores; estrutura do clube configurável pelo admin.",
    ambito: "TODO_CLUBE",
    capacidades: [
      ...CAPACIDADES_DADOS_EQUIPA,
      // Gestão de pessoas: convidar e gerir treinadores/membros (§8.2).
      // Sem CLUBE_PERFIS — a definição de perfis de permissão e o estatuto de
      // administrador (ativar licenças, config de infra) continuam do Administrador.
      "CLUBE_UTILIZADORES",
      "CATALOGO_METRICAS",
      "CATALOGO_HABILIDADES",
      "EXERCICIOS_GERIR",
      "RELATORIOS_VER",
      "PROMOVER_ATLETAS",
      "COMUNICACOES_GERIR",
      "LEMBRETES_EQUIPA_GERIR",
    ],
  },
  {
    nome: "Treinador Principal",
    descricao: "Controlo total dos escalões atribuídos.",
    ambito: "PROPRIOS_ESCALOES",
    capacidades: [
      ...CAPACIDADES_DADOS_EQUIPA,
      "EXERCICIOS_GERIR",
      "RELATORIOS_VER",
      "COMUNICACOES_GERIR",
      "LEMBRETES_EQUIPA_GERIR",
    ],
  },
  {
    nome: "Adjunto",
    descricao: "Operação do dia-a-dia dos escalões atribuídos.",
    ambito: "PROPRIOS_ESCALOES",
    capacidades: [
      "TREINOS_GERIR",
      "PRESENCAS_MARCAR",
      "ESTATISTICAS_GERIR",
      "CADERNETA_GERIR",
      "EXERCICIOS_GERIR",
    ],
  },
  {
    // 🔁 v7 (§6.9): gere os escalões da(s) secção(ões) que coordena, via
    // SECCAO_ESCALOES_GERIR (âmbito SECCAO) — sem acesso ao resto do clube.
    nome: "Coordenador de Secção",
    descricao: "Gere os escalões de uma secção do clube.",
    ambito: "SECCAO",
    capacidades: ["SECCAO_ESCALOES_GERIR"],
  },
  {
    // Perfil de leitura para a direção do clube. RELATORIOS_VER é a única
    // capacidade de leitura do catálogo; concede acesso a analíticos e
    // relatórios. A licença é visível a qualquer membro (não é gated por
    // capacidade — ver obterLicenca) e a configuração do clube fica em leitura
    // pela AUSÊNCIA das capacidades CLUBE_* (que só permitem editar). Sem
    // qualquer capacidade _GERIR: não gere membros, treinos, jogos nem plantel.
    nome: "Presidente",
    descricao:
      "Direção do clube: consulta analíticos, relatórios, licença e configuração (só leitura).",
    ambito: "TODO_CLUBE",
    capacidades: ["RELATORIOS_VER"],
  },
];
