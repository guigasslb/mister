import { describe, it, expect } from "vitest";
import {
  candidatosVoto,
  linhasResultadoVotacao,
  progressoVotacao,
  votaveis,
} from "@/components/jogos/votacao-capitao-vista";

const convocados = [
  { atletaId: "a", nome: "Ana", jaVotou: true, votavel: true },
  { atletaId: "b", nome: "Bruno", jaVotou: false, votavel: true },
  { atletaId: "c", nome: "Carla", jaVotou: false, votavel: true },
  { atletaId: "d", nome: "Duarte", jaVotou: false, votavel: false },
];

describe("votação do capitão — vista", () => {
  it("progresso: conta participações e lista quem falta (sem votos)", () => {
    expect(progressoVotacao(convocados)).toEqual({
      votaram: 1,
      total: 4,
      emFalta: [convocados[1], convocados[2], convocados[3]],
    });
  });

  it("votáveis: só os titulares", () => {
    expect(votaveis(convocados).map((c) => c.atletaId)).toEqual(["a", "b", "c"]);
  });

  it("candidatos: só titulares e exclui o próprio votante", () => {
    expect(candidatosVoto(convocados, "b").map((c) => c.atletaId)).toEqual(["a", "c"]);
  });

  it("candidatos: um suplente vota (em titulares), mas não é candidato", () => {
    expect(candidatosVoto(convocados, "d").map((c) => c.atletaId)).toEqual(["a", "b", "c"]);
    expect(candidatosVoto(convocados, "a").map((c) => c.atletaId)).not.toContain("d");
  });

  it("candidatos: sem titulares não há candidatos", () => {
    const semTitulares = convocados.map((c) => ({ ...c, votavel: false }));
    expect(candidatosVoto(semTitulares, "a")).toEqual([]);
  });

  it("resultado: só atletas com votos, pela ordem do apuramento, com nome", () => {
    expect(
      linhasResultadoVotacao(
        {
          tipo: "VENCEDOR",
          vencedorAtletaId: "c",
          contagem: [
            { atletaId: "c", votos: 2 },
            { atletaId: "x", votos: 1 },
            { atletaId: "a", votos: 0 },
          ],
        },
        convocados,
      ),
    ).toEqual([
      { atletaId: "c", nome: "Carla", votos: 2 },
      { atletaId: "x", nome: "Atleta", votos: 1 },
    ]);
  });
});
