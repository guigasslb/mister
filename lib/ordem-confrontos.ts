import type { Prisma } from "@prisma/client";

/**
 * R6 (2026-10-20): ordem de apresentação dos confrontos de uma competição — a
 * `ordem` persistida primeiro (nulls no fim: caminhos legados sem ordem); o resto é
 * a ordem anterior (data, criação) com o id como desempate determinístico. O
 * backfill da migração 20261020120000_ordem_confrontos usa as mesmas colunas.
 * Módulo partilhado (fora de `"use server"`, que só pode exportar funções async).
 */
export const ORDER_RESULTADOS: Prisma.ResultadoCompeticaoOrderByWithRelationInput[] = [
  { ordem: { sort: "asc", nulls: "last" } },
  { data: "asc" },
  { criadoEm: "asc" },
  { id: "asc" },
];
