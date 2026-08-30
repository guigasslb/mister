// Script de diagnóstico — visibilidade de exercícios por escalão
// Correr: node scripts/debug-visibilidade.mjs

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const emails = ['goncalo.pereira.1992@gmail.com', 'hfreixo0@gmail.com'];

  const membros = await prisma.membroClube.findMany({
    where: { utilizador: { email: { in: emails } } },
    include: {
      utilizador: { select: { id: true, email: true } },
      perfil: { select: { nome: true, ambito: true } },
      atribuicoes: { include: { escalao: { select: { id: true, nome: true } } } },
      clube: { select: { id: true, nome: true } },
    },
  });

  for (const m of membros) {
    console.log('\n===', m.utilizador.email, '===');
    console.log('Clube:', m.clube.nome, '| clubeId:', m.clube.id);
    console.log('Perfil:', m.perfil?.nome, '| ambito:', m.perfil?.ambito);
    console.log('Estado:', m.estado);
    console.log('Atribuições de escalão:', m.atribuicoes.map(a => `${a.escalao.nome} (${a.escalao.id})`).join(', ') || '(nenhuma)');
  }

  // Exercícios pessoais do Gonçalo
  const goncalo = membros.find(m => m.utilizador.email.includes('goncalo'));
  if (goncalo) {
    const exs = await prisma.exercicio.findMany({
      where: { autorId: goncalo.utilizadorId, proprietario: 'TREINADOR' },
      select: { id: true, nome: true, autorId: true, criadorId: true, proprietario: true },
      take: 5,
    });
    console.log('\n=== Exercícios pessoais do Gonçalo ===');
    console.log('Total:', exs.length);
    exs.forEach(e => console.log(' -', e.nome, '| autorId:', e.autorId, '| criadorId:', e.criadorId));

    // Testar o filtro real
    const hugo = membros.find(m => m.utilizador.email.includes('hfreixo'));
    if (hugo && exs.length > 0) {
      const visivel = await prisma.exercicio.findFirst({
        where: {
          id: exs[0].id,
          autor: {
            membros: {
              some: {
                clubeId: hugo.clubeId,
                OR: [
                  {
                    perfil: { ambito: 'TODO_CLUBE' },
                    clube: { escaloes: { some: { atribuicoes: { some: { membroClube: { clubeId: hugo.clubeId, utilizadorId: hugo.utilizadorId } } } } } },
                  },
                  {
                    atribuicoes: { some: { escalao: { atribuicoes: { some: { membroClube: { clubeId: hugo.clubeId, utilizadorId: hugo.utilizadorId } } } } } },
                  },
                ],
              },
            },
          },
        },
      });
      console.log('\n=== Teste do filtro real ===');
      console.log('Hugo vê o exercício do Gonçalo?', visivel ? 'SIM ✓' : 'NÃO ✗');
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
