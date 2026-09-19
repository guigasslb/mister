import { describe, it, expect } from "vitest";
import {
  derivarEstatisticas,
  type ConvocadoParaDerivacao,
  type EventoParaDerivacao,
} from "@/lib/derivar-estatisticas";

function evento(over: Partial<EventoParaDerivacao>): EventoParaDerivacao {
  return {
    tipo: "GOLO",
    atletaId: null,
    atletaSecundarioId: null,
    bloco: null,
    minuto: null,
    segundoJogo: null,
    parte: null,
    ...over,
  };
}

// Atalhos para eventos do Modo Jogo ao Vivo (intervalos ao segundo).
const M = 60; // segundos por minuto
const inicio = (segundoJogo: number, parte = 1): EventoParaDerivacao =>
  evento({ tipo: "INICIO_PARTE", segundoJogo, parte });
const fim = (segundoJogo: number, parte = 1): EventoParaDerivacao =>
  evento({ tipo: "FIM_PARTE", segundoJogo, parte });
const entra = (atletaId: string, segundoJogo: number): EventoParaDerivacao =>
  evento({ tipo: "ENTRADA", atletaId, segundoJogo });
const sai = (atletaId: string, segundoJogo: number): EventoParaDerivacao =>
  evento({ tipo: "SAIDA", atletaId, segundoJogo });

const A = "atleta_a";
const B = "atleta_b";

const convocado = (
  atletaId: string,
  titularPrevisto = false,
): ConvocadoParaDerivacao => ({ atletaId, titularPrevisto });

// ─────────────────────────────────────────────────────────────────────────────
// BASELINE LEGADO (blocos) — capturado do comportamento do antigo Motor B.
// Estas asserções são a "fonte real" da zero-regressão: os minutos derivam do
// `blocoTempo` via blocoParaMinutos; sem bloco → null (distinto de zero).
// ─────────────────────────────────────────────────────────────────────────────
describe("derivarEstatisticas — contadores e blocos (baseline legado)", () => {
  it("GOLO com atletaId → golos=1 no atleta e golosMarcados=1", () => {
    const r = derivarEstatisticas(
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
    const r = derivarEstatisticas(
      [evento({ tipo: "GOLO", atletaId: null })],
      [convocado(A)],
      false,
      "FUTSAL_5",
    );
    expect(r.golosMarcados).toBe(1);
    expect(r.estatisticas.get(A)?.golos).toBe(0);
  });

  it("GOLO_SOFRIDO com atletaId → golosSofridosGR=1 no atleta e golosSofridos=1", () => {
    const r = derivarEstatisticas(
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
    const r = derivarEstatisticas(
      [evento({ tipo: "ASSISTENCIA", atletaId: A })],
      [convocado(A)],
      false,
      "FUTSAL_5",
    );
    expect(r.estatisticas.get(A)?.assistencias).toBe(1);
  });

  it("CARTAO_AMARELO → cartaoAmarelo=1", () => {
    const r = derivarEstatisticas(
      [evento({ tipo: "CARTAO_AMARELO", atletaId: A })],
      [convocado(A)],
      false,
      "FUTSAL_5",
    );
    expect(r.estatisticas.get(A)?.cartaoAmarelo).toBe(1);
  });

  it("SUBSTITUICAO → atleta que entra fica UTILIZADO com blocoTempo e minutos derivados", () => {
    const r = derivarEstatisticas(
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
    const r = derivarEstatisticas([], [convocado(A, true)], false, "FUTSAL_5");
    const s = r.estatisticas.get(A);
    expect(s?.utilizacao).toBe("TITULAR");
    expect(s?.golos).toBe(0);
    expect(s?.assistencias).toBe(0);
    expect(s?.minutos).toBeNull();
  });

  it("convocado sem titularPrevisto e sem eventos → NAO_UTILIZADO", () => {
    const r = derivarEstatisticas([], [convocado(A, false)], false, "FUTSAL_5");
    expect(r.estatisticas.get(A)?.utilizacao).toBe("NAO_UTILIZADO");
  });

  it("REMATE em futsal (eFutebol=false) → ignorado (remates fica null)", () => {
    const r = derivarEstatisticas(
      [evento({ tipo: "REMATE", atletaId: A })],
      [convocado(A)],
      false,
      "FUTSAL_5",
    );
    expect(r.estatisticas.get(A)?.remates).toBeNull();
  });

  it("REMATE em futebol (eFutebol=true) → remates=1", () => {
    const r = derivarEstatisticas(
      [evento({ tipo: "REMATE", atletaId: A })],
      [convocado(A)],
      true,
      "FUTEBOL_11",
    );
    expect(r.estatisticas.get(A)?.remates).toBe(1);
  });

  it("agrega múltiplos eventos e vários atletas coerentemente", () => {
    const r = derivarEstatisticas(
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

  it("zero-regressão: jogo só com blocos mantém minutos idênticos ao baseline (futebol)", () => {
    // Baseline (Motor B): minutos = blocoParaMinutos(bloco, formato). FUTEBOL_11:
    // JOGO_COMPLETO=90, MEIA_PARTE=45. Sem bloco → null.
    const r = derivarEstatisticas(
      [
        evento({ tipo: "SUBSTITUICAO", atletaId: A, bloco: "JOGO_COMPLETO" }),
        evento({ tipo: "SUBSTITUICAO", atletaId: B, bloco: "MEIA_PARTE" }),
      ],
      [convocado(A, true), convocado(B), convocado("c")],
      true,
      "FUTEBOL_11",
    );
    expect(r.estatisticas.get(A)?.minutos).toBe(90);
    expect(r.estatisticas.get(A)?.utilizacao).toBe("TITULAR"); // titularPrevisto não é despromovido
    expect(r.estatisticas.get(B)?.minutos).toBe(45);
    expect(r.estatisticas.get(B)?.utilizacao).toBe("UTILIZADO");
    // Convocado sem bloco nem intervalo → minutos null (não registado, ≠ zero).
    expect(r.estatisticas.get("c")?.minutos).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MODO JOGO AO VIVO — minutos por intervalos (cronómetro ao segundo).
// ─────────────────────────────────────────────────────────────────────────────
describe("derivarEstatisticas — intervalos ao vivo (§10.4)", () => {
  it("atleta que joga do início ao fim → minutos do cronómetro + TITULAR", () => {
    const eventos = [inicio(0), entra(A, 0), fim(40 * M)];
    const r = derivarEstatisticas(eventos, [convocado(A)], false, "FUTSAL_5");
    const s = r.estatisticas.get(A);
    expect(s?.minutos).toBe(40);
    expect(s?.utilizacao).toBe("TITULAR");
  });

  it("entrou depois do arranque → UTILIZADO (não despromove um previsto? entra depois → UTILIZADO)", () => {
    const eventos = [inicio(0), entra(A, 0), entra(B, 10 * M), fim(40 * M)];
    const r = derivarEstatisticas(
      eventos,
      [convocado(A), convocado(B, true)], // B era titularPrevisto mas entrou a meio
      false,
      "FUTSAL_5",
    );
    // O cronómetro prevalece sobre o plano previsto (precedência).
    expect(r.estatisticas.get(A)?.utilizacao).toBe("TITULAR");
    expect(r.estatisticas.get(B)?.utilizacao).toBe("UTILIZADO");
    expect(r.estatisticas.get(B)?.minutos).toBe(30);
  });

  it("múltiplos intervalos ao vivo somam", () => {
    const eventos = [
      inicio(0),
      entra(A, 0),
      sai(A, 10 * M),
      entra(A, 20 * M),
      sai(A, 35 * M),
      fim(40 * M),
    ];
    const r = derivarEstatisticas(eventos, [convocado(A)], false, "FUTSAL_5");
    expect(r.estatisticas.get(A)?.minutos).toBe(25); // 10 + 15
  });

  it("ainda em campo no fim → saída assume o segundo de FIM_PARTE", () => {
    const eventos = [inicio(0), entra(A, 30 * M), fim(40 * M)];
    const r = derivarEstatisticas(eventos, [convocado(A)], false, "FUTSAL_5");
    expect(r.estatisticas.get(A)?.minutos).toBe(10);
  });

  it("2–4 partes (cronómetro contínuo) — soma ao longo das partes", () => {
    // 4 partes de 15 min; A joga tudo (0..3600s).
    const eventos = [
      inicio(0, 1),
      entra(A, 0),
      fim(15 * M, 1),
      inicio(15 * M, 2),
      fim(30 * M, 2),
      inicio(30 * M, 3),
      fim(45 * M, 3),
      inicio(45 * M, 4),
      fim(60 * M, 4),
    ];
    const r = derivarEstatisticas(eventos, [convocado(A)], false, "FUTSAL_5");
    expect(r.estatisticas.get(A)?.minutos).toBe(60);
    expect(r.estatisticas.get(A)?.utilizacao).toBe("TITULAR");
  });

  it("pausa manual (PAUSA/RETOMA) não afeta os minutos — o cronómetro já é contínuo", () => {
    const semPausa = [inicio(0), entra(A, 0), fim(30 * M)];
    const comPausa = [
      inicio(0),
      entra(A, 0),
      evento({ tipo: "PAUSA", segundoJogo: 12 * M }),
      evento({ tipo: "RETOMA", segundoJogo: 12 * M }),
      fim(30 * M),
    ];
    const a = derivarEstatisticas(semPausa, [convocado(A)], false, "FUTSAL_5");
    const b = derivarEstatisticas(comPausa, [convocado(A)], false, "FUTSAL_5");
    expect(b.estatisticas.get(A)?.minutos).toBe(a.estatisticas.get(A)?.minutos);
    expect(b.estatisticas.get(A)?.minutos).toBe(30);
  });

  it("convocado que nunca entrou (ao vivo) → NAO_UTILIZADO com minutos null", () => {
    const eventos = [inicio(0), entra(A, 0), fim(40 * M)];
    const r = derivarEstatisticas(
      eventos,
      [convocado(A), convocado(B)],
      false,
      "FUTSAL_5",
    );
    expect(r.estatisticas.get(B)?.utilizacao).toBe("NAO_UTILIZADO");
    expect(r.estatisticas.get(B)?.minutos).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRECEDÊNCIA: intervalos > blocos > null.
// ─────────────────────────────────────────────────────────────────────────────
describe("derivarEstatisticas — precedência intervalos > blocos > null", () => {
  it("intervalos ao vivo ganham a um bloco registado para o mesmo atleta", () => {
    // A tem um bloco MEIA_PARTE (20 min) MAS também intervalos ao vivo de 30 min.
    const eventos = [
      inicio(0),
      entra(A, 0),
      sai(A, 30 * M),
      evento({ tipo: "SUBSTITUICAO", atletaId: A, bloco: "MEIA_PARTE" }),
      fim(40 * M),
    ];
    const r = derivarEstatisticas(eventos, [convocado(A)], false, "FUTSAL_5");
    // Intervalo (30) prevalece sobre o bloco (20).
    expect(r.estatisticas.get(A)?.minutos).toBe(30);
  });

  it("sem intervalos usa o bloco; sem bloco fica null", () => {
    const eventos = [evento({ tipo: "SUBSTITUICAO", atletaId: A, bloco: "BLOCO_10MIN" })];
    const r = derivarEstatisticas(
      eventos,
      [convocado(A), convocado(B)],
      false,
      "FUTSAL_5",
    );
    expect(r.estatisticas.get(A)?.minutos).toBe(10); // bloco
    expect(r.estatisticas.get(B)?.minutos).toBeNull(); // nem intervalo nem bloco
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG P0 — convergência e não-sobrescrita.
// ─────────────────────────────────────────────────────────────────────────────
describe("derivarEstatisticas — bug P0 (convergência e não-sobrescrita)", () => {
  // Eventos completos de um jogo conduzido ao vivo (intervalos ao segundo) +
  // golos registados no separador clássico (sem segundoJogo).
  const eventosCompletos = (): EventoParaDerivacao[] => [
    inicio(0),
    entra(A, 0),
    entra(B, 0),
    sai(B, 18 * M),
    fim(40 * M),
    // Golos registados à parte (registo clássico, sem segundoJogo/bloco).
    evento({ tipo: "GOLO", atletaId: A }),
    evento({ tipo: "GOLO", atletaId: A }),
  ];
  // Apenas o registo ao vivo (o que `terminarJogoAoVivo`/`editarEventos` lê).
  const eventosAoVivo = (): EventoParaDerivacao[] => [
    inicio(0),
    entra(A, 0),
    entra(B, 0),
    sai(B, 18 * M),
    fim(40 * M),
  ];
  const convs = () => [convocado(A), convocado(B), convocado("banco")];

  it("não-sobrescrita: registo ao vivo produz minutos PRECISOS (nunca null)", () => {
    // Este é exatamente o cenário que o Motor B antigo corrompia: eventos só com
    // segundoJogo (sem bloco) davam minutos null. Agora dão os minutos do cronómetro.
    const r = derivarEstatisticas(eventosCompletos(), convs(), false, "FUTSAL_5");
    expect(r.estatisticas.get(A)?.minutos).toBe(40);
    expect(r.estatisticas.get(B)?.minutos).toBe(18);
    expect(r.estatisticas.get(A)?.minutos).not.toBeNull();
    expect(r.estatisticas.get(B)?.minutos).not.toBeNull();
    // O banco (convocado sem jogar) → null, não corrompe.
    expect(r.estatisticas.get("banco")?.minutos).toBeNull();
    // Os golos do registo clássico continuam a contar.
    expect(r.estatisticas.get(A)?.golos).toBe(2);
  });

  it("convergência: o conjunto completo e o subconjunto ao vivo dão minutos IDÊNTICOS", () => {
    // previewEstatisticasDeEventos lê TODOS os eventos; terminar/editar leem só os
    // ao vivo. Os minutos têm de bater exatamente (os 3 pontos de entrada convergem).
    const completo = derivarEstatisticas(eventosCompletos(), convs(), false, "FUTSAL_5");
    const aoVivo = derivarEstatisticas(eventosAoVivo(), convs(), false, "FUTSAL_5");
    for (const id of [A, B, "banco"]) {
      expect(aoVivo.estatisticas.get(id)?.minutos).toBe(
        completo.estatisticas.get(id)?.minutos,
      );
      expect(aoVivo.estatisticas.get(id)?.utilizacao).toBe(
        completo.estatisticas.get(id)?.utilizacao,
      );
    }
  });

  it("convergência: a ordem dos eventos não altera os minutos", () => {
    const baralhado = [...eventosCompletos()].reverse();
    const a = derivarEstatisticas(eventosCompletos(), convs(), false, "FUTSAL_5");
    const b = derivarEstatisticas(baralhado, convs(), false, "FUTSAL_5");
    for (const id of [A, B]) {
      expect(b.estatisticas.get(id)?.minutos).toBe(a.estatisticas.get(id)?.minutos);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FASE B — captura ao vivo de golos/assistências/disciplina (com `segundoJogo`).
// Garante que os eventos capturados no Modo Jogo ao Vivo (que trazem `segundoJogo`)
// entram na contagem por atleta do motor único, sem interferir com os minutos.
// ─────────────────────────────────────────────────────────────────────────────
describe("derivarEstatisticas — captura ao vivo (Fase B, §8.25.3)", () => {
  const capt = (
    tipo: EventoParaDerivacao["tipo"],
    atletaId: string | null,
    segundoJogo: number,
  ): EventoParaDerivacao => evento({ tipo, atletaId, segundoJogo, parte: 1 });

  it("golos/assist/cartões com segundoJogo contam por atleta (e no placar)", () => {
    const eventos: EventoParaDerivacao[] = [
      inicio(0),
      entra(A, 0),
      entra(B, 0),
      capt("GOLO", A, 5 * M),
      capt("ASSISTENCIA", B, 5 * M), // materializada a partir do golo (par golo+assist)
      capt("CARTAO_AMARELO", A, 10 * M),
      capt("GOLO", A, 22 * M),
      capt("GOLO_SOFRIDO", null, 30 * M),
      capt("CARTAO_VERMELHO", B, 38 * M),
      fim(40 * M),
    ];
    const r = derivarEstatisticas(eventos, [convocado(A), convocado(B)], false, "FUTSAL_5");

    // Contadores por atleta (a fase de contagem NÃO filtra por segundoJogo).
    expect(r.estatisticas.get(A)?.golos).toBe(2);
    expect(r.estatisticas.get(A)?.cartaoAmarelo).toBe(1);
    expect(r.estatisticas.get(B)?.assistencias).toBe(1);
    expect(r.estatisticas.get(B)?.cartaoVermelho).toBe(1);

    // Placar coerente com a contagem de eventos.
    expect(r.golosMarcados).toBe(2);
    expect(r.golosSofridos).toBe(1);

    // Os minutos continuam a derivar do cronómetro (captura não interfere).
    expect(r.estatisticas.get(A)?.minutos).toBe(40);
    expect(r.estatisticas.get(B)?.minutos).toBe(40);
  });

  it("golo sem autor conta para o placar mas não afeta nenhum atleta", () => {
    const eventos: EventoParaDerivacao[] = [
      inicio(0),
      entra(A, 0),
      capt("GOLO", null, 7 * M),
      fim(40 * M),
    ];
    const r = derivarEstatisticas(eventos, [convocado(A)], false, "FUTSAL_5");
    expect(r.golosMarcados).toBe(1);
    expect(r.estatisticas.get(A)?.golos).toBe(0);
  });
});
