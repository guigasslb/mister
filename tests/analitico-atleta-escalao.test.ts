import { describe, it, expect } from "vitest";
import type { Modalidade } from "@prisma/client";
import {
  escolherEscalaoContextoAnalitico,
  type ParticipacaoEpocaMinima,
} from "@/lib/analitico-atleta-escalao";

const EPOCA = "epoca-1";
const OUTRA_EPOCA = "epoca-0";
const BENJAMINS = "esc-benjamins";
const INFANTIS_A = "esc-infantis-a";
const FUTEBOL = "esc-futebol";

const modalidades = (
  entradas: Array<[string, Modalidade | null]>,
): Map<string, Modalidade | null> => new Map(entradas);

describe("escolherEscalaoContextoAnalitico", () => {
  it("mantém o escalão ativo quando o atleta só participou nele (zero regressão)", () => {
    const participacoes: ParticipacaoEpocaMinima[] = [
      { escalaoId: INFANTIS_A, epocaId: EPOCA },
    ];
    const escolha = escolherEscalaoContextoAnalitico({
      escalaoContextoAtivoId: INFANTIS_A,
      escaloesAtivos: [INFANTIS_A],
      participacoes,
      epocaId: EPOCA,
      modalidadeCtx: "FUTSAL",
      modalidadePorEscalao: modalidades([[INFANTIS_A, "FUTSAL"]]),
    });
    expect(escolha).toBe(INFANTIS_A);
  });

  it("força a vista conjunta quando o atleta mudou de escalão a meio da época", () => {
    // Tiago Coelho: saiu dos Benjamins (participação TRANSICAO, mas persiste) e
    // passou aos Infantis A (ATIVO). O histórico dos Benjamins tem de aparecer.
    const participacoes: ParticipacaoEpocaMinima[] = [
      { escalaoId: BENJAMINS, epocaId: EPOCA }, // origem (já não ativo)
      { escalaoId: INFANTIS_A, epocaId: EPOCA }, // destino (ativo)
    ];
    const escolha = escolherEscalaoContextoAnalitico({
      escalaoContextoAtivoId: INFANTIS_A,
      escaloesAtivos: [INFANTIS_A],
      participacoes,
      epocaId: EPOCA,
      modalidadeCtx: "FUTSAL",
      modalidadePorEscalao: modalidades([
        [BENJAMINS, "FUTSAL"],
        [INFANTIS_A, "FUTSAL"],
      ]),
    });
    expect(escolha).toBeUndefined(); // vista conjunta → agrega os dois escalões
  });

  it("ignora histórico de OUTRA modalidade (não mistura futsal com futebol)", () => {
    const participacoes: ParticipacaoEpocaMinima[] = [
      { escalaoId: FUTEBOL, epocaId: EPOCA }, // outra modalidade
      { escalaoId: INFANTIS_A, epocaId: EPOCA },
    ];
    const escolha = escolherEscalaoContextoAnalitico({
      escalaoContextoAtivoId: INFANTIS_A,
      escaloesAtivos: [INFANTIS_A],
      participacoes,
      epocaId: EPOCA,
      modalidadeCtx: "FUTSAL",
      modalidadePorEscalao: modalidades([
        [FUTEBOL, "FUTEBOL"],
        [INFANTIS_A, "FUTSAL"],
      ]),
    });
    expect(escolha).toBe(INFANTIS_A);
  });

  it("ignora histórico de OUTRA época", () => {
    const participacoes: ParticipacaoEpocaMinima[] = [
      { escalaoId: BENJAMINS, epocaId: OUTRA_EPOCA }, // época anterior
      { escalaoId: INFANTIS_A, epocaId: EPOCA },
    ];
    const escolha = escolherEscalaoContextoAnalitico({
      escalaoContextoAtivoId: INFANTIS_A,
      escaloesAtivos: [INFANTIS_A],
      participacoes,
      epocaId: EPOCA,
      modalidadeCtx: "FUTSAL",
      modalidadePorEscalao: modalidades([
        [BENJAMINS, "FUTSAL"],
        [INFANTIS_A, "FUTSAL"],
      ]),
    });
    expect(escolha).toBe(INFANTIS_A);
  });

  it("não muda de comportamento com participações simultâneas ativas", () => {
    // Dois escalões ATIVOS em simultâneo (SIMULTANEA): não é uma saída de
    // escalão — mantém o contexto do principal, como antes.
    const participacoes: ParticipacaoEpocaMinima[] = [
      { escalaoId: INFANTIS_A, epocaId: EPOCA },
      { escalaoId: BENJAMINS, epocaId: EPOCA },
    ];
    const escolha = escolherEscalaoContextoAnalitico({
      escalaoContextoAtivoId: INFANTIS_A,
      escaloesAtivos: [INFANTIS_A, BENJAMINS], // ambos ativos
      participacoes,
      epocaId: EPOCA,
      modalidadeCtx: "FUTSAL",
      modalidadePorEscalao: modalidades([
        [BENJAMINS, "FUTSAL"],
        [INFANTIS_A, "FUTSAL"],
      ]),
    });
    expect(escolha).toBe(INFANTIS_A);
  });

  it("mostra histórico mesmo sem participação ativa (atleta que saiu de tudo)", () => {
    const participacoes: ParticipacaoEpocaMinima[] = [
      { escalaoId: BENJAMINS, epocaId: EPOCA }, // terminada (INATIVO)
    ];
    const escolha = escolherEscalaoContextoAnalitico({
      escalaoContextoAtivoId: undefined,
      escaloesAtivos: [],
      participacoes,
      epocaId: EPOCA,
      modalidadeCtx: null,
      modalidadePorEscalao: modalidades([[BENJAMINS, "FUTSAL"]]),
    });
    // Modalidade de contexto null (sem ativo) só bate com escalões sem
    // modalidade; aqui o Benjamins é FUTSAL, logo não força conjunta e devolve o
    // contexto ativo (undefined) — a própria action cai na vista conjunta.
    expect(escolha).toBeUndefined();
  });
});
