import { describe, it, expect } from "vitest";
import {
  agregarAusencias,
  agregarEstatisticas,
  maxTitulares,
  resumoAusenciasVazio,
  JOGADORES_EM_CAMPO,
  type LinhaEstatistica,
} from "@/lib/estatisticas";

function linha(over: Partial<LinhaEstatistica> = {}): LinhaEstatistica {
  return {
    utilizacao: "TITULAR",
    minutos: null,
    golos: 0,
    assistencias: 0,
    defesas: null,
    golosSofridosGR: null,
    ...over,
  };
}

describe("agregarEstatisticas — jogador de campo", () => {
  it("soma golos, assistências e conta utilizações/titularidades", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 3,
      jogosCapitao: 0,
      sessoesTotais: 10,
      presencas: 8,
      estatisticas: [
        linha({ utilizacao: "TITULAR", golos: 2, assistencias: 1 }),
        linha({ utilizacao: "UTILIZADO", golos: 1, assistencias: 0 }),
        linha({ utilizacao: "NAO_UTILIZADO", golos: 0, assistencias: 0 }),
      ],
    });
    expect(r.totalGolos).toBe(3);
    expect(r.totalAssistencias).toBe(1);
    expect(r.jogosUtilizados).toBe(2); // TITULAR + UTILIZADO
    expect(r.titularidades).toBe(1);
    expect(r.jogosConvocado).toBe(3);
  });

  it("estatísticas de GR ficam null para jogador de campo", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 1,
      jogosCapitao: 0,
      sessoesTotais: 1,
      presencas: 1,
      estatisticas: [linha({ defesas: 5, golosSofridosGR: 2 })],
    });
    expect(r.totalDefesas).toBeNull();
    expect(r.totalGolosSofridos).toBeNull();
  });
});

describe("agregarEstatisticas — jogosCapitao (§11.5)", () => {
  it("devolve o nº de jogos como capitão tal como recebido", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 5,
      jogosCapitao: 2,
      sessoesTotais: 0,
      presencas: 0,
      estatisticas: [],
    });
    expect(r.jogosCapitao).toBe(2);
    expect(r.jogosConvocado).toBe(5);
  });
});

describe("agregarEstatisticas — guarda-redes", () => {
  it("soma defesas e golos sofridos quando é GR", () => {
    const r = agregarEstatisticas({
      eGR: true,
      jogosConvocado: 2,
      jogosCapitao: 0,
      sessoesTotais: 4,
      presencas: 4,
      estatisticas: [
        linha({ defesas: 7, golosSofridosGR: 2 }),
        linha({ defesas: 3, golosSofridosGR: 1 }),
      ],
    });
    expect(r.totalDefesas).toBe(10);
    expect(r.totalGolosSofridos).toBe(3);
  });
});

describe("agregarEstatisticas — totalMinutos (secção 15.2)", () => {
  it("é null quando nenhum jogo tem minutos registados", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 2,
      jogosCapitao: 0,
      sessoesTotais: 0,
      presencas: 0,
      estatisticas: [linha({ minutos: null }), linha({ minutos: null })],
    });
    expect(r.totalMinutos).toBeNull();
  });

  it("soma apenas os minutos registados (ignora null)", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 2,
      jogosCapitao: 0,
      sessoesTotais: 0,
      presencas: 0,
      estatisticas: [linha({ minutos: 18 }), linha({ minutos: null }), linha({ minutos: 12 })],
    });
    expect(r.totalMinutos).toBe(30);
  });

  it("distingue zero minutos de não registado", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 1,
      jogosCapitao: 0,
      sessoesTotais: 0,
      presencas: 0,
      estatisticas: [linha({ minutos: 0 })],
    });
    expect(r.totalMinutos).toBe(0); // 0 registado ≠ null
  });
});

describe("agregarEstatisticas — taxaPresenca (secção 15.2 / 22.3)", () => {
  it("é 0 quando não há sessões (evita divisão por zero)", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 0,
      jogosCapitao: 0,
      sessoesTotais: 0,
      presencas: 0,
      estatisticas: [],
    });
    expect(r.taxaPresenca).toBe(0);
  });

  it("calcula presencas / sessoesTotais", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 0,
      jogosCapitao: 0,
      sessoesTotais: 10,
      presencas: 8,
      estatisticas: [],
    });
    expect(r.taxaPresenca).toBeCloseTo(0.8);
  });

  it("atleta que entra a meio (divisor menor) não é penalizado", () => {
    // Só 5 sessões desde o ingresso, presente em todas → 100%
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 0,
      jogosCapitao: 0,
      sessoesTotais: 5,
      presencas: 5,
      estatisticas: [],
    });
    expect(r.taxaPresenca).toBe(1);
  });
});

describe("maxTitulares — limite de titulares do plano de jogo", () => {
  it("futsal (FUTSAL_5) → 5 titulares", () => {
    expect(maxTitulares("FUTSAL_5", "FUTSAL")).toBe(5);
    expect(JOGADORES_EM_CAMPO.FUTSAL_5).toBe(5);
  });

  it("usa o nº de campo real de cada formato de futebol", () => {
    expect(maxTitulares("FUTEBOL_3_3", "FUTEBOL")).toBe(3);
    expect(maxTitulares("FUTEBOL_5_5", "FUTEBOL")).toBe(5);
    expect(maxTitulares("FUTEBOL_7", "FUTEBOL")).toBe(7);
    expect(maxTitulares("FUTEBOL_9", "FUTEBOL")).toBe(9);
    expect(maxTitulares("FUTEBOL_11", "FUTEBOL")).toBe(11);
  });

  it("sem formato, cai na modalidade (futsal → 5, futebol → 11)", () => {
    expect(maxTitulares(null, "FUTSAL")).toBe(5);
    expect(maxTitulares(null, "FUTEBOL")).toBe(11);
    expect(maxTitulares(undefined)).toBe(5);
  });
});

describe("agregarAusencias — breakdown por motivo (§8.8.2)", () => {
  it("lista vazia → resumo vazio (todos os motivos a 0)", () => {
    const r = agregarAusencias([]);
    expect(r).toEqual(resumoAusenciasVazio());
    expect(r.total).toBe(0);
    expect(r.justificadas).toBe(0);
    expect(r.injustificadas).toBe(0);
    expect(r.porMotivo.LESAO).toBe(0);
    expect(r.porMotivo.SEM_MOTIVO).toBe(0);
  });

  it("conta por motivo e separa justificadas de injustificadas", () => {
    const r = agregarAusencias([
      "LESAO",
      "LESAO",
      "DOENCA",
      "SEM_MOTIVO",
      "FUTEBOL_FUTSAL",
      "OUTRO",
    ]);
    expect(r.total).toBe(6);
    expect(r.porMotivo.LESAO).toBe(2);
    expect(r.porMotivo.DOENCA).toBe(1);
    expect(r.porMotivo.FUTEBOL_FUTSAL).toBe(1);
    expect(r.porMotivo.OUTRO).toBe(1);
    expect(r.porMotivo.SEM_MOTIVO).toBe(1);
    // Justificadas = tudo exceto SEM_MOTIVO (5); injustificadas = SEM_MOTIVO (1).
    expect(r.justificadas).toBe(5);
    expect(r.injustificadas).toBe(1);
    expect(r.justificadas + r.injustificadas).toBe(r.total);
  });

  it("SEM_MOTIVO é o único injustificado", () => {
    const r = agregarAusencias(["SEM_MOTIVO", "SEM_MOTIVO", "PESSOAL"]);
    expect(r.injustificadas).toBe(2);
    expect(r.justificadas).toBe(1);
  });

  it("ignora entradas null/undefined (não são ausências com motivo)", () => {
    const r = agregarAusencias(["LESAO", null, undefined, "SEM_MOTIVO"]);
    expect(r.total).toBe(2);
    expect(r.justificadas).toBe(1);
    expect(r.injustificadas).toBe(1);
  });
});

describe("agregarEstatisticas — campo ausencias (§8.8.2)", () => {
  function linha(over: Partial<LinhaEstatistica> = {}): LinhaEstatistica {
    return {
      utilizacao: "TITULAR",
      minutos: null,
      golos: 0,
      assistencias: 0,
      defesas: null,
      golosSofridosGR: null,
      ...over,
    };
  }

  it("sem `ausencias` no input → resumo de ausências vazio (retrocompat)", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 1,
      jogosCapitao: 0,
      sessoesTotais: 5,
      presencas: 4,
      estatisticas: [linha()],
    });
    expect(r.ausencias).toEqual(resumoAusenciasVazio());
  });

  it("agrega os motivos recebidos sem alterar a taxa de presença", () => {
    const r = agregarEstatisticas({
      eGR: false,
      jogosConvocado: 1,
      jogosCapitao: 0,
      sessoesTotais: 10,
      presencas: 7,
      estatisticas: [linha()],
      ausencias: ["LESAO", "SEM_MOTIVO", "DOENCA"],
    });
    // Taxa continua PRESENTE/ATRASADO / sessões — independente das ausências.
    expect(r.taxaPresenca).toBeCloseTo(0.7);
    expect(r.ausencias.total).toBe(3);
    expect(r.ausencias.justificadas).toBe(2);
    expect(r.ausencias.injustificadas).toBe(1);
    expect(r.ausencias.porMotivo.LESAO).toBe(1);
  });
});
