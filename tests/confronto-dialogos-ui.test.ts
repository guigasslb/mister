import { describe, it, expect } from "vitest";
import {
  agruparPorJornada,
  aplicarOrdemJornada,
  classificarEdicao,
  decisoesCompletas,
  edicaoTemImpacto,
  jogosQueSobram,
  listarMotivos,
  opcoesRonda,
  ordenarPorIds,
  payloadDecisoes,
  pedeDecisaoDados,
  resolverEquipaId,
  resumoApagarCompeticao,
  rotuloJogo,
  sufixoJogosApagados,
  textoClassificacaoApagar,
  eCorridaImpacto,
  estadoPrevia,
  textoResultadoFinal,
  vezesNaJornada,
} from "@/lib/confronto-dialogos-ui";
import { ERRO_IMPACTO_COMPETICAO, ERRO_IMPACTO_CONFRONTO } from "@/lib/erros-impacto-confronto";
import { novaOrdemJornada } from "@/lib/calendario-wizard";
import type { ImpactoRemocaoJogos, JogoImpacto } from "@/lib/remocao-jogos-competicao";

function jogo(id: string, motivos: JogoImpacto["motivos"] = []): JogoImpacto {
  return {
    id,
    data: new Date("2026-11-01T10:00:00Z"),
    adversario: "Benfica",
    casaFora: "CASA",
    equipa: null,
    motivos,
  };
}

function impacto(v: number, c: number, d: number): ImpactoRemocaoJogos {
  return {
    vazios: Array.from({ length: v }, (_, i) => jogo(`v${i}`)),
    comConvocatoria: Array.from({ length: c }, (_, i) => jogo(`c${i}`, ["CONVOCATORIA"])),
    comDados: Array.from({ length: d }, (_, i) => jogo(`d${i}`, ["ESTATISTICAS"])),
  };
}

describe("decisões do impacto (R3 + D1)", () => {
  it("sem convocatória nem dados não pede decisões nem envia campos", () => {
    const i = impacto(2, 0, 0);
    expect(decisoesCompletas(i, null, null)).toBe(true);
    expect(payloadDecisoes(i, null, null)).toEqual({});
  });

  it("convocatória exige escolha; APAGAR não deixa sobras e dispensa D1", () => {
    const i = impacto(0, 1, 0);
    expect(decisoesCompletas(i, null, null)).toBe(false);
    expect(decisoesCompletas(i, "APAGAR", null)).toBe(true);
    expect(pedeDecisaoDados(i, "APAGAR")).toBe(false);
    expect(payloadDecisoes(i, "APAGAR", "MANTER")).toEqual({ jogosComConvocatoria: "APAGAR" });
  });

  it("convocatória MANTER faz sobrar jogos ⇒ pede «Manter/Retirar da competição»", () => {
    const i = impacto(0, 2, 0);
    expect(jogosQueSobram(i, "MANTER")).toBe(2);
    expect(decisoesCompletas(i, "MANTER", null)).toBe(false);
    expect(payloadDecisoes(i, "MANTER", "DESASSOCIAR")).toEqual({
      jogosComConvocatoria: "MANTER",
      jogosComDados: "DESASSOCIAR",
    });
  });

  it("jogos com dados pedem sempre D1, sem pré-seleção", () => {
    const i = impacto(1, 0, 1);
    expect(pedeDecisaoDados(i, null)).toBe(true);
    expect(decisoesCompletas(i, null, null)).toBe(false);
    expect(payloadDecisoes(i, null, "MANTER")).toEqual({ jogosComDados: "MANTER" });
  });
});

describe("textos", () => {
  it("lista motivos em PT-PT", () => {
    expect(listarMotivos(["ESTATISTICAS"])).toBe("estatísticas");
    expect(listarMotivos(["ESTATISTICAS", "RELATORIO"])).toBe("estatísticas e relatório");
    expect(listarMotivos(["CONVOCATORIA", "ESTATISTICAS", "VIDEO"])).toBe(
      "convocatória, estatísticas e vídeo",
    );
  });

  it("rótulo do jogo usa a subequipa, ou o adversário sem subequipa", () => {
    expect(rotuloJogo({ equipa: "Benjamins A", adversario: "Benfica" })).toBe("de Benjamins A");
    expect(rotuloJogo({ equipa: null, adversario: "Benfica" })).toBe("contra Benfica");
  });

  it("sufixo do toast só com jogos apagados", () => {
    expect(sufixoJogosApagados(0)).toBe("");
    expect(sufixoJogosApagados(2, " em /jogos")).toBe(" · 2 jogo(s) apagado(s) em /jogos");
  });
});

describe("editar confronto (D3)", () => {
  const equipas = [
    { id: "a", nome: "Benjamins A" },
    { id: "b", nome: "Benfica" },
    { id: "c", nome: "Porto" },
  ];

  it("resolve a identidade pela FK ou pelo nome (confrontos legados sem FK)", () => {
    expect(resolverEquipaId("b", "x", equipas)).toBe("b");
    expect(resolverEquipaId(null, "  benfica ", equipas)).toBe("b");
    expect(resolverEquipaId(null, "Removida FC", equipas)).toBeNull();
  });

  it("troca não muda equipas; substituir uma equipa sim", () => {
    expect(classificarEdicao({ casaId: "a", foraId: "b" }, { casaId: "b", foraId: "a" })).toEqual({
      troca: true,
      mudaEquipas: false,
    });
    expect(classificarEdicao({ casaId: "a", foraId: "b" }, { casaId: "a", foraId: "b" })).toEqual({
      troca: false,
      mudaEquipas: false,
    });
    expect(classificarEdicao({ casaId: "a", foraId: "b" }, { casaId: "c", foraId: "a" })).toEqual({
      troca: false,
      mudaEquipas: true,
    });
    expect(
      classificarEdicao({ casaId: null, foraId: "b" }, { casaId: "a", foraId: "b" }).mudaEquipas,
    ).toBe(true);
  });

  it("opções de jornada: 1…máx+1, incluindo sempre a atual", () => {
    expect(opcoesRonda(0)).toEqual([1]);
    expect(opcoesRonda(3)).toEqual([1, 2, 3, 4]);
    expect(opcoesRonda(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("2.º passo só quando mexe em jogos", () => {
    const vazio = { saem: impacto(0, 0, 0), atualizados: [], criaJogos: [] };
    expect(edicaoTemImpacto(vazio)).toBe(false);
    expect(edicaoTemImpacto({ ...vazio, atualizados: [{ temDados: false }] })).toBe(false);
    expect(edicaoTemImpacto({ ...vazio, atualizados: [{ temDados: true }] })).toBe(true);
    expect(edicaoTemImpacto({ ...vazio, criaJogos: ["Benjamins B"] })).toBe(true);
    expect(edicaoTemImpacto({ ...vazio, saem: impacto(1, 0, 0) })).toBe(true);
  });
});

describe("apagar competição (D2)", () => {
  it("só um botão sem jogos apagáveis; dois botões com vazios ou com convocatória", () => {
    expect(resumoApagarCompeticao(impacto(0, 0, 0)).doisBotoes).toBe(false);
    expect(resumoApagarCompeticao(impacto(0, 0, 3)).doisBotoes).toBe(false);
    expect(resumoApagarCompeticao(impacto(1, 0, 0)).doisBotoes).toBe(true);
    expect(resumoApagarCompeticao(impacto(0, 2, 1))).toEqual({
      vazios: 0,
      comConvocatoria: 2,
      comDados: 1,
      doisBotoes: true,
    });
  });
});

describe("ordem dos confrontos no separador «Confrontos» (R6)", () => {
  it("agrupa por jornada asc com «Sem jornada» no fim, mantendo a ordem recebida", () => {
    const lista = [
      { id: "x", ronda: null },
      { id: "b", ronda: 2 },
      { id: "a", ronda: 1 },
      { id: "c", ronda: 2 },
    ];
    expect(agruparPorJornada(lista).map(([r, g]) => [r, g.map((x) => x.id)])).toEqual([
      [1, ["a"]],
      [2, ["b", "c"]],
      [null, ["x"]],
    ]);
  });

  it("subir na secção troca com o vizinho visível e a ordem global só muda nessa jornada", () => {
    // Jornada 1 = [p1, r1, p2] (r1 decidido); «Por disputar» vê [p1, p2].
    const global = ["p1", "j2a", "r1", "p2", "j2b"];
    const nova = novaOrdemJornada(["p1", "r1", "p2"], ["p1", "p2"], "p2", -1);
    expect(nova).toEqual(["p2", "r1", "p1"]);
    expect(aplicarOrdemJornada(global, nova!)).toEqual(["p2", "j2a", "r1", "p1", "j2b"]);
  });

  it("ordena os itens pela lista otimista de ids", () => {
    const itens = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(ordenarPorIds(itens, ["c", "a", "b"]).map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});

describe("revisão: contagem do aviso e texto da classificação", () => {
  it("conta as vezes reais da equipa na jornada (nomes sem maiúsculas/espaços)", () => {
    const cs = [
      { ronda: 1, equipaCasa: "Benfica", equipaFora: "Porto" },
      { ronda: 1, equipaCasa: "Sporting", equipaFora: " benfica" },
      { ronda: 1, equipaCasa: "Benfica", equipaFora: "Braga" },
      { ronda: 2, equipaCasa: "Benfica", equipaFora: "Porto" },
      { ronda: null, equipaCasa: "Benfica", equipaFora: "Porto" },
    ];
    expect(vezesNaJornada(cs, 1, "Benfica")).toBe(3);
    expect(vezesNaJornada(cs, 2, "Benfica")).toBe(1);
  });

  it("apagar confronto: o texto da classificação segue a escolha D1", () => {
    const semSobras = impacto(1, 0, 0);
    expect(textoClassificacaoApagar(semSobras, null, null)).toBe(
      "O resultado deixa de contar para a classificação.",
    );
    const comDados = impacto(0, 0, 1);
    expect(textoClassificacaoApagar(comDados, null, "DESASSOCIAR")).toBe(
      "O resultado deixa de contar para a classificação.",
    );
    expect(textoClassificacaoApagar(comDados, null, "MANTER")).toMatch(/continua a contar/);
    expect(textoClassificacaoApagar(comDados, null, null)).toMatch(/se o mantiveres/);
    // Convocatória apagada não deixa sobras ⇒ texto simples.
    expect(textoClassificacaoApagar(impacto(0, 1, 0), "APAGAR", null)).toBe(
      "O resultado deixa de contar para a classificação.",
    );
  });
});

describe("revisão M1: placar do aviso D3 vem de resultadoFinal", () => {
  it("formata golos já reorientados e walkover pelo vencedor", () => {
    expect(textoResultadoFinal({ golosCasa: 1, golosFora: 3, walkoverVencedor: null }, "A", "B")).toBe(
      "1–3",
    );
    expect(
      textoResultadoFinal({ golosCasa: 3, golosFora: 0, walkoverVencedor: "FORA" }, "A", "B"),
    ).toBe("walkover a favor de B");
  });
});

describe("revisão: estado da pré-visualização D3", () => {
  const r = { golosCasa: 1, golosFora: 0, walkoverVencedor: null };
  it("sem resposta ou com resposta de outra escolha ⇒ a calcular", () => {
    expect(estadoPrevia(null, "a|b")).toEqual({ tipo: "A_CALCULAR" });
    expect(estadoPrevia({ chave: "a|c", sucesso: true, resultado: r }, "a|b")).toEqual({
      tipo: "A_CALCULAR",
    });
  });
  it("erro sai do «a calcular» e um sucesso seguinte substitui-o", () => {
    expect(estadoPrevia({ chave: "a|b", sucesso: false, erro: "Falhou" }, "a|b")).toEqual({
      tipo: "ERRO",
      erro: "Falhou",
    });
    expect(estadoPrevia({ chave: "a|b", sucesso: true, resultado: r }, "a|b")).toEqual({
      tipo: "OK",
      resultado: r,
    });
  });
});

describe("revisão: corrida do impacto (com ou sem camposInvalidos)", () => {
  const msg = ERRO_IMPACTO_CONFRONTO;
  it("deteta a corrida pela decisão em falta ou só pela mensagem", () => {
    expect(eCorridaImpacto({ erro: msg, camposInvalidos: { jogosComDados: msg } })).toBe(true);
    expect(eCorridaImpacto({ erro: msg })).toBe(true);
    expect(eCorridaImpacto({ erro: "Confronto não encontrado" })).toBe(false);
  });

  it("usa as constantes partilhadas do servidor (igualdade exata, não prefixo)", () => {
    expect(eCorridaImpacto({ erro: ERRO_IMPACTO_COMPETICAO })).toBe(true);
    expect(eCorridaImpacto({ erro: "Entretanto mudou algo nos jogos" })).toBe(false);
  });
});
