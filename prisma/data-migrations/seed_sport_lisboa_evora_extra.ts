// prisma/data-migrations/seed_sport_lisboa_evora_extra.ts
// DADOS DE TESTE — anonimizados em 2026-08-12. Não usar em produção com dados reais.
//
// Seed suplementar (standalone) do clube "Sport Lisboa e Évora".
// Equivalente à rota temporária app/api/seed-sle-extra/route.ts — ambos usam a
// MESMA lógica partilhada (seed_sport_lisboa_evora_extra_core.ts).
//
// PRÉ-REQUISITO: o clube base já tem de existir (npm run db:seed:sle).
//
// EXECUÇÃO MANUAL (com a BD acessível):
//   npm run db:seed:sle-extra
//
// Acrescenta: 5 subcategorias, 20 exercícios, exercícios nas sessões,
// periodização (7 mesociclos em 3 períodos) e 6 reuniões.

import { PrismaClient } from "@prisma/client";
import { seedSleExtra } from "./seed_sport_lisboa_evora_extra_core";

const prisma = new PrismaClient();

// Guarda de produção: este seed cria DADOS DE TESTE e NUNCA deve correr em produção.
if (process.env.NODE_ENV === "production") {
  throw new Error(
    "Seed abortado: seed de dados de teste (SLE) não pode correr em produção (NODE_ENV=production).",
  );
}

async function main() {
  const resultado = await seedSleExtra(prisma);
  if (!resultado.ok) {
    console.log(`⚠️  ${resultado.mensagem}`);
    return;
  }
  console.log(`✅ ${resultado.mensagem}`);
  if (resultado.dados) {
    const d = resultado.dados;
    console.log(`  Subcategorias: ${d.subcategorias}`);
    console.log(`  Exercícios: ${d.exercicios}`);
    console.log(`  Exercícios em sessões (criados): ${d.sessaoExercicios}`);
    console.log(`  Planeamentos (mesociclos): ${d.planeamentos}`);
    console.log(`  Sessões ligadas a planeamento: ${d.sessoesLigadas}`);
    console.log(`  Reuniões: ${d.reunioes}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
