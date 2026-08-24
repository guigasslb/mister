# UC-T5 — Cobertura Funcional (Spec)

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Área**: Lacunas de cobertura face à spec (offline, gestão de secções)

## Visão Geral

Verificações de cobertura funcional do Mister face à bíblia `Mister_Spec_v7.md`: funcionalidades previstas mas ausentes ou incompletas na implementação atual.

## Resumo de Estados

| ID | Nome | Prioridade | Estado |
|---|---|---|---|
| UC-T5-01 | Offline beira-campo | ALTO | FAIL ❌ |
| UC-T5-02 | Gestão de secções — renomear | MÉDIO | FAIL ❌ |
| UC-T5-03 | Gestão de secções — apagar | MÉDIO | FAIL ❌ |

---

### UC-T5-01: Offline beira-campo

**Perfil:** Técnico — cobertura funcional
**Área:** PWA / Offline
**Prioridade:** ALTO

**Pré-condições:**
- App instalada como PWA; sessão de treino existente.

**Passos:**
1. `GET /treinos/[id]/presencas` sem ligação à internet.
2. Marcar presenças offline.
3. Restaurar a ligação e verificar sincronização.

**Resultado esperado:**
- Presenças marcáveis offline e sincronizadas ao recuperar a ligação (fila de escrita no service worker).

**Critério de PASS/FAIL:**
- PASS: marcação offline + sincronização posterior.
- FAIL: sem fila de escrita offline.

**Estado atual:** FAIL ❌
**Notas:** O service worker não tem fila de escrita — presenças não podem ser marcadas offline. Cenário beira-campo (sem rede no pavilhão) fica descoberto.

---

### UC-T5-02: Gestão de secções — renomear

**Perfil:** Técnico — cobertura funcional
**Área:** Definições / Secções
**Prioridade:** MÉDIO

**Pré-condições:**
- Clube com secções (Futsal / Futebol).

**Passos:**
1. Ir a `/definicoes/seccoes`.
2. Editar o nome de uma secção.

**Resultado esperado:**
- Renomear secção disponível e funcional.

**Critério de PASS/FAIL:**
- PASS: renomear funciona.
- FAIL: ação inexistente.

**Estado atual:** FAIL ❌
**Notas:** A Server Action `atualizarSeccao` não existe — não é possível renomear secções.

---

### UC-T5-03: Gestão de secções — apagar

**Perfil:** Técnico — cobertura funcional
**Área:** Definições / Secções
**Prioridade:** MÉDIO

**Pré-condições:**
- Secção sem escalões associados.

**Passos:**
1. Ir a `/definicoes/seccoes`.
2. Apagar uma secção sem escalões.

**Resultado esperado:**
- Apagar secção vazia disponível e funcional (com guard para secções com escalões).

**Critério de PASS/FAIL:**
- PASS: apagar secção vazia funciona.
- FAIL: ação inexistente.

**Estado atual:** FAIL ❌
**Notas:** A Server Action `apagarSeccao` não existe — não é possível apagar secções.

---

## Referências

- [Setup do ambiente](../ambiente/setup.md)
- [UC-P3 — Clube seniores](../personas/UC-P3-clube-seniores.md)
- [Bíblia funcional — Mister_Spec_v7.md](../../Mister_Spec_v7.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial |
