import { describe, expect, it } from "vitest";
import {
  compararJogosPorProximidade,
  ordenarJogosPorProximidade,
} from "@/lib/ordenacao-jogos";

const AGORA = new Date("2026-10-04T12:00:00.000Z");
const j = (id: string, iso: string) => ({ id, data: new Date(iso) });

describe("ordenarJogosPorProximidade (§8.11)", () => {
  it("futuros por data ascendente no topo, passados por data descendente a seguir", () => {
    // Entrada na ordem antiga da query (data desc).
    const entrada = [
      j("f-26mai", "2027-05-26T15:00:00.000Z"),
      j("f-10mar", "2027-03-10T15:00:00.000Z"),
      j("f-03fev", "2027-02-03T15:00:00.000Z"),
      j("p-20set", "2026-09-20T15:00:00.000Z"),
      j("p-01set", "2026-09-01T15:00:00.000Z"),
      j("p-15ago", "2026-08-15T15:00:00.000Z"),
    ];
    expect(ordenarJogosPorProximidade(entrada, AGORA).map((x) => x.id)).toEqual([
      "f-03fev",
      "f-10mar",
      "f-26mai",
      "p-20set",
      "p-01set",
      "p-15ago",
    ]);
  });

  it("jogo com data exatamente igual a agora conta como futuro (topo)", () => {
    const entrada = [
      j("passado", "2026-10-04T11:59:59.999Z"),
      j("futuro", "2026-10-05T12:00:00.000Z"),
      j("agora", AGORA.toISOString()),
    ];
    expect(ordenarJogosPorProximidade(entrada, AGORA).map((x) => x.id)).toEqual([
      "agora",
      "futuro",
      "passado",
    ]);
  });

  it("empate de data mantém a ordem de entrada (sort estável)", () => {
    const entrada = [
      j("a", "2027-01-10T10:00:00.000Z"),
      j("b", "2027-01-10T10:00:00.000Z"),
      j("c", "2026-01-10T10:00:00.000Z"),
      j("d", "2026-01-10T10:00:00.000Z"),
    ];
    expect(ordenarJogosPorProximidade(entrada, AGORA).map((x) => x.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(compararJogosPorProximidade(entrada[0], entrada[1], AGORA)).toBe(0);
  });

  it("aceita datas em string ISO e não muta o array original", () => {
    const entrada = [
      { id: "p", data: "2026-01-01T00:00:00.000Z" },
      { id: "f", data: "2027-01-01T00:00:00.000Z" },
    ];
    const copia = [...entrada];
    expect(ordenarJogosPorProximidade(entrada, AGORA).map((x) => x.id)).toEqual(["f", "p"]);
    expect(entrada).toEqual(copia);
  });

  it("lista vazia ou só passados/só futuros", () => {
    expect(ordenarJogosPorProximidade([], AGORA)).toEqual([]);
    const passados = [j("p1", "2026-01-01T00:00:00Z"), j("p2", "2026-05-01T00:00:00Z")];
    expect(ordenarJogosPorProximidade(passados, AGORA).map((x) => x.id)).toEqual(["p2", "p1"]);
    const futuros = [j("f2", "2027-05-01T00:00:00Z"), j("f1", "2027-01-01T00:00:00Z")];
    expect(ordenarJogosPorProximidade(futuros, AGORA).map((x) => x.id)).toEqual(["f1", "f2"]);
  });
});
