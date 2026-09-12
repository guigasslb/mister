import { describe, it, expect } from "vitest";
import {
  calcularClassificacao,
  type JogoClassificacao,
  type ResultadoClassificacao,
} from "@/lib/classificacao";

const SEM_JOGOS: JogoClassificacao[] = [];
const SEM_RESULTADOS: ResultadoClassificacao[] = [];

describe("calcularClassificacao — LIGA (3 pts vitória, 1 pt empate)", () => {
  it("pontua vitória/empate/derrota da própria equipa e cria a linha do adversário", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "Sub-15",
      formato: "LIGA",
      jogosProprios: [
        { adversario: "Benfica", golosMarcados: 3, golosSofridos: 1 }, // vitória
        { adversario: "Sporting", golosMarcados: 2, golosSofridos: 2 }, // empate
        { adversario: "Porto", golosMarcados: 0, golosSofridos: 4 }, // derrota
      ],
      resultados: SEM_RESULTADOS,
    });

    const propria = tabela.find((l) => l.equipa === "Sub-15")!;
    expect(propria.jogos).toBe(3);
    expect(propria.vitorias).toBe(1);
    expect(propria.empates).toBe(1);
    expect(propria.derrotas).toBe(1);
    expect(propria.golosMarcados).toBe(5);
    expect(propria.golosSofridos).toBe(7);
    expect(propria.pontos).toBe(4); // 3 + 1 + 0

    // O espelho do adversário existe com o resultado invertido.
    const benfica = tabela.find((l) => l.equipa === "Benfica")!;
    expect(benfica.derrotas).toBe(1);
    expect(benfica.golosMarcados).toBe(1);
    expect(benfica.golosSofridos).toBe(3);
    expect(benfica.pontos).toBe(0);

    const porto = tabela.find((l) => l.equipa === "Porto")!;
    expect(porto.vitorias).toBe(1);
    expect(porto.pontos).toBe(3);
  });

  it("combina jogos próprios com resultados externos da mesma equipa", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "Sub-15",
      formato: "LIGA",
      jogosProprios: [{ adversario: "Benfica", golosMarcados: 1, golosSofridos: 0 }],
      resultados: [
        // Outro jogo do Benfica (contra o Sporting), inserido manualmente.
        { equipaCasa: "Benfica", equipaFora: "Sporting", golosCasa: 5, golosFora: 0 },
      ],
    });

    const benfica = tabela.find((l) => l.equipa === "Benfica")!;
    expect(benfica.jogos).toBe(2); // derrota c/ Sub-15 + vitória c/ Sporting
    expect(benfica.vitorias).toBe(1);
    expect(benfica.derrotas).toBe(1);
    expect(benfica.golosMarcados).toBe(5); // 0 + 5
    expect(benfica.golosSofridos).toBe(1); // 1 + 0
    expect(benfica.pontos).toBe(3);

    const sporting = tabela.find((l) => l.equipa === "Sporting")!;
    expect(sporting.jogos).toBe(1);
    expect(sporting.derrotas).toBe(1);
  });

  it("ordena por pontos, depois diferença de golos, depois golos marcados", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "A",
      formato: "LIGA",
      jogosProprios: SEM_JOGOS,
      resultados: [
        { equipaCasa: "A", equipaFora: "B", golosCasa: 1, golosFora: 0 }, // A vence
        { equipaCasa: "C", equipaFora: "D", golosCasa: 5, golosFora: 0 }, // C vence (melhor diff)
      ],
    });

    // C e A têm 3 pts; C tem melhor diferença de golos → primeiro.
    expect(tabela[0].equipa).toBe("C");
    expect(tabela[1].equipa).toBe("A");
  });

  it("atribui exatamente 3 pts à vitória, 1 pt ao empate e 0 pt à derrota", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "X",
      formato: "LIGA",
      jogosProprios: SEM_JOGOS,
      resultados: [
        { equipaCasa: "Vencedora", equipaFora: "Vencida", golosCasa: 2, golosFora: 1 },
        { equipaCasa: "EmpateA", equipaFora: "EmpateB", golosCasa: 3, golosFora: 3 },
      ],
    });

    expect(tabela.find((l) => l.equipa === "Vencedora")!.pontos).toBe(3);
    expect(tabela.find((l) => l.equipa === "Vencida")!.pontos).toBe(0);
    expect(tabela.find((l) => l.equipa === "EmpateA")!.pontos).toBe(1);
    expect(tabela.find((l) => l.equipa === "EmpateB")!.pontos).toBe(1);
  });
});

describe("calcularClassificacao — desempate", () => {
  it("desempata por diferença de golos, depois golos marcados, depois nome (asc)", () => {
    // Todas com 3 pts (uma vitória cada). Construídas para forçar cada critério.
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "irrelevante",
      formato: "LIGA",
      jogosProprios: SEM_JOGOS,
      resultados: [
        // "Zulu": diff +3 (3-0) — melhor diferença de golos → 1.º
        { equipaCasa: "Zulu", equipaFora: "adv1", golosCasa: 3, golosFora: 0 },
        // "Bravo": diff +1, 4 golos marcados
        { equipaCasa: "Bravo", equipaFora: "adv2", golosCasa: 4, golosFora: 3 },
        // "Alfa": diff +1, 2 golos marcados (mesma diff que Bravo, menos golos)
        { equipaCasa: "Alfa", equipaFora: "adv3", golosCasa: 2, golosFora: 1 },
        // "Charlie": diff +1, 4 golos marcados (empata TUDO com Bravo → nome desempata)
        { equipaCasa: "Charlie", equipaFora: "adv4", golosCasa: 4, golosFora: 3 },
      ],
    });

    const posicoes = tabela.filter((l) => !l.equipa.startsWith("adv")).map((l) => l.equipa);
    // 1) Zulu (melhor diff) → 2) Bravo e Charlie (diff+1, 4 golos; nome: Bravo<Charlie)
    //    → Charlie → 3) Alfa (diff+1, 2 golos, último)
    expect(posicoes).toEqual(["Zulu", "Bravo", "Charlie", "Alfa"]);
  });
});

describe("calcularClassificacao — TACA/TORNEIO ordenam por diferença de golos (sem pontos)", () => {
  it("TACA: sem pontos, ordena por diferença de golos", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "Sub-11",
      formato: "TACA",
      jogosProprios: SEM_JOGOS,
      resultados: [
        { equipaCasa: "Fraca", equipaFora: "Forte", golosCasa: 0, golosFora: 6 },
        { equipaCasa: "Media", equipaFora: "Outra", golosCasa: 3, golosFora: 2 },
      ],
    });

    // Ninguém tem pontos (TACA); "Forte" (+6) lidera, "Fraca" (-6) fica em último.
    expect(tabela.every((l) => l.pontos === 0)).toBe(true);
    expect(tabela[0].equipa).toBe("Forte");
    expect(tabela[tabela.length - 1].equipa).toBe("Fraca");
  });
});

describe("calcularClassificacao — TORNEIO/TACA (sem pontos)", () => {
  it("não atribui pontos mas conta jogos e golos", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "Sub-13",
      formato: "TORNEIO",
      jogosProprios: [{ adversario: "Leixões", golosMarcados: 4, golosSofridos: 1 }],
      resultados: SEM_RESULTADOS,
    });

    const propria = tabela.find((l) => l.equipa === "Sub-13")!;
    expect(propria.vitorias).toBe(1);
    expect(propria.golosMarcados).toBe(4);
    expect(propria.pontos).toBe(0); // TORNEIO não pontua
  });
});

describe("calcularClassificacao — robustez", () => {
  it("agrupa nomes com espaços à volta (trim) e ignora nomes vazios", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "Sub-15",
      formato: "LIGA",
      jogosProprios: [{ adversario: "  Benfica ", golosMarcados: 1, golosSofridos: 1 }],
      resultados: [
        { equipaCasa: "Benfica", equipaFora: "   ", golosCasa: 2, golosFora: 0 },
      ],
    });

    const benfica = tabela.find((l) => l.equipa === "Benfica")!;
    expect(benfica).toBeDefined();
    expect(benfica.jogos).toBe(2); // as duas linhas do Benfica foram agrupadas
    // A equipa de nome vazio não entra na tabela.
    expect(tabela.some((l) => l.equipa.trim() === "")).toBe(false);
  });

  it("tabela vazia quando não há jogos nem resultados", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "Sub-15",
      formato: "LIGA",
      jogosProprios: SEM_JOGOS,
      resultados: SEM_RESULTADOS,
    });
    expect(tabela).toHaveLength(0);
  });

  it("resultado externo com o próprio clube como equipaCasa funde na sua linha", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "Sub-15",
      formato: "LIGA",
      jogosProprios: [{ adversario: "Benfica", golosMarcados: 1, golosSofridos: 0 }],
      resultados: [
        // O próprio clube aparece como equipaCasa num resultado externo.
        { equipaCasa: "Sub-15", equipaFora: "Braga", golosCasa: 2, golosFora: 2 },
      ],
    });

    const propria = tabela.find((l) => l.equipa === "Sub-15")!;
    expect(propria.jogos).toBe(2); // 1 jogo próprio + 1 resultado externo
    expect(propria.vitorias).toBe(1); // 1-0 vs Benfica
    expect(propria.empates).toBe(1); // 2-2 vs Braga
    expect(propria.golosMarcados).toBe(3); // 1 + 2
    expect(propria.golosSofridos).toBe(2); // 0 + 2
    expect(propria.pontos).toBe(4); // 3 + 1
  });

  it("resultado externo com o próprio clube como equipaFora funde na sua linha", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "Sub-15",
      formato: "LIGA",
      jogosProprios: SEM_JOGOS,
      resultados: [
        // O próprio clube aparece como equipaFora (marca 3, sofre 1 → vitória).
        { equipaCasa: "Maritimo", equipaFora: "Sub-15", golosCasa: 1, golosFora: 3 },
      ],
    });

    const propria = tabela.find((l) => l.equipa === "Sub-15")!;
    expect(propria.jogos).toBe(1);
    expect(propria.vitorias).toBe(1);
    expect(propria.golosMarcados).toBe(3);
    expect(propria.golosSofridos).toBe(1);
    expect(propria.pontos).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1.2 (§23.5) — pontos configuráveis, WALKOVER, estados ignorados, ehProprio, posicao
// ─────────────────────────────────────────────────────────────────────────────

describe("calcularClassificacao — pontos configuráveis (§23.5)", () => {
  it("aplica pontuação 2/1/0 (alternativa) em LIGA", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "irrelevante",
      formato: "LIGA",
      jogosProprios: SEM_JOGOS,
      resultados: [
        { equipaCasa: "Vencedora", equipaFora: "Vencida", golosCasa: 1, golosFora: 0 },
        { equipaCasa: "EmpA", equipaFora: "EmpB", golosCasa: 2, golosFora: 2 },
      ],
      pontosVitoria: 2,
      pontosEmpate: 1,
      pontosDerrota: 0,
    });

    expect(tabela.find((l) => l.equipa === "Vencedora")!.pontos).toBe(2); // 2 (não 3)
    expect(tabela.find((l) => l.equipa === "Vencida")!.pontos).toBe(0);
    expect(tabela.find((l) => l.equipa === "EmpA")!.pontos).toBe(1);
  });

  it("aplica pontosDerrota configurável (ex: 1 ponto por derrota)", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "irrelevante",
      formato: "LIGA",
      jogosProprios: SEM_JOGOS,
      resultados: [{ equipaCasa: "Ganha", equipaFora: "Perde", golosCasa: 3, golosFora: 1 }],
      pontosVitoria: 3,
      pontosEmpate: 1,
      pontosDerrota: 1,
    });
    expect(tabela.find((l) => l.equipa === "Perde")!.pontos).toBe(1);
  });
});

describe("calcularClassificacao — WALKOVER (§23.7)", () => {
  it("conta o WO como vitória do vencedor com golosWalkover–0 e ignora golos inseridos", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "irrelevante",
      formato: "LIGA",
      jogosProprios: SEM_JOGOS,
      resultados: [
        {
          equipaCasa: "Presente",
          equipaFora: "Faltou",
          // Golos preenchidos por engano — DEVEM ser ignorados a favor do resultado regulamentar.
          golosCasa: 9,
          golosFora: 9,
          estado: "WALKOVER",
          walkoverVencedor: "CASA",
        },
      ],
      golosWalkover: 3,
    });

    const presente = tabela.find((l) => l.equipa === "Presente")!;
    expect(presente.vitorias).toBe(1);
    expect(presente.golosMarcados).toBe(3); // regulamentar, não os 9 inseridos
    expect(presente.golosSofridos).toBe(0);
    expect(presente.pontos).toBe(3);

    const faltou = tabela.find((l) => l.equipa === "Faltou")!;
    expect(faltou.derrotas).toBe(1);
    expect(faltou.golosMarcados).toBe(0);
    expect(faltou.golosSofridos).toBe(3);
    expect(faltou.pontos).toBe(0);
  });

  it("respeita walkoverVencedor = FORA e o golosWalkover configurável", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "irrelevante",
      formato: "LIGA",
      jogosProprios: SEM_JOGOS,
      resultados: [
        {
          equipaCasa: "Faltou",
          equipaFora: "Presente",
          estado: "WALKOVER",
          walkoverVencedor: "FORA",
        },
      ],
      golosWalkover: 5,
    });

    const presente = tabela.find((l) => l.equipa === "Presente")!;
    expect(presente.vitorias).toBe(1);
    expect(presente.golosMarcados).toBe(5);
    expect(presente.golosSofridos).toBe(0);
  });
});

describe("calcularClassificacao — estados ignorados (§23.5)", () => {
  it("ignora confrontos CANCELADO e AGENDADO (não contam golos/jogos/pontos)", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "irrelevante",
      formato: "LIGA",
      jogosProprios: SEM_JOGOS,
      resultados: [
        { equipaCasa: "A", equipaFora: "B", golosCasa: 5, golosFora: 0, estado: "CANCELADO" },
        { equipaCasa: "C", equipaFora: "D", golosCasa: 3, golosFora: 1, estado: "AGENDADO" },
        { equipaCasa: "A", equipaFora: "C", golosCasa: 2, golosFora: 1, estado: "REALIZADO" },
      ],
    });

    // Só o confronto REALIZADO conta: A 1 jogo (vitória), C 1 jogo (derrota).
    const a = tabela.find((l) => l.equipa === "A")!;
    expect(a.jogos).toBe(1);
    expect(a.golosMarcados).toBe(2); // não inclui o 5-0 cancelado
    expect(a.pontos).toBe(3);
    // B e D nunca entram na tabela (só apareciam em confrontos ignorados).
    expect(tabela.some((l) => l.equipa === "B")).toBe(false);
    expect(tabela.some((l) => l.equipa === "D")).toBe(false);
  });
});

describe("calcularClassificacao — ehProprio e posicao (§23.5)", () => {
  it("marca ehProprio = true na equipa própria e false nas restantes", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "Juventude SC",
      formato: "LIGA",
      jogosProprios: [{ adversario: "Benfica", golosMarcados: 1, golosSofridos: 0 }],
      resultados: [
        { equipaCasa: "Porto", equipaFora: "Sporting", golosCasa: 1, golosFora: 1 },
      ],
    });

    expect(tabela.find((l) => l.equipa === "Juventude SC")!.ehProprio).toBe(true);
    expect(tabela.find((l) => l.equipa === "Benfica")!.ehProprio).toBe(false);
    expect(tabela.find((l) => l.equipa === "Porto")!.ehProprio).toBe(false);
  });

  it("atribui posicao 1..N pela ordem final da tabela", () => {
    const tabela = calcularClassificacao({
      nomeEquipaPropria: "irrelevante",
      formato: "LIGA",
      jogosProprios: SEM_JOGOS,
      resultados: [
        { equipaCasa: "Lider", equipaFora: "Meio", golosCasa: 3, golosFora: 0 },
        { equipaCasa: "Meio", equipaFora: "Ultimo", golosCasa: 1, golosFora: 0 },
        { equipaCasa: "Lider", equipaFora: "Ultimo", golosCasa: 2, golosFora: 0 },
      ],
    });

    // Lider: 6 pts (2V) → 1.º; Meio: 3 pts → 2.º; Ultimo: 0 pts → 3.º.
    expect(tabela.map((l) => [l.equipa, l.posicao])).toEqual([
      ["Lider", 1],
      ["Meio", 2],
      ["Ultimo", 3],
    ]);
  });
});
