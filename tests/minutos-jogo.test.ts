import { describe, it, expect } from "vitest";
import {
  calcularMinutosDeEventos,
  type EventoAoVivo,
} from "@/lib/minutos-jogo";

// Atalhos para construir eventos legíveis nos cenários (§8.25.5).
const inicio = (segundoJogo: number, parte = 1): EventoAoVivo => ({
  tipo: "INICIO_PARTE",
  segundoJogo,
  parte,
});
const fim = (segundoJogo: number, parte = 1): EventoAoVivo => ({
  tipo: "FIM_PARTE",
  segundoJogo,
  parte,
});
const entrada = (atletaId: string, segundoJogo: number): EventoAoVivo => ({
  tipo: "ENTRADA",
  segundoJogo,
  atletaId,
});
const saida = (atletaId: string, segundoJogo: number): EventoAoVivo => ({
  tipo: "SAIDA",
  segundoJogo,
  atletaId,
});

describe("calcularMinutosDeEventos (§8.25.5)", () => {
  it("1. atleta que joga desde o início até ao fim", () => {
    const segundoFinal = 40 * 60; // 40 minutos
    const eventos: EventoAoVivo[] = [
      inicio(0),
      entrada("a1", 0),
      fim(segundoFinal),
    ];

    const resultado = calcularMinutosDeEventos(eventos, segundoFinal);

    expect(resultado).toEqual([
      {
        atletaId: "a1",
        minutos: 40,
        intervalos: [{ entrada: 0, saida: segundoFinal }],
      },
    ]);
  });

  it("2. atleta que entra a meio e sai antes do fim", () => {
    const segundoFinal = 40 * 60;
    const eventos: EventoAoVivo[] = [
      inicio(0),
      entrada("a2", 10 * 60), // entra ao minuto 10
      saida("a2", 25 * 60), // sai ao minuto 25
      fim(segundoFinal),
    ];

    const resultado = calcularMinutosDeEventos(eventos, segundoFinal);

    expect(resultado).toEqual([
      {
        atletaId: "a2",
        minutos: 15,
        intervalos: [{ entrada: 10 * 60, saida: 25 * 60 }],
      },
    ]);
  });

  it("3. atleta que entra e ainda está em campo no final (saída = segundoFinal)", () => {
    const segundoFinal = 40 * 60;
    const eventos: EventoAoVivo[] = [
      inicio(0),
      entrada("a3", 30 * 60), // entra ao minuto 30, nunca sai
    ];

    const resultado = calcularMinutosDeEventos(eventos, segundoFinal);

    expect(resultado).toEqual([
      {
        atletaId: "a3",
        minutos: 10, // 30 -> 40 = 10 minutos
        intervalos: [{ entrada: 30 * 60, saida: segundoFinal }],
      },
    ]);
  });

  it("4. atleta com duas entradas (entra, sai, entra de novo)", () => {
    const segundoFinal = 40 * 60;
    const eventos: EventoAoVivo[] = [
      inicio(0),
      entrada("a4", 0),
      saida("a4", 10 * 60), // joga 0..10
      entrada("a4", 20 * 60),
      saida("a4", 35 * 60), // joga 20..35
      fim(segundoFinal),
    ];

    const resultado = calcularMinutosDeEventos(eventos, segundoFinal);

    expect(resultado).toEqual([
      {
        atletaId: "a4",
        minutos: 25, // 10 + 15
        intervalos: [
          { entrada: 0, saida: 10 * 60 },
          { entrada: 20 * 60, saida: 35 * 60 },
        ],
      },
    ]);
  });

  it("5. atleta que nunca entra não aparece no resultado (utilização derivada a jusante)", () => {
    const segundoFinal = 40 * 60;
    const eventos: EventoAoVivo[] = [
      inicio(0),
      entrada("a1", 0),
      fim(segundoFinal),
    ];

    const resultado = calcularMinutosDeEventos(eventos, segundoFinal);

    // "banco" nunca teve ENTRADA -> não figura no resultado.
    expect(resultado.some((m) => m.atletaId === "banco")).toBe(false);
    expect(resultado.map((m) => m.atletaId)).toEqual(["a1"]);
  });

  it("6. lista vazia de eventos devolve resultado vazio", () => {
    const resultado = calcularMinutosDeEventos([], 40 * 60);
    expect(resultado).toEqual([]);
  });

  it("7. eventos fora de ordem cronológica são ordenados antes de processar", () => {
    const segundoFinal = 40 * 60;
    // Mesma informação do cenário 4, mas baralhada.
    const eventos: EventoAoVivo[] = [
      saida("a4", 35 * 60),
      entrada("a4", 0),
      fim(segundoFinal),
      saida("a4", 10 * 60),
      inicio(0),
      entrada("a4", 20 * 60),
    ];

    const resultado = calcularMinutosDeEventos(eventos, segundoFinal);

    expect(resultado).toEqual([
      {
        atletaId: "a4",
        minutos: 25,
        intervalos: [
          { entrada: 0, saida: 10 * 60 },
          { entrada: 20 * 60, saida: 35 * 60 },
        ],
      },
    ]);
  });

  it("não muta a lista de eventos recebida (imutabilidade)", () => {
    const segundoFinal = 40 * 60;
    const eventos: EventoAoVivo[] = [
      saida("a4", 20 * 60),
      entrada("a4", 0),
    ];
    const copia = [...eventos];

    calcularMinutosDeEventos(eventos, segundoFinal);

    expect(eventos).toEqual(copia);
  });

  it("8. jogo de 4 partes (cronómetro contínuo) — atleta joga tudo", () => {
    const segundoFinal = 60 * 60; // 4 × 15 min
    const eventos: EventoAoVivo[] = [
      inicio(0, 1),
      entrada("a1", 0),
      fim(15 * 60, 1),
      inicio(15 * 60, 2),
      fim(30 * 60, 2),
      inicio(30 * 60, 3),
      fim(45 * 60, 3),
      inicio(45 * 60, 4),
      fim(segundoFinal, 4),
    ];

    const resultado = calcularMinutosDeEventos(eventos, segundoFinal);

    expect(resultado).toEqual([
      {
        atletaId: "a1",
        minutos: 60,
        intervalos: [{ entrada: 0, saida: segundoFinal }],
      },
    ]);
  });

  it("9. PAUSA/RETOMA não alteram os intervalos (cronómetro já é contínuo)", () => {
    const segundoFinal = 30 * 60;
    const eventos: EventoAoVivo[] = [
      inicio(0),
      entrada("a1", 0),
      { tipo: "PAUSA", segundoJogo: 12 * 60 },
      { tipo: "RETOMA", segundoJogo: 12 * 60 },
      fim(segundoFinal),
    ];

    const resultado = calcularMinutosDeEventos(eventos, segundoFinal);

    expect(resultado).toEqual([
      {
        atletaId: "a1",
        minutos: 30,
        intervalos: [{ entrada: 0, saida: segundoFinal }],
      },
    ]);
  });
});
