# Plano de Implementação — Correcções Pós-QA

> **Versão:** 1.0.0
> **Data:** 2026-08-20
> **Origem:** Bíblia de QA `docs/qa/` (82 UCs · 30 PASS · 41 FAIL · 11 PARCIAL — 37% PASS)
> **Objetivo:** Passar de **37% PASS** para **≥95% PASS** na re-execução dos 82 use cases.
> **Bíblia funcional de referência:** `docs/Mister_Spec_v7.md` (atualizar em cada alteração — regra inquebrável do projeto).

## Regras invioláveis deste plano

- **NÃO tocar em autenticação/login.** Proibido alterar `lib/auth.ts`, `middleware.ts`, o handler `app/api/auth/`, cookies/sessões de Auth.js, ou dependências de auth. **Nota importante:** o sistema de **autorização** (`lib/permissoes.ts`, `lib/permissoes-catalogo.ts`, capacidades/perfis) **NÃO é autenticação** e é território permitido — várias correcções abaixo (P5-07, P4-05, P5-02) mexem em autorização, nunca no fluxo de login.
- **Cada fase compila e testa:** `npm run typecheck` + `npm run lint` + `npm run test` verdes antes de fechar a fase (Regra Sagrada Nº 1).
- **Auto-revisão à primeira:** sem scope creep, sem dead code, diff mínimo (Regra Sagrada Nº 6).
- **Documentação no mesmo passo:** cada alteração de código atualiza `Mister_Spec_v7.md` (secção 19 — changelog) na mesma entrega.
- **Sequencial quando há dependência** (schema → action → UI); **paralelo quando independente**.

---

## Sumário Executivo dos Defeitos

| Fase | Foco | UCs alvo | Estimativa |
|---|---|---|---|
| **Fase 0** | Segurança crítica (P0) | T1-03, T1-04, T1-05, T1-06/P5-04, T2-01, P5-07, T3-01, T3-02 | 1 dia |
| **Fase 1** | Bloqueadores core (P1) | T4-01, T4-02, P5-06, P2-10/P3-06, P4-05, P5-02, P4-01/P5-01 | 3–5 dias |
| **Fase 2** | Gaps de funcionalidade alta (P2) | P1-03, P2-03, P3-09/P4-02, P4-03, P4-04, P3-04, P4-07/P5-05, P4-08, P4-09, P3-05, P3-07, P2-11, P2-13, T5-02, T5-03 | 1 semana |
| **Fase 3** | UX e polimento (P3) | P1-05, P1-07, P2-02, P1-06, P1-08, P2-05, P2-06, P2-08, P3-11, P3-12, P2-16 | 1 semana |
| **Fase 5** | Conformidade FPF (Inscrições Federativas) | Modelo 2 pré-preenchido, dados federativos, estado de inscrição | ~2 semanas |
| **Fase 6** | Validação final | Re-correr os 82 UCs | 1 dia |

---

## Fase 0 — Segurança Crítica (IMEDIATO, ~1 dia)

Bugs P0 de segurança/robustez. Todas as tarefas são **independentes entre si** → **executar em paralelo** por sub-agente. Nenhuma toca em Auth.js (apenas autorização/validação/config/schema).

### 0.1 — IDOR em `obterLicencaPendente` (UC-T1-03, CRÍTICO)
- **Subagente:** `bff-backend-specialist`
- **Ficheiro:** `lib/actions/licenciamento.ts:94`
- **Problema:** `obterLicencaPendente(clubeId: string)` aceita `clubeId` externo, não invoca `auth()`/`obterMembroAtual()`. Permite ler a licença de outro clube.
- **Correcção:** derivar o `clubeId` de `obterMembroAtual()` (padrão usado no resto do ficheiro, ex. linhas 70–81) e eliminar o parâmetro `clubeId` da assinatura; ajustar os call-sites (paywall `/sem-licenca`).
- **Critério de conclusão:** a action não recebe `clubeId` do cliente; tentativa de aceder a licença de outro clube devolve `null`/erro; teste unitário que prova o isolamento; typecheck/lint/test verdes.

### 0.2 — `marcarPresencas` sem validação de `atletaId` (UC-T2-01, CRÍTICO)
- **Subagente:** `bff-backend-specialist`
- **Ficheiro:** `lib/actions/treinos.ts:536`
- **Problema:** único dos ~36 Server Actions sem validar que cada `atletaId` do lote pertence ao clube da sessão. Permite escrever presenças em atletas de outro clube.
- **Correcção:** antes do upsert em lote, validar que todos os `atletaId` recebidos pertencem a atletas do clube autenticado (query `count`/`findMany` filtrada por `escalao.clubeId`); rejeitar com `erro()` se algum não pertencer.
- **Critério de conclusão:** lote com `atletaId` estrangeiro é rejeitado; teste unitário do cenário cross-club; typecheck/lint/test verdes.

### 0.3 — Open image proxy / SSRF (UC-T1-04, ALTO)
- **Subagente:** `frontend-specialist`
- **Ficheiro:** `next.config.js` (`images.remotePatterns`)
- **Problema:** `hostname: "**"` torna o otimizador de imagem num proxy aberto (SSRF/abuso de banda).
- **Correcção:** substituir por allowlist restritiva de domínios efetivamente usados (host do Supabase Storage, YouTube thumbnails se aplicável, e domínios de logo/foto permitidos). Alinhar com a allowlist de URLs da tarefa 0.4.
- **Critério de conclusão:** `remotePatterns` sem `"**"`; imagem de domínio fora da lista não é servida; build de produção verde.

### 0.4 — Validação de esquema de URL em `fotoUrl`/`logoUrl` (UC-T1-05, ALTO)
- **Subagente:** `bff-backend-specialist`
- **Ficheiros:** `lib/schemas/atleta.ts:25` (`fotoUrl`), schema do clube em `lib/schemas/` (`logoUrl`) — e qualquer outro campo de URL renderizado.
- **Problema:** `z.string().url()` aceita `javascript:alert(1)` e qualquer domínio → risco XSS/injeção.
- **Correcção:** criar um helper Zod partilhado (ex. `urlSeguraSchema` em `lib/schemas/`) que só aceita esquema `http`/`https` e (opcionalmente) valida contra a allowlist de domínios da 0.3; aplicar a `fotoUrl`, `logoUrl` e afins.
- **Critério de conclusão:** `javascript:`, `data:` e esquemas não-http rejeitados; testes de schema para casos maliciosos; typecheck/lint/test verdes.

### 0.5 — Rota pública `/r/[token]` devolve 500 (UC-T1-06 / UC-P5-04, ALTO)
- **Subagente:** `frontend-specialist`
- **Ficheiro:** `app/r/[token]/page.tsx` (+ eventual `error.tsx`/`not-found.tsx` local)
- **Problema:** token inválido dá 500 (`PrismaClientInitializationError`/erro não tratado) em vez de ecrã amigável.
- **Correcção:** tratar token inexistente/inválido com `notFound()` ou ecrã "relatório não encontrado" (sem stack trace); envolver a query num guard que devolve 404 amigável.
- **Critério de conclusão:** `GET /r/TOKEN_INVALIDO` devolve 404 com ecrã amigável, nunca 500; typecheck/lint/test verdes.

### 0.6 — Bloqueio efetivo de escrita para perfil só-leitura (UC-P5-07, CRÍTICO)
- **Subagente:** `bff-backend-specialist` (autorização — **não** é Auth.js)
- **Ficheiros:** `lib/permissoes.ts`, `lib/permissoes-catalogo.ts`, actions de `/definicoes` (`lib/actions/utilizadores.ts`, `lib/actions/clubes.ts`)
- **Problema:** o presidente (só leitura) abre `/definicoes/utilizadores` e `/definicoes/clube` em "só visualização" mas com potencial de edição não intencional — falta guard de escrita ao nível da action.
- **Correcção:** garantir que todas as actions de escrita destas áreas invocam `exigirCapacidade(...)` e recusam perfis sem a capacidade correspondente (ex. `CLUBE_UTILIZADORES`, `CLUBE_CONFIG`). Confirmar que o perfil de leitura não tem estas capacidades no catálogo.
- **Critério de conclusão:** cada action de escrita em `/definicoes` rejeita o perfil só-leitura; teste unitário por action; typecheck/lint/test verdes.

### 0.7 — Índices de periodização em falta (UC-T3-01, MÉDIO)
- **Subagente:** `database-specialist`
- **Ficheiro:** `prisma/schema.prisma` (modelo `Sessao`, ~linha 860)
- **Correcção:** adicionar `@@index([planoSemanalDiaId])` e `@@index([planoSemanalId])`; gerar migração (`npm run db:migrate`).
- **Critério de conclusão:** ambos os índices no schema e na migração; `prisma migrate` aplica sem erros.

### 0.8 — Password admin no seed (UC-T3-02, ALTO)
- **Subagente:** `database-specialist`
- **Ficheiro:** `prisma/seed.ts:20` (`PASS_ADMIN` com default público) e `prisma/seed.ts:38` (password impressa em logs)
- **Correcção:** remover o default público de `PASS_ADMIN` (fazer o seed falhar em produção sem password explícita, mantendo a conveniência apenas para o seed local de teste); nunca imprimir a password em logs.
- **Critério de conclusão:** seed sem default público; sem `console.log` de password; seed local de teste continua a funcionar com password via env; documentado em `docs/DEPLOY.md`.

**Checklist de saída da Fase 0:** todas as tarefas concluídas · `typecheck`+`lint`+`test` verdes · UC-T1-03, T1-04, T1-05, T1-06, T2-01, P5-07, T3-01, T3-02 a PASS · changelog da bíblia atualizado.

---

## Fase 1 — Bugs Bloqueadores Core (3–5 dias)

Bugs que impedem uso real por perfis-chave. **Sub-fases paralelas possíveis: SIM parcialmente** — as tarefas de billing (1.3), perfis/dashboards (1.5) e permissão DT (1.4) são independentes; os **cartões** (1.2) são sequenciais internamente (schema → action → UI).

### 1.1 — Taxa de assiduidade > 100% + sessões especiais (UC-T4-01, UC-T4-02)
- **Sequência:** independente. Uma única tarefa (mesmo ficheiro).
- **bff-backend-specialist:**
  - `lib/actions/analise.ts:900` — corrigir cálculo da taxa de equipa: recalcular o denominador por atleta a partir da `dataIngresso` (não usar total global) e aplicar `Math.min(taxa, 100)` como salvaguarda.
  - Excluir sessões `CAPTACAO`/`EVENTO` do denominador de assiduidade (só `TipoSessao.NORMAL` conta — alinhar com a nota do Grupo B do `CLAUDE.md`). Rever todos os cálculos de assiduidade em `analise.ts`.
- **Critério de conclusão:** taxa de equipa nunca excede 100%; sessões CAPTACAO/EVENTO não penalizam a assiduidade; testes de agregação para ambos os cenários; typecheck/lint/test verdes.

### 1.2 — Cartões na grelha pós-jogo (UC-P2-10, UC-P3-06) — SEQUENCIAL
- **1.2a — Schema** (`database-specialist`): `prisma/schema.prisma`, modelo `EstatisticaAtleta` (~linha 1260) — adicionar `cartoesAmarelos Int @default(0)` e `cartaoVermelho Boolean @default(false)` (ou `Int` se dupla-amarela contar em separado). Gerar migração. Atualizar `prisma/seed-rico.ts` com cartões realistas para os dados de teste.
  - **Critério:** campos no schema + migração aplicada; seed com cartões.
- **1.2b — Action** (`bff-backend-specialist`, depende de 1.2a): `lib/schemas/jogo.ts` (schema de estatística) + `lib/actions/jogos.ts` — incluir os novos campos no upsert da grelha de estatísticas.
  - **Critério:** action persiste cartões; teste unitário do upsert.
- **1.2c — UI** (`frontend-specialist`, depende de 1.2b): grelha de estatísticas em `app/(app)/jogos/[id]/page.tsx` (aba Estatísticas) — colunas editáveis de cartão amarelo/vermelho por atleta.
  - **Critério:** cartões editáveis na grelha por atleta; guarda em lote funcional.
- **Nota de dependência:** desbloqueia UC-P2-11 (ranking disciplina) e UC-P3-07 (suspensões) na Fase 2.

### 1.3 — Preço e faturas da licença (UC-P5-06)
- **Sequência:** independente.
- **bff-backend-specialist:** `lib/actions/licenciamento.ts` — garantir que a licença ativa expõe `precoCentimos`, data de próxima renovação e histórico de movimentos/recibos (já existe `listarMovimentosCarteira`; ligar à vista). Confirmar que o preço é preenchido no onboarding/ativação (não ficar em branco).
- **frontend-specialist:** `app/(app)/definicoes/licenca/page.tsx` e `app/(app)/definicoes/licenca/movimentos/page.tsx` — mostrar preço mensal, próxima renovação com valor e histórico de pagamentos.
- **Critério de conclusão:** preço mensal e renovação visíveis com valor real; histórico de pagamentos listado; sem campos em branco para clube com licença ativa; typecheck/lint/test verdes.

### 1.4 — Diretor Técnico sem permissão de equipa técnica (UC-P4-05)
- **Sequência:** independente. Autorização (não é Auth.js).
- **bff-backend-specialist:** `lib/permissoes-catalogo.ts` — atribuir a capacidade `CLUBE_UTILIZADORES` (ou equivalente de gestão de equipa técnica) ao perfil de Diretor Técnico, conforme papel definido na spec v7. Verificar que actions de convite/atribuição/alteração de membros passam a aceitar o DT.
- **Critério de conclusão:** DT consegue convidar treinador, atribuir escalão e alterar perfil de membro; Admin mantém as suas capacidades; teste de autorização por capacidade; typecheck/lint/test verdes.

### 1.5 — Perfis diferenciados: dashboard + menu (UC-P4-01, UC-P5-01, UC-P5-02)
- **Sequência:** independente das anteriores; internamente frontend + bff em paralelo.
- **bff-backend-specialist:** expor, a partir de `obterMembroAtual()`/capacidades, o conjunto de itens de menu e ações permitidas por perfil (fonte de verdade para navegação e dashboard). Corrigir o erro "Algo correu mal" do presidente em `/comunicacoes` (guard de capacidade que devolve estado tratado em vez de exceção).
- **frontend-specialist:**
  - Dashboard diferenciado por perfil — `app/(app)/dashboard/page.tsx`: presidente/DT recebem vista orientada a leitura/supervisão (relatórios, resumo de época), sem ações operacionais de treinador.
  - Menu afinado — componente de `Navegacao` (sidebar + bottom-nav): esconder opções sem capacidade; nenhuma opção do menu pode dar erro.
- **Critério de conclusão:** presidente e DT veem dashboard próprio; menu só mostra opções acessíveis; `/comunicacoes` não dá erro ao presidente (ou é escondido); typecheck/lint/test verdes.

**Checklist de saída da Fase 1:** UC-T4-01, T4-02, P5-06, P2-10, P3-06, P4-05, P4-01, P5-01, P5-02 a PASS · schema de cartões migrado e semeado · `typecheck`+`lint`+`test` verdes · changelog da bíblia atualizado.

---

## Fase 2 — Gaps de Funcionalidade Alta (1 semana)

Features em falta de prioridade alta. Muitas dependem de trabalho da Fase 1 (cartões, perfis). Organizar em **lotes paralelos por domínio**.

### Lote A — Modelo de dados & atleta

#### 2.A1 — Upload de foto de atleta (UC-P1-03, parte foto)
- **Subagentes (sequencial):** `bff-backend-specialist` (mecanismo de upload para Supabase Storage em `lib/server/`/`lib/actions/atletas.ts`, devolvendo URL segura) → `frontend-specialist` (campo de upload de ficheiro no formulário `app/(app)/plantel/novo` e `.../editar`, a substituir o input de URL).
- **Critério:** foto carregável por ficheiro; URL resultante validada pela allowlist da Fase 0; imagem servida via `next/image`; typecheck/lint/test verdes.

#### 2.A2 — Contacto de emergência e notas médicas (UC-P1-03, parte campos)
- **Subagentes (sequencial):** `database-specialist` (campos `contactoEmergencia`, `notasMedicas` no modelo `Atleta` + migração) → `bff-backend-specialist` (`lib/schemas/atleta.ts` + `lib/actions/atletas.ts`) → `frontend-specialist` (formulário).
- **Critério:** campos persistidos e editáveis; visíveis no perfil de atleta de formação.

#### 2.A3 — Autor da marcação de presenças (UC-P3-04)
- **Subagentes (sequencial):** `database-specialist` (`marcadoPorId String?` + relação para `MembroClube`/`Utilizador` no modelo `Presenca`, ~linha 956; migração) → `bff-backend-specialist` (`lib/actions/treinos.ts` `marcarPresencas` grava `marcadoPorId` do utilizador autenticado).
- **Critério:** cada marcação regista o autor; visível para auditoria; teste unitário.

### Lote B — Disciplina (depende de 1.2 cartões)

#### 2.B1 — Ranking de disciplina / total de cartões por época (UC-P2-11)
- **Subagente:** `bff-backend-specialist` (`lib/actions/analise.ts`) + `frontend-specialist` (painel de analíticos do escalão).
- **Critério:** ranking com total de amarelos/vermelhos por atleta na época.

#### 2.B2 — Gestão de suspensões por acumulação (UC-P3-07)
- **Subagentes:** `bff-backend-specialist` (regra de cálculo de suspensão por acumulação de cartões) + `frontend-specialist` (alerta "jogador X suspenso no próximo jogo").
- **Critério:** alerta de suspensão calculado a partir dos cartões registados.

### Lote C — Analíticos multi-dimensão

#### 2.C1 — Filtro por modalidade nos analíticos (UC-P3-09, UC-P4-02)
- **Subagente:** `bff-backend-specialist` (`lib/actions/analise.ts` — parâmetro de modalidade) + `frontend-specialist` (`app/(app)/analiticos/page.tsx` — filtro futsal/futebol).
- **Critério:** analíticos filtráveis por modalidade; sem mistura de dados.

#### 2.C2 — Dimensão por treinador nos analíticos (UC-P4-03)
- **Subagente:** `bff-backend-specialist` + `frontend-specialist`.
- **Critério:** métricas por treinador (atividade, escalões atribuídos) no painel de clube.

#### 2.C3 — Histórico multi-época no perfil do atleta (UC-P2-03)
- **Subagente:** `bff-backend-specialist` (`lib/actions/analise.ts`/perfil) + `frontend-specialist` (`app/(app)/plantel/[id]/page.tsx`).
- **Critério:** estatísticas por época e cumulativas, incluindo épocas passadas.

#### 2.C4 — Comparação de épocas (UC-P4-08)
- **Subagente:** `bff-backend-specialist` + `frontend-specialist`.
- **Critério:** painel de clube compara época N vs N-1.

#### 2.C5 — Tendência do atleta / forma (UC-P2-13)
- **Subagente:** `bff-backend-specialist` (cálculo de forma recente) + `frontend-specialist` (indicador no perfil).
- **Critério:** indicador "em alta"/"em queda" baseado em desempenho recente.

### Lote D — Relatórios agregados

#### 2.D1 — Balanço de época agregado (UC-P4-07, UC-P5-05)
- **Subagente:** `bff-backend-specialist` (`lib/actions/relatorios.ts` — agregação de todos os escalões) + `frontend-specialist` (botão "balanço de época num clique").
- **Critério:** documento único agregando todos os escalões do clube.

### Lote E — Auditoria & agenda

#### 2.E1 — Audit log + alerta de inatividade (UC-P4-04)
- **Subagentes (sequencial):** `database-specialist` (modelo `AuditLog` — quem/o quê/quando; migração) → `bff-backend-specialist` (escrita de audit nas actions relevantes + query de inatividade) → `frontend-specialist` (vista de audit + alerta de treinador inativo há N dias).
- **Critério:** registo de atividade consultável; alerta de inatividade.
- **Nota:** coordenar com 2.A3 (`marcadoPorId`) para reaproveitar o autor.

#### 2.E2 — Reuniões na agenda unificada (UC-P4-09)
- **Subagente:** `bff-backend-specialist` (`lib/actions/agenda.ts` + `lib/actions/reunioes.ts` — incluir reuniões no feed) + `frontend-specialist` (`app/(app)/agenda/page.tsx`).
- **Critério:** reuniões aparecem na agenda unificada, a par de treinos/jogos.

### Lote F — Concorrência & secções

#### 2.F1 — Controlo de concorrência na edição de treino (UC-P3-05)
- **Subagentes (sequencial):** `database-specialist` (campo de versão/`atualizadoEm` para lock optimista no modelo `Sessao`, se necessário) → `bff-backend-specialist` (`lib/actions/treinos.ts` — deteção de conflito no guardar) → `frontend-specialist` (aviso de conflito).
- **Critério:** edição simultânea deteta conflito em vez de sobrescrever silenciosamente.

#### 2.F2 — Renomear e apagar secções (UC-T5-02, UC-T5-03)
- **Subagentes (sequencial):** `bff-backend-specialist` (`lib/actions/seccoes.ts` — novas actions `atualizarSeccao` e `apagarSeccao`, com `exigirCapacidade` e guard para secções com escalões) → `frontend-specialist` (`app/(app)/definicoes/seccoes/page.tsx` — botões renomear/apagar).
- **Critério:** renomear funciona; apagar secção vazia funciona; secção com escalões é bloqueada; teste por action.

**Checklist de saída da Fase 2:** UCs dos lotes A–F a PASS · migrações aplicadas · `typecheck`+`lint`+`test` verdes · changelog da bíblia atualizado.

---

## Fase 3 — UX e Polimento (1 semana)

Adaptação ao perfil, redução de fricção e conclusão de gaps de prioridade média/baixa. Maioritariamente **frontend**, com apoio pontual de bff. Tarefas independentes → **paralelizáveis**.

### 3.1 — RPE/carga adaptado ao escalão (UC-P1-07)
- **Subagente:** `frontend-specialist` (+ `bff-backend-specialist` se a regra de "escalão de formação" precisar de flag no backend).
- **Ficheiro:** formulário de sessão em `app/(app)/treinos/novo` e `.../[id]/editar`.
- **Correcção:** ocultar RPE/carga em escalões de formação (ex. Sub-10); mostrar apenas em escalões onde é relevante.
- **Critério:** RPE não aparece em Sub-10; continua visível em seniores.

### 3.2 — Ficha de atleta adaptada a seniores (UC-P2-02)
- **Subagentes (sequencial):** `database-specialist` (campos de sénior: `clubeAnterior`, `federacaoId`, altura/peso, contacto próprio no modelo `Atleta`, se ausentes) → `bff-backend-specialist` (`lib/schemas/atleta.ts`) → `frontend-specialist` (formulário adaptativo por escalão).
- **Correcção:** em escalões de seniores, ocultar bloco "Encarregado de Educação" e mostrar campos de sénior.
- **Critério:** ficha adapta-se ao escalão; sem campos de formação irrelevantes em seniores.

### 3.3 — Motivo de falta com botões rápidos (UC-P1-05)
- **Subagente:** `frontend-specialist` (**não** requer schema — o enum `MotivoFalta` já existe: `LESAO`, `DOENCA`, `OUTRO`, `SEM_JUSTIFICACAO`).
- **Ficheiro:** ecrã de presenças `app/(app)/treinos/[id]/presencas` (ou componente equivalente).
- **Correcção:** expor o enum `MotivoFalta` como botões rápidos (≥44px) em vez de texto livre; manter `justificacao` como texto opcional.
- **Critério:** motivo selecionável por botão rápido; alvos ≥44px; texto livre continua disponível como complemento.

### 3.4 — Exercícios: adequação Sub-10 + modo simples do editor (UC-P1-06)
- **Subagentes:** `frontend-specialist` (modo simples do editor de campo) + `bff-backend-specialist`/`database-specialist` (rever `seed`/biblioteca de arranque para exercícios adequados a formação).
- **Critério:** exercícios de arranque adequados a Sub-10; editor com modo simples para o perfil solo.

### 3.5 — Jogo: reduzir separadores + registo de golo rápido (UC-P1-08)
- **Subagente:** `frontend-specialist`.
- **Ficheiro:** `app/(app)/jogos/[id]/page.tsx`.
- **Correcção:** simplificar navegação de separadores para o perfil solo; registo de golo ao vivo em 1 toque.
- **Critério:** golo em 1 toque; navegação simplificada.

### 3.6 — Taxonomia táctica de exercícios + filtro (UC-P2-05)
- **Subagentes (sequencial):** `database-specialist` (taxonomia estruturada — enum/tabela de objetivos tácticos) → `bff-backend-specialist` (`lib/schemas/exercicio.ts` + `lib/actions/exercicios.ts`) → `frontend-specialist` (filtro por objetivo).
- **Critério:** objetivo táctico como taxonomia filtrável (não texto livre).

### 3.7 — Duplicar exercício / favoritos (UC-P2-06, BAIXO)
- **Subagentes:** `database-specialist` (flag `favorito` se necessário) + `bff-backend-specialist` (`lib/actions/exercicios.ts` — `duplicarExercicio`, `toggleFavorito`) + `frontend-specialist` (botões).
- **Critério:** duplicar e favoritar exercícios funcionam.

### 3.8 — Distinção Plano Semanal vs Periodização (UC-P2-08)
- **Subagente:** `frontend-specialist`.
- **Ficheiros:** `app/(app)/treinos/planos/page.tsx`, `app/(app)/treinos/periodizacao/page.tsx`.
- **Correcção:** copy/ajuda contextual que separe claramente os dois conceitos.
- **Critério:** utilizador percebe a diferença sem tutorial.

### 3.9 — Modelo de jogo ↔ exercícios (UC-P3-11)
- **Subagentes (sequencial):** `database-specialist` (ligação princípio ↔ exercício) → `bff-backend-specialist` (`lib/actions/modeloJogo.ts` + `lib/actions/exercicios.ts`) → `frontend-specialist` (etiquetar exercício com princípio + filtro).
- **Critério:** exercício etiquetável por princípio; biblioteca filtrável por princípio.

### 3.10 — Relatório de jogo estruturado (UC-P3-12)
- **Subagentes:** `database-specialist` (campos estruturados no relatório de jogo, se hoje é texto livre) + `bff-backend-specialist` + `frontend-specialist` (secções: análise táctica, destaques, próximo jogo).
- **Critério:** relatório com secções estruturadas.

### 3.11 — Importar calendário externo de competição (UC-P2-16)
- **Subagentes:** `bff-backend-specialist` (`lib/actions/competicoes.ts` — importação de jornadas) + `frontend-specialist` (UI de importação).
- **Critério:** calendário de competição importável (não só introdução manual).

**Checklist de saída da Fase 3:** UCs P1-05, P1-06, P1-07, P1-08, P2-02, P2-05, P2-06, P2-08, P3-11, P3-12, P2-16 a PASS · `typecheck`+`lint`+`test` verdes · changelog da bíblia atualizado.

---

## Fase 5 — Conformidade FPF (Inscrições Federativas) (~2 semanas)

Suporte à pré-geração automática dos Modelos federativos da FPF (foco no **Modelo 2**), à imagem do que o EMJOGO faz. **Pode correr em paralelo com a Fase 3** (UX/polimento): não depende da Fase 1 nem da Fase 2. Ordenação interna clássica: **schema (`database-specialist`) → schema Zod + Server Actions (`bff-backend-specialist`) → UI/export (`frontend-specialist`)**.

### O que é

O EMJOGO **não integra** com a plataforma **SCORE** da FPF — apenas preenche automaticamente os **Modelos 1/2/9** em PDF, e o secretário do clube submete manualmente na SCORE. Não existe certificação de software obrigatória do lado federativo (ao contrário da faturação/AT). O Mister pode fazer exatamente o mesmo com ~2 semanas de trabalho, eliminando o lock-in do EMJOGO no lado federativo.

### Pré-requisito de negócio (antes de arrancar o sprint)

Confirmar os **campos exactos do Modelo 2 atual** com o PDF oficial da **FPF** ou da **AF distrital**. Sem isto, o layout do PDF pode ter de ser revisto. **Recomendado:** obter o formulário oficial antes de iniciar a implementação do export.

### 5.1 — Dados federativos no modelo `Atleta` (SCHEMA)
- **Subagente:** `database-specialist`
- **Ficheiro:** `prisma/schema.prisma` (modelo `Atleta`)
- **Correcção:** adicionar campos **opcionais** (migração **não-destrutiva**, sem alterar campos existentes):
  - `nDocumento String?` — nº de CC/BI/Passaporte
  - `tipoDocumento` (enum `TipoDocumento`: `CC | BI | PASSAPORTE | OUTRO`, opcional)
  - `checkDigitDocumento String?`
  - `paisNascimento String?`
  - `nacionalidade String?`
  - `nLicencaFPF String?` — nº de licença federativa
  - `modalidadeFiliacao String?` — Futsal / Futebol / Ambas
  - `consentimentoRgpdAtleta Boolean @default(false)`
  - `consentimentoRgpdEe Boolean @default(false)` — encarregado de educação
  - `inscricaoFpfEstado` (enum `EstadoInscricaoFpf`: `PENDENTE | SUBMETIDA | COMPLETA`, default `PENDENTE`)
- **Critério de conclusão:** campos e enums no schema; migração Prisma aplicada sem erros e sem alterar dados existentes; `prisma migrate` verde.

### 5.2 — Schema Zod + Server Actions federativas (BACKEND, depende de 5.1)
- **Subagente:** `bff-backend-specialist`
- **Ficheiros:** `lib/schemas/atleta.ts`, `lib/actions/atletas.ts`, nova `lib/actions/inscricoesFpf.ts` (ou equivalente)
- **Correcção:**
  - Atualizar `atletaSchema` com os novos campos (Zod, **todos opcionais**); `nDocumento` validado como `urlSeguraSchema` **não** se aplica (é texto), mas aplicar sanitização/formato conforme `tipoDocumento`.
  - Atualizar `criarAtleta` e `atualizarAtleta` para persistir os campos federativos.
  - Nova Server Action `gerarModeloDoisAtleta(atletaId)` → valida input → `auth()` → `obterEpocaAtiva()` → devolve os **dados estruturados** do Modelo 2 para um atleta (`Resultado<T>`), filtrado pelo clube do utilizador.
  - Nova Server Action `gerarModeloDoisEscalao(escalaoId)` → gera os dados estruturados para **todos os atletas do escalão** (filtrado por clube + época ativa).
  - Ambas respeitam as convenções fixas do projeto (validação Zod → `auth()` → clube/época → `Resultado<T>` → `revalidatePath()` quando aplicável).
- **Critério de conclusão:** schema Zod aceita e valida os campos federativos; `criarAtleta`/`atualizarAtleta` persistem; as duas actions de geração devolvem dados corretos e isolados por clube; testes unitários (mapeamento de dados + isolamento cross-club); typecheck/lint/test verdes.

### 5.3 — Export PDF do Modelo 2 (BACKEND/EXPORT, depende de 5.2)
- **Subagente:** `bff-backend-specialist` (geração server-side) + `frontend-specialist` (integração/download)
- **Biblioteca:** `@react-pdf/renderer` (dentro do ecossistema React/Next.js; rendering server-side possível).
- **Correcção:**
  - Layout do **Modelo 2 oficial da FPF**, com os campos pré-preenchidos.
  - Campos obrigatórios a mapear do Mister → PDF: **nome, data de nascimento, documento, check digit, país de nascimento, clube, escalão, época, encarregados de educação** (já existem em `Atleta`).
  - Suportar geração **individual** (1 atleta) e **em lote por escalão** (documento multi-página).
- **Nota:** o layout exacto depende do PDF oficial (ver pré-requisito de negócio acima) — se o formulário não estiver disponível, entregar layout provisório assinalado como *a validar*.
- **Critério de conclusão:** PDF do Modelo 2 gerado e transferível para 1 atleta e para escalão completo; campos mapeados corretamente; typecheck/lint/test verdes.

### 5.4 — UI: formulário federativo + lista com estado (FRONTEND, depende de 5.2/5.3)
- **Subagente:** `frontend-specialist`
- **Ficheiros:** `AtletaForm` (`app/(app)/plantel/novo`, `.../[id]/editar`), lista do plantel (`app/(app)/plantel/page.tsx`), página/modal de export.
- **Correcção:**
  - Secção **colapsável "Dados Federativos"** no `AtletaForm` — só aparece se o utilizador a expandir (**não obrigatória**).
  - Página/modal de **geração do Modelo 2**: seleccionar atleta(s) → pré-visualização → download PDF.
  - Botão **"Gerar Modelo 2"** na lista do plantel (individual e em lote por escalão).
  - Coluna **opcional** de estado de inscrição (`inscricaoFpfEstado`: PENDENTE | SUBMETIDA | COMPLETA) na lista do plantel.
  - **Relatório de inscrições pendentes** (filtro na lista do plantel).
- **Critério de conclusão:** secção federativa colapsável e opcional; geração/pré-visualização/download funcionam (individual + lote); estado de inscrição visível; filtro de pendentes operacional; alvos de toque ≥44px; typecheck/lint/test verdes.

### Impacto estratégico

Esta fase elimina o **único lock-in real do EMJOGO no lado desportivo**: a pré-geração automática dos Modelos FPF. Após esta fase, o secretário do clube pode usar o Mister para gerar o Modelo 2 e submeter na SCORE (plataforma FPF) — sem precisar do EMJOGO para o processo federativo.

### Dependências e RGPD

- Pode correr **em paralelo com a Fase 3**. **Não depende** da Fase 1 nem da Fase 2.
- Os campos de identidade (documento, check digit, nacionalidade) são **RGPD sensível**: confirmar que o **RGPD dos menores (GAP-P2-19)** está pelo menos **documentado** antes de capturar dados de documento de identificação. Reaproveitar os campos de consentimento (`consentimentoRgpdAtleta`, `consentimentoRgpdEe`) introduzidos em 5.1.

**Checklist de saída da Fase 5:** schema migrado com campos opcionais (não-destrutivo) · `AtletaForm` com secção federativa colapsável · geração de PDF do Modelo 2 pré-preenchido para 1 atleta e para escalão completo · estado de inscrição visível na lista do plantel · **não requer homologação FPF, não requer API/integração com SCORE** · `typecheck`+`lint`+`test` verdes · changelog da bíblia atualizado.

---

## Fase 6 — Validação Final (~1 dia)

- **Re-correr os 82 UCs** da bíblia (`docs/qa/`) na íntegra, atualizando o estado de cada UC e a tabela agregada do `README.md`.
- **Critério de aprovação:** **≥95% PASS** (≥78/82). Nenhum FAIL de prioridade CRÍTICA ou ALTA em segurança.
- **Agentes de validação:**
  - `qa-seguranca` — re-executa UC-T1 (segurança) e confirma isolamento multi-tenant (T4-03), IDOR (T1-03), image proxy (T1-04), validação de URL (T1-05), rota pública (T1-06).
  - `qa-testes` — re-executa `npm run test`/`typecheck`/`lint` (UC-T2-04/05/06) e valida cobertura das novas features.
  - `qa-backend` — re-executa UC-T2/T3/T4 (Server Actions, schema, regras de negócio).
  - `qa-negocio` — re-executa as personas P1–P5.
- **Entrega:** atualizar `docs/qa/README.md` (tabela de estado + nova execução), registar no changelog de `Mister_Spec_v7.md`.

> **Nota de disponibilidade de agentes:** os subagentes de validação nomeados na tarefa são `qa-seguranca` e `qa-testes`. `qa-backend` e `qa-negocio` são desejáveis para cobertura completa; se não existirem no registo de subagentes, a validação backend/negócio recai sobre `qa-testes` + revisão dos specialists de implementação, e deve ser sinalizada ao supervisor antes da Fase 6.

---

## Mapa de Dependências

| Item | Depende de | Bloqueia |
|---|---|---|
| 0.3 image proxy (allowlist) | — | 0.4 (validação URL usa mesma allowlist), 2.A1 (upload foto) |
| 0.4 validação URL | 0.3 (allowlist de domínios) | 2.A1 (upload foto) |
| 1.2a schema cartões | — | 1.2b, 1.2c, 2.B1, 2.B2 |
| 1.2b action cartões | 1.2a | 1.2c |
| 1.2c UI cartões | 1.2b | 2.B1 (ranking), 2.B2 (suspensões) |
| 2.B1 ranking disciplina | 1.2 (cartões completos) | — |
| 2.B2 suspensões | 1.2 (cartões completos) | — |
| 1.4 permissão DT | — | UC-P4-05 e reforça P4-01 (dashboard DT) |
| 1.5 perfis/dashboards | (usa capacidades; sinergia com 1.4) | — |
| 2.A3 marcadoPorId | — | 2.E1 (audit log reaproveita autor) |
| 2.E1 audit log | 2.A3 (opcional) | UC-P4-04 |
| 2.C1 filtro modalidade | — | reforça 2.C2 (dimensão treinador) |
| 2.D1 balanço agregado | 2.C* (agregações) recomendado | UC-P4-07, UC-P5-05 |
| 3.2 ficha sénior | 3.2 schema sénior | formulário adaptativo |
| 3.6 taxonomia táctica | 3.6 schema taxonomia | 3.9 (modelo↔exercícios reforça) |

**Regra geral de ordenação:** dentro de cada feature, **schema (`database-specialist`) → action/schema Zod (`bff-backend-specialist`) → UI (`frontend-specialist`)**. Entre features distintas do mesmo lote, executar em paralelo desde que não partilhem ficheiros.

---

## Fora de Âmbito (não incluído neste plano)

Conforme instrução explícita, os seguintes UCs FAIL/PARCIAL **não** são endereçados agora:

| UC | Descrição | Motivo |
|---|---|---|
| UC-T5-01 | Offline beira-campo (PWA + fila de escrita) | PWA/offline — investimento significativo |
| UC-P1-10 | Portal de caderneta para atletas/pais | Nova feature complexa (portal externo) |
| UC-P5-08 | RGPD — consentimento parental / garantia EU | Decisão de negócio (consentimento fora da app); apagar definitivo já existe (`apagarAtletaDefinitivamente`); garantia EU é ops de deploy |
| UC-P2-07 (parte gantt) | Vista gantt da periodização | Backlog (a parte `sugerirPlaneamento` já é PASS) |
| UC-P2-12 | Análise casa/fora | Backlog |
| UC-P3-08 (parte histórico) | Base de dados histórica de scouting por adversário | Scouting histórico — backlog (scouting por jogo já existe) |
| — | Recuperação de password | Auth.js — proibido tocar (Regra Sagrada Nº 3) |

**UC-T3-04** (multi-tenancy sem `clubeId` directo em `Sessao`/`Jogo`) é uma **OBSERVAÇÃO**, não um FAIL. Recomenda-se avaliar `clubeId` desnormalizado ou middleware de query como reforço defensivo, mas fica **fora do critério de ≥95% PASS** desta campanha; decisão a levar ao supervisor.

---

## Checklist de Entrega por Fase

- [ ] **Fase 0 — Segurança:** IDOR licença (0.1), IDOR presenças (0.2), image proxy (0.3), validação URL (0.4), rota `/r` 500 (0.5), write-protection presidente (0.6), índices periodização (0.7), seed password (0.8) · `typecheck`+`lint`+`test` verdes · bíblia atualizada.
- [ ] **Fase 1 — Bloqueadores:** assiduidade ≤100% (1.1), cartões na grelha schema→action→UI (1.2), preço/faturas licença (1.3), permissão DT (1.4), perfis/dashboards/menu (1.5) · `typecheck`+`lint`+`test` verdes · migrações aplicadas · bíblia atualizada.
- [ ] **Fase 2 — Gaps altos:** lotes A (atleta/dados), B (disciplina), C (analíticos), D (relatórios), E (auditoria/agenda), F (concorrência/secções) · migrações aplicadas · `typecheck`+`lint`+`test` verdes · bíblia atualizada.
- [ ] **Fase 3 — UX/polimento:** RPE por escalão (3.1), ficha sénior (3.2), motivos falta (3.3), exercícios/editor (3.4), jogo simplificado (3.5), taxonomia táctica (3.6), duplicar/favoritos (3.7), plano vs periodização (3.8), modelo↔exercícios (3.9), relatório estruturado (3.10), importar calendário (3.11) · `typecheck`+`lint`+`test` verdes · bíblia atualizada.
- [ ] **Fase 5 — Conformidade FPF:** dados federativos no `Atleta` schema (5.1), schema Zod + Server Actions `gerarModeloDois*` (5.2), export PDF do Modelo 2 individual + lote (5.3), UI federativa colapsável + estado de inscrição + filtro de pendentes (5.4) · pré-requisito do PDF oficial FPF confirmado · migração não-destrutiva aplicada · RGPD de menores documentado · `typecheck`+`lint`+`test` verdes · bíblia atualizada.
- [ ] **Fase 6 — Validação:** 82 UCs re-corridos · ≥95% PASS · zero FAIL CRÍTICO/ALTO de segurança · `README.md` da bíblia atualizado · changelog `Mister_Spec_v7.md`.

---

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | workflow-planner | Versão inicial — plano de 5 fases (0–4) derivado da bíblia de QA (82 UCs, 41 FAIL, 11 PARCIAL) |
| 1.1.0 | 2026-08-24 | documentation-specialist | Nova Fase 5 — Conformidade FPF (Inscrições Federativas): dados federativos no `Atleta`, Server Actions `gerarModeloDois*`, export PDF do Modelo 2 (individual + escalão), estado de inscrição na lista do plantel. Validação Final renumerada de Fase 4 para Fase 6 |
