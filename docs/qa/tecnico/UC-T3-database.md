# UC-T3 — Base de Dados (Schema e Integridade)

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Área**: Schema Prisma, índices, seeds, cascades FK, multi-tenancy

## Visão Geral

Verificações da camada de dados do Mister: índices em falta, segurança do seed, integridade referencial (cascades/restrict) e desenho de multi-tenancy.

## Resumo de Estados

| ID | Nome | Prioridade | Estado |
|---|---|---|---|
| UC-T3-01 | Índices em planoSemanalDiaId e planoSemanalId | MÉDIO | FAIL ❌ |
| UC-T3-02 | Password admin no seed | ALTO | FAIL ❌ |
| UC-T3-03 | Cascades FK em entidades críticas | ALTO | PASS ✅ |
| UC-T3-04 | Multi-tenancy sem clubeId directo em Sessao/Jogo | MÉDIO | OBSERVAÇÃO 👁️ |

---

### UC-T3-01: Índices em planoSemanalDiaId e planoSemanalId

**Perfil:** Técnico — base de dados
**Área:** Schema Prisma / Performance
**Prioridade:** MÉDIO

**Pré-condições:**
- Ficheiro: `prisma/schema.prisma`, modelo `Sessao`.

**Passos:**
1. Procurar `@@index([planoSemanalDiaId])` e `@@index([planoSemanalId])` no modelo `Sessao`.

**Resultado esperado:**
- Ambos os índices presentes (FKs consultadas frequentemente na periodização).

**Critério de PASS/FAIL:**
- PASS: ambos os índices existem.
- FAIL: ausentes.

**Estado atual:** FAIL ❌
**Notas:** Índices ausentes em `Sessao` para `planoSemanalDiaId` e `planoSemanalId`. Risco de full scans nas queries de periodização à medida que os dados crescem.

---

### UC-T3-02: Password admin no seed

**Perfil:** Técnico — base de dados
**Área:** Seed / Segurança
**Prioridade:** ALTO

**Pré-condições:**
- Ficheiro: `prisma/seed.ts`.

**Passos:**
1. Verificar `prisma/seed.ts:20` — `PASS_ADMIN` tem default público?
2. Verificar `prisma/seed.ts:38` — a password é impressa em logs?

**Resultado esperado:**
- Sem default público de password; sem impressão de password em logs (em produção o seed deve falhar sem password explícita).

**Critério de PASS/FAIL:**
- PASS: sem default público e sem log de password.
- FAIL: default público e/ou password em logs.

**Estado atual:** FAIL ❌
**Notas:** `PASS_ADMIN` tem default público (`prisma/seed.ts:20`) e a password é impressa em logs (`prisma/seed.ts:38`). Risco em ambientes partilhados. (A auditoria de produção já garante falha do seed em prod sem passwords — confirmar cobertura no seed base.)

---

### UC-T3-03: Cascades FK em entidades críticas

**Perfil:** Técnico — base de dados
**Área:** Integridade referencial
**Prioridade:** ALTO

**Pré-condições:**
- BD com dados relacionados.

**Passos:**
1. Apagar Escalão com atletas → deve bloquear (Restrict + guard aplicacional).
2. Apagar Atleta → cascata em Presença/Estatística/Progresso.
3. Apagar Jogo → cascata em Convocatória/Estatística.

**Resultado esperado:**
- Bloqueio onde há dependências fortes; cascata onde é seguro.

**Critério de PASS/FAIL:**
- PASS: comportamentos de cascata/restrict corretos.
- FAIL: apagar deixa órfãos ou bloqueia indevidamente.

**Estado atual:** PASS ✅
**Notas:** Cascades e guards conforme auditoria de produção (fase 3). Comportamento correto.

---

### UC-T3-04: Multi-tenancy sem clubeId directo em Sessao/Jogo

**Perfil:** Técnico — base de dados
**Área:** Multi-tenancy / Desenho
**Prioridade:** MÉDIO

**Pré-condições:**
- Modelos `Sessao` e `Jogo`.

**Passos:**
1. Verificar como as queries isolam o clube.
2. Confirmar que filtram por `escalao: { clubeId }` (relação) e não por `clubeId` directo.

**Resultado esperado:**
- Isolamento correto por clube, mesmo via relação.

**Critério de PASS/FAIL:**
- OBSERVAÇÃO: funciona mas depende sempre do join pela relação — frágil se alguma query esquecer o filtro.

**Estado atual:** OBSERVAÇÃO 👁️
**Notas:** `Sessao`/`Jogo` não têm `clubeId` directo; o isolamento faz-se por `escalao.clubeId`. Funciona, mas é frágil por design — um `clubeId` desnormalizado (ou middleware de query) reduziria o risco de fugas multi-tenant.

---

## Referências

- [Setup do ambiente](../ambiente/setup.md)
- [UC-T4 — Regras de negócio](UC-T4-negocio.md)
- [Bíblia funcional — Mister_Spec_v7.md](../../Mister_Spec_v7.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial |
