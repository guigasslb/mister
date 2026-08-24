# Contas de Teste

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Estado**: Publicado

## Visão Geral

Contas criadas pelo `prisma/seed-teste.ts` para a campanha de testes. Todas partilham a mesma password para simplificar a execução. Cada conta mapeia numa persona e numa porta de servidor isolada.

## Tabela de Contas

| Email | Password | Clube | Perfil | Porta |
|---|---|---|---|---|
| `solo.miudos@teste.pt` | `Mister#2026!` | Atlético dos Miúdos | Admin (solo) | 3020 |
| `solo.seniores@teste.pt` | `Mister#2026!` | FC Independente | Admin (solo) | 3021 |
| `clube.seniores@teste.pt` | `Mister#2026!` | SC Estrela | Admin de clube | 3022 |
| `diretor@estrela.pt` | `Mister#2026!` | SC Estrela | Diretor Técnico | 3023 |
| `presidente@estrela.pt` | `Mister#2026!` | SC Estrela | Presidente (só leitura) | 3024 |

## Dados por Clube (após `seed-rico.ts`)

### Atlético dos Miúdos (P1)

- **Escalão único**: Sub-10 (futsal)
- 12 atletas
- 20 sessões de treino
- 8 jogos
- Contexto: treinador solo de formação, foco em mobile e comunicação com pais.

### FC Independente (P2)

- **Escalão único**: Seniores (futsal)
- 16 atletas
- 25 sessões de treino
- 18 jogos
- Periodização configurada (microciclos, RPE por sessão)
- Contexto: treinador solo de seniores, foco em táctica, periodização e analíticos avançados (ACWR).

### SC Estrela (P3, P4, P5)

- **2 escalões**: Seniores Futsal + Sub-15 Futebol (secções distintas)
- 16 atletas por escalão
- 20 + 18 sessões de treino
- 15 + 12 jogos
- Competição regional configurada
- Contexto multi-utilizador: treinador (André), diretor técnico (Carlos), presidente (João).

## Notas de Segurança

- Estas passwords são **exclusivas do ambiente local de teste**. Nunca reutilizar em QUA/PPRD/PRD.
- O `seed-teste.ts` só deve correr contra a BD `mister_local`.
- Ver observação de segurança sobre a password admin no seed de produção em [UC-T3-02](../tecnico/UC-T3-database.md).

## Referências

- [Setup do ambiente](setup.md)
- [README da bíblia de QA](../README.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial |
