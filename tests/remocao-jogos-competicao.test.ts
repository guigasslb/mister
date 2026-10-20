import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  agruparImpacto,
  categoriaRemocao,
  LABEL_MOTIVO_DADOS,
  motivosDados,
  SELECT_REMOCAO_JOGO,
  wherePodeApagar,
  type JogoParaRemocao,
  type MotivoDados,
} from "@/lib/remocao-jogos-competicao";

// Regra R3 (§23.6): critérios «o jogo tem dados» — classificador (pré-visualização)
// e predicado SQL do deleteMany derivam da mesma tabela (simetria, Regra 6.5).

const jogo = (over: Partial<JogoParaRemocao> = {}): JogoParaRemocao => ({
  id: "j1",
  data: new Date("2026-11-01T10:00:00Z"),
  adversario: "Benfica",
  casaFora: "CASA",
  equipaCompeticao: null,
  golosMarcados: null,
  golosSofridos: null,
  faltas1aParte: null,
  faltas2aParte: null,
  relatorio: null,
  videoUrl: null,
  fechado: false,
  sessaoAoVivo: null,
  _count: { convocatorias: 0, estatisticas: 0, eventos: 0, quadros: 0, observacoes: 0 },
  ...over,
});
const contagem = (c: Partial<JogoParaRemocao["_count"]>) => ({
  _count: { convocatorias: 0, estatisticas: 0, eventos: 0, quadros: 0, observacoes: 0, ...c },
});

/** Um fixture por motivo (só esse motivo presente). */
const UM_MOTIVO: [MotivoDados, JogoParaRemocao][] = [
  ["CONVOCATORIA", jogo(contagem({ convocatorias: 2 }))],
  ["ESTATISTICAS", jogo(contagem({ estatisticas: 1 }))],
  ["EVENTOS", jogo(contagem({ eventos: 3 }))],
  ["AO_VIVO", jogo({ sessaoAoVivo: { estado: "EM_CURSO" } })],
  ["RESULTADO", jogo({ golosMarcados: 0 })],
  ["QUADRO_TATICO", jogo(contagem({ quadros: 1 }))],
  ["RELATORIO", jogo({ relatorio: "Bom jogo" })],
  ["VIDEO", jogo({ videoUrl: "https://youtu.be/x" })],
  ["SCOUTING", jogo(contagem({ observacoes: 1 }))],
  ["FECHADO", jogo({ fechado: true })],
];

// ─── Avaliador mínimo do JogoWhereInput gerado por `wherePodeApagar` ─────────
const RELACOES = ["convocatorias", "estatisticas", "eventos", "quadros", "observacoes"] as const;

function avaliar(w: Prisma.JogoWhereInput, j: JogoParaRemocao): boolean {
  return Object.entries(w).every(([chave, valor]) => {
    if (chave === "AND") return (valor as Prisma.JogoWhereInput[]).every((x) => avaliar(x, j));
    if (chave === "OR") return (valor as Prisma.JogoWhereInput[]).some((x) => avaliar(x, j));
    if ((RELACOES as readonly string[]).includes(chave)) {
      expect(valor).toEqual({ none: {} });
      return j._count[chave as (typeof RELACOES)[number]] === 0;
    }
    if (chave === "sessaoAoVivo") {
      const is = (valor as { is: { estado: string } | null }).is;
      return is === null ? j.sessaoAoVivo === null : j.sessaoAoVivo?.estado === is.estado;
    }
    return (j as unknown as Record<string, unknown>)[chave] === valor;
  });
}

describe("motivosDados / categoriaRemocao", () => {
  it("jogo sem nada ⇒ VAZIO", () => {
    expect(motivosDados(jogo())).toEqual([]);
    expect(categoriaRemocao(jogo())).toBe("VAZIO");
  });

  it.each(UM_MOTIVO)("cada motivo isolado: %s", (motivo, j) => {
    expect(motivosDados(j)).toEqual([motivo]);
    expect(categoriaRemocao(j)).toBe(motivo === "CONVOCATORIA" ? "CONVOCATORIA" : "DADOS");
  });

  it("convocatória + estatísticas ⇒ DADOS", () => {
    const j = jogo(contagem({ convocatorias: 1, estatisticas: 1 }));
    expect(motivosDados(j)).toEqual(["CONVOCATORIA", "ESTATISTICAS"]);
    expect(categoriaRemocao(j)).toBe("DADOS");
  });

  it("sessão ao vivo POR_INICIAR ⇒ VAZIO; EM_CURSO/INTERVALO/PAUSADO/TERMINADO ⇒ DADOS", () => {
    expect(categoriaRemocao(jogo({ sessaoAoVivo: { estado: "POR_INICIAR" } }))).toBe("VAZIO");
    for (const estado of ["EM_CURSO", "INTERVALO", "PAUSADO", "TERMINADO"] as const)
      expect(categoriaRemocao(jogo({ sessaoAoVivo: { estado } }))).toBe("DADOS");
  });

  it("relatorio/videoUrl \"\" ⇒ VAZIO; só espaços conta como dados (sem trim, simétrico)", () => {
    expect(categoriaRemocao(jogo({ relatorio: "", videoUrl: "" }))).toBe("VAZIO");
    expect(categoriaRemocao(jogo({ relatorio: " " }))).toBe("DADOS");
  });

  it("qualquer campo de resultado (golos ou faltas) ⇒ RESULTADO", () => {
    for (const campo of ["golosMarcados", "golosSofridos", "faltas1aParte", "faltas2aParte"] as const)
      expect(motivosDados(jogo({ [campo]: 0 }))).toEqual(["RESULTADO"]);
  });

  it("todos os motivos têm rótulo PT-PT", () => {
    expect(Object.keys(LABEL_MOTIVO_DADOS).sort()).toEqual(UM_MOTIVO.map(([m]) => m).sort());
  });
});

describe("wherePodeApagar — simetria com categoriaRemocao", () => {
  const fixtures: JogoParaRemocao[] = [
    jogo(),
    jogo({ sessaoAoVivo: { estado: "POR_INICIAR" } }),
    jogo({ relatorio: "", videoUrl: "" }),
    jogo({ relatorio: " " }),
    jogo(contagem({ convocatorias: 1, estatisticas: 1 })),
    ...UM_MOTIVO.map(([, j]) => j),
  ];

  it.each(fixtures.map((f, i) => [i, f] as const))("fixture %i", (_i, f) => {
    const categoria = categoriaRemocao(f);
    expect(avaliar(wherePodeApagar(false), f)).toBe(categoria === "VAZIO");
    expect(avaliar(wherePodeApagar(true), f)).toBe(categoria !== "DADOS");
  });

  it("com convocatória: só o critério CONVOCATORIA sai do predicado", () => {
    const sem = wherePodeApagar(false).AND as Prisma.JogoWhereInput[];
    const com = wherePodeApagar(true).AND as Prisma.JogoWhereInput[];
    expect(sem).toHaveLength(UM_MOTIVO.length);
    expect(com).toEqual(sem.filter((c) => !("convocatorias" in c)));
  });

  it("SELECT_REMOCAO_JOGO lê todos os campos usados pelos critérios", () => {
    expect(Object.keys(SELECT_REMOCAO_JOGO._count.select).sort()).toEqual([...RELACOES].sort());
    for (const campo of ["golosMarcados", "golosSofridos", "faltas1aParte", "faltas2aParte", "relatorio", "videoUrl", "fechado"])
      expect(SELECT_REMOCAO_JOGO).toHaveProperty(campo, true);
    expect(SELECT_REMOCAO_JOGO.sessaoAoVivo).toEqual({ select: { estado: true } });
  });
});

describe("agruparImpacto", () => {
  it("separa vazios, com convocatória e com dados (com equipa e motivos)", () => {
    const r = agruparImpacto([
      jogo({ id: "v", equipaCompeticao: { nome: "Benjamins A" } }),
      jogo({ id: "c", ...contagem({ convocatorias: 1 }) }),
      jogo({ id: "d", golosMarcados: 2, golosSofridos: 1 }),
    ]);
    expect(r.vazios).toEqual([
      { id: "v", data: jogo().data, adversario: "Benfica", casaFora: "CASA", equipa: "Benjamins A", motivos: [] },
    ]);
    expect(r.comConvocatoria.map((x) => [x.id, x.equipa, x.motivos])).toEqual([["c", null, ["CONVOCATORIA"]]]);
    expect(r.comDados.map((x) => [x.id, x.motivos])).toEqual([["d", ["RESULTADO"]]]);
  });
});
