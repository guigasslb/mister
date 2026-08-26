import { describe, it, expect } from "vitest";
import {
  atletaPessoalSchema,
  criarAtletaSchema,
  posicoesPorModalidade,
} from "@/lib/schemas/atleta";
import { exercicioSchema, diagramaSchema } from "@/lib/schemas/exercicio";
import { jogoSchema, estatisticaSchema } from "@/lib/schemas/jogo";
import { sessaoSchema, presencaSchema } from "@/lib/schemas/treino";
import { escalaoSchema } from "@/lib/schemas/escalao";

const CUID = "ckv9v0z1w0000abcd1234efgh";

describe("escalaoSchema (P2.8 — visibilidade para outros treinadores)", () => {
  it("aceita um escalão válido sem visivelOutrosTreinadores (campo opcional)", () => {
    const r = escalaoSchema.safeParse({ nome: "Sub-15" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.visivelOutrosTreinadores).toBeUndefined();
  });

  it("aceita e preserva visivelOutrosTreinadores = false", () => {
    const r = escalaoSchema.safeParse({ nome: "Sub-15", visivelOutrosTreinadores: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.visivelOutrosTreinadores).toBe(false);
  });

  it("aceita e preserva visivelOutrosTreinadores = true", () => {
    const r = escalaoSchema.safeParse({ nome: "Sub-15", visivelOutrosTreinadores: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.visivelOutrosTreinadores).toBe(true);
  });

  it("rejeita visivelOutrosTreinadores não-booleano", () => {
    const r = escalaoSchema.safeParse({ nome: "Sub-15", visivelOutrosTreinadores: "sim" });
    expect(r.success).toBe(false);
  });
});

describe("atletaPessoalSchema (F1 — só dados pessoais)", () => {
  it("aceita um atleta válido mínimo", () => {
    const r = atletaPessoalSchema.safeParse({ nome: "João Silva" });
    expect(r.success).toBe(true);
  });

  it("rejeita nome com menos de 2 caracteres", () => {
    const r = atletaPessoalSchema.safeParse({ nome: "J" });
    expect(r.success).toBe(false);
  });

  it("rejeita posição inválida no array de posições", () => {
    // 🔁 v7 (§3.2): AVANCADO passou a ser válido (posição de futebol); uma posição
    // inexistente no enum (ex.: "LIBERO") continua a ser rejeitada.
    const r = atletaPessoalSchema.safeParse({ nome: "João", posicoes: ["LIBERO"] });
    expect(r.success).toBe(false);
  });

  it("aceita múltiplas posições válidas de futsal", () => {
    const r = atletaPessoalSchema.safeParse({ nome: "João", posicoes: ["ALA", "PIVO"] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.posicoes).toEqual(["ALA", "PIVO"]);
  });

  it("aceita posições de futebol (§3.2 — enum multi-desporto)", () => {
    const r = atletaPessoalSchema.safeParse({
      nome: "João",
      posicoes: ["DEFESA_CENTRAL", "AVANCADO"],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.posicoes).toEqual(["DEFESA_CENTRAL", "AVANCADO"]);
  });

  it("ignora escalão/número (passaram para a participação)", () => {
    const r = atletaPessoalSchema.safeParse({ nome: "João", escalaoId: CUID, numero: 7 });
    expect(r.success).toBe(true);
    if (r.success) expect("numero" in r.data).toBe(false);
  });
});

describe("posicoesPorModalidade (§2.3/§3.2 — seletor por modalidade)", () => {
  it("futsal mostra {GR, Fixo, Ala, Pivô, Universal}", () => {
    expect(posicoesPorModalidade("FUTSAL")).toEqual([
      "GUARDA_REDES",
      "FIXO",
      "ALA",
      "PIVO",
      "UNIVERSAL",
    ]);
  });

  it("futebol mostra as posições de futebol + partilhadas (GR, Universal)", () => {
    expect(posicoesPorModalidade("FUTEBOL")).toEqual([
      "GUARDA_REDES",
      "DEFESA_CENTRAL",
      "LATERAL_DIREITO",
      "LATERAL_ESQUERDO",
      "MEDIO_DEFENSIVO",
      "MEDIO_CENTRO",
      "MEDIO_OFENSIVO",
      "EXTREMO_DIREITO",
      "EXTREMO_ESQUERDO",
      "AVANCADO",
      "UNIVERSAL",
    ]);
  });

  it("GUARDA_REDES e UNIVERSAL são partilhados pelas duas modalidades", () => {
    for (const partilhada of ["GUARDA_REDES", "UNIVERSAL"] as const) {
      expect(posicoesPorModalidade("FUTSAL")).toContain(partilhada);
      expect(posicoesPorModalidade("FUTEBOL")).toContain(partilhada);
    }
  });

  it("posições específicas não atravessam modalidades", () => {
    expect(posicoesPorModalidade("FUTSAL")).not.toContain("AVANCADO");
    expect(posicoesPorModalidade("FUTEBOL")).not.toContain("FIXO");
  });

  it("sem modalidade devolve todas as posições sem duplicar as partilhadas", () => {
    const todas = posicoesPorModalidade(null);
    // Cada posição aparece exatamente uma vez.
    expect(new Set(todas).size).toBe(todas.length);
    expect(todas).toContain("FIXO");
    expect(todas).toContain("AVANCADO");
    expect(todas).toContain("GUARDA_REDES");
  });
});

describe("criarAtletaSchema (dados pessoais + participação inicial)", () => {
  it("aceita criação com participação inicial mínima", () => {
    const r = criarAtletaSchema.safeParse({
      nome: "João Silva",
      participacaoInicial: { escalaoId: CUID },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.participacaoInicial.tipo).toBe("PRINCIPAL");
  });

  it("rejeita sem participação inicial", () => {
    expect(criarAtletaSchema.safeParse({ nome: "João Silva" }).success).toBe(false);
  });

  it("rejeita número fora do intervalo 1-999", () => {
    const comNumero = (numero: number) =>
      criarAtletaSchema.safeParse({
        nome: "João",
        participacaoInicial: { escalaoId: CUID, numero },
      }).success;
    expect(comNumero(0)).toBe(false);
    expect(comNumero(1000)).toBe(false);
    expect(comNumero(7)).toBe(true);
  });

  it("rejeita tipo de participação inválido", () => {
    const r = criarAtletaSchema.safeParse({
      nome: "João",
      participacaoInicial: { escalaoId: CUID, tipo: "EMPRESTIMO" },
    });
    expect(r.success).toBe(false);
  });
});

// Os schemas de participação (F1) têm ficheiro próprio: tests/participacoes.test.ts

describe("exercicioSchema", () => {
  it("aceita exercício válido", () => {
    expect(exercicioSchema.safeParse({ nome: "1x1" }).success).toBe(true);
  });

  it("rejeita nome vazio", () => {
    expect(exercicioSchema.safeParse({ nome: "" }).success).toBe(false);
  });

  it("rejeita duração fora do intervalo", () => {
    expect(exercicioSchema.safeParse({ nome: "X", duracaoMin: 0 }).success).toBe(false);
    expect(exercicioSchema.safeParse({ nome: "X", duracaoMin: 181 }).success).toBe(false);
  });
});

describe("diagramaSchema", () => {
  it("aceita diagrama vazio", () => {
    expect(diagramaSchema.safeParse({ versao: 1, elementos: [] }).success).toBe(true);
  });

  it("aceita elementos válidos (jogador, bola, seta)", () => {
    const diagrama = {
      versao: 1,
      elementos: [
        { id: "a", tipo: "jogador", x: 100, y: 100, cor: "azul", numero: 7 },
        { id: "b", tipo: "bola", x: 50, y: 50 },
        {
          id: "c",
          tipo: "seta",
          estilo: "passe",
          cor: "#000",
          pontos: [
            { x: 0, y: 0 },
            { x: 40, y: 40 },
          ],
        },
      ],
    };
    expect(diagramaSchema.safeParse(diagrama).success).toBe(true);
  });

  it("aceita versão 2 (com passos de animação)", () => {
    const d = {
      versao: 2,
      elementos: [{ id: "a", tipo: "jogador", x: 100, y: 100, cor: "azul" }],
      passos: [{ id: "p1", ordem: 0, posicoes: [{ elementoId: "a", x: 120, y: 130 }] }],
    };
    expect(diagramaSchema.safeParse(d).success).toBe(true);
  });

  it("rejeita versão inválida (3)", () => {
    expect(diagramaSchema.safeParse({ versao: 3, elementos: [] }).success).toBe(false);
  });

  it("rejeita coordenadas fora do campo (0-400 / 0-200)", () => {
    const mau = {
      versao: 1,
      elementos: [{ id: "a", tipo: "jogador", x: 500, y: 100, cor: "azul" }],
    };
    expect(diagramaSchema.safeParse(mau).success).toBe(false);
  });

  it("rejeita seta com menos de 2 pontos", () => {
    const mau = {
      versao: 1,
      elementos: [{ id: "c", tipo: "seta", estilo: "passe", cor: "#000", pontos: [{ x: 0, y: 0 }] }],
    };
    expect(diagramaSchema.safeParse(mau).success).toBe(false);
  });

  it("rejeita cor de jogador inválida", () => {
    const mau = {
      versao: 1,
      elementos: [{ id: "a", tipo: "jogador", x: 10, y: 10, cor: "rosa" }],
    };
    expect(diagramaSchema.safeParse(mau).success).toBe(false);
  });

  it("aceita cone sem cor (retrocompatível → laranja)", () => {
    const d = {
      versao: 2,
      elementos: [{ id: "c", tipo: "cone", x: 100, y: 100 }],
    };
    expect(diagramaSchema.safeParse(d).success).toBe(true);
  });

  it("aceita cone com cores válidas", () => {
    for (const cor of ["laranja", "amarelo", "vermelho", "azul", "verde", "branco"]) {
      const d = {
        versao: 2,
        elementos: [{ id: "c", tipo: "cone", x: 100, y: 100, cor }],
      };
      expect(diagramaSchema.safeParse(d).success, cor).toBe(true);
    }
  });

  it("rejeita cor de cone inválida", () => {
    const mau = {
      versao: 2,
      elementos: [{ id: "c", tipo: "cone", x: 100, y: 100, cor: "rosa" }],
    };
    expect(diagramaSchema.safeParse(mau).success).toBe(false);
  });

  it("aceita escadinha mínima (aplica defaults: ângulo 0, tamanho média)", () => {
    const d = {
      versao: 2,
      elementos: [{ id: "e", tipo: "escadinha", x: 100, y: 80 }],
    };
    const r = diagramaSchema.safeParse(d);
    expect(r.success).toBe(true);
    if (r.success) {
      const el = r.data.elementos[0];
      expect(el.tipo).toBe("escadinha");
      if (el.tipo === "escadinha") {
        expect(el.angulo).toBe(0);
        expect(el.tamanho).toBe("media");
      }
    }
  });

  it("aceita escadinha com ângulo e tamanho explícitos", () => {
    const d = {
      versao: 2,
      elementos: [
        { id: "e", tipo: "escadinha", x: 100, y: 80, angulo: 90, tamanho: "grande" },
      ],
    };
    expect(diagramaSchema.safeParse(d).success).toBe(true);
  });

  it("rejeita escadinha com tamanho inválido", () => {
    const mau = {
      versao: 2,
      elementos: [{ id: "e", tipo: "escadinha", x: 100, y: 80, tamanho: "enorme" }],
    };
    expect(diagramaSchema.safeParse(mau).success).toBe(false);
  });

  it("rejeita escadinha com ângulo fora do intervalo (0-360)", () => {
    const mau = {
      versao: 2,
      elementos: [{ id: "e", tipo: "escadinha", x: 100, y: 80, angulo: 400 }],
    };
    expect(diagramaSchema.safeParse(mau).success).toBe(false);
  });

  it("aceita barras para saltos (aplica default: ângulo 0)", () => {
    const d = {
      versao: 2,
      elementos: [{ id: "b", tipo: "barras", x: 200, y: 100 }],
    };
    const r = diagramaSchema.safeParse(d);
    expect(r.success).toBe(true);
    if (r.success) {
      const el = r.data.elementos[0];
      if (el.tipo === "barras") expect(el.angulo).toBe(0);
    }
  });

  it("aceita barras com ângulo explícito", () => {
    const d = {
      versao: 2,
      elementos: [{ id: "b", tipo: "barras", x: 200, y: 100, angulo: 45 }],
    };
    expect(diagramaSchema.safeParse(d).success).toBe(true);
  });

  it("rejeita barras com coordenadas fora do campo (0-400 / 0-200)", () => {
    const mau = {
      versao: 2,
      elementos: [{ id: "b", tipo: "barras", x: 500, y: 100 }],
    };
    expect(diagramaSchema.safeParse(mau).success).toBe(false);
  });
});

describe("jogoSchema", () => {
  it("aceita jogo válido", () => {
    const r = jogoSchema.safeParse({
      data: "2026-01-10T18:00",
      adversario: "CD Aves",
      casaFora: "CASA",
      escalaoId: CUID,
    });
    expect(r.success).toBe(true);
  });

  it("rejeita adversário vazio", () => {
    const r = jogoSchema.safeParse({
      data: "2026-01-10T18:00",
      adversario: "",
      casaFora: "CASA",
      escalaoId: CUID,
    });
    expect(r.success).toBe(false);
  });

  it("rejeita casaFora inválido", () => {
    const r = jogoSchema.safeParse({
      data: "2026-01-10T18:00",
      adversario: "X",
      casaFora: "NEUTRO",
      escalaoId: CUID,
    });
    expect(r.success).toBe(false);
  });

  it("agendar sem resultado é válido (P4.3) — golos/faltas/vídeo opcionais", () => {
    const r = jogoSchema.safeParse({
      data: "2026-12-10T18:00",
      adversario: "CD Aves",
      casaFora: "FORA",
      escalaoId: CUID,
      competicaoId: CUID,
      local: "Pavilhão",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.golosMarcados).toBeUndefined();
      expect(r.data.faltas1aParte).toBeUndefined();
    }
  });

  it("aceita jogo já disputado com resultado completo (P4.3)", () => {
    const r = jogoSchema.safeParse({
      data: "2026-01-10T18:00",
      adversario: "CD Aves",
      casaFora: "CASA",
      escalaoId: CUID,
      golosMarcados: 3,
      golosSofridos: 1,
      faltas1aParte: 2,
      faltas2aParte: 4,
      videoUrl: "https://youtu.be/abc",
    });
    expect(r.success).toBe(true);
  });

  it("ignora o campo legado `competicao` (texto livre) — deprecado (P4.3)", () => {
    const r = jogoSchema.safeParse({
      data: "2026-01-10T18:00",
      adversario: "CD Aves",
      casaFora: "CASA",
      escalaoId: CUID,
      competicao: "Liga distrital",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect("competicao" in r.data).toBe(false);
    }
  });
});

describe("estatisticaSchema", () => {
  it("aceita estatística mínima (só utilização) e aplica defaults", () => {
    const r = estatisticaSchema.safeParse({ atletaId: CUID, utilizacao: "TITULAR" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.golos).toBe(0);
      expect(r.data.assistencias).toBe(0);
    }
  });

  it("aceita valoresMetricas", () => {
    const r = estatisticaSchema.safeParse({
      atletaId: CUID,
      utilizacao: "UTILIZADO",
      valoresMetricas: [{ metricaId: CUID, valor: 3 }],
    });
    expect(r.success).toBe(true);
  });

  it("rejeita utilização inválida", () => {
    expect(
      estatisticaSchema.safeParse({ atletaId: CUID, utilizacao: "BANCO" }).success,
    ).toBe(false);
  });
});

describe("sessaoSchema", () => {
  it("aceita sessão válida", () => {
    const r = sessaoSchema.safeParse({ data: "2026-01-10T18:00", escalaoId: CUID });
    expect(r.success).toBe(true);
  });

  it("rejeita sem escalão", () => {
    expect(sessaoSchema.safeParse({ data: "2026-01-10T18:00" }).success).toBe(false);
  });

  it("rejeita planeamentoId numa sessão não-NORMAL (ex.: ABERTO)", () => {
    const r = sessaoSchema.safeParse({
      data: "2026-01-10T18:00",
      escalaoId: CUID,
      tipoSessao: "ABERTO",
      planeamentoId: CUID,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "planeamentoId")).toBe(true);
    }
  });

  it("aceita planeamentoId numa sessão NORMAL", () => {
    const r = sessaoSchema.safeParse({
      data: "2026-01-10T18:00",
      escalaoId: CUID,
      tipoSessao: "NORMAL",
      planeamentoId: CUID,
    });
    expect(r.success).toBe(true);
  });
});

describe("presencaSchema", () => {
  it("aceita os cinco estados de presença", () => {
    for (const estado of ["PRESENTE", "FALTA", "FALTA_JUSTIFICADA", "LESIONADO", "ATRASADO"]) {
      expect(presencaSchema.safeParse({ atletaId: CUID, estado }).success).toBe(true);
    }
  });

  it("rejeita estado inválido", () => {
    expect(presencaSchema.safeParse({ atletaId: CUID, estado: "FERIAS" }).success).toBe(false);
  });

  it("aceita motivo de falta (F1) e null", () => {
    for (const motivo of ["LESAO", "DOENCA", "OUTRO", "SEM_JUSTIFICACAO", null]) {
      expect(
        presencaSchema.safeParse({ atletaId: CUID, estado: "FALTA", motivo }).success,
      ).toBe(true);
    }
  });

  it("rejeita motivo de falta inválido", () => {
    expect(
      presencaSchema.safeParse({ atletaId: CUID, estado: "FALTA", motivo: "FERIAS" }).success,
    ).toBe(false);
  });
});
