import { describe, it, expect } from "vitest";
import {
  adicionarConfronto,
  adicionarRonda,
  agruparPorRonda,
  atualizarConfronto,
  avisosJornada,
  combinarDataHora,
  deGerados,
  ERRO_CASA_POR_ESCOLHER,
  ERRO_EQUIPA_FORA_DA_LISTA,
  ERRO_FORA_POR_ESCOLHER,
  ERRO_MESMA_EQUIPA,
  moverNaJornada,
  mudarRonda,
  novaOrdemJornada,
  paraPayload,
  removerConfronto,
  rondaMaxima,
  trocar,
  validarCalendario,
  type JogoCalendario,
} from "@/lib/calendario-wizard";
import { gerarBracket, gerarLiga } from "@/lib/quadro-cliente";

// Calendário editável (2026-10-20): lógica pura do Passo 3 do wizard e do
// separador «Confrontos» (lib/calendario-wizard.ts).

const j = (chave: string, ronda: number, casa = "A", fora = "B", data = "", hora = ""): JogoCalendario => ({
  chave,
  equipaCasa: casa,
  equipaFora: fora,
  ronda,
  data,
  hora,
});

const chaves = (jogos: JogoCalendario[]) => jogos.map((x) => x.chave);

describe("edição do calendário", () => {
  it("trocar inverte casa e visitante só no confronto indicado", () => {
    const r = trocar([j("1", 1, "A", "B"), j("2", 1, "C", "D")], "1");
    expect(r.map((x) => [x.equipaCasa, x.equipaFora])).toEqual([
      ["B", "A"],
      ["C", "D"],
    ]);
  });

  it("atualizarConfronto altera equipas/data/hora", () => {
    const r = atualizarConfronto([j("1", 1)], "1", { equipaFora: "C", data: "2026-11-01", hora: "10:00" });
    expect(r[0]).toMatchObject({ equipaCasa: "A", equipaFora: "C", data: "2026-11-01", hora: "10:00" });
  });

  it("adicionarConfronto acrescenta um confronto vazio no fim da jornada, com chave nova", () => {
    const base = [j("1", 1), j("2", 2)];
    const r = adicionarConfronto(base, 1);
    expect(r).toHaveLength(3);
    const novo = r[2];
    expect(novo).toMatchObject({ equipaCasa: "", equipaFora: "", ronda: 1, data: "", hora: "" });
    expect(base.map((x) => x.chave)).not.toContain(novo.chave);
    expect(agruparPorRonda(r)[0][1].map((x) => x.chave)).toEqual(["1", novo.chave]);
  });

  it("adicionarRonda cria a jornada máx+1 (1 numa lista vazia)", () => {
    expect(rondaMaxima([])).toBe(0);
    expect(adicionarRonda([])[0].ronda).toBe(1);
    expect(adicionarRonda([j("1", 1), j("2", 3)]).at(-1)?.ronda).toBe(4);
  });

  it("removerConfronto remove só o indicado (a jornada vazia desaparece)", () => {
    const r = removerConfronto([j("1", 1), j("2", 2)], "2");
    expect(chaves(r)).toEqual(["1"]);
    expect(agruparPorRonda(r).map(([ronda]) => ronda)).toEqual([1]);
  });

  it("mudarRonda envia o confronto para o fim da jornada de destino; mesma jornada = nada", () => {
    const base = [j("1", 1), j("2", 2), j("3", 2), j("4", 1)];
    const r = mudarRonda(base, "1", 2);
    expect(agruparPorRonda(r).map(([ronda, l]) => [ronda, chaves(l)])).toEqual([
      [1, ["4"]],
      [2, ["2", "3", "1"]],
    ]);
    expect(r.find((x) => x.chave === "1")?.ronda).toBe(2);
    expect(mudarRonda(base, "1", 1)).toBe(base);
  });

  it("moverNaJornada troca com o vizinho da MESMA jornada e respeita os limites", () => {
    const base = [j("1", 1), j("2", 2), j("3", 1), j("4", 1)];
    expect(chaves(moverNaJornada(base, "3", -1))).toEqual(["3", "2", "1", "4"]);
    expect(chaves(moverNaJornada(base, "3", 1))).toEqual(["1", "2", "4", "3"]);
    expect(moverNaJornada(base, "1", -1)).toBe(base); // 1.º da jornada
    expect(moverNaJornada(base, "4", 1)).toBe(base); // último da jornada
    expect(moverNaJornada(base, "2", 1)).toBe(base); // único da jornada 2
    expect(moverNaJornada(base, "x", 1)).toBe(base);
  });

  it("agruparPorRonda ordena as jornadas e mantém a ordem da lista dentro de cada uma", () => {
    const r = agruparPorRonda([j("a", 2), j("b", 1), j("c", 2)]);
    expect(r.map(([ronda, l]) => [ronda, chaves(l)])).toEqual([
      [1, ["b"]],
      [2, ["a", "c"]],
    ]);
  });
});

describe("validarCalendario", () => {
  const participantes = ["Benjamins", "Benfica", "Porto"];

  it("erros: casa/visitante por escolher, equipa fora da lista, casa = visitante", () => {
    const { erros } = validarCalendario(
      [
        j("1", 1, "", "Benfica"),
        j("2", 1, "Benfica", ""),
        j("3", 1, "Sporting", "Porto"),
        j("4", 1, "Porto", " porto "),
        j("5", 1, "benjamins", "Benfica"),
      ],
      participantes,
    );
    expect([...erros.entries()]).toEqual([
      ["1", ERRO_CASA_POR_ESCOLHER],
      ["2", ERRO_FORA_POR_ESCOLHER],
      ["3", ERRO_EQUIPA_FORA_DA_LISTA],
      ["4", ERRO_MESMA_EQUIPA],
    ]);
  });

  it("mesma equipa 2× na jornada ⇒ só aviso (não é erro)", () => {
    const r = validarCalendario(
      [j("1", 1, "Benjamins", "Benfica"), j("2", 1, "Porto", "Benjamins"), j("3", 2, "Benfica", "Porto")],
      participantes,
    );
    expect(r.erros.size).toBe(0);
    expect(r.avisos).toEqual([{ ronda: 1, equipa: "Benjamins" }]);
  });

  it("avisosJornada ignora «Sem jornada» (ronda null) e nomes vazios; um aviso por equipa", () => {
    expect(
      avisosJornada([
        { ronda: null, equipaCasa: "A", equipaFora: "B" },
        { ronda: null, equipaCasa: "A", equipaFora: "C" },
        { ronda: 3, equipaCasa: "", equipaFora: "B" },
        { ronda: 3, equipaCasa: "", equipaFora: "C" },
        { ronda: 2, equipaCasa: "A", equipaFora: "B" },
        { ronda: 2, equipaCasa: "a ", equipaFora: "B" },
      ]),
    ).toEqual([
      { ronda: 2, equipa: "A" },
      { ronda: 2, equipa: "B" },
    ]);
  });
});

describe("paraPayload", () => {
  // Mapeamento anterior do wizard (zero-regressão): `{equipaCasa, equipaFora, ronda, dataHora}`.
  const antigo = (gerados: { equipaCasa: string; equipaFora: string; ronda: number }[]) =>
    gerados.map((g) => ({ equipaCasa: g.equipaCasa, equipaFora: g.equipaFora, ronda: g.ronda, dataHora: null }));
  const equipas = ["Benjamins", "Benfica", "Porto", "Sporting", "Braga"].map((nome, i) => ({ nome, posicao: i + 1 }));

  it("zero-regressão: quadro gerado sem edições (liga, liga a duas mãos, bracket) = payload atual", () => {
    for (const gerados of [gerarLiga(equipas, false), gerarLiga(equipas, true), gerarBracket(equipas)]) {
      expect(paraPayload(deGerados(gerados))).toEqual(antigo(gerados));
    }
  });

  it("ordena por jornada com ordenação estável pela ordem da lista", () => {
    const r = paraPayload([j("1", 2, "A", "B"), j("2", 1, "C", "D"), j("3", 2, "E", "F"), j("4", 1, "G", "H")]);
    expect(r.map((x) => [x.ronda, x.equipaCasa])).toEqual([
      [1, "C"],
      [1, "G"],
      [2, "A"],
      [2, "E"],
    ]);
  });

  it("combina data e hora (sem data ⇒ null; sem hora ⇒ 00:00)", () => {
    expect(combinarDataHora("", "10:00")).toBeNull();
    expect(combinarDataHora("2026-11-01", "")?.getHours()).toBe(0);
    const d = paraPayload([j("1", 1, "A", "B", "2026-11-01", "18:30")])[0].dataHora;
    expect(d?.getHours()).toBe(18);
    expect(d?.getMinutes()).toBe(30);
  });
});

describe("novaOrdemJornada (separador «Confrontos»)", () => {
  // Jornada completa r1..r4; «Por disputar» mostra r1, r3, r4 (r2 está em «Resultados»).
  const jornada = ["r1", "r2", "r3", "r4"];
  const visiveis = ["r1", "r3", "r4"];

  it("troca com o vizinho VISÍVEL da secção, mantendo os outros no lugar", () => {
    expect(novaOrdemJornada(jornada, visiveis, "r3", -1)).toEqual(["r3", "r2", "r1", "r4"]);
    expect(novaOrdemJornada(jornada, visiveis, "r3", 1)).toEqual(["r1", "r2", "r4", "r3"]);
  });

  it("sem vizinho (1.º/último visível) ou id desconhecido ⇒ null", () => {
    expect(novaOrdemJornada(jornada, visiveis, "r1", -1)).toBeNull();
    expect(novaOrdemJornada(jornada, visiveis, "r4", 1)).toBeNull();
    expect(novaOrdemJornada(jornada, visiveis, "r2", 1)).toBeNull();
  });
});
