import { describe, it, expect } from "vitest";
import {
  derivarEstatisticasDeEventos,
  type ConvocadoParaEstatisticas,
  type EventoParaEstatisticas,
} from "@/lib/eventos-para-estatisticas";

function evento(over: Partial<EventoParaEstatisticas>): EventoParaEstatisticas {
  return {
    tipo: "GOLO",
    atletaId: null,
    atletaSecundarioId: null,
    bloco: null,
    minuto: null,
    ...over,
  };
}

const A = "atleta_a";
const B = "atleta_b";

const convocado = (
  atletaId: string,
  titularPrevisto = false,
): ConvocadoParaEstatisticas => ({ atletaId, titularPrevisto });

describe("derivarEstatisticasDeEventos", () => {
  it("GOLO com atletaId → golos=1 no atleta e golosMarcados=1", () => {
    const r = derivarEstatisticasDeEventos(
      [evento({ tipo: "GOLO", atletaId: A })],
      [convocado(A)],
      false,
      "FUTSAL_5",
    );
    expect(r.estatisticas.get(A)?.golos).toBe(1);
    expect(r.golosMarcados).toBe(1);
    expect(r.golosSofridos).toBe(0);
  });

  it("GOLO sem atletaId → golosMarcados=1 e nenhum atleta afetado", () => {
    const r = derivarEstatisticasDeEventos(
      [evento({ tipo: "GOLO", atletaId: null })],
      [convocado(A)],
      false,
      "FUTSAL_5",
    );
    expect(r.golosMarcados).toBe(1);
    expect(r.estatisticas.get(A)?.golos).toBe(0);
  });

  it("GOLO_SOFRIDO com atletaId → golosSofridosGR=1 no atleta e golosSofridos=1", () => {
    const r = derivarEstatisticasDeEventos(
      [evento({ tipo: "GOLO_SOFRIDO", atletaId: A })],
      [convocado(A)],
      false,
      "FUTSAL_5",
    );
    expect(r.estatisticas.get(A)?.golosSofridosGR).toBe(1);
    expect(r.golosSofridos).toBe(1);
    expect(r.golosMarcados).toBe(0);
  });

  it("ASSISTENCIA → assistencias=1", () => {
    const r = derivarEstatisticasDeEventos(
      [evento({ tipo: "ASSISTENCIA", atletaId: A })],
      [convocado(A)],
      false,
      "FUTSAL_5",
    );
    expect(r.estatisticas.get(A)?.assistencias).toBe(1);
  });

  it("CARTAO_AMARELO → cartaoAmarelo=1", () => {
    const r = derivarEstatisticasDeEventos(
      [evento({ tipo: "CARTAO_AMARELO", atletaId: A })],
      [convocado(A)],
      false,
      "FUTSAL_5",
    );
    expect(r.estatisticas.get(A)?.cartaoAmarelo).toBe(1);
  });

  it("SUBSTITUICAO → atleta que entra fica UTILIZADO com blocoTempo e minutos derivados", () => {
    const r = derivarEstatisticasDeEventos(
      [evento({ tipo: "SUBSTITUICAO", atletaId: A, bloco: "MEIA_PARTE" })],
      [convocado(A)],
      false,
      "FUTSAL_5",
    );
    const s = r.estatisticas.get(A);
    expect(s?.utilizacao).toBe("UTILIZADO");
    expect(s?.blocoTempo).toBe("MEIA_PARTE");
    // FUTSAL_5: MEIA_PARTE = 20 minutos.
    expect(s?.minutos).toBe(20);
  });

  it("convocado titularPrevisto=true sem eventos → TITULAR com zeros", () => {
    const r = derivarEstatisticasDeEventos([], [convocado(A, true)], false, "FUTSAL_5");
    const s = r.estatisticas.get(A);
    expect(s?.utilizacao).toBe("TITULAR");
    expect(s?.golos).toBe(0);
    expect(s?.assistencias).toBe(0);
    expect(s?.minutos).toBeNull();
  });

  it("convocado sem titularPrevisto e sem eventos → NAO_UTILIZADO", () => {
    const r = derivarEstatisticasDeEventos([], [convocado(A, false)], false, "FUTSAL_5");
    expect(r.estatisticas.get(A)?.utilizacao).toBe("NAO_UTILIZADO");
  });

  it("REMATE em futsal (eFutebol=false) → ignorado (remates fica null)", () => {
    const r = derivarEstatisticasDeEventos(
      [evento({ tipo: "REMATE", atletaId: A })],
      [convocado(A)],
      false,
      "FUTSAL_5",
    );
    expect(r.estatisticas.get(A)?.remates).toBeNull();
  });

  it("REMATE em futebol (eFutebol=true) → remates=1", () => {
    const r = derivarEstatisticasDeEventos(
      [evento({ tipo: "REMATE", atletaId: A })],
      [convocado(A)],
      true,
      "FUTEBOL_11",
    );
    expect(r.estatisticas.get(A)?.remates).toBe(1);
  });

  it("agrega múltiplos eventos e vários atletas coerentemente", () => {
    const r = derivarEstatisticasDeEventos(
      [
        evento({ tipo: "GOLO", atletaId: A }),
        evento({ tipo: "ASSISTENCIA", atletaId: B }),
        evento({ tipo: "GOLO", atletaId: A }),
        evento({ tipo: "GOLO_SOFRIDO", atletaId: null }),
        evento({ tipo: "FALTA", atletaId: B }),
        evento({ tipo: "TIMEOUT", atletaId: null }),
      ],
      [convocado(A, true), convocado(B)],
      false,
      "FUTSAL_5",
    );
    expect(r.golosMarcados).toBe(2);
    expect(r.golosSofridos).toBe(1);
    expect(r.estatisticas.get(A)?.golos).toBe(2);
    expect(r.estatisticas.get(A)?.utilizacao).toBe("TITULAR");
    expect(r.estatisticas.get(B)?.assistencias).toBe(1);
    expect(r.estatisticas.get(B)?.faltasCometidas).toBe(1);
  });
});
