# Bíblia de Use Cases de Teste — Mister

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Autor**: Equipa QA (subagentes beta-testers)
> **Estado**: Publicado
> **Última Execução**: 2026-08-20

## Visão Geral

Este documento é a **fonte única de verdade** para os testes de aceitação do produto **Mister** (plataforma de gestão desportiva multi-modalidade). Reúne todos os use cases corridos pelos subagentes beta-testers na campanha de 2026-08-20 e serve de base para **re-execução após cada ciclo de correções**.

Os use cases estão organizados por:

- **Personas** — cenários end-to-end na pele de cada tipo de utilizador real.
- **Técnicos** — verificações de segurança, backend, base de dados, regras de negócio e cobertura funcional.

A bíblia funcional do produto continua a ser [`docs/Mister_Spec_v7.md`](../Mister_Spec_v7.md). Esta bíblia de QA é complementar e foca-se exclusivamente em **como validar** o produto.

## Pré-requisitos

- PostgreSQL 16 local (ver [`ambiente/setup.md`](ambiente/setup.md))
- Node.js + `npm` instalados
- Contas de teste carregadas via seed (ver [`ambiente/contas.md`](ambiente/contas.md))

## Como Configurar o Ambiente

1. Seguir o guia completo em [`ambiente/setup.md`](ambiente/setup.md) para preparar a base de dados local `mister_local`.
2. Correr as migrações e os seeds (`seed-teste.ts` + `seed-rico.ts`).
3. Confirmar as contas de teste em [`ambiente/contas.md`](ambiente/contas.md).

## Como Correr os Testes

### Testes de persona (via UI + curl autenticado)

Cada persona corre numa **porta isolada** (3020–3024) para evitar colisões entre sessões:

```bash
# Limpar processos anteriores na porta
lsof -ti:3020 | xargs kill -9 2>/dev/null; true

# Arrancar o servidor de dev na porta da persona
npm run dev -- --port 3020

# Aguardar 20-25 segundos antes de testar
```

O login por `curl` (Auth.js v5 credentials) e as limitações de teste de Server Actions estão descritos em detalhe em [`ambiente/setup.md`](ambiente/setup.md).

### Testes técnicos automáticos

```bash
npm run typecheck   # UC-T2-05
npm run lint        # UC-T2-06
npm run test        # UC-T2-04
```

## Índice de Use Cases

### Personas

| Ficheiro | Persona | Área principal |
|---|---|---|
| [UC-P1](personas/UC-P1-solo-miudos.md) | Rui Santos — treinador solo Sub-10 | Formação, mobile, comunicação |
| [UC-P2](personas/UC-P2-solo-seniores.md) | Miguel Ferreira — treinador solo seniores | Táctica, periodização, analíticos |
| [UC-P3](personas/UC-P3-clube-seniores.md) | André Costa — treinador de clube | Multi-escalão, colaboração |
| [UC-P4](personas/UC-P4-diretor-tecnico.md) | Carlos Mendes — diretor técnico | Supervisão, relatórios de clube |
| [UC-P5](personas/UC-P5-presidente.md) | Dr. João Figueiredo — presidente (só leitura) | Relatórios, licença, RGPD |

### Técnicos

| Ficheiro | Área |
|---|---|
| [UC-T1](tecnico/UC-T1-seguranca.md) | Segurança |
| [UC-T2](tecnico/UC-T2-backend.md) | Server Actions e validação |
| [UC-T3](tecnico/UC-T3-database.md) | Schema e integridade |
| [UC-T4](tecnico/UC-T4-negocio.md) | Regras de domínio |
| [UC-T5](tecnico/UC-T5-funcional.md) | Cobertura da spec |

## Estado Geral (execução 2026-08-20)

Legenda: PASS ✅ · FAIL ❌ · PARCIAL ⚠️ · OBSERVAÇÃO 👁️

| Categoria | Total | PASS ✅ | FAIL ❌ | PARCIAL ⚠️ | % PASS |
|---|---|---|---|---|---|
| P1 — Solo miúdos | 12 | 6 | 3 | 3 | 50% |
| P2 — Solo seniores | 16 | 5 | 9 | 2 | 31% |
| P3 — Clube seniores | 12 | 4 | 7 | 1 | 33% |
| P4 — Diretor técnico | 10 | 3 | 6 | 1 | 30% |
| P5 — Presidente | 8 | 1 | 5 | 2 | 13% |
| T1 — Segurança | 6 | 2 | 4 | 0 | 33% |
| T2 — Backend | 6 | 5 | 1 | 0 | 83% |
| T3 — Base de dados | 4 | 1 | 2 | 1 👁️ | 25% |
| T4 — Regras de negócio | 5 | 3 | 1 | 1 | 60% |
| T5 — Cobertura funcional | 3 | 0 | 3 | 0 | 0% |
| **TOTAL** | **82** | **30** | **41** | **11** | **37%** |

> Nota: use cases marcados como "mixed" (parte PASS / parte FAIL) foram contabilizados como PARCIAL ⚠️ para efeitos de estatística agregada, exceto quando o resultado dominante é claramente uma falha.

## Áreas Críticas com Falhas (prioridade de correção)

1. **Segurança** — IDOR em `obterLicencaPendente` (UC-T1-03), open image proxy (UC-T1-04), validação de URL (UC-T1-05), rota pública `/r/[token]` a dar 500 (UC-T1-06).
2. **Backend** — `marcarPresencas` sem validação de `atletaId` do clube (UC-T2-01).
3. **Perfis diferenciados** — presidente e diretor técnico recebem dashboard e menu de treinador (UC-P4-01, UC-P5-01, UC-P5-02).
4. **Ficha do atleta sénior** — modelo pensado só para formação (UC-P2-02).
5. **Cartões e disciplina** — sem registo em grelha nem totais/suspensões (UC-P2-10, UC-P2-11, UC-P3-06, UC-P3-07).
6. **Licenciamento e RGPD** — preço/faturas em branco (UC-P5-06), consentimento fora da app (UC-P5-08).

## Referências

- [Bíblia funcional — Mister_Spec_v7.md](../Mister_Spec_v7.md)
- [Guia de deploy — DEPLOY.md](../DEPLOY.md)
- [Relatório mestre de auditoria — MASTER_AUDIT_REPORT.md](../MASTER_AUDIT_REPORT.md)
- [Guia de marca — BRAND.md](../BRAND.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial — 82 use cases documentados a partir da campanha beta de 2026-08-20 |
