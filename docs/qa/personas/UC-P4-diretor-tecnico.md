# UC-P4 — Diretor Técnico (Carlos Mendes, SC Estrela)

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Persona**: Carlos Mendes — diretor técnico do clube
> **Clube**: SC Estrela
> **Conta**: `diretor@estrela.pt` / `Mister#2026!`
> **Porta**: 3023

## Contexto da Persona

Carlos supervisiona todos os escalões e treinadores. Não treina diretamente: precisa de visão transversal (comparação de escalões, atividade dos treinadores), relatórios de clube, gestão da equipa técnica e modelo de jogo transversal. O produto atual trata-o como um treinador comum.

## Resumo de Estados

| ID | Nome | Prioridade | Estado |
|---|---|---|---|
| UC-P4-01 | Login e dashboard de DT | CRÍTICO | FAIL ❌ |
| UC-P4-02 | Painel de clube — comparação de escalões | ALTO | PARCIAL ⚠️ |
| UC-P4-03 | Dimensão por treinador nos analíticos | ALTO | FAIL ❌ |
| UC-P4-04 | Audit log — atividade dos treinadores | ALTO | FAIL ❌ |
| UC-P4-05 | Gestão da equipa técnica como DT | ALTO | FAIL ❌ |
| UC-P4-06 | Relatório para direção — por escalão | ALTO | PASS ✅ |
| UC-P4-07 | Balanço de época completo — todos os escalões | ALTO | FAIL ❌ |
| UC-P4-08 | Comparação de épocas | MÉDIO | FAIL ❌ |
| UC-P4-09 | Agenda unificada e conflitos | ALTO | PARCIAL ⚠️ |
| UC-P4-10 | Modelo de jogo do clube | MÉDIO | PASS ✅ |

---

### UC-P4-01: Login e dashboard de DT

**Perfil:** P4
**Área:** Autenticação / Dashboard
**Prioridade:** CRÍTICO

**Pré-condições:**
- Conta: `diretor@estrela.pt` / `Mister#2026!`
- Servidor: `npm run dev -- --port 3023`

**Passos:**
1. Autenticar.
2. `GET /dashboard`.
3. Verificar se o dashboard é diferenciado para DT (ações relevantes).

**Resultado esperado:**
- Dashboard próprio de DT, com visão transversal e ações relevantes ao papel.

**Critério de PASS/FAIL:**
- PASS: dashboard diferenciado do treinador.
- FAIL: dashboard igual ao treinador.

**Estado atual:** FAIL ❌
**Notas:** Dashboard igual ao do treinador — sem visão de supervisão transversal.

---

### UC-P4-02: Painel de clube — comparação de escalões

**Perfil:** P4
**Área:** Analíticos
**Prioridade:** ALTO

**Pré-condições:**
- Clube com múltiplos escalões e dados.

**Passos:**
1. `GET /analiticos`.
2. Verificar tabela com todos os escalões (V/E/D, presenças, golos).
3. Verificar filtro por modalidade.

**Resultado esperado:**
- Tabela comparativa por escalão + filtro por modalidade.

**Critério de PASS/FAIL:**
- PASS: tabela comparativa e filtro por modalidade.
- FAIL: sem comparação ou sem filtro.

**Estado atual:** PARCIAL ⚠️
**Notas:** Tabela comparativa por escalão existe (PASS ✅). **Sem filtro por modalidade** (FAIL ❌).

---

### UC-P4-03: Dimensão por treinador nos analíticos

**Perfil:** P4
**Área:** Analíticos
**Prioridade:** ALTO

**Pré-condições:**
- Escalões com treinadores atribuídos.

**Passos:**
1. Painel de clube → ver treinador de cada escalão.
2. Verificar métricas por treinador (atividade, taxa de lançamento).

**Resultado esperado:**
- Analíticos com dimensão por treinador.

**Critério de PASS/FAIL:**
- PASS: métricas por treinador presentes.
- FAIL: só por escalão.

**Estado atual:** FAIL ❌
**Notas:** Analíticos são por escalão, não por treinador. Não há visão de desempenho/atividade do treinador.

---

### UC-P4-04: Audit log — atividade dos treinadores

**Perfil:** P4
**Área:** Auditoria
**Prioridade:** ALTO

**Pré-condições:**
- Atividade recente de vários utilizadores.

**Passos:**
1. Procurar registo "quem fez o quê, quando".
2. Procurar alerta de treinador inativo há N dias.

**Resultado esperado:**
- Audit log + alerta de inatividade.

**Critério de PASS/FAIL:**
- PASS: audit log e alerta existem.
- FAIL: inexistentes.

**Estado atual:** FAIL ❌
**Notas:** Sem audit log nem alerta de inatividade — cego à atividade da equipa técnica.

---

### UC-P4-05: Gestão da equipa técnica como DT

**Perfil:** P4
**Área:** Definições / Equipa técnica
**Prioridade:** ALTO

**Pré-condições:**
- DT autenticado.

**Passos:**
1. Convidar novo treinador.
2. Atribuir escalão a treinador.
3. Alterar perfil de membro.

**Resultado esperado:**
- DT com permissões de gestão da equipa técnica.

**Critério de PASS/FAIL:**
- PASS: DT gere a equipa técnica.
- FAIL: apenas Admin tem essa permissão.

**Estado atual:** FAIL ❌
**Notas:** Só o perfil Admin tem a permissão `CLUBE_UTILIZADORES`. O DT não consegue convidar/atribuir/alterar membros.

---

### UC-P4-06: Relatório para direção — por escalão

**Perfil:** P4
**Área:** Relatórios
**Prioridade:** ALTO

**Pré-condições:**
- Escalão com dados.

**Passos:**
1. Gerar relatório partilhável de escalão específico.
2. Abrir link sem conta e verificar marca do clube.

**Resultado esperado:**
- Link público com marca do clube.

**Critério de PASS/FAIL:**
- PASS: relatório partilhável por escalão funciona.
- FAIL: exige login ou sem marca.

**Estado atual:** PASS ✅
**Notas:** Relatório por escalão funciona.

---

### UC-P4-07: Balanço de época completo — todos os escalões

**Perfil:** P4
**Área:** Relatórios
**Prioridade:** ALTO

**Pré-condições:**
- Clube com vários escalões.

**Passos:**
1. Gerar relatório com todos os escalões num único documento.

**Resultado esperado:**
- Documento agregado de todos os escalões.

**Critério de PASS/FAIL:**
- PASS: relatório agregado num documento.
- FAIL: só por escalão individual.

**Estado atual:** FAIL ❌
**Notas:** Só é possível gerar por escalão individualmente — sem balanço de época agregado.

---

### UC-P4-08: Comparação de épocas

**Perfil:** P4
**Área:** Analíticos
**Prioridade:** MÉDIO

**Pré-condições:**
- Dados em duas épocas.

**Passos:**
1. Painel de clube → filtrar 2024/25 vs 2025/26.

**Resultado esperado:**
- Comparação entre épocas.

**Critério de PASS/FAIL:**
- PASS: comparação multi-época.
- FAIL: só época ativa.

**Estado atual:** FAIL ❌
**Notas:** Sem comparação entre épocas.

---

### UC-P4-09: Agenda unificada e conflitos

**Perfil:** P4
**Área:** Agenda
**Prioridade:** ALTO

**Pré-condições:**
- Eventos em vários escalões.

**Passos:**
1. `GET /agenda` — todos os eventos de todos os escalões.
2. Verificar deteção de conflito de pavilhão.
3. Verificar se reuniões aparecem na agenda.

**Resultado esperado:**
- Agenda unificada com conflitos e reuniões.

**Critério de PASS/FAIL:**
- PASS: agenda unificada e conflitos.
- FAIL: reuniões fora da agenda.

**Estado atual:** PARCIAL ⚠️
**Notas:** Agenda unificada e conflitos de pavilhão funcionam (PASS ✅). **Reuniões não entram na agenda** (FAIL ❌).

---

### UC-P4-10: Modelo de jogo do clube

**Perfil:** P4
**Área:** Modelo de Jogo
**Prioridade:** MÉDIO

**Pré-condições:**
- DT autenticado.

**Passos:**
1. Criar modelo transversal (não por escalão).
2. Verificar que treinadores de todos os escalões o veem.

**Resultado esperado:**
- Modelo de jogo do clube visível a todos os escalões.

**Critério de PASS/FAIL:**
- PASS: modelo transversal partilhado.
- FAIL: modelo isolado por escalão.

**Estado atual:** PASS ✅
**Notas:** Modelo de jogo transversal do clube funciona.

---

## Referências

- [Setup do ambiente](../ambiente/setup.md)
- [Contas de teste](../ambiente/contas.md)
- [Bíblia funcional — Mister_Spec_v7.md](../../Mister_Spec_v7.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial |
