# UC-T4 — Regras de Negócio (Domínio)

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Área**: Regras de domínio (assiduidade, multi-tenancy, convocatória, integridade de estatísticas)

## Visão Geral

Verificações das regras de negócio do Mister: cálculo de assiduidade, tratamento de sessões especiais, isolamento entre clubes e integridade da convocatória/estatísticas.

## Resumo de Estados

| ID | Nome | Prioridade | Estado |
|---|---|---|---|
| UC-T4-01 | Taxa de assiduidade da equipa > 100% | ALTO | FAIL ❌ |
| UC-T4-02 | Sessões CAPTACAO/EVENTO no denominador de assiduidade | MÉDIO | PARCIAL ⚠️ |
| UC-T4-03 | Multi-tenancy — isolamento entre clubes | CRÍTICO | PASS ✅ |
| UC-T4-04 | Convocatória — atleta duplicado | ALTO | PASS ✅ |
| UC-T4-05 | Remover convocado com estatísticas | ALTO | PASS ✅ |

---

### UC-T4-01: Taxa de assiduidade da equipa > 100%

**Perfil:** Técnico — regras de negócio
**Área:** Analíticos / Assiduidade
**Prioridade:** ALTO

**Pré-condições:**
- Clube com atletas que saíram a meio da época.
- Ficheiro: `lib/actions/analise.ts:900`.

**Passos:**
1. Chamar `obterAnaliticoClubeEpoca`.
2. Observar a taxa de assiduidade da equipa.

**Resultado esperado:**
- Taxa de equipa ≤ 100%.

**Critério de PASS/FAIL:**
- PASS: taxa nunca excede 100%.
- FAIL: taxa pode exceder 100%.

**Estado atual:** FAIL ❌
**Notas:** A taxa pode exceder 100% quando atletas saem a meio da época (denominador desalinhado). Falta um `Math.min(..., 100)` / recálculo do denominador em `lib/actions/analise.ts:900`.

---

### UC-T4-02: Sessões CAPTACAO/EVENTO no denominador de assiduidade

**Perfil:** Técnico — regras de negócio
**Área:** Assiduidade / Tipos de sessão
**Prioridade:** MÉDIO

**Pré-condições:**
- Criar sessão do tipo CAPTACAO ou EVENTO.

**Passos:**
1. Criar sessão CAPTACAO.
2. Verificar se a taxa de assiduidade de um atleta regular diminui por causa dela.

**Resultado esperado:**
- Sessões não-NORMAIS (CAPTACAO/EVENTO) **não** contam no denominador de assiduidade (coerente com a nota do Grupo B: só NORMAL liga a planeamento/estatística regular).

**Critério de PASS/FAIL:**
- PASS: CAPTACAO/EVENTO excluídas do cálculo.
- FAIL: incluídas, penalizando a assiduidade.

**Estado atual:** PARCIAL ⚠️
**Notas:** Comportamento contradiz a nota do Grupo B do CLAUDE.md (só NORMAL deveria contar). Confirmar se CAPTACAO/EVENTO estão a entrar no denominador e alinhar a regra.

---

### UC-T4-03: Multi-tenancy — isolamento entre clubes

**Perfil:** Técnico — regras de negócio
**Área:** Autorização / Multi-tenancy
**Prioridade:** CRÍTICO

**Pré-condições:**
- Dois clubes com dados.

**Passos:**
1. Rever as Server Actions.
2. Confirmar que o `clubeId` é derivado de `auth()`, nunca de parâmetro do cliente.

**Resultado esperado:**
- Todas as queries filtram pelo clube da sessão.

**Critério de PASS/FAIL:**
- PASS: `clubeId` sempre derivado de `auth()`.
- FAIL: qualquer action confia em `clubeId` do cliente.

**Estado atual:** PASS ✅
**Notas:** Isolamento correto na generalidade. Exceções pontuais estão registadas em UC-T1-03 (`obterLicencaPendente`) e UC-T2-01 (`marcarPresencas`) e são tratadas nesses use cases.

---

### UC-T4-04: Convocatória — atleta duplicado

**Perfil:** Técnico — regras de negócio
**Área:** Jogos / Convocatória
**Prioridade:** ALTO

**Pré-condições:**
- Jogo com convocatória.

**Passos:**
1. Tentar adicionar o mesmo atleta duas vezes ao mesmo jogo.

**Resultado esperado:**
- Bloqueio por constraint de unicidade.

**Critério de PASS/FAIL:**
- PASS: duplicado rejeitado (`@@unique`).
- FAIL: duplicado aceite.

**Estado atual:** PASS ✅
**Notas:** Constraint `@@unique` impede duplicados na convocatória.

---

### UC-T4-05: Remover convocado com estatísticas

**Perfil:** Técnico — regras de negócio
**Área:** Jogos / Integridade
**Prioridade:** ALTO

**Pré-condições:**
- Convocado com estatísticas registadas.

**Passos:**
1. Remover o atleta da convocatória.
2. Verificar diálogo de confirmação.
3. Confirmar e verificar que as estatísticas são apagadas em transação.

**Resultado esperado:**
- Confirmação obrigatória + remoção transacional das estatísticas.

**Critério de PASS/FAIL:**
- PASS: confirmação aparece e remoção é atómica.
- FAIL: remoção silenciosa ou estatísticas órfãs.

**Estado atual:** PASS ✅
**Notas:** Conforme spec (secção 9 — casos-limite). Confirmação + transação corretas.

---

## Referências

- [Setup do ambiente](../ambiente/setup.md)
- [UC-T3 — Base de dados](UC-T3-database.md)
- [Bíblia funcional — Mister_Spec_v7.md](../../Mister_Spec_v7.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial |
