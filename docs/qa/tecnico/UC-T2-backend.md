# UC-T2 — Backend (Server Actions e Validação)

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Área**: Server Actions, padrão de validação, qualidade de código (typecheck/lint/test)

## Visão Geral

Verificações do backend do Mister: conformidade das Server Actions com o padrão `validate → auth → clube → Resultado<T> → revalidate`, presença de `"use server"`, isolamento multi-tenant e qualidade estática (typecheck, lint, testes).

## Resumo de Estados

| ID | Nome | Prioridade | Estado |
|---|---|---|---|
| UC-T2-01 | `marcarPresencas` — validação de atletaId | CRÍTICO | FAIL ❌ |
| UC-T2-02 | Todos os Server Actions têm `"use server"` | ALTO | PASS ✅ |
| UC-T2-03 | Padrão validate→auth→clube→Resultado→revalidate | ALTO | PASS ✅ |
| UC-T2-04 | Testes automáticos | CRÍTICO | PASS ✅ |
| UC-T2-05 | Typecheck limpo | ALTO | PASS ✅ |
| UC-T2-06 | Lint limpo | ALTO | PASS ✅ |

---

### UC-T2-01: `marcarPresencas` — validação de atletaId

**Perfil:** Técnico — backend
**Área:** Server Actions / Autorização
**Prioridade:** CRÍTICO

**Pré-condições:**
- Dois clubes com atletas distintos.
- Ficheiro: `lib/actions/treinos.ts:536`.

**Passos:**
1. Analisar `marcarPresencas`.
2. Confirmar se valida que cada `atletaId` pertence ao clube do utilizador autenticado.
3. Tentar marcar presença de um `atletaId` de outro clube.

**Resultado esperado:**
- A action rejeita `atletaId` que não pertença ao clube da sessão.

**Critério de PASS/FAIL:**
- PASS: validação de pertença ao clube presente.
- FAIL: aceita `atletaId` de outro clube.

**Estado atual:** FAIL ❌
**Notas:** Único dos ~36 Server Actions sem este check. `marcarPresencas` não valida a pertença do `atletaId` ao clube (`lib/actions/treinos.ts:536`). Permite escrever presenças em atletas de outro clube.

---

### UC-T2-02: Todos os Server Actions têm `"use server"`

**Perfil:** Técnico — backend
**Área:** Server Actions
**Prioridade:** ALTO

**Pré-condições:**
- Código em `lib/actions/`.

**Passos:**
1. Executar `grep -rL '"use server"' lib/actions/`.

**Resultado esperado:**
- Resultado vazio (todos os ficheiros têm a diretiva).

**Critério de PASS/FAIL:**
- PASS: grep vazio.
- FAIL: qualquer ficheiro sem `"use server"`.

**Estado atual:** PASS ✅
**Notas:** Todos os ficheiros de actions declaram `"use server"`.

---

### UC-T2-03: Padrão validate→auth→clube→Resultado<T>→revalidate

**Perfil:** Técnico — backend
**Área:** Convenções de código
**Prioridade:** ALTO

**Pré-condições:**
- Código em `lib/actions/`.

**Passos:**
1. Selecionar 5 actions aleatórias.
2. Verificar sequência: validação Zod → `auth()` → obtenção da época/clube → devolve `Resultado<T>` → `revalidatePath()`.

**Resultado esperado:**
- As 5 actions seguem o padrão fixo (secção de convenções do CLAUDE.md).

**Critério de PASS/FAIL:**
- PASS: todas as amostras cumprem o padrão.
- FAIL: qualquer desvio.

**Estado atual:** PASS ✅
**Notas:** Amostragem confirma o padrão. Exceção conhecida documentada em UC-T2-01 e UC-T1-03.

---

### UC-T2-04: Testes automáticos

**Perfil:** Técnico — backend
**Área:** Testes (Vitest)
**Prioridade:** CRÍTICO

**Pré-condições:**
- Dependências instaladas.

**Passos:**
1. `npm run test`.

**Resultado esperado:**
- Todos os testes passam.

**Critério de PASS/FAIL:**
- PASS: 1269/1269 PASS.
- FAIL: qualquer teste falha.

**Estado atual:** PASS ✅
**Notas:** 1269/1269 testes verdes na execução de 2026-08-20.

---

### UC-T2-05: Typecheck limpo

**Perfil:** Técnico — backend
**Área:** TypeScript
**Prioridade:** ALTO

**Pré-condições:**
- Dependências instaladas.

**Passos:**
1. `npm run typecheck`.

**Resultado esperado:**
- 0 erros de tipos.

**Critério de PASS/FAIL:**
- PASS: 0 erros.
- FAIL: qualquer erro.

**Estado atual:** PASS ✅
**Notas:** Typecheck sem erros.

---

### UC-T2-06: Lint limpo

**Perfil:** Técnico — backend
**Área:** ESLint
**Prioridade:** ALTO

**Pré-condições:**
- Dependências instaladas.

**Passos:**
1. `npm run lint`.

**Resultado esperado:**
- 0 warnings e 0 erros.

**Critério de PASS/FAIL:**
- PASS: 0 warnings, 0 erros.
- FAIL: qualquer warning/erro.

**Estado atual:** PASS ✅
**Notas:** Lint sem warnings nem erros.

---

## Referências

- [Setup do ambiente](../ambiente/setup.md)
- [UC-T1 — Segurança](UC-T1-seguranca.md)
- [Bíblia funcional — Mister_Spec_v7.md](../../Mister_Spec_v7.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial |
