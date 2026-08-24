# UC-P5 — Presidente (Dr. João Figueiredo, SC Estrela)

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Persona**: Dr. João Figueiredo — presidente do clube (perfil de só leitura)
> **Clube**: SC Estrela
> **Conta**: `presidente@estrela.pt` / `Mister#2026!`
> **Porta**: 3024

## Contexto da Persona

O presidente não opera a app no dia-a-dia. Quer consultar relatórios, balanços de época e a situação da licença/faturação. Precisa de um perfil de só leitura, sem risco de editar dados operacionais, e de um menu limpo, sem opções que não pode usar.

## Resumo de Estados

| ID | Nome | Prioridade | Estado |
|---|---|---|---|
| UC-P5-01 | Login e primeira impressão | CRÍTICO | PARCIAL ⚠️ |
| UC-P5-02 | Menu afinado ao perfil | CRÍTICO | FAIL ❌ |
| UC-P5-03 | Acesso a relatórios | ALTO | PASS ✅ |
| UC-P5-04 | Gerar relatório partilhável | ALTO | PARCIAL ⚠️ |
| UC-P5-05 | Balanço da época num clique | ALTO | FAIL ❌ |
| UC-P5-06 | Preço e faturas da licença | ALTO | FAIL ❌ |
| UC-P5-07 | Segurança do menu — áreas restritas | CRÍTICO | FAIL ❌ |
| UC-P5-08 | RGPD — menores | ALTO | FAIL ❌ |

---

### UC-P5-01: Login e primeira impressão

**Perfil:** P5
**Área:** Autenticação / Dashboard
**Prioridade:** CRÍTICO

**Pré-condições:**
- Conta: `presidente@estrela.pt` / `Mister#2026!`
- Servidor: `npm run dev -- --port 3024`

**Passos:**
1. Autenticar.
2. Verificar identidade do perfil (ex.: "Manuel (Presidente) · SC Estrela").
3. Verificar dashboard relevante ao presidente (sem botões de treinador).

**Resultado esperado:**
- Identidade do perfil visível.
- Dashboard orientado a leitura/relatórios.

**Critério de PASS/FAIL:**
- PASS: identidade visível e dashboard adequado ao presidente.
- FAIL: dashboard de treinador.

**Estado atual:** PARCIAL ⚠️
**Notas:** Identidade do perfil visível (PASS ✅), mas o dashboard é o de treinador (FAIL ❌) — mostra ações operacionais irrelevantes.

---

### UC-P5-02: Menu afinado ao perfil

**Perfil:** P5
**Área:** Navegação
**Prioridade:** CRÍTICO

**Pré-condições:**
- Presidente autenticado.

**Passos:**
1. Inspecionar o menu.
2. Confirmar que não mostra opções sem acesso.
3. Aceder a `/comunicacoes`.

**Resultado esperado:**
- Menu só com opções acessíveis; nenhuma opção dá erro.

**Critério de PASS/FAIL:**
- PASS: menu afinado, sem erros.
- FAIL: opção sem acesso presente e/ou dá erro.

**Estado atual:** FAIL ❌
**Notas:** "Comunicações" aparece no menu e dá erro "Algo correu mal" ao presidente. Menu não está afinado ao perfil.

---

### UC-P5-03: Acesso a relatórios

**Perfil:** P5
**Área:** Relatórios
**Prioridade:** ALTO

**Pré-condições:**
- Clube com dados.

**Passos:**
1. `GET /relatorios`.
2. Verificar analíticos por escalão (V/E/D, golos, atletas, sessões, marcadores).

**Resultado esperado:**
- Relatórios por escalão acessíveis em leitura.

**Critério de PASS/FAIL:**
- PASS: relatórios carregam com dados.
- FAIL: erro ou sem dados.

**Estado atual:** PASS ✅
**Notas:** Acesso a relatórios por escalão funciona.

---

### UC-P5-04: Gerar relatório partilhável

**Perfil:** P5
**Área:** Relatórios
**Prioridade:** ALTO

**Pré-condições:**
- Escalão com dados.

**Passos:**
1. "Gerar relatório" → link público com marca do clube.
2. Testar link inválido → verificar mensagem amigável (não 500).

**Resultado esperado:**
- Link público com marca; link inválido mostra ecrã amigável.

**Critério de PASS/FAIL:**
- PASS: gera link com marca e trata link inválido com mensagem.
- FAIL: link inválido devolve 500.

**Estado atual:** PARCIAL ⚠️
**Notas:** Gerar relatório e marca do clube funcionam (PASS ✅). Link inválido dava **500** (FAIL ❌) — ver [UC-T1-06](../tecnico/UC-T1-seguranca.md); confirmar se já foi corrigido.

---

### UC-P5-05: Balanço da época num clique

**Perfil:** P5
**Área:** Relatórios
**Prioridade:** ALTO

**Pré-condições:**
- Clube com vários escalões.

**Passos:**
1. Procurar botão que agrega todos os escalões num documento único.

**Resultado esperado:**
- Balanço de época agregado num clique.

**Critério de PASS/FAIL:**
- PASS: documento agregado.
- FAIL: escalão a escalão manualmente.

**Estado atual:** FAIL ❌
**Notas:** Só é possível escalão a escalão — sem balanço agregado (ver também UC-P4-07).

---

### UC-P5-06: Preço e faturas da licença

**Perfil:** P5
**Área:** Definições / Licença
**Prioridade:** ALTO

**Pré-condições:**
- Clube com licença ativa.

**Passos:**
1. `GET /definicoes/licenca`.
2. Verificar preço mensal.
3. Verificar data de próxima renovação com valor.
4. Verificar histórico de pagamentos/recibos.

**Resultado esperado:**
- Preço, renovação e histórico de faturação visíveis.

**Critério de PASS/FAIL:**
- PASS: preço, renovação e histórico presentes.
- FAIL: preço em branco ou histórico vazio.

**Estado atual:** FAIL ❌
**Notas:** Preço mensal em branco e histórico de pagamentos vazio. Informação de faturação incompleta para o decisor financeiro.

---

### UC-P5-07: Segurança do menu — áreas restritas

**Perfil:** P5
**Área:** Segurança / Autorização
**Prioridade:** CRÍTICO

**Pré-condições:**
- Presidente (só leitura) autenticado.

**Passos:**
1. Aceder a `/definicoes/utilizadores` — verificar se está bloqueado ou só leitura.
2. Aceder a `/definicoes/clube` (cores/logo) — verificar se está bloqueado.

**Resultado esperado:**
- Áreas de configuração bloqueadas ou em modo estritamente leitura, sem risco de edição.

**Critério de PASS/FAIL:**
- PASS: áreas restritas bloqueadas ou sem qualquer ação de escrita.
- FAIL: presidente acede a configurações com possibilidade de editar.

**Estado atual:** FAIL ❌
**Notas:** Definições abrem para "só visualização" mas com potencial de edição não intencional. Falta bloqueio efetivo de escrita para o perfil de só leitura.

---

### UC-P5-08: RGPD — menores

**Perfil:** P5
**Área:** RGPD / Conformidade
**Prioridade:** ALTO

**Pré-condições:**
- Clube com atletas menores.

**Passos:**
1. Verificar registo de consentimento parental dentro da app.
2. Verificar apagar definitivo de atleta (direito ao esquecimento).
3. Verificar garantia de servidores na UE.

**Resultado esperado:**
- Consentimento registado na app, apagar definitivo disponível e garantia EU explícita.

**Critério de PASS/FAIL:**
- PASS: consentimento + apagar definitivo + garantia EU.
- FAIL: qualquer um em falta.

**Estado atual:** FAIL ❌
**Notas:** Consentimento é tratado fora da app (decisão 2026-08-02), não há apagar definitivo (direito ao esquecimento) nem garantia EU explícita. Risco de conformidade para menores.

---

## Referências

- [Setup do ambiente](../ambiente/setup.md)
- [Contas de teste](../ambiente/contas.md)
- [UC-T1 — Segurança](../tecnico/UC-T1-seguranca.md)
- [Bíblia funcional — Mister_Spec_v7.md](../../Mister_Spec_v7.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial |
