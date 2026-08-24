# Relatório Consolidado de QA — Mister
**Data:** 2026-08-20
**Use cases executados:** 82
**PASS:** 30 (37%) | **FAIL:** 41 (50%) | **PARCIAL:** 11 (13%)

## Sumário Executivo

O Mister tem um **núcleo funcional sólido e uma base técnica de qualidade acima da média** para um produto nesta fase: proteção de rotas, headers de segurança, isolamento multi-tenant na generalidade, 1269 testes verdes, typecheck e lint limpos, cascades de FK corretas e um padrão de Server Actions consistente (`validate → auth → clube → Resultado<T> → revalidate`). Os fluxos que mais encantam — editor SVG táctico, ACWR, gerador de comunicação WhatsApp, relatório partilhável com marca do clube, competições com classificação automática, deteção de conflito de pavilhão e multi-escalão/multi-modalidade — estão a funcionar e não devem ser tocados.

Dito isto, **50% dos use cases falham e o produto ainda não está pronto para venda a um clube estruturado**. O problema não é o "básico do treinador solo" (esse está maioritariamente de pé), é a **ambição multi-perfil e multi-modalidade prometida no `Mister_Spec_v7`**: o presidente e o diretor técnico recebem o dashboard e o menu do treinador, o presidente vê a app rebentar em "Comunicações", e o DT não tem sequer permissão para gerir a sua própria equipa técnica. Estes perfis foram vendidos na spec mas não têm superfície de produto que os sirva.

Há ainda um **cluster de segurança/dados que é bloqueador de produção**: escrita cross-tenant em `marcarPresencas`, rota pública `/r/[token]` a devolver 500, password de admin com default público impressa em logs, e validação de URL que aceita `javascript:` (XSS). Nenhum destes pode ir para produção como está. São poucos, são localizados, e são corrigíveis num sprint curto — mas são inegociáveis.

**Prontidão comercial:** o produto serve **hoje** um treinador solo de formação em modo "single-player". **Não serve** um clube com hierarquia (presidente/DT), nem cumpre requisitos de RGPD para menores, nem fecha o ciclo financeiro (preço/faturação/IBAN por confirmar). O caminho para a venda é claro e faseado: primeiro fechar os P0 de segurança, depois dar cara aos perfis que já vendemos, e só depois a sofisticação analítica.

---

## Bugs Críticos — Bloqueadores de Produção (P0)

### BUG-P0-01: Escrita cross-tenant em `marcarPresencas`
- **Área:** Backend / Treinos / Autorização
- **Impacto:** Qualquer utilizador autenticado pode escrever presenças em atletas de **outro clube**. Corrupção de dados multi-tenant e violação de isolamento. É o único dos ~36 Server Actions sem o check de pertença ao clube.
- **UC Ref:** UC-T2-01
- **Ficheiro:** `lib/actions/treinos.ts:536`
- **Reprodução:** Autenticar no clube A; invocar `marcarPresencas` com um `atletaId` pertencente ao clube B; a escrita é aceite.

### BUG-P0-02: Rota pública `/r/[token]` devolve 500 com token inválido
- **Área:** Rotas públicas / Tratamento de erros
- **Impacto:** Rota **sem autenticação** (link partilhado com direção/pais) expõe erro 500 (`PrismaClientInitializationError` não capturado) em vez de um 404 amigável. Má primeira impressão pública e potencial fuga de stack trace.
- **UC Ref:** UC-T1-06, UC-P5-04
- **Ficheiro:** rota `/r/[token]`
- **Reprodução:** `GET /r/TOKEN_INVALIDO_QUALQUER` → 500.

### BUG-P0-03: Password de admin com default público e impressa em logs (seed)
- **Área:** Base de dados / Seed / Segurança
- **Impacto:** `PASS_ADMIN` tem default público e a password é escrita em logs. Risco direto de comprometimento de conta admin em ambientes partilhados.
- **UC Ref:** UC-T3-02
- **Ficheiro:** `prisma/seed.ts:20` (default público), `prisma/seed.ts:38` (log da password)
- **Reprodução:** Correr o seed base sem definir `PASS_ADMIN`; observar default aplicado e password no output.
- **Nota:** A auditoria de produção já força falha do seed em prod sem passwords — **confirmar cobertura no seed base**, não só no de produção.

### BUG-P0-04: Validação de URL aceita `javascript:` (XSS) em `fotoUrl`/`logoUrl`
- **Área:** Validação de input / Zod / Segurança
- **Impacto:** Schemas aceitam qualquer URL, incluindo `javascript:alert(1)`. Se renderizada sem sanitização, é vetor de XSS/injeção — pode expor sessões e dados.
- **UC Ref:** UC-T1-05
- **Ficheiro:** `lib/schemas/`
- **Reprodução:** Criar atleta com `fotoUrl: "javascript:alert(1)"`; Zod aceita.

### BUG-P0-05: Recuperação de password ausente + IBAN de pagamento por confirmar
- **Área:** Autenticação / Licenciamento
- **Impacto:** Sem recuperação de password, utilizador que esquece a password fica bloqueado — bloqueador de uso real. Fluxo de pagamento/IBAN não validado pelos 82 UCs.
- **UC Ref:** — (não coberto pelos UCs executados)
- **⚠️ Nota de conformidade:** Qualquer alteração à recuperação de password **toca em autenticação** e exige autorização explícita do supervisor antes de avançar (Regra Sagrada Nº3). Este item fica registado como bloqueador, mas **não deve ser mexido sem autorização**.

---

## Bugs de Alta Prioridade — Impacto na Experiência Core (P1)

### BUG-P1-01: IDOR em `obterLicencaPendente`
- **Área:** Server Actions / Autorização — **Ficheiro:** `lib/actions/licenciamento.ts:94`
- **Impacto:** Não chama `auth()` e aceita `clubeId` como parâmetro externo → leitura da licença pendente de outro clube.
- **UC Ref:** UC-T1-03

### BUG-P1-02: Otimizador de imagem como proxy aberto (SSRF)
- **Área:** Next.js Image / Infra — **Ficheiro:** `next.config.js` (`hostname: "**"`)
- **Impacto:** `/_next/image` serve imagens de qualquer domínio → SSRF e abuso de banda.
- **UC Ref:** UC-T1-04

### BUG-P1-03: Cartões não registáveis na grelha pós-jogo
- **Área:** Jogos / Estatísticas
- **Impacto:** Cartões só existem como evento ao vivo; impossível editar amarelos/vermelhos por atleta na grelha. Base para disciplina/suspensões inexistente.
- **UC Ref:** UC-P2-10, UC-P3-06 (mesmo bug, dois perfis)

### BUG-P1-04: Sem gestão de suspensões por acumulação
- **Área:** Jogos / Disciplina
- **Impacto:** Sem alerta "jogador X suspenso no próximo jogo". Depende de BUG-P1-03 estar resolvido primeiro.
- **UC Ref:** UC-P3-07

### BUG-P1-05: Diretor técnico sem permissão de gerir equipa técnica
- **Área:** Definições / Autorização
- **Impacto:** Só o perfil Admin tem `CLUBE_UTILIZADORES`. O DT não consegue convidar, atribuir escalão nem alterar membros.
- **UC Ref:** UC-P4-05
- **⚠️ Nota:** Toca em autorização/claims → exige autorização explícita do supervisor (Regra Sagrada Nº3).

### BUG-P1-06: Taxa de assiduidade da equipa pode exceder 100%
- **Área:** Analíticos / Assiduidade — **Ficheiro:** `lib/actions/analise.ts:900`
- **Impacto:** Quando atletas saem a meio da época o denominador desalinha e a taxa passa dos 100% — mina a confiança nos analíticos.
- **UC Ref:** UC-T4-01

### BUG-P1-07: Sessões CAPTACAO/EVENTO a contar no denominador de assiduidade
- **Área:** Regras de negócio / Assiduidade
- **Impacto:** Contradiz a nota do Grupo B do CLAUDE.md (só NORMAL deveria contar). Penaliza injustamente a assiduidade de atletas regulares.
- **UC Ref:** UC-T4-02

### BUG-P1-08: "Comunicações" dá erro 500 ao presidente
- **Área:** Navegação / Comunicações
- **Impacto:** Opção aparece no menu do presidente e rebenta com "Algo correu mal". Erro visível ao decisor que estamos a tentar conquistar.
- **UC Ref:** UC-P5-02

### BUG-P1-09: Perfil de só leitura (presidente) com potencial de edição em Definições
- **Área:** Segurança / Autorização (RBAC)
- **Impacto:** Definições abrem em "só visualização" mas sem bloqueio efetivo de escrita — presidente pode alterar configuração do clube por engano.
- **UC Ref:** UC-P5-07
- **⚠️ Nota:** Toca em autorização → Regra Sagrada Nº3.

### BUG-P1-10: Edição simultânea sobrescreve sem aviso (perda silenciosa)
- **Área:** Treinos / Concorrência
- **Impacto:** Dois treinadores a editar o mesmo treino → o último a guardar apaga o trabalho do outro sem aviso. Perda de dados num clube com assistentes.
- **UC Ref:** UC-P3-05

---

## Gaps de Funcionalidade — Features em Falta (P2)

- **GAP-P2-01 — Perfis diferenciados (dashboard + menu) para DT e presidente.** Ambos recebem a experiência de treinador. É a promessa multi-perfil do `Spec_v7` por cumprir. *(UC-P4-01, UC-P5-01, UC-P5-02)*
- **GAP-P2-02 — Portal externo para atleta/pai** consultar caderneta/progresso sem conta. Valor central do treinador de formação. *(UC-P1-10)*
- **GAP-P2-03 — Histórico e comparação multi-época.** Perfil de atleta e analíticos só mostram a época ativa. *(UC-P2-03, UC-P4-08)*
- **GAP-P2-04 — Filtro por modalidade nos analíticos.** Futsal e futebol misturados num clube multi-modalidade. *(UC-P3-09, UC-P4-02)*
- **GAP-P2-05 — Licença: preço mensal + histórico de faturação.** Preço em branco, histórico vazio. *(UC-P5-06)*
- **GAP-P2-06 — Balanço de época agregado** (todos os escalões num documento). Hoje é escalão a escalão. *(UC-P4-07, UC-P5-05)*
- **GAP-P2-07 — Ficha de atleta sénior:** faltam campos (clube anterior, federação, contacto próprio, altura/peso). *(UC-P2-02)*
- **GAP-P2-08 — Upload de foto (ficheiro) + contacto de emergência + notas médicas.** Foto é só por URL; campos ausentes críticos em formação. *(UC-P1-03)*
- **GAP-P2-09 — Dimensão por treinador + audit log/alerta de inatividade** para o DT supervisionar. *(UC-P4-03, UC-P4-04)*
- **GAP-P2-10 — Gestão de secções: renomear e apagar.** As actions `atualizarSeccao`/`apagarSeccao` não existem. *(UC-T5-02, UC-T5-03)*
- **GAP-P2-11 — Offline beira-campo (fila de escrita PWA)** para marcar presenças sem rede. *(UC-T5-01)*
- **GAP-P2-12 — Taxonomia táctica filtrável em exercícios** (objetivo é texto livre). *(UC-P2-05)*
- **GAP-P2-13 — Ligação Modelo de Jogo ↔ exercícios** (etiquetar por princípio e filtrar). *(UC-P3-11)*
- **GAP-P2-14 — Ranking/total de disciplina (cartões) por época.** Depende de BUG-P1-03. *(UC-P2-11)*
- **GAP-P2-15 — Autor da marcação de presenças (`marcadoPorId`)** para auditoria. *(UC-P3-04)*
- **GAP-P2-16 — Reuniões na agenda unificada.** Conflitos de pavilhão funcionam, reuniões não entram. *(UC-P4-09)*
- **GAP-P2-17 — Índices Prisma em `Sessao` (`planoSemanalDiaId`, `planoSemanalId`)** para evitar full scans. *(UC-T3-01)*
- **GAP-P2-18 — Hardening de multi-tenancy:** `Sessao`/`Jogo` sem `clubeId` direto; isolamento depende do join por `escalao.clubeId` (frágil). *(UC-T3-04)*
- **GAP-P2-19 — RGPD menores:** consentimento fora da app, sem direito ao esquecimento (apagar definitivo) nem garantia EU explícita. *(UC-P5-08)*

---

## Melhorias de UX/Usabilidade (P3)

- **UX-P3-01 — RPE/carga visível em Sub-10.** Irrelevante e confuso na formação; devia adaptar-se ao escalão. *(UC-P1-07)*
- **UX-P3-02 — Motivo de falta só em texto livre.** Faltam botões rápidos (doente, escola, lesão) para uso mobile. *(UC-P1-05)*
- **UX-P3-03 — Exercícios de arranque desadequados para Sub-10 + editor demasiado complexo** para o perfil solo de formação. *(UC-P1-06)*
- **UX-P3-04 — Detalhe de jogo com 6 separadores e golo em 3+ toques.** Fricção alta ao vivo para o treinador solo. *(UC-P1-08)*
- **UX-P3-05 — Plano Semanal vs Periodização** — distinção pouco clara sem tutorial. *(UC-P2-08)*
- **UX-P3-06 — Sem duplicar exercício nem favoritos.** Fricção para quem gere biblioteca grande. *(UC-P2-06)*
- **UX-P3-07 — Relatório de jogo é texto livre**, sem secções estruturadas (análise táctica, destaques, próximo jogo). *(UC-P3-12)*
- **UX-P3-08 — Bloco "Encarregado de Educação" visível em seniores** (irrelevante). *(UC-P2-02 — faceta cosmética)*

---

## Sugestões de Produto (BACKLOG)

- **BL-01 — Base de dados de scouting histórico por adversário** (reutilizável entre jogos). *(UC-P3-08)*
- **BL-02 — Análise casa/fora** (o dado `casaFora` já existe, falta o painel). *(UC-P2-12)*
- **BL-03 — Vista Gantt da periodização** (hoje só lista). *(UC-P2-07)*
- **BL-04 — Indicador de tendência/forma do atleta** ("em alta"/"em queda"). *(UC-P2-13)*
- **BL-05 — Importação de calendário externo em competições** (hoje inserção manual de jornadas). *(UC-P2-16)*

---

## Pontos Fortes — Manter e Destacar

- **Segurança de base:** proteção de rotas (307→/login em 12/12) e headers completos (CSP, X-Frame-Options, HSTS, etc.). *(UC-T1-01, UC-T1-02)*
- **Qualidade de código:** 1269/1269 testes verdes, typecheck e lint limpos, `"use server"` em todas as actions, padrão de action consistente. *(UC-T2-02 a UC-T2-06)*
- **Integridade de dados:** cascades/restrict corretos, unicidade de convocatória, remoção transacional de convocado com confirmação. *(UC-T3-03, UC-T4-04, UC-T4-05)*
- **Isolamento multi-tenant na generalidade** (`clubeId` derivado de `auth()`), salvo as exceções P0/P1 já mapeadas. *(UC-T4-03)*
- **Editor SVG táctico** (equipas com cores, setas, animação em passos) — bom e valorizado. *(UC-P2-04, UC-P3-03)*
- **ACWR / carga de treino** com curva semanal e zonas de risco. *(UC-P2-09)*
- **Gerador de comunicação WhatsApp** pré-preenchido — grande valor no perfil solo. *(UC-P1-09)*
- **Relatório partilhável público com marca do clube e impressão PDF.** *(UC-P2-15, UC-P4-06)*
- **Multi-escalão/multi-modalidade, escalão secundário, partilha de exercícios do clube, conflito de pavilhão, modelo de jogo transversal.** *(UC-P3-01/02/03/10, UC-P4-10)*
- **Competições com classificação automática** e **onboarding "Vitória Rápida"** claro. *(UC-P2-16, UC-P1-02)*
- **Ergonomia mobile** (alvos ≥44px, bottom-nav a uma mão) e **estados vazios orientadores**. *(UC-P1-12, UC-P1-11)*

---

## Matriz de Prioridade

| ID | Título | Prioridade | Área | Complexidade Est. | UC Ref |
|---|---|---|---|---|---|
| BUG-P0-01 | Escrita cross-tenant em `marcarPresencas` | P0 | Backend/Autz | Baixa | UC-T2-01 |
| BUG-P0-02 | `/r/[token]` devolve 500 (rota pública) | P0 | Rotas públicas | Baixa | UC-T1-06, UC-P5-04 |
| BUG-P0-03 | Password admin default + em logs (seed) | P0 | DB/Seed | Baixa | UC-T3-02 |
| BUG-P0-04 | URL aceita `javascript:` (XSS) | P0 | Validação/Zod | Baixa | UC-T1-05 |
| BUG-P0-05 | Recuperação password + IBAN (lacuna) | P0 | Auth/Licença | Média | — |
| BUG-P1-01 | IDOR `obterLicencaPendente` | P1 | Server Actions | Baixa | UC-T1-03 |
| BUG-P1-02 | Proxy de imagem aberto (SSRF) | P1 | Infra/Next | Baixa | UC-T1-04 |
| BUG-P1-03 | Cartões na grelha pós-jogo | P1 | Jogos/Estat. | Média | UC-P2-10, UC-P3-06 |
| BUG-P1-04 | Gestão de suspensões | P1 | Jogos/Disciplina | Média | UC-P3-07 |
| BUG-P1-05 | DT sem permissão de equipa técnica | P1 | Autz/RBAC | Média | UC-P4-05 |
| BUG-P1-06 | Assiduidade da equipa >100% | P1 | Analíticos | Baixa | UC-T4-01 |
| BUG-P1-07 | CAPTACAO/EVENTO no denominador | P1 | Regras negócio | Baixa | UC-T4-02 |
| BUG-P1-08 | "Comunicações" 500 ao presidente | P1 | Navegação | Baixa | UC-P5-02 |
| BUG-P1-09 | Só-leitura com potencial de edição | P1 | Autz/RBAC | Média | UC-P5-07 |
| BUG-P1-10 | Edição simultânea sobrescreve | P1 | Concorrência | Média | UC-P3-05 |
| GAP-P2-01 | Perfis diferenciados (DT/presidente) | P2 | Frontend/UX | Alta | UC-P4-01, UC-P5-01/02 |
| GAP-P2-02 | Portal atleta/pai | P2 | Full-stack | Alta | UC-P1-10 |
| GAP-P2-03 | Histórico/comparação multi-época | P2 | Analíticos | Alta | UC-P2-03, UC-P4-08 |
| GAP-P2-04 | Filtro por modalidade nos analíticos | P2 | Analíticos | Média | UC-P3-09, UC-P4-02 |
| GAP-P2-05 | Licença: preço + histórico faturação | P2 | Licença | Média | UC-P5-06 |
| GAP-P2-06 | Balanço de época agregado | P2 | Relatórios | Média | UC-P4-07, UC-P5-05 |
| GAP-P2-07 | Ficha de atleta sénior (campos) | P2 | DB/Frontend | Média | UC-P2-02 |
| GAP-P2-08 | Upload foto + emergência + notas médicas | P2 | Full-stack | Média | UC-P1-03 |
| GAP-P2-09 | Dimensão por treinador + audit log | P2 | Backend/Analít. | Alta | UC-P4-03, UC-P4-04 |
| GAP-P2-10 | Gestão de secções (renomear/apagar) | P2 | Backend | Baixa | UC-T5-02, UC-T5-03 |
| GAP-P2-11 | Offline beira-campo (fila PWA) | P2 | Frontend/PWA | Alta | UC-T5-01 |
| GAP-P2-12 | Taxonomia táctica de exercícios | P2 | Full-stack | Média | UC-P2-05 |
| GAP-P2-13 | Modelo de Jogo ↔ exercícios | P2 | Full-stack | Média | UC-P3-11 |
| GAP-P2-14 | Ranking/total de disciplina | P2 | Analíticos | Baixa | UC-P2-11 |
| GAP-P2-15 | Autor da marcação (`marcadoPorId`) | P2 | DB/Backend | Baixa | UC-P3-04 |
| GAP-P2-16 | Reuniões na agenda | P2 | Backend | Baixa | UC-P4-09 |
| GAP-P2-17 | Índices Prisma em `Sessao` | P2 | DB | Baixa | UC-T3-01 |
| GAP-P2-18 | Hardening multi-tenancy (`clubeId`) | P2 | DB/Backend | Média | UC-T3-04 |
| GAP-P2-19 | RGPD menores (consentimento/esquecimento) | P2 | Full-stack/Legal | Alta | UC-P5-08 |
| UX-P3-01 | RPE visível em Sub-10 | P3 | Frontend | Baixa | UC-P1-07 |
| UX-P3-02 | Botões rápidos de motivo de falta | P3 | Frontend | Baixa | UC-P1-05 |
| UX-P3-03 | Exercícios/editor adequados a Sub-10 | P3 | Frontend/Conteúdo | Média | UC-P1-06 |
| UX-P3-04 | Separadores do jogo + golo 1 toque | P3 | Frontend | Média | UC-P1-08 |
| UX-P3-05 | Distinção plano vs periodização | P3 | Frontend/UX | Baixa | UC-P2-08 |
| UX-P3-06 | Duplicar exercício / favoritos | P3 | Full-stack | Baixa | UC-P2-06 |
| UX-P3-07 | Relatório de jogo estruturado | P3 | Full-stack | Média | UC-P3-12 |
| UX-P3-08 | Ocultar bloco EE em seniores | P3 | Frontend | Baixa | UC-P2-02 |
| BL-01 | Scouting histórico por adversário | BACKLOG | Full-stack | Alta | UC-P3-08 |
| BL-02 | Análise casa/fora | BACKLOG | Analíticos | Média | UC-P2-12 |
| BL-03 | Gantt de periodização | BACKLOG | Frontend | Alta | UC-P2-07 |
| BL-04 | Indicador de tendência do atleta | BACKLOG | Analíticos | Média | UC-P2-13 |
| BL-05 | Importação de calendário externo | BACKLOG | Full-stack | Alta | UC-P2-16 |

---

## Áreas por Agente de Implementação

**`bff-backend-specialist`** (Server Actions, lib/actions, validação)
- BUG-P0-01 `marcarPresencas` — check de pertença ao clube *(treinos.ts:536)*
- BUG-P0-02 `/r/[token]` — capturar erro Prisma e devolver 404 amigável
- BUG-P0-04 validação Zod de esquema/allowlist de URL *(lib/schemas/)*
- BUG-P1-01 `obterLicencaPendente` — `auth()` + derivar `clubeId` *(licenciamento.ts:94)*
- BUG-P1-06 `Math.min(...,100)` / recálculo do denominador *(analise.ts:900)*
- BUG-P1-07 excluir CAPTACAO/EVENTO do denominador de assiduidade
- BUG-P1-08 tratar erro de "Comunicações" para perfis sem contexto
- BUG-P1-10 lock optimista / deteção de conflito em treinos
- GAP-P2-10 actions `atualizarSeccao`/`apagarSeccao`
- GAP-P2-15 gravar `marcadoPorId`; GAP-P2-16 reuniões na agenda
- GAP-P2-05/06/09/14 lógica de licença/faturação, balanço agregado, métricas por treinador, ranking de disciplina

**`database-specialist`** (schema Prisma, migrations, índices, seed)
- BUG-P0-03 seed sem default público e sem log de password
- GAP-P2-07 campos de atleta sénior
- GAP-P2-08 modelo de foto/contacto emergência/notas médicas
- GAP-P2-15 coluna `marcadoPorId`; cartões/suspensões/audit log
- GAP-P2-17 índices `planoSemanalDiaId`/`planoSemanalId`
- GAP-P2-18 avaliar `clubeId` desnormalizado em Sessao/Jogo

**`frontend-specialist`** (React/Next, UI)
- GAP-P2-01 dashboards e menus por perfil (DT/presidente)
- GAP-P2-04 filtros de modalidade; GAP-P2-02 portal atleta/pai (UI)
- UX-P3-01 a UX-P3-08

**`devops-specialist`** (config/infra)
- BUG-P1-02 `remotePatterns` restritivos em `next.config.js`

**Requer autorização explícita do supervisor (Regra Sagrada Nº3):**
- BUG-P0-05 recuperação de password
- BUG-P1-05 permissão `CLUBE_UTILIZADORES` para DT
- BUG-P1-09 bloqueio efetivo de escrita para perfil só-leitura
- **Não avançar nestes três sem confirmação explícita.**

**Análise funcional / legal:**
- GAP-P2-19 RGPD menores — `functional-analyst` antes de implementar.

---

## Recomendação de Prioridade para a Próxima Sprint

| Prioridade | Item | Porquê agora | Métrica de sucesso |
|---|---|---|---|
| P0 | Cluster de segurança (BUG-P0-01 a 04) | Bloqueiam produção; expõem/corrompem dados; correções pequenas e localizadas | 0 UCs de segurança em FAIL; cross-tenant e XSS cobertos por teste; `/r/token` inválido → 404 |
| P1 | Perfis DT/presidente utilizáveis (BUG-P1-05, 08, 09 + GAP-P2-01) | Vendemos multi-perfil na spec e hoje rebenta; é o maior gap entre promessa e produto | Presidente e DT sem erros no menu; DT gere equipa técnica; só-leitura sem escrita possível |
| P1 | Integridade dos analíticos (BUG-P1-06, 07) | Números errados (>100%) destroem confiança no produto diferenciador | Taxa ≤100% sempre; CAPTACAO/EVENTO fora do denominador, com teste |
| P2 | Cartões → grelha → disciplina (BUG-P1-03/04 + GAP-P2-14) | Requisito central do treinador sénior/clube; desbloqueia suspensões | Cartões editáveis na grelha; ranking de disciplina agrega corretamente |

---

## Contagem por Categoria

| Categoria | Itens |
|---|---|
| P0 Bloqueadores | 5 |
| P1 Alta prioridade | 10 |
| P2 Gaps de funcionalidade | 19 |
| P3 UX/Usabilidade | 8 |
| BACKLOG Sugestões | 5 |
| **Total consolidado** | **47** |

*47 itens consolidados a partir de 52 UCs em FAIL/PARCIAL/OBSERVAÇÃO, com consolidação de duplicados: cartões (UC-P2-10 + UC-P3-06), multi-época (UC-P2-03 + UC-P4-08), filtro modalidade (UC-P3-09 + UC-P4-02), balanço agregado (UC-P4-07 + UC-P5-05), /r/token 500 (UC-T1-06 + UC-P5-04).*
