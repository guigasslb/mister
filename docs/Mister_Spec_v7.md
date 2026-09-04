# Mister — Especificação do Produto Final (v7)

> **Estatuto:** Bíblia do produto. Fonte única de verdade. **v7 (2026-08-19)** — sucede à `Mister_Spec_v6.md` (mantida **intacta como histórico**, à semelhança do que a v6 fez à v5) e ao `Mister_Spec_v4_MVP_historico.md` (arquivado).
> **Marca comercial:** o produto é distribuído sob a marca **Mister** (guia visual em `docs/BRAND.md`); "Mister" mantém-se como nome técnico/histórico do projeto.
> **Regra de ouro:** nenhuma alteração de código sem a atualização correspondente neste documento, no mesmo passo. Toda a modificação é registada no **changelog (secção 19)** com data e descrição. Se o código se perder, este documento tem de permitir recriar tudo do zero a 100%.
> **Convenções:** **DEVE** = obrigatório · **DEVERIA** = recomendado · **FUTURO** = fora do âmbito da versão atual do produto final.
> **Marcas de propriedade de dados:** 🏛️ = dado do **clube** (fica no clube) · 🎒 = **portátil** (pertence ao treinador e viaja com ele) — ver secção 4.
> **Marcas de modalidade:** ⚽futsal = específico de futsal · 🥅futebol = específico de futebol · 🔁comum = transversal às duas modalidades. Quando não há marca, o conteúdo é **comum** por omissão.
> **⚠️ = decisão de modelação a validar tecnicamente antes de implementar.**

---

## 0. Nota de versão v7 — Mister passa a plataforma multi-desporto

A **v7** expande o Mister de plataforma dedicada ao **futsal** para plataforma **multi-desporto (futsal + futebol)**, mantendo **um único código, um único modelo de dados multi-tenant e a mesma filosofia de produto**. Esta é uma **feature de produção final**, não um MVP — sem atalhos, todos os formatos e taxonomias do futebol entram completos.

**O que muda (resumo executivo):**

1. **Nova entidade `Secção`** (secção 3.1.1 e 20.2) — camada entre `Clube` e `Escalão`, âncora da **modalidade**. Cada `Secção` tem `clubeId` + `modalidade` (FUTSAL | FUTEBOL). Um clube pode ter secções de futsal **e** de futebol em simultâneo. `@@unique([clubeId, modalidade])` garante **uma secção por modalidade por clube**.
2. **`Escalão` ganha `seccaoId`** (secção 3.2) — cada escalão pertence a uma secção; deriva dela a sua modalidade. Migração **aditiva com backfill** (Apêndice C).
3. **Novo papel: Coordenador de Secção** (secção 6.9) — vê todos os escalões da **sua** secção, não os das outras.
4. **Onboarding transparente** (secção 8.1): a secção é **criada automaticamente** ao criar o primeiro escalão de uma modalidade — invisível para quem só usa uma modalidade.
5. **Formatos de futebol completos** (Apêndice B): `FUTSAL_5`, `FUTEBOL_3_3`, `FUTEBOL_5_5`, `FUTEBOL_7`, `FUTEBOL_9`, `FUTEBOL_11`.
6. **Taxonomia de posições de futebol** (secção 3.2): defesa central, laterais, médios (defensivo/centro/ofensivo), extremos e avançado, acrescentados ao enum `Posicao` (partilhando `GUARDA_REDES` e `UNIVERSAL`).
7. **Estatísticas de futebol** (secção 10.8): mesmo princípio do futsal — **núcleo fixo** (golos, assistências, defesas GR, remates, cantos, foras-de-jogo, desarmes) + **customizável** por cima via `MetricaConfig`. `faltas1aParte`/`faltas2aParte` só visíveis em FUTSAL.
8. **Campo de futebol SVG** (secção 11.5) — todos os formatos, no mesmo editor/formato de diagrama do futsal.
9. **Atleta multi-desporto** (secção 3.2, 9): um único `Atleta` por pessoa no clube, com participações (`AtletaEscalao`) em escalões de secções diferentes; estatísticas/caderneta segmentadas por modalidade/secção na UI.
10. **Licenciamento multi-secção** (secção 17): Individual = **uma modalidade ou a outra** (nunca as duas), preço mantém-se; Clube = **uma ou várias secções**, preço escala por secção/modalidade.
11. **Nova secção 20** — Arquitetura multi-desporto e extensibilidade (camadas agnóstica/parametrizável/específica; registry `ConfigModalidade`; como adicionar um novo desporto no futuro).
12. **Apêndices A, B, C** — Configuração de Futsal, Configuração de Futebol (todos os formatos), Matriz de migração v6→v7 (aditiva, backfill).

**O que NÃO muda:** a filosofia (secção 1.4), a propriedade/portabilidade de dados (secção 4), o esqueleto de contas/permissões (secções 5–6, exceto o novo papel), o editor de campo como diferenciador (secção 11), o sistema de design (secção 12) e o modelo de negócio "2 em 1" (secção 1.2). O **logótipo mantém-se** (decisão de produto). A terminologia FPF de futsal mantém-se **intacta**; a terminologia de futebol é **acrescentada**, não substitui.

**Princípio de compatibilidade:** todas as alterações de schema são **aditivas** (colunas/tabelas novas, nullable ou com default, mais backfill) — dados existentes (100% futsal) migram sem perda. Ver Apêndice C.

> **Pré-requisito de migração:** o schema da v6 tem fases *expand* pendentes não concluídas: `Atleta.escalaoId` (NOT NULL legado), `Atleta.clubeId` (nullable legado), `Exercicio.proprietario @default(CLUBE)` (deve ser `TREINADOR`), `Clube.clubeTecnico` (campo não existe no schema). Antes de aplicar as migrações v7, DEVE concluir-se o *contract* v6: criar `Clube.clubeTecnico Boolean @default(false)`, fixar `Atleta.clubeId` como NOT NULL, remover `Atleta.escalaoId`/`escalaoSecundarioId`/`epocaId` legados, e corrigir `Exercicio.proprietario @default(TREINADOR)`. O Apêndice C pressupõe o modelo *contracted* como ponto de partida.

---

## Índice

1. [Visão, âmbito e princípios](#1-visão-âmbito-e-princípios)
2. [Glossário e terminologia](#2-glossário-e-terminologia)
3. [Modelo de dados completo](#3-modelo-de-dados-completo)
4. [Propriedade e portabilidade de dados](#4-propriedade-e-portabilidade-de-dados)
5. [Contas, autenticação, adesão a clube e RGPD](#5-contas-autenticação-adesão-a-clube-e-rgpd)
6. [Papéis e permissões configuráveis](#6-papéis-e-permissões-configuráveis)
7. [Server Actions](#7-server-actions)
8. [Módulos funcionais](#8-módulos-funcionais)
9. [Regras de negócio transversais e casos-limite](#9-regras-de-negócio-transversais-e-casos-limite)
10. [Estatísticas e agregações](#10-estatísticas-e-agregações)
11. [Formato do diagrama de campo e animação](#11-formato-do-diagrama-de-campo-e-animação)
12. [Sistema de design](#12-sistema-de-design)
13. [Estados de UI, i18n, acessibilidade e requisitos não-funcionais](#13-estados-de-ui-i18n-acessibilidade-e-requisitos-não-funcionais)
14. [Estratégia de testes](#14-estratégia-de-testes)
15. [Stack, setup e deployment](#15-stack-setup-e-deployment)
16. [Ordem de desenvolvimento (fases)](#16-ordem-de-desenvolvimento-fases)
17. [Modelo de negócio e licenciamento](#17-modelo-de-negócio-e-licenciamento)
18. [Roadmap futuro](#18-roadmap-futuro)
19. [Changelog da documentação](#19-changelog-da-documentação)
20. [Arquitetura multi-desporto e extensibilidade](#20-arquitetura-multi-desporto-e-extensibilidade)
21. [Backoffice Interno (Admin)](#21-backoffice-interno-admin)
22. [Mano-a-Mano (duelos 1×1)](#22-mano-a-mano-duelos-11)
- [Apêndice A — Configuração de Futsal](#apêndice-a--configuração-de-futsal)
- [Apêndice B — Configuração de Futebol (todos os formatos)](#apêndice-b--configuração-de-futebol-todos-os-formatos)
- [Apêndice C — Matriz de migração v6→v7](#apêndice-c--matriz-de-migração-v6v7)

---

## 1. Visão, âmbito e princípios

### 1.1 O que é
O **Mister** (marca **Mister**) é uma aplicação **web (PWA)** de gestão de treino e de clube dedicada ao **desporto de formação** — **futsal e futebol** —, em português de Portugal. Permite a um treinador planear e conduzir a época — plantel, periodização, treinos, exercícios com diagramas de campo animados, presenças, jogos com estatísticas, convocatórias, caderneta de desenvolvimento do atleta, modelo de jogo, scouting, comunicação com pais/staff e reuniões — e permite a um **clube** organizar várias **secções (modalidades)**, vários escalões e treinadores num único ecossistema com permissões, analytics transversais e relatórios profissionais.

> **🔁 Nota de modalidade (v7):** onde a v6 dizia "dedicada ao futsal", a v7 mantém o rigor específico do futsal **e** acrescenta o futebol com a mesma seriedade (dimensões de campo corretas, formatos 3×3 a 11×11, posições e estatísticas próprias). A modalidade é ancorada pela **Secção** (secção 3.1.1). Um treinador ou clube que só use futsal **não vê nenhuma complexidade nova** — a modalidade futsal é o comportamento por omissão.

### 1.2 O modelo "2 em 1" (posicionamento central)
O produto funciona a dois níveis, com o mesmo código e o **mesmo modelo de dados multi-tenant**:
- **Individual (licença de treinador):** um treinador usa-o sozinho, com a sua conta e o seu portfólio de trabalho. **Sem qualquer UI ou funcionalidade de gestão de clube.** Tecnicamente, um treinador individual é o único membro de um **clube técnico invisível** (ver 1.2.1 e secção 5). **🔁 v7:** a licença Individual dá acesso a **uma** modalidade (futsal **ou** futebol), à escolha — nunca às duas em simultâneo (secção 17.1).
- **Clube (ecossistema, licença de clube):** um clube tem uma ou várias **secções** (futsal e/ou futebol), com vários escalões e treinadores, dados partilhados, permissões por papel, branding, analytics de clube e relatórios.

Esta dualidade é a vantagem competitiva. O concorrente de referência (**Dossier do Treinador**) é **apenas individual** (uma equipa por conta, sem partilha editável entre contas). O Mister é individual **e** plataforma de clube — **e agora multi-desporto**.

#### 1.2.1 Multi-tenant único (decisão 2026-08-05)
O **`Clube` é sempre o tenant de topo**, mesmo na licença Individual. Consequências:
- **DEVE:** ao registar-se ou comprar licença Individual, é criado automaticamente um **clube técnico** (`Clube.clubeTecnico = true`) com o treinador como único membro (perfil Administrador). Este clube é **invisível ao utilizador**: não há UI de gestão de clube, branding, membros, perfis, nem escalões partilhados no modo Individual.
- **DEVE:** toda a operação corre sempre num contexto de clube resolvido no servidor (elimina o caso "sem clube"), simplificando queries e permissões.
- **DEVE:** a conta é **única por email pessoal**. Ao longo do tempo pode estar em modo Individual (clube técnico) ou vinculada a um clube real (membro com papel). A transição entre modos é suportada (secção 5.3).
- **🔁 DEVE (v7):** a **modalidade** é sempre resolvida a partir da **Secção** do escalão em contexto (secção 3.1.1, 20.2). No clube técnico Individual existe **uma única secção**, da modalidade escolhida na compra.

### 1.3 Estratégia de venda
- Venda **individual** (licença de treinador): **€4,99/mês** ou **€49/ano**, para **uma** modalidade. Sem trial, sem freemium — compra directa.
- Venda **por clube** (licença de ecossistema, tiers por nº de escalões — ver secção 17): o espaço do clube com secções, escalões, permissões, branding, analytics e relatórios. **🔁 v7:** o preço **escala por secção/modalidade** (secção 17.1).
- Percurso típico: o treinador usa individualmente → demonstra ao clube → o clube adere (o treinador é **absorvido**, com crédito proporcional para carteira — secção 17.4). Se o clube não aderir, o treinador continua a usar individualmente. Se sair do clube, reativa a licença Individual por conta própria.
- **Go-to-market:** vídeo demonstrativo público; reunião de demonstração a pedido para clubes; primeiros clubes como **parceiros fundadores** (patrocínio mútuo, visibilidade cruzada, referência comercial); suporte via **WhatsApp** para utilizadores individuais.

### 1.4 Princípios de design (inquebráveis)
1. **Útil primeiro, mas visualmente e experiencialmente interessante.** Cada esforço pedido ao treinador devolve algo visual e satisfatório (marcar presenças → ver a taxa subir; registar um golo → ver o gráfico crescer; desbloquear uma habilidade → celebração).
2. **Valor acumulado sem trabalho extra.** Os dados entram naturalmente pelo uso quotidiano (presenças, sessões, jogos, stats); a app transforma-os em analytics e relatórios automaticamente. **Analytics é um pilar** (secção 10).
3. **O mais barato possível de operar.** Sem custos recorrentes de IA no núcleo. Só alojamento + base de dados + storage. A IA fica fora do núcleo (quando muito, plugin pago futuro).
4. **Desporto a sério, não adaptações.** ⚽ **Futsal a sério** (não futebol adaptado): campo com dimensões corretas, terminologia FPF, estatísticas específicas (faltas acumuladas por parte, rotações/quintetos, power play/GR-jogador, tempos de jogo por blocos). 🥅 **Futebol a sério** (não futsal esticado): campo e formatos corretos (3×3 a 11×11), posições próprias, estatísticas próprias (remates, cantos, foras-de-jogo, desarmes), **sem** as regras específicas de futsal (faltas acumuladas por parte não se aplicam).
5. **Beira-campo real:** o "modo jornada" tem de funcionar com rede fraca (PWA + offline) e poucos toques.
6. **Desenvolvimento do atleta como alma:** a caderneta e o tracking de evolução por jogador são o coração emocional e o argumento de venda aos pais.
7. **O editor de campo é um diferenciador central** (interativo, com animações) — a sua qualidade e validação são prioritárias antes de escalar a biblioteca. Serve **futsal e futebol** (secção 11.5).
8. **Português de Portugal**, terminologia do glossário (secção 2).
9. **Documentação sempre atualizada** (regra de ouro no topo).

### 1.5 Âmbito da versão atual do produto final
**Incluído (núcleo — uso prático do treinador + equipa técnica + ecossistema de clube):**
- Esqueleto multi-tenant: utilizador independente (clube técnico) + adesão a clube + propriedade de dados + RGPD + permissões configuráveis com overrides + branding do clube.
- **🔁 Multi-desporto:** **Secções** por modalidade (futsal/futebol); escalões dentro de secções; papel de **Coordenador de Secção**; onboarding transparente (secção criada ao criar o primeiro escalão da modalidade).
- **Licenciamento:** licença Individual (uma modalidade) e de Clube (uma ou várias secções; tiers por nº de escalões), carteira/crédito de absorção, arquitetura pronta para **billing Paddle** (implementação de billing deferida — secção 17).
- Plantel/atletas ao **nível do clube** com relação **N-N atleta↔escalão** (histórico, transições, número por escalão) — **agora multi-desporto** (um atleta pode participar em escalões de secções diferentes) · Escalões (ligados a secções) · Épocas.
- Exercícios: **editor de campo interativo + animação (A→B)** — **futsal e futebol** — + **duas bibliotecas** (pessoal portátil + do clube) + biblioteca curada de exemplo (por parte do treino/objetivo/escalão/**modalidade**).
- **Templates de sessão** (sessões completas pré-construídas, curadas e do treinador/clube).
- Treinos: sessões + notas de treino + presenças (**lesões como motivo de falta**).
- **Periodização:** planos semanais e mensais (microciclos/mesociclos).
- **Modelo de jogo** (documento vivo por clube/escalão/época) + **bolas paradas** + quadro tático por jogo (reutiliza o editor de campo).
- Jogos (amigável/competição): convocatória + estatísticas (**futsal e futebol**) + **tempos de jogo por blocos** + **registo ao vivo ou pós-jogo** + relatório + vídeo por link YouTube + **vista de dia de jogo** + **scouting do adversário no próprio jogo**.
- **Calendário + competições + tabelas de classificação** (a partir de resultados inseridos manualmente).
- **Comunicação (gerador de conteúdo para WhatsApp)** + **reuniões** (escalão/clube, ata exposta) + **sincronização Google Calendar**.
- **Caderneta de habilidades.**
- **Analytics em 3 níveis (atleta/equipa/clube)** — com **filtro por secção/modalidade** — e **relatório de fim de época partilhável** (PDF + vista web com link, sem IA).
- **Relatórios PDF** profissionais.
- **Onboarding com vitória rápida** (criação em massa do plantel, primeira sessão de template, primeira convocatória).
- **Dashboard contextual** (centro de comando temporal) + secção "atenção necessária".
- **Lembretes / to-dos** (pessoais e de equipa, com deadline, integrados no dashboard).
- **Design direction** (secção 12): tema escuro como base, cor do clube como identidade, **motion como linguagem**, empty states desenhados.

**FUTURO (fora da versão atual):** ver secção 18. Nota importante: o **portal de pais/atletas** continua FUTURO; o que entra é apenas o **gerador de conteúdo para WhatsApp** (os pais não têm conta na app).

### 1.6 Anti-âmbito (decisões conscientes)
- **Sem IA no núcleo** (custo).
- **Sem armazenamento de vídeo** (só links YouTube).
- **Sem app nativa/APK** — a PWA cobre Android e iOS; APK só como embrulho fino (TWA/Capacitor) no futuro.
- **Sem quotas/mensalidades do clube** (o clube a cobrar aos pais).
- **Sem multi-idioma/multi-moeda** (mercado PT primeiro).
- **Conformidade FPF** (Modelo 2 e documentos federativos) está **no âmbito**, mas a implementação depende de **levantamento dos requisitos exatos da FPF** (secção 8/16). **🔁 v7:** o levantamento deve cobrir os documentos federativos de **futsal e de futebol**.
- **🔁 v7 — Anti-âmbito multi-desporto:** **não** há desportos além de futsal e futebol nesta versão (a arquitetura fica preparada para os acrescentar — secção 20.4, mas nenhum outro entra agora); **não** há regras de arbitragem automáticas nem bloqueio de substituições (o registo é informativo — amigáveis de formação não têm regras fixas de substituições).

### 1.7 Multi-desporto (posicionamento e princípios — decisão 2026-08-19)
> Esta secção fixa os princípios que governam toda a expansão multi-desporto. É **prescritiva**.

**1.7.1 A modalidade vive na Secção.** A `Secção` (secção 3.1.1) é a **âncora da modalidade** — tudo o que precisa de saber "isto é futsal ou futebol?" resolve-o subindo do escalão para a secção. Não há campo `modalidade` disperso por atletas, jogos ou exercícios: deriva-se **sempre** da secção do escalão em contexto. Isto evita inconsistências e mantém o modelo limpo (secção 20.1).

**1.7.2 Um clube, várias modalidades.** Um clube pode ter **secções de FUTSAL e de FUTEBOL em simultâneo** (`@@unique([clubeId, modalidade])` — no máximo uma por modalidade). Cada secção é um universo visual e organizacional próprio: "Benjamins Futsal" e "Benjamins Futebol" nunca se confundem porque vivem em secções separadas (secção 8.1.1).

**1.7.3 Uma pessoa, um atleta.** Há **um único `Atleta` por pessoa** no clube, independentemente de quantas modalidades pratica. O mesmo miúdo pode ter participações (`AtletaEscalao`) em "Benjamins Futsal" e "Benjamins Futebol" — dados pessoais partilhados, estatísticas e caderneta **segmentadas por modalidade/secção** na UI (secção 9, 10.8).

**1.7.4 Individual = uma modalidade.** A licença Individual dá acesso a **uma** modalidade (a escolhida na compra). Não é possível gerir futsal e futebol na mesma licença Individual — para isso existe a licença de Clube com múltiplas secções (secção 17.1).

> **Treinador individual e duas modalidades:** a licença Individual suporta uma única modalidade. Um treinador que dirija escalões de futsal e de futebol em simultâneo DEVE usar uma licença de Clube (ou Clube Técnico). Esta decisão é intencional: a gestão de duas secções implica funcionalidades de coordenação (permissões, analytics cruzados) que a licença Individual não comporta. A persona do treinador dual-sport individual é reconhecida e o seu caminho natural é o Clube Técnico (sem atletas, só escalões do próprio treinador).

**1.7.5 Transparência para quem não precisa.** Um treinador ou clube que só faça uma modalidade **não vê complexidade nova**: a secção é criada automaticamente ao criar o primeiro escalão (secção 8.1.1) e a UI não mostra seletor de secção quando só existe uma. A camada multi-desporto é **invisível por omissão** e **explícita só quando há mais do que uma secção**.

**1.7.6 Três camadas de conhecimento de modalidade** (detalhe em 20.1):
- **Agnóstica** — não sabe nada de modalidade (contas, permissões, épocas, presenças, comunicação, caderneta, lembretes, reuniões).
- **Parametrizável** — comporta-se conforme a modalidade via configuração (estatísticas, posições, formato de jogo, campo do editor, biblioteca curada).
- **Específica** — regras que só existem numa modalidade (faltas acumuladas por parte e power play só em futsal; foras-de-jogo e cantos como núcleo em futebol).

---

## 2. Glossário e terminologia

Interface 100% em **português de Portugal**, terminologia FPF (futsal e futebol). Usar sempre estes termos (não sinónimos).

### 2.1 Termos comuns (transversais às modalidades) 🔁

**Organização**
- **Clube** — a organização (ecossistema). Tem **secções**, escalões, membros, épocas, branding. No modo Individual é um **clube técnico** invisível.
- **Clube técnico** — clube automático de 1 membro que suporta a licença Individual (invisível ao utilizador).
- **Ecossistema** — o espaço partilhado do clube (várias secções/escalões/treinadores com permissões).
- **Secção** — 🔁 **(novo v7)** subdivisão do clube por **modalidade** (Futsal ou Futebol). É a **âncora da modalidade**; contém escalões e coordenadores. Um clube tem no máximo **uma secção por modalidade**. Criada automaticamente ao criar o primeiro escalão da modalidade.
- **Modalidade** — 🔁 **(novo v7)** o desporto de uma secção: **FUTSAL** ou **FUTEBOL**.
- **Escalão** — grupo etário/nível (Petizes, Traquinas, Benjamins, Infantis, Iniciados, Juvenis, Juniores, Séniores). Pertence a uma **secção** (logo, a uma modalidade). É a "equipa" na prática.
- **Época** — ano desportivo (ex: "2026/27"). Uma ativa de cada vez por clube.
- **Membro** — utilizador ligado a um clube com um perfil.
- **Perfil** — pacote configurável de permissões (capacidades + âmbito).
- **Override de capacidade** — capacidade concedida ou revogada a um membro específico, independentemente do seu perfil (secção 6).
- **Coordenador de Secção** — 🔁 **(novo v7)** membro que coordena **uma secção**: vê e gere todos os escalões dessa secção, não os das outras secções (secção 6.9).

**Licenciamento**
- **Licença** — direito de uso pago: **Individual** (treinador, **uma modalidade**) ou **Clube** (ecossistema, **uma ou várias secções**).
- **Tier** — escalão comercial da licença de clube por nº de escalões (Pequeno/Médio/Grande/Parceiro).
- **Carteira** — saldo de crédito da conta do treinador (resulta de absorção por clube; usado em compras futuras).
- **Absorção** — quando um treinador Individual passa a membro de um clube; o tempo restante da sua licença converte-se em crédito de carteira.
- **Parceiro fundador** — clube inicial com acordo de patrocínio mútuo e voz no roadmap.

**Pessoas**
- **Atleta** — jogador que pertence ao **clube** (não à época, nem ao treinador, nem à modalidade). Participa em um ou mais escalões — **de secções/modalidades potencialmente diferentes** — via **participação de escalão**.
- **Participação de escalão (`AtletaEscalao`)** — vínculo atleta↔escalão numa época, com **tipo** (Principal/Simultânea/Ocasional), **estado** (Ativo/Transição permanente/Inativo), **número de camisola** e datas. A modalidade da participação deriva da secção do escalão.
- **Plantel** — conjunto de atletas com participação ativa num escalão numa época.
- **Administrador / Diretor Técnico / Coordenador de Secção / Treinador (Principal/Adjunto)** — papéis de arranque (perfis).
- **Encarregado de educação** — responsável legal do atleta menor (RGPD).

**Treino**
- **Sessão** — uma sessão de treino (data, objetivo, exercícios, presenças). Pertence a um escalão (logo, a uma modalidade).
- **Template de sessão (`ModeloSessao`)** — sessão completa pré-construída e reutilizável (curada pela equipa Mister ou criada pelo treinador/clube).
- **Exercício** — unidade de treino, com diagrama de campo opcional (estático ou animado). O campo do diagrama adapta-se à modalidade (secção 11.5).
- **Biblioteca pessoal (🎒)** — exercícios/templates do treinador, portáteis.
- **Biblioteca do clube (🏛️)** — exercícios/templates partilhados no clube.
- **Parte do treino** — Aquecimento / Parte principal / Jogo - campo inteiro/reduzido / Retorno à calma.
- **Semana (de trabalho)** — unidade de planeamento semanal **exposta ao utilizador** (o termo técnico **Microciclo** é interno e não aparece na UI). O agrupamento de sessões por semana é **automático pela data**; formalizar uma semana (nome, modo) é **opcional**. Ver 8.9.
- **Modo de semana** — forma de detalhar uma semana formalizada: **Estruturado** (dias marcados por relação com o jogo — MD-X) ou **Texto livre** (campo aberto). Ver 8.9.
- **Semana-tipo** — estrutura/metodologia de uma semana reutilizável como **template** (🎒 portátil quando criada pelo treinador). Ver 3.5 / 8.9.
- **Microciclo** — termo técnico **interno** para semana de treino (não exposto na UI; ver «Semana»). **Mesociclo** — bloco de semanas; campo **opcional**, **visível no formulário de planeamento**. **Período** — Preparatório / Competitivo / Transição.
- **Periodização** — planeamento por ciclos (semanal/mensal).
- **Presença** — estado do atleta numa sessão (Presente, Falta, Falta justificada, Lesionado, Atrasado), com **motivo de falta** (Lesão/Doença/Outro/Sem justificação).

**Jogo (comum)**
- **Jogo** — encontro (Oficial ou Amigável), Casa/Fora, com um **formato** (ver "Formato de jogo").
- **Formato de jogo (`FormatoJogo`)** — 🔁 **(novo v7)** número de jogadores por equipa: **FUTSAL_5** (futsal); **FUTEBOL_3_3**, **FUTEBOL_5_5**, **FUTEBOL_7**, **FUTEBOL_9**, **FUTEBOL_11** (futebol). Determina o campo do editor e a interpretação de algumas estatísticas.
- **Convocatória** — atletas convocados para um jogo (com posição prevista para a vista de dia de jogo).
- **Vista de dia de jogo** — ecrã dedicado ao dia do jogo (convocados + posições, scouting, bolas paradas, hora e local).
- **Utilização** — Titular / Utilizado / Não utilizado.
- **Bloco de tempo** — unidade de tempo de jogo (Jogo completo / Meia-parte / 10 min / 5 min); alternativa ao minuto-a-minuto.
- **Modelo de jogo** — documento vivo da identidade tática da equipa (princípios/subprincípios por momento, incluindo bolas paradas). **Quadro tático** — esquema tático de um jogo específico.
- **Bola parada** — esquema de canto/livre/lançamento, criado no editor (vive na biblioteca e no modelo de jogo).
- **Scouting / Observação do adversário** — informação sobre o adversário, criada no contexto do jogo.
- **Competição** — prova; gera **classificação** a partir dos resultados **inseridos manualmente** pelo treinador (todos os jogos de todas as equipas). Integração automática com competições oficiais = FUTURO.

**Comunicação**
- **Template de comunicação** — texto formatado gerado pela app para partilhar no WhatsApp (convocatória, cancelamento, mudança de horário/local, resultado, aviso geral, calendário).
- **Reunião** — encontro de escalão/clube com ata exposta; calendarizável (Google Calendar).
- **Lembrete / tarefa (`Lembrete`)** — item de to-do ligado ao contexto da equipa: **pessoal** (só o próprio vê) ou de **equipa** (DT/Admin atribui a treinadores específicos ou a toda a equipa técnica), com deadline opcional; aparece no dashboard dos destinatários.

**Desenvolvimento e análise**
- **Caderneta** — sistema de habilidades que o atleta desbloqueia ao longo da época.
- **Habilidade** — "move" técnico, por nível (Básico/Intermédio/Avançado).
- **Analytics** — três níveis: **atleta**, **equipa**, **clube (transversal)** — com filtro por **secção/modalidade** e por escalão.
- **Relatório de fim de época** — síntese por equipa/atleta/clube, a partir dos dados; exportável em PDF e partilhável por link web.

**Dados**
- **Portátil (🎒)** — dado que pertence ao treinador e viaja com ele.
- **Do clube (🏛️)** — dado que fica no clube quando o treinador sai.
- **Snapshot** — cópia só-de-leitura que o clube retém de conteúdo do treinador usado em sessões.

### 2.2 Bloco Futsal ⚽ (terminologia específica)
- **Futsal** — modalidade de 5×5 em pavilhão, campo 40×20 m (`FormatoJogo = FUTSAL_5`).
- **Quinteto** — os 5 jogadores em campo. **Rotação** — trocas constantes.
- **Faltas acumuladas** — faltas da equipa **por parte**; à 5.ª, livre sem barreira (10 m). **Só existe em futsal** (`Jogo.faltas1aParte`/`faltas2aParte`).
- **Power play / GR-jogador** — guarda-redes a jogar como 5.º jogador de campo. Conceito específico de futsal.
- **Posições de futsal** — **Guarda-redes**, **Fixo**, **Ala**, **Pivô**, **Universal**.
- **Segunda penalidade** — marca dos 10 m (característica do futsal). **Marca de grande penalidade** — 6 m.

### 2.3 Bloco Futebol 🥅 (terminologia específica)
- **Futebol** — modalidade de campo, em vários **formatos** por escalão etário: **3×3** (petizes), **5×5** (traquinas / petizes mais velhos), **7** (Benjamins, Sub-10/11), **9** (Infantis/Iniciados, Sub-12/13), **11** (Juvenis, Sub-15/17; Juniores, Sub-19; Seniores).
- **Formatos** — `FUTEBOL_3_3`, `FUTEBOL_5_5`, `FUTEBOL_7`, `FUTEBOL_9`, `FUTEBOL_11` (ver Apêndice B para dimensões).
- **Posições de futebol** — **Guarda-redes**, **Defesa central**, **Lateral direito**, **Lateral esquerdo**, **Médio defensivo**, **Médio centro**, **Médio ofensivo**, **Extremo direito**, **Extremo esquerdo**, **Avançado** (mais **Universal**, partilhado). Ver secção 3.2.
- **Estatísticas de futebol (núcleo fixo)** — golos, assistências, defesas (GR), **remates**, **cantos**, **foras-de-jogo**, **desarmes** (secção 10.8).
- **Fora-de-jogo** — situação regulamentar do futebol (não existe em futsal); registada como estatística de núcleo.
- **Canto (pontapé de canto)** — reposição de bola pela linha de fundo; núcleo estatístico de futebol.
- **Desarme** — recuperação defensiva de bola; núcleo estatístico de futebol.
- **Sem faltas acumuladas por parte** — as regras de faltas acumuladas do futsal **não se aplicam** em futebol (campos `faltas1aParte`/`faltas2aParte` ocultos na UI de futebol — secção 8.11, 10.8).

## 3. Modelo de dados completo

Stack de persistência: **Prisma + PostgreSQL (Supabase)**. Todos os `id` são `cuid`. Todas as datas são `DateTime`. Convenção de propriedade: 🏛️ clube · 🎒 portátil (treinador). Marcas de modalidade: ⚽ futsal · 🥅 futebol · 🔁 comum.

> **Nota:** este é o modelo-alvo do produto final. Decisões ainda **a validar tecnicamente** estão marcadas com ⚠️. As alterações da v7 (Secção, `seccaoId` no escalão, formatos e posições de futebol, estatísticas de futebol) são **aditivas** (Apêndice C) e correspondem às fases 25–30 (secção 16).

### 3.1 Contas, clube e permissões (o esqueleto)

```prisma
// 🎒 Existe independentemente de qualquer clube real. Suporta o modo individual (via clube técnico) e a portabilidade.
model Utilizador {
  id           String   @id @default(cuid())
  nome         String
  email        String   @unique
  passwordHash String
  telefone     String?
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  membros         MembroClube[]      // adesões a clubes (inclui o clube técnico)
  exercicios      Exercicio[]        // 🎒 biblioteca pessoal (autor)
  modelosSessao   ModeloSessao[]     // 🎒 templates de sessão (autor)
  modelosJogo     ModeloJogo[]       // 🎒 modelos de jogo (autor)
  registoCarreira RegistoCarreira[]  // 🎒 histórico de carreira portátil
  licencaIndividual Licenca?         @relation("LicencaIndividual") // licença Individual (se ativa)
  carteira        Carteira?          // 🎒 saldo de crédito
}

// 🏛️ O ecossistema. No modo Individual é um clube técnico invisível (clubeTecnico=true).
model Clube {
  id            String   @id @default(cuid())
  nome          String
  clubeTecnico  Boolean  @default(false) // true = clube invisível que suporta a licença Individual
  corPrimaria   String   @default("#F0531E")
  corSecundaria String   @default("#FFD700")
  logoUrl       String?  // ficheiro no Supabase Storage
  morada        String?
  email         String?
  telefone      String?
  criadoEm      DateTime @default(now())

  membros         MembroClube[]
  perfis          Perfil[]
  epocas          Epoca[]
  seccoes         Seccao[]              // 🔁 v7: secções (modalidades) do clube
  escaloes        Escalao[]
  atletas         Atleta[]              // atletas pertencem ao clube (não à época nem à modalidade)
  habilidades     Habilidade[]
  metricas        MetricaConfig[]
  subcategorias   SubcategoriaExercicio[]
  competicoes     Competicao[]
  reunioes        Reuniao[]
  modelosComunicacao ModeloComunicacao[]
  licenca         Licenca?              @relation("LicencaClube") // licença de clube (se real)
}

// Adesão utilizador↔clube. REGRA: no máximo UMA adesão ATIVA por utilizador (um clube de cada vez).
model MembroClube {
  id            String       @id @default(cuid())
  utilizadorId  String
  utilizador    Utilizador   @relation(fields: [utilizadorId], references: [id], onDelete: Cascade)
  clubeId       String
  clube         Clube        @relation(fields: [clubeId], references: [id], onDelete: Cascade)
  perfilId      String
  perfil        Perfil       @relation(fields: [perfilId], references: [id])
  estado        EstadoMembro @default(ATIVO) // ATIVO | INATIVO | CONVIDADO
  capacidadesExtra     String[] @default([]) // concedidas além do perfil
  capacidadesRevogadas String[] @default([]) // removidas apesar do perfil
  dataEntrada   DateTime     @default(now())
  dataSaida     DateTime?

  atribuicoes AtribuicaoEscalao[]
  seccoes     MembroSeccao[]      // 🔁 v7: secções que este membro coordena (scope de secção)

  @@unique([utilizadorId, clubeId])
}

enum EstadoMembro { ATIVO INATIVO CONVIDADO }

// Perfil = pacote configurável de capacidades + âmbito. Cada clube tem os seus (com modelos de arranque editáveis).
model Perfil {
  id          String       @id @default(cuid())
  clubeId     String
  clube       Clube        @relation(fields: [clubeId], references: [id], onDelete: Cascade)
  nome        String       // ex: "Administrador", "Diretor Técnico", "Coordenador de Secção", "Treinador Principal", "Adjunto"
  descricao   String?
  ambito      AmbitoPerfil @default(PROPRIOS_ESCALOES) // TODO_CLUBE | SECCAO | PROPRIOS_ESCALOES
  capacidades String[]     // chaves de capacidade (ver secção 6)
  sistema     Boolean      @default(false) // modelo de arranque (editável, mas assinalado)
  criadoEm    DateTime     @default(now())

  membros MembroClube[]
}

// 🔁 v7: âmbito ganha o valor SECCAO (todos os escalões de uma secção).
enum AmbitoPerfil { TODO_CLUBE SECCAO PROPRIOS_ESCALOES }

// Quais escalões um membro gere/vê (âmbito PROPRIOS_ESCALOES, ou DT restringido pelo admin).
model AtribuicaoEscalao {
  id            String      @id @default(cuid())
  membroClubeId String
  membroClube   MembroClube @relation(fields: [membroClubeId], references: [id], onDelete: Cascade)
  escalaoId     String
  escalao       Escalao     @relation(fields: [escalaoId], references: [id], onDelete: Cascade)

  @@unique([membroClubeId, escalaoId])
}
```

#### 3.1.1 Secção (modalidade) e coordenação de secção — 🔁 novo v7

> A `Secção` é a **âncora da modalidade** (secções 1.7.1, 20.2). Cada escalão pertence a uma secção; a modalidade de tudo o resto deriva daí. Um clube tem **no máximo uma secção por modalidade** (`@@unique([clubeId, modalidade])`). Criada **automaticamente** ao criar o primeiro escalão da modalidade (secção 8.1.1) — transparente para quem não precisa.

```prisma
// 🔁 v7: subdivisão do clube por modalidade. Contém escalões e coordenadores.
model Seccao {
  id         String     @id @default(cuid())
  clubeId    String
  clube      Clube      @relation(fields: [clubeId], references: [id], onDelete: Cascade)
  modalidade Modalidade                 // FUTSAL | FUTEBOL
  nome       String?                    // "Futsal" | "Futebol" | nome custom do clube
  escaloes   Escalao[]
  membros    MembroSeccao[]             // coordenadores e outros com scope de secção
  criadoEm   DateTime   @default(now())

  @@unique([clubeId, modalidade])       // um clube tem no máximo UMA secção por modalidade
  @@index([clubeId])
}

// 🔁 v7: a modalidade de uma secção.
enum Modalidade { FUTSAL FUTEBOL }

// 🔁 v7: vínculo membro↔secção com scope de coordenação (papel de Coordenador de Secção — §6.9).
model MembroSeccao {
  id            String      @id @default(cuid())
  seccaoId      String
  seccao        Seccao      @relation(fields: [seccaoId], references: [id], onDelete: Cascade)
  membroClubeId String
  membroClube   MembroClube @relation(fields: [membroClubeId], references: [id], onDelete: Cascade)
  papel         PapelSeccao @default(COORDENADOR)
  criadoEm      DateTime    @default(now())

  @@unique([seccaoId, membroClubeId])
  @@index([membroClubeId])
}

// 🔁 v7: papel de um membro numa secção (extensível no futuro).
enum PapelSeccao { COORDENADOR }
```

- **Regra (DEVE):** ao criar um `Escalao` numa modalidade que o clube ainda não tem, o sistema cria a `Secção` correspondente na **mesma transação** (idempotente por `@@unique([clubeId, modalidade])`).
- **Regra (DEVE):** apagar uma secção só é permitido se **não tiver escalões** (à semelhança de apagar escalão com participações — secção 8.4). A secção do clube técnico (Individual) não é apagável pela UI.
- **Nome (DEVERIA):** `nome` é opcional; *fallback* de apresentação = rótulo da modalidade ("Futsal"/"Futebol").
- **Backfill (Apêndice C):** para cada clube existente, cria-se **uma secção FUTSAL** e ligam-se-lhe todos os escalões existentes (`Escalao.seccaoId`).

### 3.2 Época, secção, escalão e atleta (🏛️ clube)

> **Alteração estrutural 2026-08-05:** o `Atleta` deixa de estar ligado a uma época/escalão diretamente. Passa a pertencer ao **clube** e a participar em escalões via **`AtletaEscalao`** (relação N-N com histórico). O **número de camisola** passa para a participação.
> **🔁 Alteração v7:** o `Escalão` ganha **`seccaoId`** (pertence a uma secção → a uma modalidade). O `Atleta` é **multi-desporto**: um único atleta pode participar em escalões de secções diferentes (ex.: Benjamins Futsal e Benjamins Futebol).

```prisma
model Epoca {
  id         String   @id @default(cuid())
  clubeId    String
  clube      Clube    @relation(fields: [clubeId], references: [id])
  nome       String   // "2026/27"
  dataInicio DateTime
  dataFim    DateTime
  ativa      Boolean  @default(false)
  criadoEm   DateTime @default(now())

  participacoes AtletaEscalao[]
  sessoes       Sessao[]
  jogos         Jogo[]
  progressos    ProgressoHabilidade[]
  planeamentos  Planeamento[]
  competicoes   Competicao[]
}

model Escalao {
  id                       String   @id @default(cuid())
  clubeId                  String
  clube                    Clube    @relation(fields: [clubeId], references: [id])
  // 🔁 v7: cada escalão pertence a uma secção (modalidade). Backfill aditivo (Apêndice C).
  seccaoId                 String
  seccao                   Seccao   @relation(fields: [seccaoId], references: [id])
  nome                     String   // "Benjamins"
  idadeMin                 Int?
  idadeMax                 Int?
  ordem                    Int      @default(0)
  visivelOutrosTreinadores Boolean  @default(true) // leitura por treinadores de outros escalões
  criadoEm                 DateTime @default(now())

  participacoes AtletaEscalao[]
  sessoes       Sessao[]
  jogos         Jogo[]
  atribuicoes   AtribuicaoEscalao[]
  planeamentos  Planeamento[]
  competicoes   Competicao[]

  @@index([clubeId])
  @@index([seccaoId])
}

// Atleta pertence ao CLUBE (nível de clube, transversal às épocas E às modalidades — §1.7.3).
model Atleta {
  id                  String    @id @default(cuid())
  clubeId             String
  clube               Clube     @relation(fields: [clubeId], references: [id])
  nome                String
  dataNascimento      DateTime?
  posicoes            Posicao[] // um atleta pode ter VÁRIAS posições (futsal e/ou futebol)
  observacoes         String?
  fotoUrl             String?   // por URL (upload Supabase é follow-up)
  ativo               Boolean   @default(true) // estado no plantel: ativo vs saiu/experimental (§8.5) + soft delete
  inscrito            Boolean   @default(false) // inscrição federativa/no clube (§8.5); independente de `ativo`
  dataIngresso        DateTime? // para taxa de presença (secção 10); default = criadoEm
  // Encarregado de educação (RGPD — minimização)
  encarregadoNome     String?
  encarregadoContacto String?
  encarregadoEmail    String?
  criadoEm            DateTime  @default(now())
  atualizadoEm        DateTime  @updatedAt

  escaloes       AtletaEscalao[]     // participações (N-N com histórico), possivelmente em modalidades diferentes
  presencas      Presenca[]
  convocatorias  Convocatoria[]
  estatisticas   EstatisticaAtleta[]
  progressos     ProgressoHabilidade[]
  consentimentos Consentimento[]

  @@index([clubeId])
  @@index([clubeId, ativo])
}

// Participação de um atleta num escalão numa época (N-N com histórico e transições).
// A MODALIDADE da participação deriva de escalao.seccao.modalidade (não é campo próprio — §1.7.1).
model AtletaEscalao {
  id         String             @id @default(cuid())
  atletaId   String
  atleta     Atleta             @relation(fields: [atletaId], references: [id], onDelete: Cascade)
  escalaoId  String
  escalao    Escalao            @relation(fields: [escalaoId], references: [id])
  epocaId    String
  epoca      Epoca              @relation(fields: [epocaId], references: [id])
  tipo       TipoParticipacao   @default(PRINCIPAL)   // PRINCIPAL | SIMULTANEA | OCASIONAL
  estado     EstadoParticipacao @default(ATIVO)       // ATIVO | TRANSICAO_PERMANENTE | INATIVO
  numero     Int?               // número de camisola NESTE escalão
  dataInicio DateTime           @default(now())
  dataFim    DateTime?
  criadoEm   DateTime           @default(now())

  @@unique([atletaId, escalaoId, epocaId])
  @@index([escalaoId, epocaId, estado])
  @@index([epocaId])
}

// Um atleta tem SEMPRE uma participação PRINCIPAL por época POR MODALIDADE em que atua.
// 🔁 v7: o invariante "principal único" é POR (atleta, época, modalidade) — um atleta pode ter
//   um principal em futsal E um principal em futebol na mesma época (§9). Pode ter N
//   participações adicionais (SIMULTANEA/OCASIONAL). A transição permanente muda o principal.
enum TipoParticipacao { PRINCIPAL SIMULTANEA OCASIONAL }
enum EstadoParticipacao { ATIVO TRANSICAO_PERMANENTE INATIVO }

// 🔁 v7: posições de FUTSAL + FUTEBOL num único enum. GUARDA_REDES e UNIVERSAL são partilhados.
enum Posicao {
  // Partilhados (futsal + futebol)
  GUARDA_REDES
  UNIVERSAL
  // Futsal ⚽
  FIXO
  ALA
  PIVO
  // Futebol 🥅
  DEFESA_CENTRAL
  LATERAL_DIREITO
  LATERAL_ESQUERDO
  MEDIO_DEFENSIVO
  MEDIO_CENTRO
  MEDIO_OFENSIVO
  EXTREMO_DIREITO
  EXTREMO_ESQUERDO
  AVANCADO
}
```

> **🔁 UI de posições (DEVE):** o seletor de posições filtra as opções pela **modalidade da secção** em contexto — futsal mostra {GR, Fixo, Ala, Pivô, Universal}; futebol mostra {GR, Defesa central, Laterais, Médios, Extremos, Avançado, Universal}. Como um atleta multi-desporto pode ter posições de ambas as modalidades, o perfil do atleta guarda todas em `Atleta.posicoes`; cada contexto (jogo/plantel) mostra as relevantes à sua modalidade. Rótulos pt-PT em `LABEL_POSICAO` (secção 12/UI), agrupados por modalidade.

### 3.3 Exercícios, diagramas e bibliotecas (🎒 pessoal / 🏛️ clube)

Cada treinador tem uma **biblioteca pessoal** (portátil, sempre dele). Pode **contribuir deliberadamente** para a **biblioteca do clube** (gesto explícito — toggle na criação). A propriedade (`proprietario`) é **decidida pelo treinador no momento da criação** via toggle — **não** por quem paga a licença (ver secção 4.2): **pessoal** (default) → `TREINADOR`; **clube** → `CLUBE`. `autorId` regista sempre quem criou.

> **🔁 Modalidade do exercício (v7 — DEVE):** um exercício ganha o campo opcional **`modalidade Modalidade?`** para filtragem da biblioteca (futsal vs futebol). Nullable = **genérico** (aplicável a ambas as modalidades — ex.: exercícios físicos, de finalização genérica). O campo do diagrama adapta-se à modalidade do exercício (ou mostra campo neutro se genérico) — secção 11.5. Este campo é **de organização/filtro** (não substitui a derivação por secção quando o exercício é usado numa sessão de um escalão concreto).

> **🔁 Visibilidade da biblioteca pessoal (v7 — DEVE, decisão 2026-08-26):** um exercício **pessoal** (`proprietario = TREINADOR`) é visível ao **autor** e a **qualquer treinador do clube que partilhe pelo menos um escalão** com o autor (via atribuições de escalão — `AtribuicaoEscalao`/`escaloesLegiveis`). Exemplo: se A e B treinam ambos os Benjamins, os exercícios pessoais de A são visíveis a B (e vice-versa); C, que só treina os Iniciados, **não** vê os exercícios pessoais de A nem de B — a não ser que também passe a treinar os Benjamins. Um exercício visível por partilha de escalão é **só-de-leitura** para quem não é o autor (pode ser **duplicado**, nunca editado — a edição do master é sempre do autor). A **propriedade e a portabilidade não mudam**: o exercício continua `TREINADOR` e viaja sempre com o autor (secção 4.2) — esta regra afeta apenas **quem o vê**, não quem o possui. Exercícios de propriedade **`CLUBE`** mantêm-se visíveis a **toda a equipa técnica** do clube.

```prisma
model Exercicio {
  id             String              @id @default(cuid())
  autorId        String
  autor          Utilizador          @relation(fields: [autorId], references: [id])
  proprietario   PropriedadeConteudo @default(TREINADOR) // CLUBE | TREINADOR (toggle na criação; default pessoal)
  clubeProprietarioId String?        // preenchido quando proprietario = CLUBE (biblioteca do clube)
  modalidade     Modalidade?         // 🔁 v7: FUTSAL | FUTEBOL | null = genérico (ambas)
  nome           String
  descricao      String?
  objetivo       String?
  duracaoMin     Int?
  parteTreino    ParteTreino?        // AQUECIMENTO | PRINCIPAL | JOGO_REDUZIDO | RETORNO_CALMA
  categoriaPrincipal CategoriaExercicioPrincipal?
  subcategoriaId String?
  subcategoria   SubcategoriaExercicio? @relation(fields: [subcategoriaId], references: [id])
  escalaoAlvo    String?             // faixa etária/escalão sugerido (texto: "sub-10")
  numeroJogadores String?            // 🔁 nº de jogadores envolvidos (texto livre: "4+GR", "3x3+GR", "Todos", "8"); opcional
  espaco         String?             // 🔁 espaço/dimensões do exercício (texto livre: "campo inteiro", "meio-campo", "20x20m"); opcional
  diagrama       Json?               // DiagramaCampo v2 (com passos/animação) — secção 11
  origemSeed     Boolean @default(false) // exercício da biblioteca curada de arranque
  criadoEm       DateTime @default(now())
  atualizadoEm   DateTime @updatedAt

  partilhas PartilhaExercicioClube[]
  sessoes   SessaoExercicio[]
  modelosSessao ModeloSessaoExercicio[]
}

enum ParteTreino { AQUECIMENTO PRINCIPAL JOGO_REDUZIDO RETORNO_CALMA }
enum PropriedadeConteudo { CLUBE TREINADOR }
enum CategoriaExercicioPrincipal {
  ATAQUE DEFESA TRANSICAO BOLAS_PARADAS FISICO GUARDA_REDES OUTRO
}

model SubcategoriaExercicio {
  id        String                      @id @default(cuid())
  clubeId   String
  clube     Clube                       @relation(fields: [clubeId], references: [id], onDelete: Cascade)
  nome      String
  categoria CategoriaExercicioPrincipal
  ordem     Int                         @default(0)
  sistema   Boolean                     @default(false)
  criadoEm  DateTime                    @default(now())

  exercicios Exercicio[]

  @@index([clubeId, categoria])
}

model PartilhaExercicioClube {
  id          String    @id @default(cuid())
  exercicioId String
  exercicio   Exercicio @relation(fields: [exercicioId], references: [id], onDelete: Cascade)
  clubeId     String
  criadoEm    DateTime  @default(now())

  @@unique([exercicioId, clubeId])
}
```
**Preservação de histórico:** quando um exercício **do treinador** (`proprietario = TREINADOR`) é usado numa sessão do clube, o clube retém um **snapshot só-de-leitura** desse exercício (mecanismo em **4.2.1**; campos `snap*` do `SessaoExercicio`, secção 3.5).

**Duplicar (DEVE — UX-P3-06):** qualquer exercício **visível** (🎒 pessoal próprio, 🎒 pessoal de um treinador com quem partilha ≥1 escalão — §3.3 — ou 🏛️ da biblioteca do clube) pode ser duplicado via `duplicarExercicio(id)` (§7.3). A cópia é **sempre 🎒 pessoal** do utilizador que duplica (`proprietario = TREINADOR`, sem partilha no clube, `origemSeed = false`), com o nome sufixado por **" (cópia)"** — serve para partir de um exercício existente (mesmo curado ou do clube) e adaptá-lo sem alterar o original. Exige `EXERCICIOS_GERIR`.

**Favoritos (DEVERIA — UX-P3-06b):** a lista de exercícios permite marcar favoritos (⭐) e filtrar por "só favoritos". Como a entidade `Exercicio` **não** tem campo `favorito`, o estado é **local ao navegador** (`localStorage`, chave `"exercicios-favoritos"` = array de IDs), por utilizador/dispositivo, e **não** afeta a biblioteca partilhada. **FUTURO:** migrar para a BD (campo por utilizador) quando o schema o suportar.

### 3.4 Templates de sessão (🎒 pessoal / 🏛️ clube)

Sessões completas pré-construídas (aquecimento + parte principal + jogo - campo inteiro/reduzido + retorno à calma), com durações e objetivos. Curadas pela equipa Mister (seed) e criadas pelo treinador/clube. **🔁 v7:** ganham `modalidade Modalidade?` (para separar templates de futsal e de futebol na biblioteca; null = genérico).

```prisma
model ModeloSessao {
  id                  String              @id @default(cuid())
  autorId             String
  autor               Utilizador          @relation(fields: [autorId], references: [id])
  proprietario        PropriedadeConteudo @default(TREINADOR)
  clubeProprietarioId String?
  modalidade          Modalidade?         // 🔁 v7: FUTSAL | FUTEBOL | null = genérico
  origemSeed          Boolean             @default(false)
  nome                String              // ex: "Pressing defensivo, 60 min, sub-10"
  objetivoTatico      String?
  faseEpoca           PeriodoEpoca?       // PREPARATORIO | COMPETITIVO | TRANSICAO
  escalaoAlvo         String?             // "sub-10" / faixa etária
  duracaoMin          Int?
  descricao           String?
  criadoEm            DateTime            @default(now())
  atualizadoEm        DateTime            @updatedAt

  exercicios ModeloSessaoExercicio[]

  @@index([clubeProprietarioId])
  @@index([autorId])
}

model ModeloSessaoExercicio {
  id             String       @id @default(cuid())
  modeloSessaoId String
  modeloSessao   ModeloSessao @relation(fields: [modeloSessaoId], references: [id], onDelete: Cascade)
  exercicioId    String
  exercicio      Exercicio    @relation(fields: [exercicioId], references: [id])
  ordem          Int          @default(0)
  duracaoMin     Int?
  parteTreino    ParteTreino?
  notas          String?

  @@unique([modeloSessaoId, ordem])
  @@index([exercicioId])
}
```
Ao criar uma sessão a partir de um template, os exercícios e durações são copiados para a `Sessao` (o template não fica ligado — é um ponto de partida editável).

### 3.5 Periodização e treinos (🏛️ clube; metodologia/semana-tipo portátil 🎒)

```prisma
model Planeamento {
  id         String        @id @default(cuid())
  clubeId    String
  escalaoId  String
  epocaId    String
  tipo       TipoPlaneamento // SEMANAL | MENSAL
  periodo    PeriodoEpoca?   // PREPARATORIO | COMPETITIVO | TRANSICAO
  mesociclo  Int?            // opcional; visível no formulário de planeamento
  microciclo Int?            // ⚠️ numeração INTERNA da semana; a UI mostra sempre "Semana"
  nome       String?         // nome livre da semana formalizada; opcional
  modoSemana ModoSemana?     // ESTRUTURADO (dias MD-X) | TEXTO_LIVRE; só quando formaliza (tipo=SEMANAL)
  notaSemana String?         // campo aberto do modo TEXTO_LIVRE
  dataInicio DateTime
  dataFim    DateTime
  objetivos  String?
  criadoEm   DateTime      @default(now())

  sessoes Sessao[]
}

enum TipoPlaneamento { SEMANAL MENSAL }
enum PeriodoEpoca { PREPARATORIO COMPETITIVO TRANSICAO }
enum ModoSemana { ESTRUTURADO TEXTO_LIVRE }

// ── Plano semanal de treinos (§8.8.1) — 🔁 novo 2026-08-20 ──────────────────
// Horário RECORRENTE de treino de um escalão numa época. A partir dos dias da
// semana configurados, o sistema GERA automaticamente as sessões da época (8.8.1).
// As sessões geradas ligam-se ao plano (`Sessao.planoSemanalId`) e ao dia
// (`Sessao.planoSemanalDiaId`) para a propagação "esta e todas as futuras" funcionar.
// NÃO confundir com `Planeamento` (periodização/carga por semana — MD-X, microciclo)
// nem com `ModeloSessao` (conteúdo reutilizável): o plano semanal só AGENDA
// (data/hora/local/tipo); o CONTEÚDO (exercícios/presenças) vive na `Sessao`.
// No máximo UM plano `ativo` por (escalaoId, epocaId) — validado na aplicação.
model PlanoSemanal {
  id           String   @id @default(cuid())
  clubeId      String   // scope multi-tenant (todas as queries filtram por clube)
  escalaoId    String
  epocaId      String
  nome         String?  // livre; fallback = nome do escalão
  ativo        Boolean  @default(true)
  criadorId    String
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  dias    PlanoSemanalDia[]
  sessoes Sessao[]

  @@index([epocaId, escalaoId])
  @@index([clubeId])
}

// Configuração de UM dia da semana. É o BASELINE (hora/local/tipo) usado na
// GERAÇÃO e na PROPAGAÇÃO: editar o baseline propaga a "esta e todas as futuras".
model PlanoSemanalDia {
  id             String       @id @default(cuid())
  planoSemanalId String
  planoSemanal   PlanoSemanal @relation(fields: [planoSemanalId], references: [id], onDelete: Cascade)
  diaSemana      Int          // ISO-8601: 1=segunda … 7=domingo
  horaInicio     String       // "HH:MM" (hora local)
  horaFim        String       // "HH:MM" (> horaInicio)
  local          String?
  tipoSessao     TipoSessao   @default(NORMAL)

  sessoes Sessao[]

  @@unique([planoSemanalId, diaSemana])
  @@index([planoSemanalId])
}

model Sessao {
  id            String     @id @default(cuid())
  clubeId       String
  escalaoId     String
  epocaId       String
  tipoSessao    TipoSessao @default(NORMAL) // NORMAL liga a periodização; ABERTO/CAPTACAO/EVENTO dispensam
  planeamentoId String?     // Só válido quando tipoSessao == NORMAL (imposto no servidor)
  rpeSessao     Int?        // 1-10: carga percebida da sessão (RPE do treinador) — §8.20
  data          DateTime
  duracaoMin    Int?
  objetivo      String?
  local         String?
  notas         String?  // notas de treino (input para o tracking)
  material      String?
  microciclo    Int?          // ⚠️ INTERNO; a UI mostra "Semana"
  mesociclo     Int?          // opcional; visível no formulário de planeamento
  momentoSemana MomentoSemana? // posição do dia na semana (MD-X); opcional; aplicável a qualquer tipo de sessão
  periodo       PeriodoEpoca?
  volume        Int?
  googleEventId String?  // sincronização Google Calendar (secção 8.16)
  modalidadeAtividade  Modalidade?  // 🔁 v7: null = herda da secção do escalão; preenchido = actividade pontual noutra modalidade
  // §8.8.1 — ligação ao plano semanal (null = treino avulso). SetNull: apagar o
  // plano não apaga as sessões (só as desvincula). `personalizada = true` quando a
  // sessão foi editada individualmente ("só esta"): a propagação "esta e futuras"
  // não sobrescreve os seus campos de agendamento.
  planoSemanalId    String?
  planoSemanalDiaId String?
  personalizada     Boolean @default(false)
  criadorId     String
  criadoEm      DateTime @default(now())
  atualizadoEm  DateTime @updatedAt

  exercicios SessaoExercicio[]
  presencas  Presenca[]
  rpesAtletas RpeAtleta[]  // §8.20
}

enum TipoSessao { NORMAL ABERTO CAPTACAO EVENTO }
enum MomentoSemana { MD_MENOS_3 MD_MENOS_2 MD_MENOS_1 MD_MAIS_1 ATIVACAO TAPER LIVRE }

// RPE individual do atleta para uma sessão (1-10) — §8.20.
model RpeAtleta {
  id        String   @id @default(cuid())
  sessaoId  String
  sessao    Sessao   @relation(fields: [sessaoId], references: [id], onDelete: Cascade)
  atletaId  String
  atleta    Atleta   @relation(fields: [atletaId], references: [id], onDelete: Cascade)
  rpe       Int      // 1-10
  createdAt DateTime @default(now())

  @@unique([sessaoId, atletaId])
}

model SessaoExercicio {
  id          String @id @default(cuid())
  sessaoId    String
  exercicioId String
  ordem       Int    @default(0)
  duracaoMin  Int?
  notas       String?   @db.Text  // nota livre do treinador para este exercício nesta sessão
  // Adaptação do exercício para ESTA sessão (não altera a biblioteca — §8.8.2)
  series            Int?          // nº de séries/repetições específico desta sessão
  descricaoOverride String?   @db.Text  // montagem/instrução própria desta sessão; sobrepõe a descrição da biblioteca
  numeroJogadoresOverride String?  // 🔁 nº de jogadores próprio desta sessão; sobrepõe `Exercicio.numeroJogadores`. Semeado a partir do valor base ao adicionar o exercício à sessão
  espacoOverride    String?       // 🔁 espaço próprio desta sessão; sobrepõe `Exercicio.espaco`. Semeado a partir do valor base ao adicionar o exercício à sessão
  parteTreino       ParteTreino?  // fase do treino nesta sessão (AQUECIMENTO|PRINCIPAL|JOGO_REDUZIDO|RETORNO_CALMA); null = sem fase. Override por sessão — não altera a biblioteca
  // Snapshot só-de-leitura (mecanismo em 4.2.1). Congela dados de exercícios TREINADOR usados em sessões do clube.
  snapNome      String?
  snapDescricao String?
  snapObjetivo  String?
  snapDiagrama  Json?     // cópia congelada do DiagramaCampo (secção 11)
  snapNumeroJogadores String?  // 🔁 snapshot histórico do nº de jogadores (mecanismo 4.2.1)
  snapEspaco    String?         // 🔁 snapshot histórico do espaço (mecanismo 4.2.1)
  snapCriadoEm  DateTime?

  @@unique([sessaoId, ordem])
}

model Presenca {
  id           String         @id @default(cuid())
  sessaoId     String
  atletaId     String
  escalaoId    String          // presenças calculadas POR escalão (atleta pode participar em vários)
  estado       EstadoPresenca  @default(PRESENTE)
  motivo       MotivoFalta?
  justificacao String?

  @@unique([sessaoId, atletaId])
}

enum EstadoPresenca { PRESENTE FALTA FALTA_JUSTIFICADA LESIONADO ATRASADO }
enum MotivoFalta { LESAO DOENCA OUTRO SEM_JUSTIFICACAO }
```

**Semana de trabalho, snapshot e propriedade da periodização:** conforme v6 (decisões 2026-08-16) — a UI usa sempre «Semana» (nunca «Microciclo»); a instância concreta do `Planeamento` é 🏛️ do clube; a **estrutura/metodologia** (semana-tipo) é 🎒 portátil como template. Ver 8.9 e 4.4. (Sem alteração na v7.)

### 3.6 Modelo de jogo e quadro tático (🏛️ clube; metodologia portátil 🎒)

Documento vivo da identidade tática. Por clube/escalão/época = do clube; metodologia genérica portátil (sem escalão/época) = do treinador. Organiza-se por **momento** (org. ofensiva/defensiva, transições, bolas paradas), com princípios/subprincípios + diagrama (editor). **🔁 v7:** como o `ModeloJogo` pode ligar-se a um `escalaoId`, a modalidade deriva do escalão; para modelos portáteis (sem escalão) ganha `modalidade Modalidade?` (null = genérico).

```prisma
model ModeloJogo {
  id           String              @id @default(cuid())
  autorId      String
  autor        Utilizador          @relation(fields: [autorId], references: [id])
  proprietario PropriedadeConteudo @default(CLUBE) // CLUBE (documento da equipa) | TREINADOR (portátil)
  clubeProprietarioId String?
  modalidade   Modalidade?         // 🔁 v7: para modelos portáteis (escalaoId null); senão deriva do escalão
  escalaoId    String?             // null = metodologia genérica portátil
  escalao      Escalao?            @relation("ModeloJogoEscalao", fields: [escalaoId], references: [id], onDelete: SetNull)
  epocaId      String?             // null = portátil
  epoca        Epoca?              @relation("ModeloJogoEpoca", fields: [epocaId], references: [id], onDelete: SetNull)
  nome         String
  momento      MomentoJogo         // ORG_OFENSIVA | ORG_DEFENSIVA | TRANS_OFENSIVA | TRANS_DEFENSIVA | BOLAS_PARADAS
  principios   String?  @db.Text
  subprincipios Json?
  diagrama     Json?
  criadoEm     DateTime            @default(now())
  atualizadoEm DateTime            @updatedAt

  @@index([clubeProprietarioId])
  @@index([autorId])
  @@index([clubeProprietarioId, escalaoId, epocaId])
  @@index([escalaoId])
  @@index([epocaId])
}

enum MomentoJogo { ORG_OFENSIVA ORG_DEFENSIVA TRANS_OFENSIVA TRANS_DEFENSIVA BOLAS_PARADAS }

model QuadroTatico {
  id       String  @id @default(cuid())
  jogoId   String
  jogo     Jogo    @relation(fields: [jogoId], references: [id], onDelete: Cascade)
  nome     String
  tipo     TipoQuadroTatico @default(GERAL) // GERAL | BOLA_PARADA
  diagrama Json?
  notas    String?

  @@index([jogoId])
}

enum TipoQuadroTatico { GERAL BOLA_PARADA }
```

### 3.7 Competições, jogos, estatísticas, classificação e scouting (🏛️ clube)

> **🔁 Alteração v7:** `Jogo` ganha **`formato FormatoJogo`** e `Competicao` ganha **`formatoJogo FormatoJogo?`** (ver enum). ⚠️ Em `Competicao` o campo chama-se **`formatoJogo`** (não `formato`) para não colidir com o campo já existente `formato FormatoCompeticao` (LIGA/TORNEIO/TACA). `EstatisticaAtleta` ganha o **núcleo estatístico de futebol** (remates, cantos, foras-de-jogo, desarmes). Os campos `Jogo.faltas1aParte`/`faltas2aParte` **só se aplicam a futsal** (ocultos na UI de futebol). O núcleo estatístico é sempre acompanhado das **métricas configuráveis** (`MetricaConfig`) — mesmo princípio nas duas modalidades (secção 10.8).

> **🔁 Alteração 2026-08-20 (equipas + quadro competitivo + agendamento — Fase 32):** a competição deixa de ter as equipas como texto livre disperso pelos resultados e ganha a entidade **`EquipaCompeticao`** (equipas participantes com seed/cabeça-de-série). `ResultadoCompeticao` ganha **`ronda`** (jornada de LIGA ou fase de TORNEIO/TAÇA), **`dataHora`** (agendamento, `null` = "por definir") e **`estado EstadoResultado`** (`AGENDADO`/`REALIZADO`), passando `golosCasa`/`golosFora` a serem **nullable** (jogo agendado ainda sem resultado). Isto permite **gerar o quadro competitivo** (todos-contra-todos para LIGA; bracket eliminatório para TORNEIO/TAÇA) e **agendar** os jogos na própria criação da competição (§8.11). Os campos são **aditivos** e retrocompatíveis: resultados legados têm `ronda=null`, `dataHora=null` e assumem `estado=REALIZADO` (ver Apêndice C / backfill).

```prisma
model Competicao {
  id        String       @id @default(cuid())
  clubeId   String
  escalaoId String
  epocaId   String
  nome      String
  tipo      TipoJogo     @default(OFICIAL) // OFICIAL | AMIGAVEL
  formato   FormatoCompeticao @default(LIGA) // LIGA | TORNEIO | TACA
  formatoJogo FormatoJogo?  // 🔁 v7: formato de jogo por defeito da competição (FUTSAL_5 | FUTEBOL_*); NÃO confundir com `formato` (LIGA/TORNEIO/TACA)
  criadoEm  DateTime     @default(now())

  jogos      Jogo[]
  resultados ResultadoCompeticao[] // resultados de outras equipas (para a classificação)
  equipas    EquipaCompeticao[]    // 🔁 2026-08-20: equipas participantes (entidade, já não texto livre)
}

enum TipoJogo { OFICIAL AMIGAVEL }
enum CasaFora { CASA FORA }
enum FormatoCompeticao { LIGA TORNEIO TACA }
// 🔁 2026-08-20: estado do jogo da competição. AGENDADO = ainda sem resultado; REALIZADO = resultado inserido.
enum EstadoResultado { AGENDADO REALIZADO }

// 🔁 2026-08-20: equipa participante numa competição (seed para o bracket / identidade estável).
//   Substitui o uso de texto livre disperso pelos ResultadoCompeticao.
model EquipaCompeticao {
  id           String     @id @default(cuid())
  competicaoId String
  nome         String     // texto livre, trim obrigatório
  posicao      Int?       // seed/cabeça-de-série para o bracket (ordem de introdução)
  criadoEm     DateTime   @default(now())

  competicao   Competicao @relation(fields: [competicaoId], references: [id], onDelete: Cascade)

  @@unique([competicaoId, nome]) // unicidade case-sensitive; display compara case-insensitive
  @@index([competicaoId])
}

// 🔁 v7: formato de jogo (nº de jogadores por equipa). Deriva por defeito da modalidade da secção
//   do escalão; guardado no jogo para o editor de campo e a interpretação das estatísticas.
enum FormatoJogo {
  FUTSAL_5      // futsal standard (5×5)
  FUTEBOL_3_3   // petizes
  FUTEBOL_5_5   // traquinas (ou petizes mais velhos)
  FUTEBOL_7     // benjamins/infantis
  FUTEBOL_9     // iniciados/transição
  FUTEBOL_11    // juniores/séniores
}

model ResultadoCompeticao {
  id           String     @id @default(cuid())
  competicaoId String
  competicao   Competicao @relation(fields: [competicaoId], references: [id], onDelete: Cascade)
  data         DateTime?
  equipaCasa   String
  equipaFora   String
  golosCasa    Int?       // 🔁 2026-08-20: nullable — null enquanto AGENDADO (jogo por realizar)
  golosFora    Int?       // 🔁 2026-08-20: nullable — idem
  // 🔁 2026-08-20: quadro competitivo + agendamento
  ronda        Int?       // LIGA: nº da jornada · TORNEIO/TAÇA: fase (1=final, 2=meias, 4=quartos, 8=oitavos…)
  dataHora     DateTime?  // data e hora do jogo; null = "por definir"
  estado       EstadoResultado @default(AGENDADO) // AGENDADO até ter resultado; REALIZADO ao inserir
  criadoEm     DateTime   @default(now())

  @@index([competicaoId])
}

model Jogo {
  id                    String    @id @default(cuid())
  clubeId               String
  escalaoId             String
  epocaId               String
  competicaoId          String?
  formato               FormatoJogo? // 🔁 v7: FUTSAL_5 | FUTEBOL_* ; default derivado da secção do escalão
  data                  DateTime
  adversario            String
  casaFora              CasaFora  @default(CASA)
  tipo                  TipoJogo  @default(OFICIAL)
  local                 String?
  golosMarcados         Int?
  golosSofridos         Int?
  faltas1aParte         Int?      // ⚽ futsal: faltas acumuladas na 1ª parte (oculto em futebol)
  faltas2aParte         Int?      // ⚽ futsal: faltas acumuladas na 2ª parte (oculto em futebol)
  relatorio             String?   @db.Text // 🔁 relatório estruturado em JSON: { analiseTatica, destaques, proximoJogo } (UX-P3-07). Retrocompatível: texto puro legado = análise táctica. (de)serialização em lib/relatorio-jogo.ts
  videoUrl              String?   // link YouTube (allowlist)
  googleEventId         String?   // sincronização Google Calendar (secção 8.16)
  modalidadeAtividade   Modalidade? // 🔁 v7: null = herda da secção; preenchido = jogo/torneio pontual noutra modalidade
  criadorId             String
  criadoEm              DateTime  @default(now())
  atualizadoEm          DateTime  @updatedAt

  convocatorias Convocatoria[]
  estatisticas  EstatisticaAtleta[]
  eventos       EventoJogo[]        // registo ao vivo
  quadros       QuadroTatico[]
  observacoes   ObservacaoAdversario[] // scouting no contexto do jogo
}

model Convocatoria {
  id              String   @id @default(cuid())
  jogoId          String
  atletaId        String
  convocado       Boolean  @default(true)
  posicaoPrevista Posicao? // para a vista de dia de jogo (posição da modalidade do jogo)
  titularPrevisto Boolean  @default(false)

  @@unique([jogoId, atletaId])
}

model EstatisticaAtleta {
  id              String     @id @default(cuid())
  jogoId          String
  atletaId        String
  utilizacao      Utilizacao @default(NAO_UTILIZADO) // TITULAR | UTILIZADO | NAO_UTILIZADO
  blocoTempo      BlocoTempo? // tempo de jogo por bloco
  minutos         Int?        // aproximado, opcional (derivável do bloco)
  // Núcleo comum (futsal + futebol)
  golos           Int        @default(0)
  assistencias    Int        @default(0)
  defesas         Int?       // GR (ambas as modalidades)
  golosSofridosGR Int?       // GR
  faltasCometidas Int?
  // Disciplina (§3.7): cartões acumulados por jogo — comuns a futsal e futebol (gravados sempre)
  cartaoAmarelo   Int        @default(0) // grelha de estatísticas: input 0–5
  cartaoVermelho  Int        @default(0) // grelha de estatísticas: input 0–2
  // 🔁 v7 — Núcleo de FUTEBOL 🥅 (nullable; só relevante/preenchido em jogos de futebol)
  remates         Int?
  cantos          Int?
  forasDeJogo     Int?
  desarmes        Int?
  // Métricas configuráveis (ambas as modalidades)
  valoresMetricas ValorMetrica[]

  @@unique([jogoId, atletaId])
}

enum Utilizacao { TITULAR UTILIZADO NAO_UTILIZADO }
enum BlocoTempo { JOGO_COMPLETO MEIA_PARTE BLOCO_10MIN BLOCO_5MIN NAO_JOGOU }

model EventoJogo {
  id                 String        @id @default(cuid())
  jogoId             String
  parte              Int           // 1 | 2
  minuto             Int?
  tipo               TipoEventoJogo
  bloco              BlocoTempo?
  atletaId           String?       // protagonista
  atletaSecundarioId String?       // assistência / substituído
  criadoEm           DateTime      @default(now())
}

// 🔁 v7: tipos de evento comuns + de futebol. Os tipos futsal-específicos e futebol-específicos
//   coexistem; a UI de registo ao vivo mostra o subconjunto relevante à modalidade do jogo.
enum TipoEventoJogo {
  GOLO ASSISTENCIA FALTA CARTAO_AMARELO CARTAO_VERMELHO
  SUBSTITUICAO DEFESA GOLO_SOFRIDO TIMEOUT
  // Futebol 🥅
  REMATE CANTO FORA_DE_JOGO DESARME
}

model MetricaConfig {
  id      String      @id @default(cuid())
  clubeId String
  nome    String
  tipo    TipoMetrica @default(NUMERO) // NUMERO | BOOLEANO | ESCALA
  ativa   Boolean     @default(true)
  ordem   Int         @default(0)
  // 🔁 v7 (DEVERIA): métrica pode ser específica de uma modalidade (só aparece nessa) ou geral.
  modalidade Modalidade? // null = aplica-se às duas modalidades

  valores ValorMetrica[]
}

enum TipoMetrica { NUMERO BOOLEANO ESCALA }

model ValorMetrica {
  id            String @id @default(cuid())
  metricaId     String
  estatisticaId String
  valor         Int

  @@unique([metricaId, estatisticaId])
}

model ObservacaoAdversario {
  id            String   @id @default(cuid())
  clubeId       String
  escalaoId     String?
  jogoId        String?
  jogo          Jogo?    @relation(fields: [jogoId], references: [id], onDelete: SetNull)
  equipa        String
  jogoObservado String?
  competicao    String?
  sistemaTatico String?
  pontosFortes  String?
  pontosFracos  String?
  notas         String?
  diagrama      Json?
  criadoEm      DateTime @default(now())

  jogadores ObservacaoJogadorAdversario[]
}

model ObservacaoJogadorAdversario {
  id           String @id @default(cuid())
  observacaoId String
  numero       Int?
  nome         String?
  posicao      String?
  descricao    String?
}
```

> **🔁 Derivação do formato (DEVE):** ao criar um `Jogo`, o `formato` é **pré-preenchido** a partir da modalidade da secção do escalão (`FUTSAL_5` para futsal; para futebol, o formato por defeito do escalão — configurável, ver Apêndice B) e permanece **editável** (um escalão pode disputar amigáveis noutro formato). O `formato` determina o campo do editor (secção 11.5) e que estatísticas de núcleo são exibidas (secção 10.8).

### 3.8 Caderneta de habilidades (🏛️ clube)

```prisma
model Habilidade {
  id        String          @id @default(cuid())
  clubeId   String
  clube     Clube           @relation(fields: [clubeId], references: [id])
  nome      String
  descricao String?
  nivel     NivelHabilidade @default(BASICO) // BASICO | INTERMEDIO | AVANCADO
  ordem     Int             @default(0)
  // 🔁 v7 (DEVERIA): uma habilidade pode ser específica de uma modalidade ou transversal.
  modalidade Modalidade?    // null = transversal (aplica-se às duas)
  criadoEm  DateTime        @default(now())

  progressos ProgressoHabilidade[]
}

enum NivelHabilidade { BASICO INTERMEDIO AVANCADO }

model ProgressoHabilidade {
  id              String           @id @default(cuid())
  atletaId        String
  habilidadeId    String
  epocaId         String
  estado          EstadoHabilidade @default(NAO_INICIADO)
  dataDesbloqueio DateTime?
  notas           String?

  @@unique([atletaId, habilidadeId, epocaId])
}

enum EstadoHabilidade { NAO_INICIADO EM_PROGRESSO DESBLOQUEADO }
```

### 3.9 Reuniões e comunicação (🏛️ clube)
`Reuniao` (com `ambito CLUBE | ESCALAO`, `ordemTrabalhos`, `ata`, `googleEventId`, criador `SetNull`), `ModeloComunicacao` (7 tipos, globais via `clubeId = null` + variante do clube), placeholders `{{campo}}` e `gerarTextoComunicacao` — conforme v6 §3.9. (Os placeholders de `RESULTADO`/`CONVOCATORIA` são agnósticos à modalidade; ver 8.12.) **🔁 v7 — `Reuniao` ganha `afixada Boolean @default(false)`** — indica se a reunião está afixada no dashboard/Início; controla a apresentação descrita em §8.13 (afixadas surgem sempre no dashboard, independentemente da data). Alteração **aditiva** (default `false`).

### 3.10 Relatório de época partilhável (🏛️ clube)
Sem alteração de modelo na v7. `RelatorioPartilhado` (`token @unique`, `tipo TipoRelatorio`, `dadosSnapshot Json?` imutável, `expiraEm?`) — conforme v6 §3.10. O snapshot passa a poder conter dados segmentados por modalidade (secção 10.8), mas o modelo é o mesmo.

### 3.11 Licenciamento, subscrição e carteira
Modelo desenhado para suportar Paddle. O **billing** (checkout, webhooks, pagamentos via Paddle) mantém-se **deferido**; a arquitetura de dados fica pronta. **🔁 v7:** `Licenca` ganha os campos multi-secção necessários ao pricing por secção (secção 17.1) e o registo da modalidade Individual.

**Guarda de acesso à plataforma (ativa).** Distinta do billing e da **autenticação** (Auth.js, intocável): uma **guarda de licença** protege toda a área autenticada da app (grupo de rotas `app/(app)/`). Após a autenticação e a verificação de adesão a clube, o layout (`app/(app)/layout.tsx`) chama `temLicencaValida(clubeId, utilizadorId)` (`lib/licenca.ts`); sem licença **válida** o utilizador é redirecionado para o **paywall** `/sem-licenca` (fora do grupo `(app)`, sem ciclo de redirect). Regras (função pura `licencaValida`, testável): uma licença dá acesso quando está **`ATIVA`** e (não tem `dataFim`, ou essa data ainda não passou — cobre períodos experimentais, já que o enum `EstadoLicenca` não tem estado `TRIAL`; um trial é uma licença `ATIVA` com `dataFim` futura). Vale a licença de **Clube** (`Licenca.clubeId`) **ou** a **Individual** (`Licenca.utilizadorId` — clube técnico invisível, §3.1). Uma licença **`PENDENTE`** (criada no registo, à espera de confirmação de pagamento — ver abaixo) **não** é válida: a guarda trata o titular como sem acesso e redireciona-o para o paywall `/sem-licenca`. A guarda **não** processa pagamentos: a criação/renovação de licenças (e a transição automática `ATIVA→EXPIRADA`) entra com o billing Paddle.

**🔁 Escolha de plano no onboarding + licença `PENDENTE` (fluxo interino, ativo).** O **wizard de onboarding** (§8.1) inclui, **antes do submit final**, um **passo de escolha de plano** (tier): o utilizador seleciona o plano pretendido (Individual, ou Clube por tier de escalões — §17.1). Ao **criar o clube**, é criada uma `Licenca` com **`estado: PENDENTE`** e o **tier escolhido** (e `ciclo`/`precoCentimos` correspondentes). Como `PENDENTE` não concede acesso, ao concluir o onboarding o utilizador é encaminhado para o paywall `/sem-licenca`. Aí, em vez da **tabela completa de planos**, o ecrã mostra **o plano escolhido e o valor exato a transferir**, com as instruções de transferência bancária (IBAN + referência + email de comprovativo — §17.5). A ativação (`PENDENTE → ATIVA`) é feita **manualmente pelo admin no backoffice** (§21.2) após receção do comprovativo.

```prisma
// Licença ativa de um utilizador (Individual) OU de um clube (Clube).
// Um titular tem no máximo uma ativa (utilizadorId @unique OU clubeId @unique).
model Licenca {
  id            String         @id @default(cuid())
  tipo          TipoLicenca    // INDIVIDUAL | CLUBE
  tier          TierClube?     // só se tipo=CLUBE: PEQUENO | MEDIO | GRANDE | PARCEIRO
  estado        EstadoLicenca  @default(ATIVA) // PENDENTE | ATIVA | EXPIRADA | CANCELADA | SUSPENSA
  ciclo         CicloFaturacao // MENSAL | ANUAL
  precoCentimos Int?           // preço praticado (cêntimos) — já com acréscimo multi-secção

  // 🔁 v7 — Individual: modalidade contratada (futsal ou futebol). null em licenças de Clube.
  modalidade    Modalidade?    // registo explícito do produto Individual vendido (§17.1)
  // 🔁 v7 — Clube: nº de secções faturadas (pricing por secção — §17.1: tier mais caro + 50%/secção adicional).
  numSeccoes    Int            @default(1) // 1 = comportamento v6; >1 aplica acréscimo por secção adicional

  // Titular (exatamente um dos dois preenchido)
  utilizadorId String?     @unique
  utilizador   Utilizador? @relation("LicencaIndividual", fields: [utilizadorId], references: [id])
  clubeId      String?     @unique
  clube        Clube?      @relation("LicencaClube", fields: [clubeId], references: [id])

  // Datas
  dataInicio    DateTime  @default(now())
  dataRenovacao DateTime?
  dataFim       DateTime?

  // Integração Paddle (futura)
  paddleSubscriptionId String?
  paddleCustomerId     String?

  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt
}

enum TipoLicenca { INDIVIDUAL CLUBE }
enum TierClube { PEQUENO MEDIO GRANDE PARCEIRO }
enum EstadoLicenca { PENDENTE ATIVA EXPIRADA CANCELADA SUSPENSA }
enum CicloFaturacao { MENSAL ANUAL }

// Carteira (wallet) do treinador — crédito de absorção usado em compras futuras.
model Carteira {
  id            String     @id @default(cuid())
  utilizadorId  String     @unique
  utilizador    Utilizador @relation(fields: [utilizadorId], references: [id], onDelete: Cascade)
  saldoCentimos Int        @default(0)
  atualizadoEm  DateTime   @updatedAt

  movimentos MovimentoCarteira[]
}

model MovimentoCarteira {
  id            String        @id @default(cuid())
  carteiraId    String
  carteira      Carteira      @relation(fields: [carteiraId], references: [id], onDelete: Cascade)
  tipo          TipoMovimento // CREDITO_ABSORCAO | DEBITO_COMPRA | REEMBOLSO | AJUSTE
  valorCentimos Int           // positivo = crédito; negativo = débito
  descricao     String
  criadoEm      DateTime      @default(now())

  @@index([carteiraId])
}

enum TipoMovimento { CREDITO_ABSORCAO DEBITO_COMPRA REEMBOLSO AJUSTE }
```

> **🔁 v7 — modalidade na licença Individual (DEVERIA):** a licença Individual regista a **modalidade contratada** em `Licenca.modalidade` (a secção única do clube técnico determina-a; o campo torna explícito o produto vendido). A licença de Clube **não** fixa modalidade (o clube tem as secções que tiver); o pricing escala por secção via `numSeccoes` (secção 17.1). ⚠️ decidir na implementação se `Licenca.modalidade` é a fonte de verdade ou derivado da secção do clube técnico.

> **🔁 Estados da licença (`EstadoLicenca`):**
> - **`PENDENTE`** — licença **criada aquando do registo** (com o tier escolhido no onboarding), **aguarda confirmação de pagamento**. **Não concede acesso** (a guarda trata-a como sem licença). É o estado inicial no fluxo interino por transferência bancária (§17.5); transita para `ATIVA` quando o admin confirma o comprovativo (§21.2).
> - **`ATIVA`** — licença válida; concede acesso enquanto não tiver `dataFim` no passado (um trial é uma `ATIVA` com `dataFim` futura).
> - **`EXPIRADA`** — `dataFim` ultrapassada; transição automática (entra com o billing).
> - **`CANCELADA`** — subscrição cancelada; sem acesso.
> - **`SUSPENSA`** — suspensa administrativamente; sem acesso.
> - **Nota:** o `@default(ATIVA)` do schema mantém-se (usado por criação administrativa/absorção); o onboarding (`criarClube`) **grava `PENDENTE` explicitamente**.

### 3.12 Integração com calendário externo (Google Calendar)
Sem alteração na v7. `IntegracaoCalendario` (OAuth Google, `refreshToken` encriptado at-rest), `googleEventId` em `Sessao`/`Jogo`/`Reuniao` — conforme v6 §3.12.

### 3.13 Portfólio e histórico de carreira do treinador (🎒 portátil)
Sem alteração de estrutura na v7. `RegistoCarreira` — conforme v6 §3.13. **🔁 (DEVERIA):** o campo textual `escalao`/notas pode indicar a modalidade (ex.: "Sub-15 Futebol"); nenhum campo novo é obrigatório.

### 3.14 RGPD — consentimento de menores
Sem alteração na v7. `Consentimento` (`DADOS`/`IMAGEM`, `@@unique([atletaId, tipo])`) — conforme v6 §3.14. Como o atleta é único por pessoa, o consentimento é **por atleta** (cobre todas as modalidades em que participa).

### 3.15 Lembretes e tarefas (🏛️ contexto do clube)
Sem alteração de modelo na v7. `Lembrete` + `LembreteDestinatario` (âmbito PESSOAL/EQUIPA) — conforme v6 §3.15.

### 3.16 Cards sociais para Instagram (🏛️ clube)
Sem alteração de arquitetura na v7. Geração server-side (`next/og`, rota `GET /api/social/card`, token HMAC) dos cards `resultado`/`mvp`/`ranking` com RGPD (bloqueio de formação jovem ≤ sub-14) — conforme v6 §3.16. **🔁 (DEVERIA):** os cards refletem a modalidade do jogo/escalão (ex.: card de resultado de um jogo de futebol usa o formato correto); a lógica de RGPD (bloqueio de menores) é **idêntica** nas duas modalidades.

## 4. Propriedade e portabilidade de dados

### 4.1 Princípio
Há três tipos de dados:
- **Operacionais/competitivos** → sempre do **clube** (ficam quando o treinador sai): atletas e participações, jogos, estatísticas, eventos, presenças, convocatórias, caderneta, **secções**, escalões, épocas, competições, classificações, reuniões, comunicação, scouting, consentimentos.
- **Conteúdo metodológico** (exercícios, templates de sessão, modelos de jogo) → a propriedade é **decidida pelo treinador no momento da criação** (toggle pessoal vs clube), **não** por quem paga a licença (ver 4.2). Cada treinador tem sempre uma **biblioteca pessoal** (portátil); a **biblioteca do clube** representa a filosofia/identidade do clube.
- **Histórico de carreira** (`RegistoCarreira`) e **carteira** (`Carteira`) → sempre do **treinador** (viajam com ele).

> **🔁 v7:** a **Secção** é um dado **operacional do clube** (🏛️): fica no clube quando o treinador sai. O conteúdo metodológico portátil (🎒) do treinador **atravessa modalidades** — se ele criou exercícios de futebol, leva-os consigo tal como os de futsal; a marca `Exercicio.modalidade` viaja com o conteúdo.

### 4.2 Propriedade do conteúdo metodológico — decidida pelo treinador (decisão definitiva 2026-08-05)
> **Esta decisão substitui qualquer decisão anterior em contrário.** O pagamento da licença de clube **NÃO** transfere a propriedade do trabalho criativo do treinador.

- **Biblioteca pessoal = SEMPRE do treinador**, independentemente de quem paga a licença. Leva-a consigo para qualquer clube ao longo de toda a carreira (**futsal e futebol**).
- **Biblioteca do clube = filosofia e identidade do clube.** Fica no clube quando um treinador sai.
- **Toggle na criação (mantém-se):** o treinador escolhe **pessoal** (default) ou **clube**.

| Escolha do treinador na criação | `proprietario` | Ao sair do clube |
|---|---|---|
| **Biblioteca pessoal** (default) | `TREINADOR` | Viaja com ele |
| **Biblioteca do clube** (toggle explícito) | `CLUBE` | Fica no clube |

- `autorId` regista **sempre** quem criou.
- Conteúdo `CLUBE`: ligado a `clubeProprietarioId`.
- Conteúdo `TREINADOR`: viaja com o autor; se foi usado em sessões do clube, o clube mantém um **snapshot só-de-leitura** (4.2.1).

> **🔁 Visibilidade ≠ propriedade (v7 — decisão 2026-08-26):** os pontos acima tratam de **propriedade e portabilidade**. A **visibilidade** da biblioteca pessoal segue uma regra própria (secção 3.3): um exercício `TREINADOR` é visível aos treinadores que **partilhem pelo menos um escalão** com o autor. Partilhar a **visão** não transfere propriedade, não altera o `proprietario` e **não** gera snapshot (4.2.1) — o master editável e a portabilidade continuam a ser exclusivamente do autor. Só a passagem explícita para `CLUBE` (toggle) muda a propriedade.

#### 4.2.1 Mecanismo de snapshot (especificação — decisão 2026-08-16)
O snapshot é **obrigatório**. Ao **adicionar** um exercício portátil (`proprietario = TREINADOR`) a uma **sessão do clube**, o sistema cria **automaticamente** uma cópia congelada (nome, descrição, objetivo, diagrama, nº de jogadores e espaço) nos campos `snap*` do `SessaoExercicio` (secção 3.5 — incl. `snapNumeroJogadores` e `snapEspaco`). É **imutável** e **pertence ao clube**; o master editável fica com o treinador. Exercícios `proprietario = CLUBE` **não** geram snapshot. Aplica-se igualmente a exercícios de futsal e de futebol.

### 4.3 Uma adesão ativa de cada vez
Um utilizador tem **no máximo uma adesão de clube ativa** (que pode ser o clube técnico no modo Individual). Ao mudar de clube, a adesão anterior passa a `INATIVO` (histórico) e o conteúdo `TREINADOR` acompanha-o.

### 4.4 Tabela definitiva de propriedade e portabilidade (decisão 2026-08-16)
A coluna **«Porta com o treinador?»** indica se o treinador **retém uma cópia/registo** ao sair, **independentemente** de a propriedade ficar no clube.

| Dado | Proprietário | Porta com o treinador? |
|---|---|---|
| Nome dos atletas | 🏛️ CLUBE | ✅ Sim — nome é informação não-sensível |
| Foto do atleta | 🏛️ CLUBE | ❌ Não |
| Contacto/email do encarregado de educação | 🏛️ CLUBE | ❌ Não |
| Resultados de jogos (marcador, adversário) | 🏛️ CLUBE | ✅ Sim — o treinador dirigiu os jogos |
| Relatórios de sessões (estrutura, exercícios usados) | 🎒 TREINADOR | ✅ Sim |
| Estatísticas individuais de atletas (golos, cartões, RPE, remates, desarmes…) | 🏛️ CLUBE | ❌ Não |
| Caderneta de habilidades dos atletas | 🏛️ CLUBE | ❌ Não |
| Exercícios criados pelo treinador (futsal **e** futebol) | 🎒 TREINADOR (toggle) | ✅ Sim (se `proprietario = TREINADOR`) |
| Modelos táticos criados pelo treinador | 🎒 TREINADOR (toggle) | ✅ Sim (se `proprietario = TREINADOR`) |
| Planeamentos / semanas criadas pelo treinador | 🎒 TREINADOR | ✅ Sim — como templates (semana-tipo) |
| Planeamentos definidos pelo clube/DT | 🏛️ CLUBE | ❌ Não |
| **Secção** (modalidade) | 🏛️ CLUBE | ❌ Não |
| Menores (Sub-10, Sub-12, …) | — | ✅ Mesma regra que acima |

**Notas:** os dados operacionais das sessões (presenças, datas, RPE) permanecem 🏛️; o **snapshot** (4.2.1) é o mecanismo que permite ao clube manter o histórico completo depois de o treinador levar os seus exercícios portáteis.

---

## 5. Contas, autenticação, adesão a clube e RGPD

### 5.1 Autenticação
- **Auth.js v5** com provider **Credentials** (email + password). Sem OAuth no núcleo. *(A integração Google Calendar usa OAuth Google, distinta do login.)*
- Password: mínimo 8 caracteres; hash **bcrypt (custo 12)**; nunca em logs.
- Sessão **JWT** (`maxAge` 7 dias). **Uma sessão ativa por conta**.
- Gestão de password: alteração pelo próprio (exige atual); reposição por membro com `CLUBE_UTILIZADORES`. Recuperação por email é **FUTURO**.

> **🔒 Regra sagrada de auth:** nenhuma alteração multi-desporto toca em login/autenticação. A modalidade é resolvida **depois** da autenticação, no contexto de clube/secção. As fases 25–30 (secção 16) **não** alteram `middleware.ts`, `lib/auth.ts`, cookies de sessão ou o SDK de identidade.

### 5.2 Contas e modos (o "2 em 1" multi-tenant)
- O **`Utilizador` existe por si**. Ao registar-se/comprar licença Individual, é criado um **clube técnico** invisível (`clubeTecnico=true`) com o utilizador como Administrador único. O portfólio 🎒 vive nesse contexto.
- **🔁 v7:** a compra Individual escolhe a **modalidade** (futsal ou futebol); cria-se **uma secção** dessa modalidade no clube técnico (secção 8.1.1). O modo Individual tem sempre **exatamente uma secção**.
- **Modo Individual:** sem UI de gestão de clube, membros, perfis, branding, escalões partilhados **nem seletor de secção** (só há uma).
- **Criar/aderir a clube real:** um utilizador pode criar um `Clube` (torna-se Administrador; geram-se perfis de arranque) **ou** aceitar um convite (5.3).
- **Uma adesão ATIVA de cada vez** (4.3).

> **⚠️ Impacto de modelação (2026-08-05):** o modo Individual tem **sempre** um clube técnico em contexto — elimina o caso "sem clube". `obterMembroAtual()` nunca devolve `null` por ausência de clube.

### 5.3 Transição de clube e absorção
- **Sair do clube real:** `MembroClube` → `INATIVO`. Conteúdo `TREINADOR` viaja; conteúdo `CLUBE`, **secções** e **snapshots** ficam. `RegistoCarreira` consolidado. O treinador reativa a licença Individual por conta própria.
- **Aderir a novo clube (absorção):** nova `MembroClube` ativa. Se tinha licença Individual paga, o tempo restante converte-se em crédito (`CREDITO_ABSORCAO`). Reembolso real só por pedido manual. O clube paga o preço normal.
- **Proteção:** um clube real **nunca pode ficar sem Administrador** (6.8).

### 5.4 Contexto de sessão
Toda a operação corre num contexto resolvido no servidor:
- **Utilizador atual** — `obterUtilizadorAtual()`.
- **Membro/clube ativo** — `obterMembroAtual()` devolve `{ clube, perfil, capacidadesEfetivas, escalõesAtribuidos, seccoesCoordenadas, ambito }` (sempre existe). **🔁 v7:** inclui as secções coordenadas.
- **Época ativa** — `obterEpocaAtiva()` (cookie `epoca_ativa` validado contra o clube).
- **Secção selecionada** — 🔁 **(novo v7)** parâmetro de UI (quando o clube tem >1 secção), nunca fonte de autorização por si só.
- **Escalão selecionado** — parâmetro de UI (tabs).

### 5.5 RGPD (dados de menores)
> **Estado atual (2026-08-02):** consentimento parental recolhido pelo clube na inscrição, fora da app.
- **Minimização:** recolher apenas o necessário (nome, data de nascimento, posições, número, observações, encarregado de educação). Um atleta multi-desporto **não** duplica dados pessoais (secção 1.7.3) — minimização reforçada.
- **Consentimento parental** (`Consentimento`, `DADOS`/`IMAGEM`): por atleta (cobre todas as modalidades).
- **Direito ao esquecimento:** soft-delete por defeito; hard-delete a pedido (estatísticas anonimizáveis) — apaga participações em **todas** as secções.
- **Portabilidade:** exportação dos dados do educando em PDF/estruturado, a pedido.

### 5.6 Segurança geral
- Todas as Server Actions verificam **autenticação** e **capacidade/âmbito** antes de operar.
- **Validação server-side obrigatória** (Zod).
- Todas as queries filtram por **clube** + (quando aplicável) **época** + **âmbito** (+ **secção**, quando relevante).
- Segredos só em `.env`. HTTPS. Ficheiros do Supabase Storage com URLs não-adivinháveis. Tokens de integração e `RelatorioPartilhado.token` não-adivinháveis.

---

## 6. Papéis e permissões configuráveis

### 6.1 Modelo
Um **`Perfil`** = `nome` + `ambito` (`TODO_CLUBE` | **`SECCAO`** | `PROPRIOS_ESCALOES`) + **lista de capacidades**. Perfis são **por clube** e **totalmente configuráveis**. Ao criar o clube geram-se **modelos de arranque editáveis** (Administrador, Diretor Técnico, **Coordenador de Secção**, Treinador Principal, Adjunto, **Presidente**).

**Hierarquia base:** Admin → Diretor Técnico → **Coordenador de Secção** → Treinador (Principal/Adjunto).

### 6.2 Catálogo de capacidades
Chaves usadas em `Perfil.capacidades` e nos overrides de membro:

**Estrutura do clube (sempre a todo o clube):**
- `CLUBE_BRANDING` — editar cores e logótipo.
- `CLUBE_SECCOES` — 🔁 **(novo v7)** criar/editar/apagar **secções** e atribuir coordenadores.
- `CLUBE_ESCALOES` — criar/editar/apagar escalões e visibilidade.
- `CLUBE_EPOCAS` — criar épocas e definir a ativa.
- `CLUBE_UTILIZADORES` — convidar/gerir membros, repor passwords, overrides.
- `CLUBE_PERFIS` — criar/editar perfis e atribuir.
- `CATALOGO_METRICAS` — gerir métricas configuráveis.
- `CATALOGO_HABILIDADES` — gerir o catálogo de habilidades.
- `FATURACAO_GERIR` — **FUTURO** (billing/subscrição; só o Admin).

**Secção (âmbito `SECCAO`) — 🔁 novo v7:**
- `SECCAO_ESCALOES_GERIR` — criar/editar/apagar escalões e definir visibilidade **dentro da(s) secção(ões) coordenada(s)** (`MembroSeccao`). É a capacidade dedicada do Coordenador de Secção para gerir os escalões da sua modalidade, sem conceder o `CLUBE_ESCALOES` (que é sempre de nível clube). Não permite gerir escalões de outras secções.

**Dados de equipa (conforme o `ambito`):**
- `PLANTEL_GERIR` · `PROMOVER_ATLETAS` · `TREINOS_GERIR` · `PRESENCAS_MARCAR` · `PERIODIZACAO_GERIR` · `MODELO_JOGO_GERIR` · `JOGOS_GERIR` (variante `gerir_jogos_todos` = âmbito `TODO_CLUBE`) · `CONVOCATORIA_GERIR` · `ESTATISTICAS_GERIR` · `COMPETICOES_GERIR` · `MANOAMANO_GERIR` · `SCOUTING_GERIR` · `CADERNETA_GERIR` · `REUNIOES_GERIR` · `COMUNICACOES_GERIR` · `LEMBRETES_EQUIPA_GERIR` · `EXERCICIOS_GERIR` · `RELATORIOS_VER`.

- `MANOAMANO_GERIR` — **(novo)** criar/editar/apagar **competições Mano-a-Mano** (ligas e torneios 1×1), gerir participantes e clubes externos, gerar fixtures/brackets, agendar e registar resultados de duelos (secção 22). O registo de resultados de um duelo **dentro de uma sessão de treino** (bloco Mano-a-Mano do detalhe da sessão — 22.7) é adicionalmente coberto por **`TREINOS_GERIR`**, para que um adjunto que conduz o treino possa registar duelos sem gerir a competição.

*(Os lembretes **pessoais** não exigem capacidade — qualquer membro autenticado os cria para si.)*

### 6.3 Âmbito
- `TODO_CLUBE`: as capacidades de dados de equipa aplicam-se a **todos os escalões de todas as secções**.
- **`SECCAO`** — 🔁 **(novo v7):** aplicam-se a **todos os escalões da(s) secção(ões)** atribuídas ao membro (`MembroSeccao`).
- `PROPRIOS_ESCALOES`: aplicam-se **apenas aos escalões atribuídos** (`AtribuicaoEscalao`).
- As capacidades de estrutura (`CLUBE_*`, `CATALOGO_*`, `FATURACAO_GERIR`) são **sempre de nível clube** (não são restringíveis a uma secção — em particular, `CLUBE_ESCALOES` é sempre de nível clube).
- 🔁 **(novo v7):** a gestão de escalões **dentro de uma secção** faz-se pela capacidade dedicada **`SECCAO_ESCALOES_GERIR`** (âmbito `SECCAO`), **não** por um `CLUBE_ESCALOES` restringido. Isto elimina a ambiguidade: quem gere escalões de todo o clube tem `CLUBE_ESCALOES`; quem gere apenas os da sua secção tem `SECCAO_ESCALOES_GERIR`.

### 6.4 Overrides por membro (decisão 2026-08-05)
Além do perfil base, o Admin (com `CLUBE_UTILIZADORES`) pode **conceder** (`capacidadesExtra`) ou **revogar** (`capacidadesRevogadas`) capacidades a um membro.

**Capacidades efetivas** = `(perfil.capacidades ∪ capacidadesExtra) \ capacidadesRevogadas`.

- **Regra de delegação (DEVE):** um membro só concede capacidades **iguais ou inferiores às próprias**.
- **Visibilidade configurável (DEVE):** o Admin pode restringir DT/Coordenador a um subconjunto de escalões/secções. ⚠️ decidir na implementação se a restrição usa âmbito+atribuições ou capacidade dedicada.

### 6.5 Leitura de escalões alheios
A flag `Escalao.visivelOutrosTreinadores` concede **leitura transversal** de um escalão que não é próprio, mas **apenas a membros de âmbito não-próprio**:
- **`TODO_CLUBE`** — lê todos os escalões (a flag é irrelevante).
- **`SECCAO` (Coordenador de Secção)** — lê por defeito todos os escalões da(s) sua(s) secção(ões); a leitura **fora da secção** depende de `visivelOutrosTreinadores`.
- **`PROPRIOS_ESCALOES` (Treinador Principal/Adjunto)** — **DEVE** ler **exclusivamente** os escalões que lhe estão atribuídos (`AtribuicaoEscalao`). `visivelOutrosTreinadores` **não** concede leitura a um treinador de âmbito próprio (decisão de segurança 2026-08-26): as tabs/filtros de escalão e o filtro de dados das Server Actions só oferecem os escalões atribuídos, e a navegação direta (`?escalaoId=…`) para um escalão alheio devolve vazio / "sem acesso".

A **escrita** continua a exigir capacidade + âmbito (§6.7), independentemente da flag.

### 6.6 Modelos de arranque (defaults editáveis)
- **Administrador** — `TODO_CLUBE`, **todas** as capacidades (exceto `FATURACAO_GERIR`, FUTURO), incluindo `CLUBE_SECCOES`.
- **Diretor Técnico** — `TODO_CLUBE`, todas as capacidades de **dados de equipa** + `CATALOGO_*` + `RELATORIOS_VER` + **`CLUBE_UTILIZADORES`** (convidar e gerir treinadores/membros — §8.2) + `PROMOVER_ATLETAS` + `COMUNICACOES_GERIR` + `LEMBRETES_EQUIPA_GERIR`. **NÃO** tem `CLUBE_PERFIS` (definição de perfis de permissão continua do Administrador, tal como o estatuto de admin que exige `CLUBE_UTILIZADORES` **e** `CLUBE_PERFIS`) e **NÃO** gere billing nem restante estrutura/configuração de infra da conta.
- **Coordenador de Secção** — 🔁 **(novo v7):** `SECCAO`, todas as capacidades de **dados de equipa** dos escalões da(s) sua(s) secção(ões) + `EXERCICIOS_GERIR` + `RELATORIOS_VER` + `COMUNICACOES_GERIR` + `PROMOVER_ATLETAS` (dentro da secção) + **`SECCAO_ESCALOES_GERIR`** (gestão de escalões da sua secção — ver 6.9). **NÃO** tem `CLUBE_ESCALOES` (nível clube) e **NÃO** gere billing, branding, perfis, épocas nem outras secções.
- **Treinador Principal** — `PROPRIOS_ESCALOES`, capacidades de dados de equipa dos seus escalões + `EXERCICIOS_GERIR` + `RELATORIOS_VER` + `COMUNICACOES_GERIR`. `PROMOVER_ATLETAS` desligada por defeito.
- **Adjunto** — `PROPRIOS_ESCALOES`, capacidades operacionais (`TREINOS_GERIR`, `PRESENCAS_MARCAR`, `ESTATISTICAS_GERIR`, `CADERNETA_GERIR`, `EXERCICIOS_GERIR`). **NÃO** recebe `MANOAMANO_GERIR` (não gere competições 1×1), mas **pode registar resultados de duelos no bloco Mano-a-Mano da sessão de treino** por via de `TREINOS_GERIR` (secção 22.7).

> **Distribuição de `MANOAMANO_GERIR` (novo — secção 22):** incluído por defeito no **Administrador** (todas as capacidades), no **Diretor Técnico** e no **Coordenador de Secção** (todas as capacidades de dados de equipa) e no **Treinador Principal** (capacidades de dados de equipa dos seus escalões). O **Adjunto** não o recebe; regista duelos em treino via `TREINOS_GERIR`. O **Presidente** (leitura) não gere competições 1×1, mas vê a classificação/campeão nos relatórios via `RELATORIOS_VER`.
- **Presidente** — `TODO_CLUBE`, perfil de **leitura** para a direção do clube: apenas `RELATORIOS_VER` (analíticos e relatórios). A **licença** é visível a qualquer membro (não é gated por capacidade); a **configuração do clube** fica em leitura pela **ausência** das capacidades `CLUBE_*` (que só permitem editar). **NÃO** tem nenhuma capacidade `_GERIR`: não gere membros, perfis, treinos, jogos nem plantel.

### 6.7 Verificação (algoritmo de autorização)
Helper `exigirCapacidade(cap, escalaoId?)`:
1. Há utilizador autenticado? senão → `erro("Não autenticado")`.
2. Há adesão ativa (clube real ou técnico)? senão → `erro("Sem acesso a este clube")`.
3. As **capacidades efetivas** (6.4) incluem `cap`? senão → `erro("Sem permissão")`.
4. Se `cap` é de dados de equipa:
   - âmbito `TODO_CLUBE` → permitido em qualquer escalão;
   - **âmbito `SECCAO`** → o escalão-alvo pertence a uma secção atribuída (`escalao.seccaoId ∈ seccoesCoordenadas`)? senão → `erro("Sem permissão nesta secção")`;
   - âmbito `PROPRIOS_ESCALOES` → o escalão-alvo está nos atribuídos? senão → `erro("Sem permissão neste escalão")`.
5. Para **leitura** de escalão alheio (§6.5): âmbito `PROPRIOS_ESCALOES` → **só** os atribuídos (nunca por `visivelOutrosTreinadores`); âmbito `SECCAO` → escalões da secção coordenada + os `visivelOutrosTreinadores` fora da secção; âmbito `TODO_CLUBE` → todos.

### 6.8 Regras de proteção
- O **Administrador** tem sempre todas as capacidades; `capacidadesRevogadas` não se aplica ao último admin.
- Um clube real **nunca fica sem Administrador**.
- Um perfil **em uso** não se apaga sem reatribuir os membros.
- **Delegação (6.4):** atribuir/conceder só capacidades ≤ às próprias.
- **🔁 v7:** apagar uma **secção** exige que não tenha escalões; remover um coordenador de secção não afeta os dados da secção.

### 6.9 Coordenador de Secção — 🔁 novo v7
> Papel desenhado para clubes multi-desporto (ou com secções grandes) que querem delegar a gestão de **uma modalidade** sem dar acesso ao resto do clube.

- **Scope:** vê e gere **todos os escalões da(s) sua(s) secção(ões)** (`MembroSeccao`), como um "DT da secção". **Não** vê os escalões de outras secções (a menos que `visivelOutrosTreinadores`).
- **Âmbito `SECCAO`:** as capacidades de dados de equipa aplicam-se a todos os escalões cujo `escalao.seccaoId` esteja nas suas secções coordenadas.
- **Atribuição:** feita por quem tem `CLUBE_SECCOES` (Admin/DT) — cria-se um `MembroSeccao` ligando o membro à secção com `papel = COORDENADOR`.
- **Gestão de escalões dentro da secção (DEVE):** um Coordenador pode criar/editar/apagar escalões **da sua secção** (não de outras) através da capacidade dedicada **`SECCAO_ESCALOES_GERIR`** (âmbito `SECCAO`) — **não** através de `CLUBE_ESCALOES` (que é sempre de nível clube). Decisão fechada (fase 25): a gestão de escalões por secção usa `SECCAO_ESCALOES_GERIR`, resolvida por `exigirCapacidade` contra `escalao.seccaoId ∈ seccoesCoordenadas`.
- **Coordenação de múltiplas secções (DEVE):** uma pessoa pode ter `MembroSeccao` em **mais do que uma secção** (ex.: um coordenador que acumula futsal **e** futebol). É **raro, mas válido** — `seccoesCoordenadas` é uma lista e o âmbito `SECCAO` aplica-se a todos os escalões de **todas** as secções coordenadas por esse membro.
- **Analytics:** vê o analítico da **sua secção** (nível de secção — secção 10.3/10.8) e dos seus escalões; não vê o analítico transversal de todo o clube por defeito (configurável pelo Admin via override `RELATORIOS_VER` de âmbito).
- **Regra de delegação:** um Coordenador só concede a outros capacidades ≤ às próprias e **só dentro da sua secção**.

---

## 7. Server Actions

Sem REST (exceto o handler do Auth.js e, futuramente, o webhook do Paddle e o callback OAuth do Google Calendar). Todas as actions começam com `"use server"`, vivem em `lib/actions/`, e devolvem `Resultado<T>`.

### 7.1 Padrão obrigatório de cada action
1. Validar input com **Zod** (`lib/schemas/`).
2. Resolver contexto: `obterMembroAtual()`.
3. **`exigirCapacidade(cap, escalaoId?)`** (secção 6.7) — inclui âmbito `SECCAO`.
4. Quando aplicável, `obterEpocaAtiva()`.
5. **🔁 v7:** quando a operação depende da modalidade, **derivar a modalidade** da secção do escalão (`escalao.seccao.modalidade`) — nunca receber a modalidade do cliente como fonte de verdade.
6. Operar (Prisma), **filtrando sempre por clube + época + âmbito** (+ secção quando aplicável).
7. `revalidatePath()` das rotas afetadas.
8. Devolver `Resultado<T>`.

### 7.2 Helpers de contexto (`lib/`)
- `obterUtilizadorAtual(): Promise<Utilizador | null>`
- `obterMembroAtual()` — **sempre não-nulo** para autenticado; devolve também `seccoesCoordenadas: string[]` (🔁 v7).
- `capacidadesEfetivas(membro): string[]` — aplica overrides (6.4).
- `obterEpocaAtiva(): Promise<Epoca | null>`
- `exigirCapacidade(cap, escalaoId?)` — resolve âmbito `TODO_CLUBE`/`SECCAO`/`PROPRIOS_ESCALOES`.
- `podeLerEscalao(escalaoId): Promise<boolean>` — inclui a regra de secção coordenada.
- **🔁 v7:** `obterSeccaoAtual()` / `escaloesDaSeccao(seccaoId)` / `modalidadeDoEscalao(escalaoId): Promise<Modalidade>`.

### 7.3 Assinaturas por módulo (referência; validadas por Zod; devolvem `Resultado<T>`)

**Contas, clube e licença** (`contas.ts`, `clubes.ts`, `licenca.ts`)
```
registar(dados) // cria Utilizador + clube técnico + Secção (modalidade escolhida) + Carteira
iniciarSessao(dados), terminarSessao(), alterarMinhaPassword(dados)
criarClube(dados) // clube real: criador=Administrador + perfis de arranque
atualizarBrandingClube(dados) // CLUBE_BRANDING
obterClubeAtivo()
obterLicencaAtual(), simularAbsorcao(utilizadorId), aplicarCreditoAbsorcao(utilizadorId)
obterCarteira(), listarMovimentosCarteira()
```

**Secções** (`seccoes.ts`) — 🔁 novo v7 — `CLUBE_SECCOES`
```
listarSeccoes()                                   // secções do clube (com contagem de escalões)
criarSeccao({ modalidade, nome? })                // idempotente por (clubeId, modalidade)
atualizarSeccao(id, { nome })
apagarSeccao(id)                                  // bloqueado se tiver escalões
atribuirCoordenador(seccaoId, membroClubeId)      // cria MembroSeccao (papel COORDENADOR)
removerCoordenador(seccaoId, membroClubeId)
garantirSeccaoParaModalidade(modalidade)          // helper: cria a secção se não existir (usado ao criar escalão)
```

**Membros e perfis** (`membros.ts`, `perfis.ts`) — `CLUBE_UTILIZADORES` / `CLUBE_PERFIS`
```
convidarMembro(email, perfilId), removerMembro(id), sairDoClube()
atribuirPerfil(membroId, perfilId), atribuirEscaloes(membroId, escalaoIds[])
atribuirSeccoes(membroId, seccaoIds[])            // 🔁 v7: scope de secção (Coordenador)
definirOverrides(membroId, extra[], revogadas[])  // 6.4 (respeita delegação)
redefinirPasswordMembro(membroId, novaPassword)
listarMembros()          // dados sensíveis — exige CLUBE_UTILIZADORES
listarMembrosBasico()    // id + nome — qualquer membro ativo do clube
criarPerfil/atualizarPerfil/apagarPerfil/listarPerfis
```

**Escalões / Épocas / Catálogos** — `CLUBE_ESCALOES` / `CLUBE_EPOCAS` / `CATALOGO_*`
```
criarEscalao({ nome, seccaoId?, modalidade?, ... }) // 🔁 v7: cria/garante a Secção da modalidade e liga o escalão
atualizarEscalao/apagarEscalao/moverEscalao/listarEscaloes(seccaoId?)/definirVisibilidadeEscalao
criarEpoca/listarEpocas/definirEpocaAtiva/selecionarEpoca
criarMetrica({ ..., modalidade? })/listarMetricas(modalidade?)/alternarMetrica/moverMetrica
criarHabilidade({ ..., modalidade? })/atualizarHabilidade/apagarHabilidade/moverHabilidade/listarHabilidades(modalidade?)
```
> **🔁 `criarEscalao` (DEVE):** recebe `seccaoId` **ou** `modalidade`. Com `modalidade`, chama `garantirSeccaoParaModalidade` (cria a secção se ainda não existir — onboarding transparente, secção 8.1.1) e liga o escalão. Com `seccaoId`, valida que a secção pertence ao clube.
> **🔁 Bloqueio Individual = uma modalidade (DEVE):** se o clube for técnico Individual (`Clube.clubeTecnico && Licenca.tipo == INDIVIDUAL`), rejeitar com erro de validação se já existe uma `Secção` de modalidade diferente. O helper `garantirSeccaoParaModalidade` verifica esta condição antes de criar (mensagem sugere a licença de Clube — §17.1).

**Plantel e participações** (`atletas.ts`, `participacoes.ts`) — `PLANTEL_GERIR`, `PROMOVER_ATLETAS`
```
criarAtleta/atualizarAtleta/apagarAtleta(soft)/apagarAtletaDefinitivamente/obterAtleta
toggleAtivoAtleta(atletaId) // alterna ativo↔inativo (período experimental/saída — §8.5)
listarAtletas(escalaoId?, epocaId?, seccaoId?, incluirInativos?=false) // participação ativa; só ativos por defeito
criarAtletasEmMassa(lista[{nome, numero}]) // onboarding
associarAEscalao(atletaId, escalaoId, tipo, numero) // PLANTEL_GERIR no escalão (invariante principal por modalidade — §9)
transferirEscalao(atletaId, deEscalao, paraEscalao, permanente?)
editarTipoParticipacao(atletaId, escalaoId, tipo) // PROMOVER_ATLETAS; promover a PRINCIPAL despromove o principal anterior da modalidade (§9)
terminarParticipacao(atletaEscalaoId)
obterEstatisticasAtleta(id, escalaoId?)  // por escalão/modalidade + vista conjunta segmentada
obterCarreiraAtleta(id)                   // percurso (inclui modalidade via secção)
registarConsentimento(atletaId, tipo, dados)
```

**Exercícios e templates de sessão** (`exercicios.ts`, `templatesSessao.ts`) — `EXERCICIOS_GERIR`
```
criarExercicio({ ..., modalidade? })/atualizarExercicio/apagarExercicio/obterExercicio
duplicarExercicio(id) // UX-P3-06 — cria cópia 🎒 pessoal "(cópia)", proprietario=TREINADOR, partilhado=false
listarExercicios(parteTreino?, categoria?, modalidade?, q?) // biblioteca pessoal + clube
partilharExercicioNoClube/removerPartilhaNoClube/instalarBibliotecaArranque(modalidade?)
criarModeloSessao({ ..., modalidade? })/atualizarModeloSessao/apagarModeloSessao/listarModelosSessao(escalaoAlvo?, modalidade?)/obterModeloSessao(id)
partilharModeloSessaoNoClube(id), criarSessaoDeTemplate({modeloSessaoId, escalaoId, data, epocaId?})
instalarTemplatesArranque(modalidade?)
```

**Treinos e periodização** (`treinos.ts`, `periodizacao.ts`) — `TREINOS_GERIR` / `PERIODIZACAO_GERIR` / `PRESENCAS_MARCAR`
```
criarSessao/atualizarSessao/apagarSessao/obterSessao/listarSessoes(escalaoId?)
adicionarExercicioSessao/removerExercicioSessao/reordenarExercicios
atualizarExercicioSessao(sessaoExercicioId, dados) // §8.8.2 — override por sessão (duracaoMin/series/descricaoOverride/notas); TREINOS_GERIR; não altera a biblioteca
marcarPresencas(sessaoId, presencas[]) // upsert em lote; inclui motivo de falta
criarPlaneamento/atualizarPlaneamento/apagarPlaneamento/listarPlaneamentos/sugerirPlaneamento
registarRpeSessao(sessaoId, rpe)/registarRpeAtleta(sessaoId, atletaId, rpe)/obterCargaSemanal(escalaoId)
// §8.8.1 — Plano semanal de treinos
preverPlanoSemanal(dados)            // dry-run: nº de sessões, intervalo, dias já ocupados; não persiste
criarPlanoSemanal(dados)             // gera as sessões da época em transação; devolve { planoId, geradas, ignoradas }
listarPlanosSemanais(escalaoId?)/obterPlanoSemanal(id)
atualizarPlanoSemanal(id, dados)     // add/remover dias, renomear, ativo; propaga baseline às futuras
apagarPlanoSemanal(id, { modo })     // modo: DESVINCULAR | APAGAR_FUTURAS_VAZIAS
atualizarSessao(id, dados, { alcance? }) // alcance: SO_ESTA (default) | ESTA_E_FUTURAS (só p/ sessões com planoSemanalId)
```

**Modelo de jogo / quadro tático** (`modeloJogo.ts`) — `MODELO_JOGO_GERIR`
```
criarModeloJogo({ ..., modalidade? })/atualizarModeloJogo/apagarModeloJogo/obterModeloJogo
listarModelosJogo(escalaoId?, momento?, modalidade?) // portáteis (escalaoId=null) sempre incluídos
criarQuadroTatico(jogoId, dados)/atualizarQuadroTatico/apagarQuadroTatico/listarQuadrosTaticos(jogoId, tipo?)
```

**Jogos, competições, estatísticas, scouting** (`jogos.ts`, `competicoes.ts`, `scouting.ts`)
```
criarJogo({ ..., formato? })/atualizarJogo/apagarJogo/obterJogo/listarJogos(escalaoId?)   // formato derivado da secção; editável
definirConvocatoria(jogoId, convocados[...]) // CONVOCATORIA_GERIR
definirPlanoTatico(jogoId, plano)            // posição/titular previstos (posições da modalidade do jogo)
guardarEstatisticas(jogoId, estatisticas[])  // ESTATISTICAS_GERIR — núcleo por modalidade (§10.8) + métricas
registarEventoJogo/listarEventosJogo/removerEventoJogo // live; tipos por modalidade
guardarRelatorio/definirVideo
obterSuspensoesPendentes(escalaoId) -> SuspensaoPendente[]  // BUG-P1-04 — convocados do próximo jogo suspensos (vermelho no último jogo / ≥3 amarelos na época)
obterVistaDiaDeJogo(jogoId)
criarCompeticao/atualizarCompeticao/apagarCompeticao/listarCompeticoes // COMPETICOES_GERIR
registarResultadoExterno(competicaoId, dados)/obterClassificacao(competicaoId)
// 🔁 2026-08-20: equipas, quadro competitivo e agendamento (COMPETICOES_GERIR)
adicionarEquipaCompeticao(competicaoId, nome) -> EquipaCompeticao
removerEquipaCompeticao(equipaCompeticaoId)   // bloqueia se a equipa já tem jogos REALIZADOS
obterEquipasCompeticao(competicaoId) -> EquipaCompeticao[]
gerarQuadroCompeticao(competicaoId, { duasMaos: boolean }) -> ResultadoCompeticao[] // falha se já há quadro (confirmação no UI)
criarCompeticaoCompleta(dados, equipas, jogos) -> Competicao // transação única do wizard (§8.11)
atualizarAgendamentoJogo(resultadoId, dataHora: Date | null)
criarObservacaoAdversario(jogoId?, dados)/listarObservacoes // SCOUTING_GERIR
```

**Comunicação, lembretes, reuniões, calendário, relatórios/analytics/carreira** — conforme v6 §7.3 (sem alteração de assinatura na v7).
```
gerarTextoComunicacao / gerarCalendarioTexto / listarModelosComunicacao / editarModeloComunicacao / instalarSeedComunicacao
criarLembretePessoal / criarLembreteEquipa / marcarLembreteFeito / listarMeusLembretes / atualizarLembrete / apagarLembrete
criarReuniao / atualizarReuniao / apagarReuniao / listarReunioes
obterUrlAutorizacaoCalendario / obterIntegracaoCalendario / desconectarGoogleCalendar / sincronizarComCalendario
obterAnalyticsAtleta / obterAnalyticsEquipa / obterAnalyticsClube(epocaId, seccaoId?) // 🔁 v7: filtro por secção
gerarPDF / criarRelatorioPartilhado / obterRelatorioPartilhado / listarRegistoCarreira / editarRegistoCarreira
```

## 8. Módulos funcionais

Cada módulo define **conteúdo**, **ações**, **estado vazio** e **regras**. Estados loading/erro seguem a secção 13. Navegação: barra de topo (logótipo do clube + **seletor de secção quando >1** + seletor de época + menu do utilizador) + sidebar (PC) / bottom-nav (móvel). **A sidebar tem dois estados — expandida (ícone + rótulo, 224px) e colapsada (só ícones, 64px)** com um botão de alternância no topo; a preferência do utilizador é persistida (`localStorage`). **Por defeito arranca colapsada em tablet (md–xl, ~768–1279px, incl. iPad em paisagem) e expandida em desktop (≥xl, ≥1280px)**; em móvel (<md) usa-se a bottom-nav. **A bottom-nav (móvel) expõe os itens primários — Início · Plantel · Agenda · Exercícios — sendo os restantes acedidos pelo menu "Mais"** (🔁 2026-08-26b — a **Agenda substitui** os antigos itens separados de **Treinos** e **Jogos** no menu, que eram redundantes com a vista central de eventos; **Treinos e Jogos deixam de figurar como itens de navegação** — as rotas `/treinos` e `/jogos` mantêm-se como **vistas de gestão**, acessíveis a partir da própria Agenda, §8.13.1). **No modo Individual, os módulos de gestão de clube (secções, membros, perfis, branding) não aparecem.**

### 8.1 Onboarding e contas
> **Princípio (decisão 2026-08-05):** o **formulário de registo recolhe apenas o essencial**. O **setup completo é feito no primeiro ecrã após o primeiro login** (onboarding guiado pós-registo) — nunca misturado com o pagamento.
- **Login** (`/login`): email + password. Erros inline; toast em falha.
- **Registo — só dados essenciais:**
  - **Individual:** nome, email, password **+ modalidade (futsal ou futebol)** 🔁. Cria `Utilizador` + **clube técnico** invisível + **Secção** da modalidade + `Carteira`.
  - **Clube:** nome, email, password **+ nome do clube**. Cria `Utilizador` + `Clube` real (criador = Administrador; perfis de arranque). A **primeira secção** cria-se ao criar o primeiro escalão (8.1.1).
  - ❌ **Não** se recolhem no registo/pagamento: logótipo, cores, escalões.
- **Setup guiado pós-primeiro-login (onboarding):**
  - **Clube:** logótipo, **cores** (branding), **modalidade(s)** + **escalões** (ao criar o primeiro escalão de uma modalidade, a respetiva secção é criada automaticamente), época — cada passo pode ser saltado.
  - **Individual:** vai direto para o percurso de vitória rápida.
- **Vitória rápida (decisão 2026-08-05):** valor nos primeiros 10 minutos — criação em massa do plantel → primeira sessão a partir de template → primeira convocatória partilhada no WhatsApp.
- **Aceitar convite:** por link/email; adere ao clube com o perfil (e, se for Coordenador, a(s) secção(ões)) atribuído.
- **Estado vazio:** plantel/treinos vazios encaminham para a vitória rápida.

#### 8.1.1 Secções e navegação multi-desporto — 🔁 novo v7
- **DEVE — criação transparente:** a **Secção** é criada **automaticamente** ao criar o **primeiro escalão** de uma modalidade que o clube ainda não tem (via `garantirSeccaoParaModalidade` na `criarEscalao`). Quem só faz uma modalidade **nunca vê** UI de secções.
- **DEVE — seletor de secção condicional:** o **seletor de secção** na barra de topo (ou no cabeçalho de plantel/treinos/jogos) **só aparece quando o clube tem mais do que uma secção**. Com uma só secção, tudo funciona como na v6 (sem passo extra).
- **DEVE — separação visual:** dentro de cada módulo (plantel, treinos, jogos, exercícios, analytics), quando há >1 secção, os escalões são **agrupados/filtrados por secção** — "Benjamins Futsal" e "Benjamins Futebol" nunca se confundem (secção 1.7.2). A tabs de escalão passa a ser **agrupada por secção** ou precedida pelo seletor de secção.
- **DEVERIA — memória de contexto:** a secção selecionada persiste (cookie/estado de UI) entre navegações, à semelhança da época ativa; nunca é fonte de autorização (5.4).

### 8.2 Gestão de membros e perfis (`CLUBE_UTILIZADORES`, `CLUBE_PERFIS`) — só clube real
- **Membros:** lista (nome, perfil, **secções coordenadas** 🔁, escalões, estado, overrides). Ações: convidar, editar perfil, atribuir escalões, **atribuir secções (Coordenador)** 🔁, definir overrides, restringir visibilidade, repor password, remover.
- **Editor de overrides:** diálogo por membro com a grelha do catálogo (6.2); origem por linha (`perfil`/`extra`/`revogada`); delegação (6.4).
- **Gating de UI:** sem `CLUBE_UTILIZADORES` o ecrã da equipa técnica é **só de leitura**.
- **Perfis:** criar/duplicar/editar/apagar; editor = nome + âmbito (`TODO_CLUBE`/**`SECCAO`**/`PROPRIOS_ESCALOES`) + grelha de capacidades.
- **Regras:** nunca deixar o clube sem admin; perfil em uso não se apaga sem reatribuir; delegação.

### 8.3 Branding do clube (`CLUBE_BRANDING`) — só clube real
- Editar cor primária, secundária e logótipo (upload → Supabase Storage). Cores por variáveis CSS em tempo real; logótipo na barra de topo, marca de água e PDF. Pré-visualização. **🔁 v7:** o branding é do **clube** (transversal às secções) — não há branding por secção.

### 8.4 Definições base
- **🔁 Secções** (`CLUBE_SECCOES`): listar, criar (por modalidade; idempotente por `@@unique[clubeId, modalidade]`), renomear, atribuir/remover coordenadores, apagar (bloqueado se tiver escalões). Ver 8.22.
- **Escalões** (`CLUBE_ESCALOES`): CRUD + reordenar + visibilidade; **cada escalão pertence a uma secção** (selecionada ou derivada da modalidade). Apagar bloqueado se tiver participações/atletas.
- **Épocas** (`CLUBE_EPOCAS`): criar, listar, definir ativa; **wizard «Nova Época»** (8.21).
- **Métricas** (`CATALOGO_METRICAS`): CRUD + tipo + ativar/desativar + reordenar; **🔁 opcionalmente por modalidade** (só aparecem nessa modalidade; null = ambas).
- **Habilidades** (`CATALOGO_HABILIDADES`): CRUD por nível + reordenar; **🔁 opcionalmente por modalidade**.
- **Subcategorias de exercício:** CRUD (seed instala predefinidas).
- **Templates de comunicação** (`COMUNICACOES_GERIR`): ver/editar variantes.

### 8.5 Plantel e participações (`PLANTEL_GERIR`, `PROMOVER_ATLETAS`)
- **Atleta ao nível do clube** (transversal às modalidades — 1.7.3). Lista: **agrupada por secção quando >1** 🔁, tabs por escalão (participações ativas na época) + pesquisa; cartões (avatar, nome, **número do escalão**, posições da modalidade). **Aviso de número duplicado** entre participações ativas do mesmo escalão.
- **Participações (N-N):** um atleta tem uma **participação PRINCIPAL por modalidade** 🔁 e pode ter simultâneas/ocasionais noutros escalões (mesma ou outra modalidade). Ações: **associar** (tipo + número), **transferir** (transição permanente muda o principal da modalidade), **editar tipo** (mudar entre principal/simultânea/ocasional numa participação ativa), **terminar**. Histórico preservado.
- **Editar tipo de participação 🔁 novo 2026-08-26:** na aba **Participações**, cada participação **ativa da época atual** tem um botão **«Editar»** (dialog com select de tipo) além de «Terminar». A ação `editarTipoParticipacao` respeita o invariante do principal **por modalidade** (§9): ao passar uma participação a **PRINCIPAL**, o principal anterior da mesma modalidade é **despromovido automaticamente a SIMULTANEA** na mesma transação Serializable; tentar despromover o **único** principal da modalidade é **recusado** (participação principal obrigatória — transferir/promover outro escalão primeiro). Um principal de **outra** modalidade nunca é tocado.
- **Gating de UI (6.7):** associar/transferir só com `PLANTEL_GERIR`; editar tipo/terminar só com `PROMOVER_ATLETAS`. Os escalões oferecidos limitam-se aos **geríveis** (todos se `TODO_CLUBE`; da secção se `SECCAO`; os atribuídos se `PROPRIOS_ESCALOES`).
- **Perfil do atleta:** cabeçalho + abas **Estatísticas** (vista conjunta na época **segmentada por modalidade/secção** 🔁 + vista por escalão), **Caderneta**, **Carreira** (percurso, com modalidade), **Dados** (+ consentimentos), **Participações** (histórico de escalões, indicando modalidade).
- **Novo/Editar:** nome (obrigatório), posições (filtradas pela modalidade do contexto, mas o atleta pode acumular de ambas), data de nascimento, foto (URL), **estado de inscrição** (switch «Inscrito»), encarregado de educação; **escalão + número** na participação.
- **Estado de inscrição (`inscrito`) 🔁 novo 2026-08-26:** campo booleano **`inscrito`** (default `false`) que distingue quem já está **formalmente inscrito** (na federação/no clube) de quem falta inscrever. É **independente de `ativo`** — um atleta ativo no plantel pode ainda estar por inscrever. Gravado na criação (`inscrito ?? false`) e editável no formulário do atleta; em `atualizarAtleta` só é escrito quando fornecido. **Na UI:** uma etiqueta pequena (`BadgeInscricao`, informação secundária) mostra **«Inscrito»** (verde) / **«Por inscrever»** (âmbar) nos **cartões** do plantel (junto ao «Inativo») e no **cabeçalho do perfil**. A página do plantel oferece um **seletor de vista** (Cartões ↔ Inscrições, estado em `?vista=inscricoes`, preservando os restantes filtros); a vista **Inscrições** é uma lista responsiva com **nome, idade + data de nascimento, encarregado (nome + contacto) e estado de inscrição**, cada linha ligada ao perfil.
- **Estado no plantel (`ativo`) 🔁 novo 2026-08-20:** o atleta tem um campo booleano **`ativo`** (default `true`) que distingue quem está **no plantel** de quem **saiu** ou ainda está em **período experimental** (nos primeiros treinos aparecem atletas a experimentar — são criados e as suas presenças registadas antes de se saber se ficam). A **lista do plantel só mostra atletas ativos por defeito** (`listarAtletas` filtra `ativo:true`); um parâmetro opcional **`incluirInativos`** mostra todos. A ação **`toggleAtivoAtleta`** alterna o estado (verifica `PLANTEL_GERIR` num escalão do atleta); ao contrário de `apagarAtleta` (que força `ativo:false`), faz toggle — reativa um inativo ou desativa um ativo. A **edição de dados pessoais não altera `ativo`** (só as ações dedicadas o fazem). **Na UI:** a lista do plantel expõe o toggle *«Mostrar atletas inativos»* (`FiltroInativos`, estado em `?incluirInativos=1`, preservando os restantes filtros) e apresenta os atletas inativos esbatidos (`opacity-60`) com badge **«Inativo»**; o perfil do atleta expõe o switch de estado no separador **«Dados»** (`ToggleAtivoAtleta`, visível só com `PLANTEL_GERIR`, atualização otimista + `toast`). As **queries de histórico** (estatísticas, presenças e convocatórias passadas em `obterEstatisticasAtleta`) **não** filtram por `ativo` — um atleta inativo mantém o histórico válido.
- **Apagar:** soft-delete; hard-delete só por RGPD (5.5) — remove participações em todas as secções.
- **Estado vazio:** "Ainda não há atletas neste escalão." + atalho de criação em massa.

### 8.6 Exercícios e bibliotecas (`EXERCICIOS_GERIR`)
- **Duas bibliotecas em abas** (`/exercicios?bib=pessoal|clube`, default pessoal): **Pessoal** (🎒) e **do Clube** (🏛️). A aba **Pessoal** mostra os exercícios do próprio treinador **e** os exercícios pessoais dos treinadores com quem partilha ≥1 escalão (§3.3) — estes últimos em **modo leitura** (não editáveis; podem ser duplicados). Filtro por **parte do treino** / categoria / **modalidade** 🔁 (futsal/futebol/genérico) + pesquisa por nome; grelha de cartões com miniatura do diagrama, badges e marca de **seed** («Curado»).
- **Biblioteca de exemplo curada** (Mister): organizada por parte do treino/objetivo/escalão **e por modalidade** 🔁 — instalável por modalidade (`instalarBibliotecaArranque(modalidade?)`); garante que nunca começa vazia.
- **Detalhe:** nome, modalidade, parte do treino, categoria, duração, objetivo, descrição, **nº de jogadores** 🔁 e **espaço** 🔁 (quando preenchidos), **diagrama** (render read-only, play se animado; campo de futsal ou de futebol conforme a modalidade — 11.5).
- **Novo/Editar:** formulário + **editor de campo** (secção 11) com passos/animação. **🔁 Campo «Modalidade»** (futsal/futebol/genérico) — determina o campo do editor. **🔁 Campos «Nº de jogadores» e «Espaço»** (texto livre, opcionais) na secção de detalhes — ex.: "4+GR", "3x3+GR", "campo inteiro", "20x20m". **Toggle de biblioteca** (🎒/🏛️) só na criação. **Toggle "partilhar no clube"** nos cartões.
- **Apagar:** bloqueado se em uso (indica em quantas sessões/templates).

### 8.7 Templates de sessão (`EXERCICIOS_GERIR`)
- Rota **`/treinos/templates`**. Sessões completas, organizadas por objetivo/fase/escalão **e modalidade** 🔁. Curadas (seed) + do treinador/clube. Filtro por escalão alvo **e por modalidade**.
- **Novo/Editar:** diálogo com nome, **modalidade** 🔁, escalão alvo, fase da época, objetivo tático, duração, descrição, toggle de biblioteca e lista de exercícios reordenável (picker filtra pela modalidade do template).
- **Criar sessão a partir de template:** pede data/hora + escalão (da mesma modalidade do template) e copia exercícios/durações.
- **Partilhar no clube:** só templates pessoais do autor; **transfere a propriedade** (§3.4).

### 8.8 Treinos (`TREINOS_GERIR`, `PRESENCAS_MARCAR`)
- **Lista/Calendário:** **agrupamento por secção quando >1** 🔁, tabs por escalão; alternância lista ⇄ calendário mensal; agrupamento automático por **semana** (8.9). **Atalho «Ver na Agenda»** (`/agenda?vista=lista&tipo=TREINO`) para a vista central unificada (§8.13.1).
- **Detalhe (`/treinos/[id]`):** ecrã redesenhado orientado à **condução do treino** — cabeçalho, **Iniciar treino** (modo condução em campo), **Presenças** (toggle de 1 toque), **Exercícios** (com conteúdo real e linha expansível), **Carga da sessão (RPE)** e **Notas** editáveis inline. Especificação completa em **§8.8.2**.
- **Novo/Editar:** **dois modos** — *Treino avulso* (sessão única, fluxo atual) ou *Plano semanal* (§8.8.1). No modo avulso: data/hora, escalão, duração, objetivo, local, notas, ligação a semana (opcional), criar a partir de template, **modalidade da actividade** (opcional) 🔁.
- **🔁 Modalidade da actividade (v7):** o campo "Modalidade da actividade" é **opcional** e por defeito herda da secção do escalão. O treinador pode alterá-lo para actividades pontuais (ex: escalão de futebol que participa num torneio de futsal). Quando diferente da modalidade mãe, a sessão é sinalizada com badge de modalidade nos painéis de treino.
- **Estado vazio:** "Sem sessões nesta época."

#### 8.8.1 Plano semanal de treinos (`TREINOS_GERIR`) — 🔁 novo 2026-08-20
Dois modos de criação de treinos. **Modo 1 — Treino avulso:** sessão única (§8.8), inalterado. **Modo 2 — Plano semanal:** agenda o horário recorrente do escalão e o sistema gera automaticamente as sessões da época.

- **Rotas:** toggle "Treino avulso | Plano semanal" em **`/treinos/novo`**; gestão dos planos em **`/treinos/planos`** (lista por escalão).
- **Criar plano:** escolher escalão + selecionar os **dias da semana** com treino; por **cada dia** definir **hora de início**, **hora de fim**, **local** e **tipo de sessão** (`TipoSessao`, default `NORMAL`). Nome do plano opcional (fallback = nome do escalão).
- **Intervalo de geração:** de **`dataInicioGeracao`** (default: hoje, ou `época.dataInicio` se a época ainda não começou; editável) até **`época.dataFim`**. **Nunca gera sessões no passado** por defeito.
- **Pré-visualização obrigatória:** antes de confirmar, `preverPlanoSemanal` mostra "**Vais gerar N treinos** entre DD/MM e DD/MM" e **quantos dias já têm treino** (serão ignorados). Confirmação explícita.
- **Geração:** `criarPlanoSemanal` cria, numa transação, uma `Sessao` por cada data do intervalo cujo dia da semana está configurado — `data` = data @ `horaInicio`, `duracaoMin` = `horaFim − horaInicio`, `local`, `tipoSessao`, ligada ao plano (`planoSemanalId`) e ao dia (`planoSemanalDiaId`). **Sem** exercícios nem presenças (conteúdo é preenchido depois). **Deduplicação:** datas que já têm sessão para o escalão são **ignoradas** (não duplica). Sessões `NORMAL` geradas têm `planeamentoId = null` (a ligação à periodização mantém-se um passo separado, §8.9).
- **Cada sessão gerada é individualmente editável** como qualquer treino.

**Editar uma sessão gerada — escolha de alcance.** Ao guardar alterações de **agendamento** (hora, local, tipo, duração) numa sessão ligada a um plano, a UI pergunta:
- **Só esta sessão** (default) — altera apenas esta e marca-a `personalizada = true` (fica protegida de futuras propagações).
- **Esta e todas as futuras** — atualiza o **baseline** do dia (`PlanoSemanalDia`) e aplica os mesmos campos a **todas as sessões futuras** do mesmo dia ligadas ao plano, **exceto** as já `personalizada`; a sessão-âncora recebe sempre a alteração. **Nunca** altera sessões com `data < agora`. A UI reporta "N sessões atualizadas; M personalizadas mantidas".
- Alterações de **conteúdo** (exercícios/presenças/notas/objetivo/RPE) são **sempre** "só esta" e nunca são tocadas pela propagação.

**Gerir o plano (`/treinos/planos`):**
- **Adicionar dia:** gera as sessões futuras (hoje→fim da época) desse novo dia (com deduplicação).
- **Remover dia:** apaga as sessões **futuras e sem conteúdo** desse dia; as que já têm conteúdo são **desvinculadas** e preservadas; passadas intactas. Confirmação.
- **Editar hora/local/tipo de um dia:** equivale a "esta e todas as futuras" a partir de hoje.
- **Apagar plano:** modo **Desvincular** (`planoSemanalId = null`, mantém sessões) ou **Apagar futuras vazias** (apaga futuras sem conteúdo e desvincula as restantes). **Nunca apaga sessões com conteúdo em silêncio.**
- **No máximo um plano `ativo` por (escalão, época).** Escalões diferentes têm planos diferentes.
- **Sincronização Google Calendar:** cada sessão gerada sincroniza como treino individual (§8.16); a propagação de hora faz *update* do evento (idempotente via `googleEventId`), nunca delete+recreate.

#### 8.8.2 Detalhe da sessão de treino — ecrã de condução (`TREINOS_GERIR`, `PRESENCAS_MARCAR`) — 🔁 novo 2026-08-20

O ecrã `/treinos/[id]` é redesenhado para ser **mobile-first** e servir dois momentos: **preparar** o treino (antes) e **conduzi-lo em campo** (durante). Usa `Sessao`, `SessaoExercicio` (incl. campos `snap*` e os campos de adaptação por sessão `series`/`descricaoOverride`/`notas`), `Presenca`, `Sessao.rpeSessao` e `RpeAtleta` (§3.5). Alvos de toque **≥44px** em toda a página; tipografia ampliada no modo condução.

**Ordem das secções (de cima para baixo):**
1. **Cabeçalho** — data/hora, local, duração e objetivo da sessão (badge de modalidade quando a actividade difere da modalidade mãe, §8.8). **Badge "Concluído"** (cinza neutro, ícone `CheckCircle2`) quando o treino já foi realizado — ver **estado "concluído"** abaixo.
2. **Iniciar treino / Ver treino** — botão de arranque do modo condução; num treino já realizado passa a **"Ver treino"** (revisão/apresentação).
3. **Presenças** — marcação por toggle de 1 toque.
4. **Exercícios** — lista com conteúdo real e linha expansível.
5. **Carga da sessão (RPE)** — RPE da sessão (§8.20).
6. **Notas** — campo editável inline (sem entrar em "Editar").

No cabeçalho, ao lado de **"Editar"**, existe o botão **"Exportar PDF"** (ícone `FileDown`, `ExportarTreinoPdfBotao`) — ver **impressão/PDF do plano de treino** abaixo.

**0. Impressão / PDF do plano de treino.** Para levar o treino impresso quando não há tablet, o botão **"Exportar PDF"** do detalhe abre numa **nova aba** a rota **`/treinos/[id]/print`** — uma página **fora do grupo `(app)`** (sem sidebar nem barra de topo), otimizada para `@media print`. Verifica a sessão via `auth()` (redirect para `/login` se não houver sessão) e reforça a autorização por escalão/clube ao ler a sessão com `obterSessao` (§7.3). O template (`TreinoPrintTemplate`, *server component* — o diagrama SVG sai fiel **sem depender de JavaScript**) apresenta: **cabeçalho** com o logótipo **Mister** (produto) e o **nome do clube + época** no contexto da página (§BRAND — o logótipo do clube não faz lockup ao lado do produto), acrescido (**quando disponível**) da **nomenclatura técnica federativa** da sessão — **Microciclo** (a UI mostra "Semana"), **Mesociclo**, **Período** (`PeriodoEpoca`) e **Momento** (MD-X, `MomentoSemana`) — e do **nº de presentes/registados** na sessão (presenças marcadas / atletas elegíveis); **resumo** (duração total — `Sessao.duracaoMin` ou o somatório dos exercícios —, nº de exercícios, tipo de sessão `TipoSessao`, local, objetivo e notas da sessão); **lista de exercícios em sequência numerada**, cada um com número de ordem, nome, metadados (duração, fase `ParteTreino`, categoria `CategoriaExercicioPrincipal`, séries e, **quando não nulos**, **nº de jogadores** 🔁 e **espaço** 🔁 como badges — respeitando os overrides da sessão e o snapshot), **miniatura do diagrama** (`MiniaturaCampo`, quando existe), **objetivo**, **descrição** (respeitando `descricaoOverride` e o **snapshot** §4.2.1) e notas; e **rodapé** com o clube e a data de impressão. Os cabeçalhos de secção usam o **laranja Mister** (`#F0531E`). Cada exercício usa `break-inside-avoid` para **não partir a meio** entre páginas. A barra de ações (link "Voltar" + botão "Imprimir / Guardar PDF", `BotaoImprimir`) tem `print:hidden`/`data-print-hidden`; ao abrir, o `AutoImprimir` dispara o diálogo de impressão do browser (**"Guardar como PDF"**) após um curto atraso para as fontes/SVG estarem pintados. Abordagem **serverless-safe** (sem motor nativo/WASM), coerente com o export dos analíticos (§8.15).

**1. Exercícios com conteúdo real.** Cada linha da lista mostra:
- **Miniatura do diagrama de campo** (`MiniaturaCampo`) quando o exercício tem diagrama; *placeholder* neutro quando não tem.
- **Nome**, **categoria** (`CategoriaExercicioPrincipal` / subcategoria) e **duração** (min).
- **Objetivo** em texto, apresentado **abaixo do nome**.
- **Linha expansível:** um toque abre um **painel inline** com a **descrição/montagem completa** do exercício (sem navegar para fora). Novo toque recolhe.
- **Linha clicável para o detalhe do exercício** (abre a ficha do exercício); a área de expandir/recolher e a de navegar são visualmente distintas para não colidirem no toque.
- **Reordenar** só aparece em **modo "Editar ordem"** (toggle no topo da secção): fora desse modo, os controlos de arrastar/subir/descer estão **ocultos** para manter a lista limpa durante a leitura e a condução. A reordenação continua a persistir via `SessaoExercicio.ordem` (regras de reordenação de §9 inalteradas).
- **Diagrama clicável (`ModalDiagramaExercicio`):** um toque na miniatura do diagrama abre um **modal** com o diagrama **em grande** (leitura à distância, sem sair do ecrã). Recolhe ao fechar.
- **Adaptar exercício para a sessão (`AdaptarExercicioDialog`):** cada linha tem um botão **"Adaptar"** (ícone `SlidersHorizontal`) que abre um diálogo para ajustar o exercício **só nesta sessão**, sem tocar na biblioteca original. Campos: **duração** (min), **séries**, **nº de jogadores** 🔁, **espaço** 🔁, **montagem** (descrição própria da sessão) e **notas** do treinador. Os campos **nº de jogadores** e **espaço** vêm **pré-preenchidos com o valor base** do exercício (`Exercicio.numeroJogadores`/`espaco`), semeados como override quando o exercício é adicionado à sessão. Persiste via `atualizarExercicioSessao(sessaoExercicioId, dados)` (§7.3), validado por `sessaoExercicioOverrideSchema` (Zod: `duracaoMin`/`series`/`numeroJogadoresOverride`/`espacoOverride`/`descricaoOverride`/`notas`), com verificação de clube e capacidade **`TREINOS_GERIR`** no escalão. Os valores gravam-se nos campos `SessaoExercicio.series`/`numeroJogadoresOverride`/`espacoOverride`/`descricaoOverride`/`notas` (§3.5); a `duracaoMin` sobrepõe a duração-base do exercício **para esta sessão**.
- Fonte do conteúdo respeita o **snapshot** quando existe (`snapNome`/`snapDescricao`/`snapObjetivo`/`snapDiagrama`/`snapNumeroJogadores`/`snapEspaco` de exercício portátil usado em sessão do clube — §4.2.1); caso contrário, os campos do exercício mestre. Quando existe `descricaoOverride` (ou `numeroJogadoresOverride`/`espacoOverride`) na sessão, este **prevalece** sobre o valor da biblioteca/snapshot na apresentação do exercício desta sessão.

**2. Presenças com toggle de 1 toque.** Substitui os dropdowns `Select` por um **controlo segmentado inline por atleta**, com os estados: **`Presente` · `Falta` · `Lesionado` · `Just.`** (mapeados a `EstadoPresenca`: `PRESENTE`, `FALTA`, `LESIONADO`, `FALTA_JUSTIFICADA`). Comportamento:
- **Um toque** define o estado do atleta (sem abrir menu). O segmento ativo fica destacado com a **cor do clube** (`--cor-primaria`).
- O **campo de motivo de falta** (`Presenca.motivo`, enum `MotivoFalta`; `justificacao` livre opcional) surge **contextualmente** apenas quando o estado o justifica (`FALTA`/`FALTA_JUSTIFICADA`/`LESIONADO`), com as opções já existentes (Lesão/Doença/Outro/Sem justificação, §2).
- **Mantêm-se** as ações e indicadores atuais: **"Marcar todos presentes"**, **"Repor"**, **contador** (presentes/total) e **"Guardar presenças"** (upsert em lote, §8.8). O estado `ATRASADO` permanece válido no modelo, acessível pela edição do motivo/estado quando aplicável, mas fora dos quatro segmentos principais.
- **Guardar só com alterações pendentes (DEVE):** o botão **"Guardar presenças"** compara o estado atual com o estado inicial carregado do servidor (helper puro `presencasAlteradas` em `lib/presencas.ts`, que normaliza a justificação — `null`/`""`/espaços equivalem) e **fica desativado quando não há nada por guardar** (rótulo "Sem alterações"); o botão **"Repor"** desativa-se pela mesma condição. Guarda também no servidor (`guardar` só submete se houver alterações).
- **Sessão fechada é só-leitura (DEVE):** quando a sessão está **fechada** (`Sessao.fechado = true`, §8.8 — fechar/reabrir), a marcação de presenças entra em **modo só-leitura** — os segmentos de estado, os botões de motivo e o texto livre ficam **desativados**, os atalhos "Marcar todos presentes"/"Repor" e a barra "Guardar presenças" ficam **ocultos**, e surge um **badge "Sessão concluída · só leitura"** (ícone `Lock`) com a indicação de reabrir a sessão para editar. **Reforço no servidor:** `marcarPresencas` (`lib/actions/treinos.ts`) rejeita a escrita numa sessão fechada (devolve `Resultado` de erro) — defesa em profundidade além da UI. **Reabrir** a sessão (botão dedicado no cabeçalho do detalhe) volta a permitir editar.
- Persistência inalterada: `Presenca` com `@@unique([sessaoId, atletaId])`, cálculo por escalão (§3.5).

**3. Modo treino (condução em campo — `ModoTreino`).** Acionado pelo botão **"▶ Iniciar treino"** no topo (cor **laranja Mister**, **largura total em mobile**) para treinos futuros/de hoje; num treino já realizado o botão passa a **"👁 Ver treino"** (estilo neutro/contorno, ícone `Eye`) e abre o mesmo overlay em **modo de revisão** (sem retomar sessões suspensas, que só fazem sentido durante a condução ao vivo). Abre uma **vista em ecrã cheio** focada num exercício de cada vez:
- **Exercício atual em grande:** diagrama ampliado, nome, objetivo e descrição, com tipografia grande e legível à distância. Quando o exercício tem **animação guardada** (passos, §11.2), o diagrama é apresentado com o `CampoAnimado` e **arranca sozinho em ciclo** assim que o painel do exercício abre — sem clicar em play (os controlos de play/pausa/velocidade/repetir mantêm-se disponíveis); ao navegar para outro exercício com animação, a reprodução recomeça automaticamente. Exercícios sem animação mostram a miniatura estática.
- **Conteúdo de adaptação da sessão:** quando o exercício ativo tem **séries** (`series`), **montagem própria** (`descricaoOverride`) ou **notas do treinador** (`notas`) definidas via "Adaptar" (§8.8.2 ponto 1), estes surgem no exercício ativo — as séries em destaque, a montagem sobrepõe a descrição-base e as notas do treinador aparecem como bloco próprio.
- **Cronómetro crescente** (conta desde o início do treino) com **pausa/retoma**: botão **Pause/Play** que **suspende e retoma** a contagem sem a reiniciar. **Barra de progresso** do percurso pelos exercícios (ex.: **"2/5"**).
- Navegação com **"Anterior"** e **"Próximo"** (alvos ≥44px), percorrendo os exercícios pela `ordem`.
- **Ao terminar** (concluir o último exercício ou sair do modo): **regressa ao detalhe** da sessão e **foca o bloco de Carga da sessão (RPE)** para registo imediato da perceção de esforço (§8.20).
- O modo condução é **só de apresentação/navegação**: não altera exercícios nem presenças; a captura de dados acontece no detalhe (presenças) e no bloco de RPE (carga).

**4. Notas editáveis inline.** O campo **`Sessao.notas`** passa a ser editável **diretamente no detalhe** (guardar inline), sem abrir o ecrã "Editar" da sessão. Restantes campos de agendamento continuam a editar-se no formulário de sessão (§8.8 / §8.8.1).

**Estado "concluído" (treino já realizado).** Um treino considera-se **concluído** quando a sua data é **estritamente anterior ao dia de hoje** — i.e. `sessao.data < inicioDoDia(hoje)` (helper puro `treinoConcluido(data, agora?)` em `lib/semana`, partilhado entre a lista e o detalhe). Um treino marcado **para hoje ainda NÃO está concluído** (pode acontecer mais logo). Consequências na UI:
- **Detalhe:** badge **"Concluído"** (cinza neutro — nunca laranja, que fica reservado a ações ativas) no cabeçalho; o CTA principal passa de **"Iniciar treino"** para **"Ver treino"** (§8.8.2 ponto 3).
- **Editar treino concluído:** o botão **"Editar"** pede **confirmação** antes de navegar (`AlertDialog` — título *"Editar treino já realizado?"*, texto *"Este treino já foi realizado. Tens a certeza que queres editá-lo?"*, ações **[Cancelar]** / **[Editar mesmo assim]**), porque editar altera o registo histórico e não deve ser acidental. Treinos futuros/de hoje editam-se diretamente (sem confirmação). Componente `components/treinos/EditarTreinoBotao.tsx`.
- **Lista de treinos (§8.9.1):** os treinos concluídos ficam **visivelmente apagados** (fundo/tom cinza esbatido, data e etiquetas em cinza) e ganham a badge **"Concluído"**, para se distinguirem de imediato dos próximos **sem ler a data**; os futuros mantêm o aspeto normal/ativo.

**Casos-limite:** sessão **sem exercícios** → estado vazio na lista e **"Iniciar treino" desativado** (com dica "Adiciona exercícios para conduzir o treino"); num treino concluído sem exercícios o botão "Ver treino" fica igualmente desativado; sessão **sem atletas elegíveis** → estado vazio nas presenças; a condução respeita a ordem atual mesmo que a lista tenha sido reordenada momentos antes (lê a `ordem` persistida).

### 8.9 Periodização e semana de trabalho (`PERIODIZACAO_GERIR`)
Conforme v6 §8.9 (sem alteração funcional na v7): grelha anual + planos semanais/mensais; UI usa **«Semana»** (nunca «Microciclo»); agrupamento automático por data; formalizar é opcional (nome livre + modo Estruturado MD-X / Texto livre); **Mesociclo** opcional, visível no formulário de planeamento. Propriedade: instância concreta 🏛️ do clube; metodologia (semana-tipo) 🎒 portátil.

### 8.10 Modelo de jogo e quadro tático (`MODELO_JOGO_GERIR`)
- **Modelo de jogo (documento vivo):** por clube/escalão/época, por **momento**, com princípios/subprincípios + diagrama. **🔁 v7:** o editor usa o campo da modalidade do escalão (ou da `modalidade` do modelo portátil). Metodologia genérica portátil = sem escalão/época.
- **Bolas paradas:** cantos/livres/lançamentos no editor — vivem na biblioteca, no modelo de jogo e nos quadros táticos.
- **Quadro tático por jogo (🏛️):** esquemas específicos ligados a um jogo (campo da modalidade do jogo). Persistidos em `QuadroTatico.diagrama` (Json), geridos pelas Server Actions de quadros (`criarQuadroTatico`/`atualizarQuadroTatico`/`listarQuadrosTaticos`).
- **Quadro tático do "Plano de jogo" (interativo):** o separador *Convocatória → Plano de jogo* (§8.11) inclui um **quadro tático interativo** que reutiliza o editor de campo. **Semeia-se** com a formação prevista (titulares posicionados por linha) e permite **arrastar** os tokens dos titulares, **desenhar setas/jogadas** e **adicionar tokens genéricos do adversário** (equipa `adversario` — token neutro/escuro tracejado com rótulo «A», distinto dos jogadores próprios coloridos/numerados). É um **único quadro por jogo**, identificado pelo nome canónico `NOME_QUADRO_PLANO_JOGO` («Plano de jogo»), do tipo `GERAL`, persistido em `QuadroTatico.diagrama` (upsert por nome). **Enquanto não houver quadro gravado**, o campo **acompanha a formação viva** dos titulares — ao marcar/posicionar titulares na tab, os tokens aparecem/atualizam-se de imediato (por defeito); **depois de gravado**, o quadro passa a ser **independente** da formação (mostra o diagrama guardado). O botão **"Repor formação"** volta a semeá-lo com a formação atual. **Edição sob `MODELO_JOGO_GERIR`**; sem essa capacidade, o quadro é **só-de-leitura** (render estático). A **posição/titularidade previstas por convocado** (que alimentam a formação semeada) continuam a ser guardadas à parte por `definirPlanoTatico` sob `CONVOCATORIA_GERIR` — os dois estados são independentes. **Limite de titulares:** o plano aceita no máximo os **jogadores em campo** do formato do jogo (**futsal = 5**; futebol usa o nº real do formato — `maxTitulares`/`JOGADORES_EM_CAMPO` em `lib/estatisticas.ts`); ao tentar marcar mais, o botão «Titular» fica **desativado** e é mostrado o aviso «Já tens N titulares selecionados».

### 8.11 Jogos, competições, estatísticas, classificação e scouting
- **Calendário/Lista** (`JOGOS_GERIR`): **agrupamento por secção quando >1** 🔁, tabs por escalão; data, adversário, Casa/Fora, resultado, competição, tipo, **formato** 🔁. **Atalho «Ver na Agenda»** (`/agenda?vista=lista&tipo=JOGO`) para a vista central unificada (§8.13.1).
- **Vista de dia de jogo:** convocados + posições previstas (**posições da modalidade** 🔁), notas de scouting, esquemas de bola parada, hora e local.
- **🔁 Modalidade da actividade (v7):** ao criar/editar um jogo, o campo "Modalidade da actividade" é **opcional** e por defeito herda da secção do escalão. O treinador pode alterá-lo para actividades pontuais (ex: escalão de futebol que participa num torneio de futsal). Quando diferente da modalidade mãe, o jogo é sinalizado com badge de modalidade nos painéis de jogo.
- **Detalhe do jogo:** cabeçalho + resultado + **campo «Formato»** 🔁 (pré-preenchido pela secção, editável); **faltas acumuladas por parte só em FUTSAL** 🔁 (ocultas em futebol) + **4 separadores** (UX-P3-04 — os mais usados primeiro; sub-separadores agrupam o dia de jogo e a análise):
  - **Convocatória** — sub-separadores: **Convocados** (`CONVOCATORIA_GERIR`; toggle por atleta) e **Plano de jogo** (posição prevista da modalidade + titular) — este último inclui um **quadro tático interativo** (arrastar titulares, desenhar setas/jogadas e adicionar adversários), semeado pela formação e persistido em `QuadroTatico.diagrama` sob `MODELO_JOGO_GERIR` (só-de-leitura sem a capacidade); ver §8.10. **Aviso de suspensões (BUG-P1-04):** quando o jogo aberto é o **próximo jogo** do escalão, os convocados que estão **suspensos** são sinalizados — alerta no topo dos *Convocados* + badge 🚫 por atleta —, calculados a partir dos cartões registados na época: **cartão vermelho no último jogo jogado** (motivo `CARTAO_VERMELHO`) ou **acumulação de ≥ `LIMITE_AMARELOS_SUSPENSAO` (3) amarelos na época** (motivo `ACUMULACAO_AMARELOS`; simplificação: contam-se todos os amarelos da época, sem purga por jornada). O vermelho tem prioridade sobre os amarelos. Fonte: `obterSuspensoesPendentes(escalaoId)` (§7.3).
  - **Estatísticas** (`ESTATISTICAS_GERIR`): por atleta — utilização, tempo de jogo por blocos, **núcleo por modalidade** 🔁 (futsal: golos, assistências, e se GR defesas/sofridos/faltas; futebol: golos, assistências, **remates, cantos, foras-de-jogo, desarmes**, e se GR defesas/sofridos), **cartões (🟨 amarelo 0–5, 🟥 vermelho 0–2 — comuns às duas modalidades, a seguir às faltas)** + **métricas configuráveis**. Aviso se soma de golos ≠ resultado. Ver 10.8.
  - **Ao Vivo:** eventos (golo, assistência, falta, cartão, substituição com bloco, defesa, timeout — **futsal**; + **remate, canto, fora-de-jogo, desarme** — **futebol** 🔁) por parte/minuto; agrega para estatísticas. Otimizado telemóvel + offline. **Sem bloqueio de substituições** (informativo — 1.6).
  - **Análise** — sub-separadores: **Relatório** e **Scouting**.
    - **Relatório** (UX-P3-07): três secções estruturadas — **Análise táctica**, **Destaques**, **Próximo jogo** — guardadas como JSON no campo `Jogo.relatorio` (retrocompatível: relatório antigo em texto puro é lido como «Análise táctica»; (de)serialização em `lib/relatorio-jogo.ts`). Inclui a **cronologia do jogo** (§10.4). O **Vídeo** (YouTube) e o **Quadro tático** (diagramas do jogo, campo da modalidade) mantêm-se.
    - **Scouting** (`SCOUTING_GERIR`): observação do adversário criada no próprio jogo. Também avulso.
- **Competições** (`COMPETICOES_GERIR`): classificação por resultados + calendário/quadro. Uma competição pertence a um escalão (logo, a uma modalidade). **Sem integração automática** (API oficial = FUTURO).

#### Criação de competição — **wizard de 3 passos** (🔁 2026-08-20 — substitui o form de 1 passo)
> A criação avulsa de competição (nome/tipo/formato num único ecrã) é substituída por um **assistente de 3 passos**. O resultado é uma competição **já com as equipas participantes e o quadro de jogos agendado** numa única gravação transacional (`criarCompeticaoCompleta`). O fluxo manual de jogos avulsos **mantém-se** e pode complementar o quadro gerado.

- **Passo 1 — Informação base** (existente, inalterado): `nome`, `tipo` (OFICIAL/AMIGAVEL), `formato` (LIGA/TORNEIO/TAÇA), `formatoJogo` (FUTSAL_5/FUTEBOL_*), escalão e época.
- **Passo 2 — Equipas participantes** (novo): lista de equipas (`EquipaCompeticao`, nome texto livre com **trim**, **mínimo 2**), com **adicionar/remover inline**. A **equipa do próprio clube** é adicionada automaticamente com o **nome do escalão** (editável). A **ordem** de introdução define o `posicao`/seed usado no bracket.
- **Passo 3 — Quadro competitivo** (novo): botão **"Gerar quadro"** (`gerarQuadroCompeticao`) cria os `ResultadoCompeticao` automaticamente conforme o formato:
  - **LIGA:** todos-contra-todos, cada par **uma vez** (N×(N−1)/2 jogos por mão); a opção **"2 mãos"** (`duasMaos`) duplica cada confronto com casa/fora trocadas (N×(N−1) jogos). Cada jogo recebe a `ronda` = nº da jornada.
  - **TORNEIO/TAÇA:** **bracket eliminatório** por rondas até à **potência de 2** mais próxima; **byes automáticos** quando o nº de equipas não é potência de 2 (byes = próxima potência de 2 − N, atribuídos aos primeiros seeds). A `ronda` codifica a fase (**1=final, 2=meias-finais, 4=quartos, 8=oitavos…**).
  - A tabela de jogos gerados mostra **ronda, casa vs fora, data/hora** (campo editável ou **"por definir"**). O treinador pode **definir datas/horas antes de guardar** ou deixá-las em branco.
- **Guardar** (`criarCompeticaoCompleta`): cria **competição + equipas + resultados agendados** numa **única transação**. Todos os jogos gerados nascem com `estado = AGENDADO` e sem golos.
- **Pós-criação:** cada jogo gerado é **editável** (data/hora via `atualizarAgendamentoJogo`; resultado via `registarResultadoExterno`, que passa o jogo a `REALIZADO`). Podem **adicionar-se jogos avulsos** à competição mesmo após a geração (fluxo manual mantido). **Regenerar o quadro** exige **confirmação** (`gerarQuadroCompeticao` falha se já existirem resultados).
- **Estado vazio:** "Sem jogos nesta época."

### 8.12 Comunicação com pais e equipa técnica (`COMUNICACOES_GERIR`)
Conforme v6 §8.12: a app **não é canal**, é gerador de conteúdo para WhatsApp; 7 templates (convocatória, cancelamento, mudança de horário/local, resultado, aviso geral, calendário). Fluxo: gerar → "Partilhar no WhatsApp". **🔁 v7:** os placeholders são agnósticos à modalidade; o `nomeEquipa` já traz o escalão (que identifica a modalidade pela secção). Sem placeholders novos.

### 8.13 Reuniões e calendário (`REUNIOES_GERIR`)
Conforme v6 §8.13: reuniões escalão/clube com ata exposta; sincronização Google Calendar (treinos/jogos/reuniões).

**🔁 v7 — cartão de reunião com acordeões:** o cartão de reunião expõe o conteúdo textual em **dois acordeões colapsáveis**:
- **"Ordem de trabalhos"** — secção colapsável com o campo `ordemTrabalhos`.
- **"Ata"** — secção colapsável com o campo `ata`.

Cada acordeão está **aberto por defeito quando o respetivo campo tem conteúdo** e colapsado (ou omitido) quando está vazio.

**🔁 v7 — afixar no Início:** o cartão de reunião passa a ter um **botão de toggle "Afixar no Início"** que alterna o campo `Reuniao.afixada` (ver §3.9). Regras de apresentação no **Dashboard/Início** (§8.16), com as reuniões separadas em **dois grupos**:
- **"Próximas reuniões"** — reuniões **futuras** (`data >= hoje`), afixadas ou não, **ordenadas por data ascendente** (a mais próxima primeiro).
- **"Reuniões anteriores"** — reuniões **afixadas já passadas** (`data < hoje`), **ordenadas por data descendente** (a mais recente primeiro).
- **Reuniões afixadas** aparecem **sempre** no dashboard, **independentemente da data**: as futuras em "Próximas reuniões", as passadas em "Reuniões anteriores".
- **Reuniões passadas não afixadas** ficam apenas visíveis na **lista de reuniões** (não surgem no dashboard).
- Cada grupo mostra **no máximo 5 reuniões**.
- As **reuniões futuras** surgem também no **calendário mensal da Agenda** (§8.13.1), a par de treinos e jogos.

#### 8.13.1 Agenda unificada (`/agenda`) — 🔁 novo 2026-08-26

A **Agenda** (`/agenda`) é a **vista central de eventos** do clube, unificando num só ecrã os três tipos de evento: **treinos** (sessões), **jogos** e **reuniões**. Substitui a antiga agenda condicional (dependente de flag de visibilidade) e passa a item primário da navegação (§8). **🔁 2026-08-26b — a Agenda substitui os itens separados de Treinos e Jogos no menu:** por ser a vista de tempo que agrega esses eventos, os antigos itens de navegação de **Treinos** e **Jogos** foram removidos (eram redundantes ao mesmo nível). As rotas `/treinos` e `/jogos` mantêm-se como **vistas de gestão** (criar/editar/detalhe, plano semanal, classificação, scouting) e são alcançadas a partir da própria Agenda — cada evento liga ao seu detalhe (`/treinos/{id}`, `/jogos/{id}`) e os botões **«Nova sessão»**/**«Novo jogo»** abrem os formulários de criação. Os atalhos **«Ver na Agenda»** em Treinos e Jogos continuam a ser o caminho de volta.

- **Dois modos de vista** (via `?vista=`): **Lista** (`vista=lista`, por defeito) e **Calendário** mensal (`vista=calendario`), com toggle na própria página.
  - **Lista:** os eventos surgem em lista cronológica, cada um identificado pelo seu tipo (treino, jogo, reunião), com ligação para o respetivo detalhe.
  - **Calendário mensal:** grelha do mês com **pills visuais distintas por tipo** — **treino** na cor primária (do clube), **jogo** a âmbar, **reunião** a esmeralda; navegação de mês via `?mes=YYYY-MM`; cada pill liga ao detalhe correto conforme o tipo.
- **Filtro por tipo** (via `?tipo=`): toggle **Todos · Treinos · Jogos · Reuniões** (`tipo=TREINO|JOGO|REUNIAO|todos`); a seleção é escrita na URL **sem apagar os restantes parâmetros** (vista, mês, escalão). O filtro é aplicado **server-side** (`FiltrosAgenda.tipo`).
- **Filtro por escalão** (via `?escalaoId=`), respeitando o âmbito do utilizador (`escaloesLegiveis`, §6.5) — as tabs/filtros de escalão são limitadas aos escalões legíveis, coerentes com o filtro de dados server-side.
- **Ações rápidas:** botões **«Nova sessão»** e **«Novo jogo»** a partir da própria Agenda.
- **Ligações a partir dos módulos:** as listas de **Treinos** (§8.8) e **Jogos** (§8.11) têm um atalho **«Ver na Agenda»** que abre a Agenda em modo lista já filtrada pelo tipo (`/agenda?vista=lista&tipo=TREINO` / `...&tipo=JOGO`).
- **Modelo de dados (`obterAgendaClube`, `lib/actions/agenda.ts`):** o tipo `EventoAgenda` é um discriminado por `tipo` (`"TREINO" | "JOGO" | "REUNIAO"`) e expõe, além dos campos comuns (data, título, escalão), os específicos por tipo — `tipoSessao?`, `tipoJogo?`, `casaFora?`, `descricao?`. As reuniões são integradas na agregação a par de treinos e jogos (`Promise.all`), com o mesmo filtro de âmbito (clube + escalões legíveis).

### 8.14 Caderneta (`CADERNETA_GERIR`)
Habilidades por nível, com estado/data/notas. Progresso + celebração ao desbloquear. **🔁 v7:** as habilidades podem ser específicas de modalidade (`Habilidade.modalidade`); a caderneta de um atleta multi-desporto mostra as habilidades da modalidade em contexto (secção/escalão) e agrega por modalidade na vista conjunta.

### 8.15 Analytics, relatórios e PDF (`RELATORIOS_VER`) — **pilar do produto**
> Três níveis, agora com **filtro por secção/modalidade** 🔁:
- **Atleta:** evolução de presenças, tempo de jogo acumulado (blocos), golos/estatísticas por jogo, caderneta, comparação com a média da equipa — **segmentado por modalidade** quando o atleta é multi-desporto (10.8).
- **Equipa:** evolução de resultados, golos, assiduidade, mais utilizados, top scorers, **núcleo estatístico da modalidade** (10.8).
- **Clube (transversal):** comparação entre escalões e **entre secções/modalidades** 🔁; assiduidade global; KPIs. Visível a Admin/DT; Coordenador vê a **sua secção** (6.9); configurável para treinadores.
- **Relatório de fim de época:** por atleta/equipa/clube — PDF + vista web partilhável (`RelatorioPartilhado`) com identidade do clube. Snapshot imutável.
- **Export CSV** dos analíticos de escalão e de atleta (Excel PT-PT). **🔁** As colunas de núcleo refletem a modalidade do escalão.
- **Export PDF dos analíticos («Dossier do Treinador»)** (2026-08-26): botão **«Guardar PDF»** nos painéis de **escalão** (estatística individual — tabela por atleta) e de **clube** (estatísticas gerais — KPIs, resultados e tabela por escalão), com a **identidade do clube** (logótipo, nome, época e cor primária; fallback laranja Mister). Gerado server-side como **relatório HTML imprimível** (`lib/pdf/gerar-pdf.ts` + templates em `components/pdf/*.ts` + route handler `app/api/pdf`); o botão abre o relatório num novo separador e o browser converte em PDF via **«Guardar como PDF»** (abordagem **serverless-safe**, sem motor nativo/WASM — ver changelog 2026-08-26). Reutiliza os mesmos dados de `obterAnaliticoEscalao`/`obterAnaliticoClubeEpoca` (auth + `RELATORIOS_VER` garantidos).
- **PDF profissional:** ficha de jogo, convocatória, plano de treino, relatório de desenvolvimento do atleta.

### 8.16 Dashboard — centro de comando contextual
Conforme v6 §8.16: temporal (treino de hoje domina; senão countdown de jogo iminente; "atenção necessária") + ações rápidas + agenda agregada + aviso de conflito de pavilhão. **🔁 v7:** quando o clube tem >1 secção, o dashboard respeita o seletor de secção (ou mostra tudo agrupado por secção para Admin/DT); a agenda agregada e o conflito de pavilhão atravessam **todas as secções** (o pavilhão pode ser partilhado entre futsal e futebol). **🔁 2026-08-26:** a agenda agregada do dashboard tem correspondência na **vista central Agenda** (`/agenda`, §8.13.1), que unifica treinos, jogos e reuniões com filtros por tipo e calendário mensal. **🔁 2026-08-26 (mini-resumo da época):** no cartão «Época {nome}», os contadores de **sessões** e **jogos** referem-se apenas a eventos **já realizados** (`data <= agora`); eventos futuros/previstos **não** contam para o resumo da época. O contador de **atletas** mantém-se (total de participações ativas na época). A deteção de «época vazia» (empty state motivacional) considera, além dos contadores realizados, a existência de sessão/jogos **futuros** agendados, para não tratar como vazia uma época recém-criada só com eventos por vir.

### 8.17 Perfil do treinador e carreira
Conforme v6 §8.17: espaço pessoal 🎒 (biblioteca pessoal, histórico de carreira editável, carteira). Página `/perfil` + métricas de carreira + copiar link. **🔁 v7:** o histórico pode indicar a modalidade nos campos de texto; a biblioteca pessoal inclui exercícios de ambas as modalidades.

### 8.18 Conformidade FPF (levantamento pendente)
- **DEVE (após levantamento):** exportação do **Modelo 2 FPF** e documentos federativos, **de futsal e de futebol** 🔁. Requer levantamento dos requisitos exatos (campos, formatos) antes de implementar — fase própria (secção 16).

### 8.19 Lembretes e tarefas (to-dos)
Conforme v6 §8.19: pessoal (qualquer membro) / equipa (`LEMBRETES_EQUIPA_GERIR`); deadline opcional; feitos individualmente; no dashboard + lista dedicada. **Apresentação (2026-08-26):** no dashboard os lembretes **persistidos** aparecem no **topo da página** (antes de qualquer outro conteúdo) e, quando há pendentes, num bloco com **cor de destaque da marca** (laranja `#F0531E` — fundo `laranja-50`, borda `laranja-500/45`, título/ícone `laranja-600` e contador de pendentes) para máxima visibilidade; sem pendentes, o painel **colapsa numa linha discreta** («Sem lembretes» + ícone pequeno, altura mínima) para não pesar no topo (2026-08-27). Distinto dos **lembretes in-app de hoje** (treino/jogo — §8.16), que continuam em tom âmbar.

### 8.20 Carga de treino — RPE / ACWR (`TREINOS_GERIR`, `RELATORIOS_VER`)
Conforme v6 §8.20: RPE da sessão (`Sessao.rpeSessao` 1-10) e individual (`RpeAtleta`); sRPE (`duracaoMin × rpeSessao`); carga semanal (ISO); **ACWR** (`<0.8` subcarga · `0.8–1.3` ideal · `>1.3` risco); gráfico `CurvaCargaSemanal` + tabela ACWR por atleta. Transversal às modalidades. Sem alteração na v7.

### 8.21 Wizard «Nova Época» (`CLUBE_EPOCAS`)
Conforme v6 §8.21 (cenários A/B/C/D), com uma extensão multi-desporto:
- **🔁 v7 (DEVE):** os passos de plantel/escalões/promoções respeitam a **secção**. Ao transitar escalões de várias secções, o wizard agrupa por secção; as promoções por idade são sugeridas **dentro da mesma modalidade** (um atleta de futsal transita para o escalão de futsal seguinte; se também joga futebol, essa participação é tratada na secção de futebol). O invariante "principal único" é aplicado **por modalidade** (§9).
- Herança automática (conteúdo portátil, métricas, caderneta, modo de semana) e reset (estatísticas/presenças/jogos/convocatórias/planeamentos) — inalterados.

### 8.22 Gestão de secções (`CLUBE_SECCOES`) — 🔁 novo v7
- **Rota `/definicoes/seccoes`** (só clube real): lista das secções (modalidade, nome, nº de escalões, coordenadores).
- **Criar secção:** escolher modalidade (só as que o clube ainda não tem — `@@unique`); nome opcional. Normalmente **não é preciso** criar manualmente (cria-se ao criar o primeiro escalão — 8.1.1); a UI existe para o caso de o Admin querer preparar a secção antes.
- **Renomear:** editar `nome`.
- **Atribuir coordenador:** escolher membro → cria `MembroSeccao` (papel `COORDENADOR`). Remover coordenador.
- **Apagar secção:** só se **não tiver escalões** (confirmação). A secção do clube técnico não é apagável.
- **Estado vazio:** "Este clube tem uma única modalidade." + explicação de que basta criar escalões de outra modalidade para surgir uma nova secção.

---

## 9. Regras de negócio transversais e casos-limite

**Herdados do MVP/v6 (mantêm-se):**
- **Métrica desativada com valores históricos:** valores mantêm-se; novos não a pedem. Nunca apagar `ValorMetrica`.
- **Mudança de posição do atleta:** jogos passados mantêm os dados registados.
- **Atleta que entra a meio da época:** taxa de presença usa como divisor as sessões **já realizadas** do escalão desde a `dataIngresso` (sessões executadas, `data < agora` — nunca as programadas futuras; BUG-P1-08).
- **Convocatória alterada com estatísticas:** remover convocado com estatísticas pede confirmação e apaga-as.
- **Sessão/jogo com data fora da época:** permitido, com aviso suave.
- **Dois atletas com o mesmo número:** permitido; aviso não-bloqueante por escalão.
- **Sem época ativa:** actions devolvem "Nenhuma época ativa"; UI encaminha.
- **Golos individuais ≠ resultado:** aviso suave, não bloqueia.
- **Exercício em uso:** apagar bloqueado; editar sempre permitido.
- **Concorrência:** last-write-wins (§13.4).
- **Modo Individual = clube técnico:** contexto de clube existe sempre; `obterMembroAtual()` nunca null.
- **Permissão negada:** action sem capacidade/âmbito devolve `erro("Sem permissão")`.
- **Overrides e delegação:** capacidades efetivas = perfil ∪ extra \ revogadas; só se atribuem capacidades ≤ às próprias.
- **Transição a meio da época:** datas preservam o histórico; estatísticas anteriores ficam no escalão de origem.
- **Lesões:** registadas como motivo de falta (`LESAO`); sem módulo clínico.
- **Tempo de jogo por blocos:** registo por bloco; acumula ao longo da época.
- **Classificação de competição:** por `ResultadoCompeticao` + jogos próprios; **só conta jogos `REALIZADO`** (jogos `AGENDADO`/sem golos são ignorados — §10.2/§10.9).
- **Scouting no jogo:** liga-se ao `jogoId`; apagar o jogo faz `SetNull`.
- **Comunicação:** a app gera texto, não envia; pais sem conta.
- **Relatório partilhável:** `token` não-adivinhável + snapshot imutável; opcional `expiraEm`.
- **Google Calendar:** sincronização idempotente via `googleEventId`.
- **Absorção:** crédito proporcional (`CREDITO_ABSORCAO`); reembolso só manual.
- **Saída de treinador:** conteúdo `TREINADOR` viaja; `CLUBE`/secções/snapshots ficam; adesão `INATIVO`; nunca deixar clube sem admin.
- **Uma sessão por conta. Época ativa é por clube.**
- **RGPD:** hard-delete a pedido preserva agregados anonimizados.

**Novos (multi-desporto — decisão 2026-08-19):** 🔁
- **Modalidade deriva da secção:** nenhuma operação recebe a modalidade do cliente como fonte de verdade — resolve-se sempre por `escalao.seccao.modalidade` (1.7.1, 7.1).
- **Secção única por modalidade:** `@@unique([clubeId, modalidade])` — tentar criar uma segunda secção da mesma modalidade devolve a existente (idempotente), não erro.
- **Criação transparente de secção:** criar o primeiro escalão de uma modalidade cria a secção na mesma transação (8.1.1).
- **Apagar secção:** bloqueado se tiver escalões; a secção do clube técnico não é apagável.
- **Atleta multi-desporto (participação principal por modalidade):** o invariante "exatamente uma participação `PRINCIPAL` ativa" é **por (atleta, época, modalidade)** — um atleta pode ter um principal em futsal **e** um principal em futebol na mesma época. As escritas (`associarAEscalao`/`transferirEscalao`/`terminarParticipacao`) aplicam o invariante **dentro da modalidade**:
  - `associarAEscalao` nunca cria um principal (só `SIMULTANEA`/`OCASIONAL`);
  - `transferirEscalao` com destino `PRINCIPAL` despromove para `SIMULTANEA` qualquer outro principal ativo **da mesma modalidade** e recusa a transferência que deixasse o atleta sem principal nessa modalidade;
  - `editarTipoParticipacao` (mudar o tipo de uma participação ativa já existente) segue as mesmas regras dentro da modalidade: passar a `PRINCIPAL` despromove o principal anterior da modalidade para `SIMULTANEA`; recusa despromover o único principal da modalidade;
  - `terminarParticipacao` recusa terminar a participação principal de uma modalidade (transferir primeiro).
- **Primeiro principal de uma modalidade nova:** quando `associarAEscalao` é chamado para um atleta que não tem nenhuma participação PRINCIPAL activa na modalidade da secção destino, o sistema DEVE criar a participação com `tipo = PRINCIPAL` automaticamente (não aplica a SIMULTANEA/OCASIONAL explícitas). Esta é a única excepção à regra "associar nunca força PRINCIPAL".
- **Estatísticas por modalidade:** o núcleo estatístico exibido/gravado depende do formato/modalidade do jogo (10.8); campos de futebol (remates, cantos, foras-de-jogo, desarmes) ficam a `null` em jogos de futsal e vice-versa (faltas por parte só em futsal).
- **Formato de jogo:** `Jogo.formato` é pré-preenchido pela secção do escalão e é **editável** (amigáveis podem ser noutro formato); determina o campo do editor e as estatísticas de núcleo.
- **Posições:** o seletor filtra pela modalidade do contexto; um atleta multi-desporto pode acumular posições de ambas as modalidades em `Atleta.posicoes`.
- **Licença Individual = uma modalidade:** não é possível criar escalões de duas modalidades num clube técnico Individual (17.1). Tentar fazê-lo é bloqueado com mensagem que sugere a licença de Clube.
- **Analytics de secção:** um Coordenador vê o analítico da sua secção e escalões; o analítico transversal do clube compara secções/modalidades (10.3, 10.8).
- **Sem bloqueio de substituições:** o registo ao vivo é informativo em ambas as modalidades (amigáveis não têm regras fixas — 1.6).

**Notas técnicas de invariantes (multi-desporto):** 🔁
- **Invariante do principal por modalidade (implementação):** o invariante "único PRINCIPAL por (atleta, época, modalidade)" **não é enforçável por índice BD** (modalidade não é coluna de `AtletaEscalao`; deriva de `escalao.seccao.modalidade`). É garantido exclusivamente por **lógica aplicacional dentro de transacção `Serializable`** que consulta todas as participações activas do atleta, atravessando `escalao → seccao`. O helper `modalidadeDoEscalao(escalaoId)` DEVE ser cacheável para evitar N+1 em listagens.
- **Invariantes cross-entidade (validadas na aplicação, não pela BD):** (1) `escalao.clubeId == escalao.seccao.clubeId`; (2) `membroSeccao.membroClube.clubeId == membroSeccao.seccao.clubeId`; (3) `Convocatoria.posicaoPrevista ∈ configModalidade(jogo.seccao.modalidade).posicoes`.

**Novos (equipas + quadro competitivo + agendamento — 2026-08-20):** 🔁
- **Mínimo 2 equipas** para gerar o quadro; abaixo disso, `gerarQuadroCompeticao` devolve erro.
- **Nome de equipa:** `trim` obrigatório; **unicidade por competição** — `@@unique([competicaoId, nome])` (case-sensitive no índice; o display compara case-insensitive para avisar de duplicados equivalentes).
- **LIGA:** N×(N−1)/2 jogos por mão; "2 mãos" duplica com casa/fora trocadas. **TORNEIO/TAÇA:** bracket até à potência de 2 mais próxima; **byes = (próxima potência de 2) − N**, atribuídos aos primeiros seeds; a `ronda` codifica a fase (1=final, 2=meias, 4=quartos…).
- **Estado do jogo:** `estado = AGENDADO` enquanto `golosCasa`/`golosFora` forem `null`; passa a `REALIZADO` ao inserir resultado. `atualizarAgendamentoJogo` altera só `dataHora` (não muda o estado).
- **Classificação só de realizados:** `obterClassificacao` **ignora** jogos `AGENDADO`/sem golos (§10.9) — sem alteração da fórmula de pontos, apenas filtragem de entrada.
- **Regeneração protegida:** `gerarQuadroCompeticao` **falha se já houver resultados**; regenerar exige confirmação explícita no UI (apaga o quadro anterior).
- **Remover equipa:** `removerEquipaCompeticao` é **bloqueado** se a equipa já tiver jogos `REALIZADO` (com resultado); equipas só com jogos `AGENDADO` podem ser removidas.
- **Jogos avulsos coexistem:** adicionar jogos manualmente à competição continua a ser possível após a geração do quadro; não colidem com os gerados.
- **Transação única do wizard:** `criarCompeticaoCompleta` cria competição + equipas + resultados agendados atomicamente (tudo ou nada).
- **Retrocompatibilidade:** competições/resultados legados têm `ronda=null`, `dataHora=null` e `estado=REALIZADO` (backfill — Apêndice C); a classificação e o calendário existentes continuam a funcionar sem alteração.

**Novos (plano semanal de treinos — 2026-08-20):** 🔁
- **Propagação só toca agendamento:** "esta e todas as futuras" altera apenas `data`(hora)/`local`/`tipoSessao`/`duracaoMin`; **nunca** exercícios, presenças, notas, objetivo ou RPE. O conteúdo das sessões geradas é sempre preservado.
- **Sessões passadas imutáveis:** a propagação afeta apenas `data >= max(data da sessão-âncora, agora)`. Sessões já realizadas nunca são alteradas via plano.
- **Sessão personalizada protegida:** uma sessão editada como "só esta" (`personalizada = true`) não é sobrescrita por propagações "esta e futuras" posteriores.
- **Época sem datas válidas:** `Epoca.dataInicio`/`dataFim` são obrigatórias no modelo; se ausentes/invertidas, `criarPlanoSemanal` devolve `erro("A época precisa de datas de início e fim válidas para gerar o plano.")` e a UI encaminha para a edição da época.
- **Deduplicação na geração:** datas que já têm sessão para o escalão (avulsa ou de plano anterior) são ignoradas — nunca duplica treinos no mesmo dia.
- **Um plano ativo por (escalão, época):** validado na aplicação (não por índice, dado que planos `ativo=false` históricos coexistem). Escalões diferentes têm planos independentes.
- **Apagar/desvincular:** apagar o plano faz `SetNull` em `Sessao.planoSemanalId`/`planoSemanalDiaId` (sessões preservadas). "Apagar futuras vazias" só remove sessões futuras sem exercícios nem presenças.

---

## 10. Estatísticas e agregações

Tudo filtrado pela **época ativa** e pelo **clube** (e, quando aplicável, pela **secção/modalidade**). Lógica em funções puras testáveis (`lib/estatisticas.ts`).

### 10.1 Agregado do atleta (`obterEstatisticasAtleta`) — por escalão e conjunto
Conforme v6 §10.1: por escalão (participação) **e** vista conjunta na época:
```
jogosConvocado, jogosUtilizados, titularidades, totalGolos, totalAssistencias
tempoJogoAcumulado (blocos → min: JOGO_COMPLETO=40, MEIA_PARTE=20, 10, 5, 0)
totalMinutos (null se nenhum registado), totalDefesas/totalGolosSofridos (só GR)
sessoesTotais (desde dataIngresso), presencas (PRESENTE|ATRASADO), taxaPresenca
```
> **🔁 v7:** a **vista conjunta é segmentada por modalidade** — um atleta que joga futsal e futebol vê dois blocos (um por modalidade), porque somar golos de futsal com golos de futebol seria enganador. `tempoJogoAcumulado` de futsal usa `JOGO_COMPLETO=40`; ⚠️ para futebol o valor de `JOGO_COMPLETO` em minutos depende do formato (Apêndice B) — ver 10.8.
- **Métricas configuráveis** (`metricas`) agregadas por `MetricaConfig` (total/média/jogos), incluindo desativadas com histórico; filtradas pela modalidade quando a métrica é específica.
- **DEVE — histórico persistente independente do estado da participação (🔁 2026-09-04).** Se um atleta tem **estatísticas ou presenças** registadas num escalão/época, esses dados **aparecem sempre** nos analíticos, **mesmo depois de o atleta sair do escalão** (participação `INATIVO` via `terminarParticipacao`, `TRANSICAO_PERMANENTE` via `transferirEscalao`) ou de ser **arquivado** (`Atleta.ativo=false`). As Server Actions do painel do atleta (`obterAnaliticoAtleta`, `obterEvolucaoAtleta`, `obterPresencasMensal` em `lib/actions/analise.ts`) derivam o(s) escalão(ões) de contexto de **todas** as participações da época (`where: { epocaId }`, **sem** filtro de `estado`), porque as `EstatisticaAtleta`/`Presenca` estão ligadas ao atleta/jogo/sessão e não ao estado da participação. O gate de leitura por escalão (`podeLerAlgumEscalao`) continua a aplicar-se a qualquer escalão onde o atleta participou. Nota: nas vistas de **equipa/clube**, `nAtletas` (denominador das médias) permanece o **plantel atual** (`estado: "ATIVO"` + `atleta.ativo`), enquanto os rankings ofensivos/assiduidade/disciplina já incluem quem saiu (derivam de `EstatisticaAtleta`/`Presenca` por jogo/escalão, não da participação).

### 10.2 Agregado da equipa (escalão + época)
Conforme v6 §10.2: jogos/V/E/D, golos, taxa de presença média, melhores marcadores/assistentes (por `atletaId`), mais utilizados (blocos), distribuição de tipos de treino, rankings por métrica configurável, ranking de assiduidade (lista completa de atletas), filtro por competição.

**🔁 Rendimento casa/fora (2026-08-31):** o agregado inclui o **balanço V/E/D por local do jogo** — `AnaliticoEscalao.recordCasa`/`recordFora` (tipo `RecordCasaFora` = `{ vitorias, empates, derrotas, jogos }`), calculados a partir de `Jogo.casaFora` (**só jogos com resultado** contam; jogos `AGENDADO`/sem golos são ignorados). Cada `ResultadoJogoResumo` expõe também `casaFora`. O `PainelEscalao` mostra a secção **«Rendimento casa/fora»** (mini-cards V-E-D para Casa e Fora, cada card só quando há ≥1 jogo com resultado nesse local) e uma **etiqueta Casa/Fora** por jogo na secção «Resultados». O enum `CasaFora` tem apenas `CASA`/`FORA` (sem `NEUTRO`), pelo que não há balanço «Neutro».

**🔁 Sessões programadas vs executadas (2026-08-26):** o agregado distingue **sessões programadas** (todas as criadas — `AnaliticoEscalao.sessoes`) de **sessões executadas / já realizadas** (`AnaliticoEscalao.sessoesExecutadas` = sessões com `data < agora`; as futuras ficam programadas mas por executar). É subconjunto de `sessoes`, coerente com a imutabilidade do passado (§8.9.1). O `PainelEscalao` mostra o KPI **«sessões realizadas»** no formato `executadas/programadas` (ex.: `67/89`). **🔁 Denominador de assiduidade (2026-08-26, BUG-P1-08):** a taxa de presença (§10.1 atleta, §10.2 escalão) usa como denominador as **sessões executadas** (`sessoesExecutadas`), **não** o total programado — caso contrário um escalão com muitas sessões futuras agendadas mostrava uma taxa artificialmente baixa (1 sessão realizada com todos presentes daria ~1% em vez de 100%). A assiduidade do escalão é a média das assiduidades individuais (`presenças / sessões executadas`), com cap a 100%. **🔁 v7:** o escalão tem uma modalidade fixa (a da sua secção), logo o agregado da equipa é naturalmente monomodalidade; o **núcleo estatístico apresentado** é o da modalidade (10.8). **🔁 2026-08-20:** o filtro por competição e a classificação associada consideram **só jogos `REALIZADO`** (jogos `AGENDADO` do quadro não contam — §10.9).

> **🔁 Actividades cross-modalidade (v7):** `obterAnaliticosEscalao` expõe o breakdown de sessões e jogos por `modalidadeAtividade`. Inclui KPI "sessões de modalidade alternativa" e filtro por modalidade da actividade.

**🔁 Análise por período — 1ª vs 2ª parte (M6 — 2026-08-31):** o agregado do escalão expõe o campo **`eventosPorParte`** de `AnaliticoEscalao` (`{ parte1, parte2 }`, mapas parciais por `TipoEventoJogo` derivados do registo ao vivo — §10.4). O `PainelEscalao` mostra a secção **«Análise por período»** com uma tabela **1ª parte vs 2ª parte** nas colunas **Golos, Assistências, Faltas, Remates e Cantos** (Remates e Cantos só têm valores em futebol; cada coluna só surge quando há ≥1 registo). A secção **só aparece quando há registos ao vivo com eventos na 2ª parte** (usada como sinal de que o treinador usou o registo por parte); snapshots antigos sem o campo usam defaults (`{ parte1: {}, parte2: {} }`) e a secção fica oculta.

### 10.3 Agregado do clube (transversal)
Conforme v6 §10.3: comparação entre escalões (assiduidade, V-E-D, golos, nº atletas), assiduidade global, KPIs. **🔁 v7:** ganha **comparação entre secções/modalidades** e **filtro por secção**. Visível a Admin/DT; **Coordenador vê o agregado da sua secção** (6.9); configurável para treinadores.

**🔁 Sessões programadas vs executadas no clube (2026-08-26):** `EscalaoResumoClube` e `AnaliticoClubeEpoca.totais` expõem `sessoesExecutadas` (sessões com `data < agora`) a par de `sessoes` (programadas). O `PainelClube` mostra o KPI **«sessões realizadas»** no formato `executadas/programadas` e uma coluna **«Realizadas»** na tabela de escalões. Com o filtro de modalidade client-side, os totais recalculam-se sobre o subconjunto usando `sessoesExecutadas` no denominador de assiduidade; snapshots antigos sem o campo fazem fallback ao total (`?? sessoes`).

**🔁 P2-06 — Balanço de época do clube:** além da comparação por escalão, o agregado expõe um **balanço de resultados de todo o clube** na época (`AnaliticoClubeEpoca.balanco`: `vitorias`, `empates`, `derrotas`, `jogos`, `golosMarcados`, `golosSofridos`), somando os `Jogo` de **todos os escalões visíveis** e de **todos os tipos** (campeonato, taça, amigável). O painel (`PainelClube`) mostra a secção **"Resultados da época"** com 3 KPIs (🟢 vitórias · ⬜ empates · 🔴 derrotas) e uma linha secundária «X jogos | X golos marcados / X sofridos». O balanço respeita o filtro de modalidade client-side (recalcula sobre o subconjunto) e faz fallback aos totais em snapshots antigos sem o campo.

### 10.4 Registo ao vivo → agregação
Os `EventoJogo` agregam para `EstatisticaAtleta`. **🔁 v7:** os tipos de evento de futebol (`REMATE`, `CANTO`, `FORA_DE_JOGO`, `DESARME`) agregam para os campos de núcleo de futebol; os de futsal para os seus. Manual e live convergem (last-write-wins).

**Derivação eventos → estatísticas (`lib/eventos-para-estatisticas.ts`).** A função pura `derivarEstatisticasDeEventos(eventos, convocados, eFutebol, formato)` transforma os eventos ao vivo nas linhas de `EstatisticaAtleta` (uma por convocado) e devolve o resultado do jogo (`golosMarcados`/`golosSofridos`). Regras: cada convocado começa `NAO_UTILIZADO` com contadores a zero (`TITULAR` se `titularPrevisto`); `GOLO`/`GOLO_SOFRIDO` contam sempre para o placar do jogo e, com `atletaId`, para o atleta (`golos`/`golosSofridosGR`); `ASSISTENCIA`, `FALTA`, `CARTAO_AMARELO`, `CARTAO_VERMELHO`, `DEFESA` incrementam o respetivo campo do atleta; o núcleo de futebol só conta com `eFutebol=true` (em futsal fica `null`); `SUBSTITUICAO` marca o atleta que entra como `UTILIZADO` (sem despromover um titular) e regista o `bloco`; os `minutos` derivam do `blocoTempo` via `blocoParaMinutos` (§10.1/§10.8). A action `previewEstatisticasDeEventos(jogoId)` expõe esta derivação **sem persistir** (auth + multi-tenant + `ESTATISTICAS_GERIR`), para o treinador rever antes de guardar.

**Placar sincronizado.** `registarEventoJogo` e `removerEventoJogo` correm em transação e, quando o evento é `GOLO`/`GOLO_SOFRIDO`, recalculam `Jogo.golosMarcados`/`golosSofridos` a partir da contagem de eventos, mantendo o resultado do jogo sempre coerente com o registo ao vivo.

**Rácios por jogo e tendência de forma no painel do atleta (M1/M3) (UI — 2026-08-31).** O `PainelAtleta` (`components/analiticos/`) calcula, **client-side sobre o agregado já recebido** (sem novas queries ao servidor), dois blocos de leitura rápida junto às estatísticas agregadas existentes:
- **M1 — Rácios de eficácia:** **golos/jogo** (`totalGolos / jogosUtilizados`), **golos/convocatória** (`totalGolos / jogosConvocado`) e, **só para guarda-redes**, **defesas/jogo** (`totalDefesas / jogosUtilizados`). Cada rácio mostra «—» quando o denominador é 0. Apresentados com 2 casas decimais.
- **M3 — Tendência de forma:** aplicada à métrica **golos** e **só para jogadores de campo** (não guarda-redes). Compara a **média dos últimos 5 jogos utilizados** (com **mínimo de 3** jogos para haver leitura) com a **média de golos da época**. Ícone visual: **TrendingUp** (recente acima da média em >0.1 golos, acento verde), **Minus** (estável, dentro de ±0.1 golos, acento cinza) ou **TrendingDown** (recente abaixo da média em >0.1 golos, acento vermelho). Sem tendência quando há <3 jogos utilizados recentes. O gráfico de evolução de golos por jogo passa a receber a **média da época como linha de referência** (`GraficoLinhas` com `mediaReferencia`, §12.5) — omitida para guarda-redes.

**Vistas do painel do atleta — comparação directa (M4) e evolução multi-época (M5) (UI — 2026-08-31).** As Server Actions `obterResumoAtletaParaComparacao` (M4) e `obterEvolucaoMultiEpoca` (M5) (changelog 2026-08-31) alimentam duas vistas no `PainelAtleta` (`components/analiticos/`, aba **Analytics** do perfil do atleta):
- **Comparação directa (M4):** dentro do contexto de um escalão (quando há `escalaoContexto` **e** colegas na mesma época), o painel oferece um seletor «Comparar com…» com os colegas do mesmo escalão/época (lista carregada na página via `AtletaEscalao` com `estado: "ATIVO"`, excluindo o próprio, ordenada por nome). Ao escolher um colega, chama `obterResumoAtletaParaComparacao(colegaId, escalaoContexto.id, epoca.id)` client-side e mostra uma tabela lado-a-lado (Golos · Jogos · Presenças · Golos/jogo) do atleta atual vs. o colega, com botão «Limpar». Coexiste com a «Comparação com a média da equipa». Sem colegas (ou fora de contexto de escalão) a secção não aparece.
- **Evolução por época (M5):** secção «Evolução por época» no fim do painel, **só quando há ≥2 épocas** com histórico. Tabela por época (Época · Escalão · Golos · Jogos · Presenças % · Habilidades desbloqueadas/total), ordenada da mais antiga para a mais recente (ordem da própria action, por `dataInicio` ASC), com a **época atual destacada**.

Ambas as props (`atletasEscalao`, `evolucaoEpocas`) do `PainelAtleta` são **opcionais** — sem elas o painel funciona como antes (zero regressão nas vistas que não as passam).

### 10.5 Específicas de futsal ⚽
- Faltas acumuladas por parte (destaque à 5.ª).
- Tempo por atleta por **blocos** (rotações); quintetos/rotações e power play derivados dos eventos de substituição.

### 10.6 Relatório de fim de época e partilha (sem IA)
Conforme v6 §10.6: agregados (10.1–10.3, 10.8), evoluções, rankings, caderneta; PDF (via impressão do browser) + link web (`RelatorioPartilhado`, snapshot imutável). **🔁 v7:** o snapshot pode ser segmentado por secção/modalidade; o relatório de clube compara secções.

### 10.7 Onde aparecem
Perfil do atleta, Dashboard, Analytics/Relatórios, vista de clube (com filtro de secção). Gráficos SVG próprios (`components/graficos/`) com a cor do clube.

### 10.8 Estatísticas de futebol 🥅 — núcleo fixo + configurável (novo v7)
> **Princípio (decisão 2026-08-19):** **mesmo princípio do futsal** — um **núcleo fixo** sempre presente + **customização por cima** via `MetricaConfig`. O que muda é o *conjunto* do núcleo e a ocultação de campos específicos da outra modalidade.

**Núcleo fixo por modalidade (campos de `EstatisticaAtleta`):**

| Campo | Futsal ⚽ | Futebol 🥅 |
|---|---|---|
| `golos` | ✅ | ✅ |
| `assistencias` | ✅ | ✅ |
| `defesas` (GR) | ✅ (só GR) | ✅ (só GR) |
| `golosSofridosGR` (GR) | ✅ (só GR) | ✅ (só GR) |
| `faltasCometidas` | ✅ | ✅ (opcional) |
| `remates` | — (oculto) | ✅ |
| `cantos` | — (oculto) | ✅ |
| `forasDeJogo` | — (oculto) | ✅ |
| `desarmes` | — (oculto) | ✅ |
| `Jogo.faltas1aParte`/`faltas2aParte` (equipa) | ✅ | — (oculto) |
| power play / GR-jogador (derivado) | ✅ | — |

**Regras (DEVE):**
- A grelha de estatísticas do jogo **mostra apenas o núcleo da modalidade do jogo** (derivada de `Jogo.formato`/secção). Campos da outra modalidade **não aparecem** e ficam a `null`.
- Sobre o núcleo, o clube pode **acrescentar métricas configuráveis** (`MetricaConfig`, opcionalmente marcadas com `modalidade`) — ex.: "duelos ganhos", "passes-chave" em futebol; "recuperações no último terço" em futsal.
- **Agregações de equipa/atleta** somam/mediam o núcleo relevante à modalidade (golos, assistências, remates, cantos, foras-de-jogo, desarmes para futebol) mais as métricas configuráveis.
- **`tempoJogoAcumulado`:** os blocos (`BlocoTempo`) são a base do tempo de jogo nas duas modalidades. O valor de `JOGO_COMPLETO` em minutos é **parametrizável por formato** (Apêndice B: ex. FUTSAL_5=40; futebol varia por escalão/formato). **✅ Decidido (Fase 28):** os minutos por bloco passam a **depender do formato** via a tabela `MINUTOS_POR_PARTE: Record<FormatoJogo, number>` (minutos de UMA parte por formato — `FUTSAL_5=20`, `FUTEBOL_3_3=15`, `FUTEBOL_5_5=20`, `FUTEBOL_7=25`, `FUTEBOL_9=35`, `FUTEBOL_11=45`), da qual se deriva `JOGO_COMPLETO = 2×parte` e `MEIA_PARTE = parte` (`BLOCO_10MIN`/`BLOCO_5MIN`/`NAO_JOGOU` constantes). `blocoParaMinutos(bloco, formato?)` sem `formato` usa a tabela base de futsal `MINUTOS_POR_BLOCO` (40/20) — retrocompatível; `FUTSAL_5` explícito é idêntico. Manteve-se o nome `MINUTOS_POR_BLOCO` (tabela de futsal, testada) e introduziu-se `MINUTOS_POR_PARTE` para não colidir com o export existente.
- **RGPD:** cards sociais e relatórios respeitam as mesmas regras de menores em ambas as modalidades (3.16).

### 10.9 Classificação de competição — só jogos realizados (🔁 2026-08-20)
`obterClassificacao(competicaoId)` **mantém-se sem alteração de fórmula** (pontos por V/E/D, golos marcados/sofridos, diferença, desempate). A única alteração é o **filtro de entrada**: com o quadro competitivo agendável (§8.11), a competição passa a conter jogos ainda **`AGENDADO`** (sem golos). A classificação **DEVE** considerar **apenas** os `ResultadoCompeticao` com `estado = REALIZADO` — equivalente, em termos práticos, a **ignorar os jogos cujo `golosCasa` é `null`**. Assim, um quadro recém-gerado mostra a tabela com **todos a zero** e vai-se preenchendo à medida que os resultados são inseridos. Resultados legados (`estado=REALIZADO` por backfill, com golos preenchidos) continuam a contar exatamente como antes.

### 10.10 Vistas de gestão do clube — Diretor Técnico e Presidente (UI — 2026-08-31)
As Server Actions DT1/DT2/DT3 (§10.1–§10.3, changelog 2026-08-31) têm as seguintes vistas na app, com gating por âmbito/capacidade (segunda linha; o servidor já valida):

- **Equipa técnica (DT1 — `PainelEquipaTecnica`, `components/analiticos/`):** tabela de produtividade dos treinadores (Nome · Perfil · Escalões · Sessões criadas · Jogos criados · Presenças marcadas · Taxa de presença média %). Server component que chama `obterAnaliticoEquipaTecnica()`. Aparece em **Analytics** apenas para **âmbito TODO_CLUBE** (DT/Admin — é uma vista de gestão de pessoas; o Presidente **não** a vê). Estado vazio quando nenhum treinador tem escalões atribuídos.
- **Atividade da equipa (DT2 — `WidgetAtividadeEquipa`, `components/dashboard/`):** feed cronológico dos últimos 3 dias (janela 72h da action) com ícone por tipo (Calendar=sessão, Trophy=jogo, Users=presenças, MessageSquare=reunião), autor, detalhe, escalão e tempo relativo ("há 2h", "ontem às 18h"); cada item liga ao recurso (`href`). Server component que chama `obterFeedAtividadeEquipa()`. Aparece no **Dashboard** apenas para o papel **DT/Admin**. "Sem atividade recente" quando vazio.
- **Evolução do clube (DT3 — `TabelaEvolucaoEpocas`, `components/analiticos/`):** tabela por época (Época · Atletas · Escalões · Jogos · Sessões · Presença média %), com a **época ativa destacada**. Componente presentacional que recebe `LinhaEvolucaoEpoca[]`. Aparece em **Analytics** para quem tem `RELATORIOS_VER` (inclui Presidente) e **só quando há ≥2 épocas**; no **Dashboard** do Presidente mostra as **últimas 3 épocas**.
- **Dashboard por papel (`derivarPapelDashboard`):** o dashboard deriva o papel do contexto do membro — **DT/Admin** (TODO_CLUBE com capacidades de escrita de dados de equipa), **Presidente** (TODO_CLUBE só de leitura) ou **Treinador** (restante, comportamento clássico do MVP inalterado). O **Presidente** troca as **ações rápidas de escrita** (Nova sessão / Novo jogo / Novo atleta) por **KPIs do clube** (atletas, jogos, golos marcados, presença média — via `obterAnaliticoClubeEpoca`) + a mini-tabela de evolução multi-época. O **DT/Admin** mantém as ações rápidas e ganha o widget de atividade da equipa.

## 11. Formato do diagrama de campo e animação

### 11.1 Campo (futsal)
⚽ Campo de futsal FIFA **40×20 m**, proporção 2:1. Coordenadas internas: 1 unidade = 10 cm → **400×200 unidades**. Linhas: meio-campo + círculo central (raio 30), áreas de baliza (quarto de círculo 6 m), marca de grande penalidade (6 m) e segunda penalidade (10 m), balizas 3 m. Render SVG nativo. Três componentes: `CampoFutsal` (read-only), `MiniaturaCampo` (listagens), `EditorCampo` (interativo).

### 11.2 `DiagramaCampo` v2 (com passos)
Guardado em `Json`. Estende o v1 com **passos** para animação, mantendo retrocompatibilidade.
```typescript
interface DiagramaCampo {
  versao: 2;
  elementos: ElementoCampo[];      // estado base (passo 0)
  passos?: PassoAnimacao[];        // opcional; se ausente, é estático
  // 🔁 v7 (DEVERIA): campo do desenho — determina o SVG de fundo.
  campo?: TipoCampo;               // "FUTSAL_5" | "FUTEBOL_11" | ... (default FUTSAL_5, retrocompatível)
}
type ElementoCampo = Jogador | Bola | Cone | Baliza | Seta | Linha | Texto | Escadinha | Barras | Arco;
interface PassoAnimacao {
  id: string; ordem: number;
  posicoes: { elementoId: string; x: number; y: number }[];
  duracaoMs?: number;
}
```
Validação **Zod** (`diagramaSchema`) obrigatória. Diagrama vazio válido: `{ versao: 2, elementos: [] }` (`DIAGRAMA_VAZIO_V2`). A leitura aceita v1 (retrocompatível) e diagramas **sem `campo`** (assumem `FUTSAL_5`); **o editor grava sempre `versao: 2`**.

> **🔁 v7 — `campo` (DEVE):** o novo campo opcional `campo: TipoCampo` indica o **fundo de campo** a desenhar (futsal ou um dos formatos de futebol — 11.5). É preenchido a partir da modalidade/formato do contexto (exercício, modelo de jogo, quadro tático). Diagramas legados sem `campo` assumem `FUTSAL_5` (retrocompatibilidade total — Apêndice C). `TipoCampo` alinha com `FormatoJogo`.

> **🔁 v7 — `TipoCampo` (formalização):** `TipoCampo` partilha os mesmos literais que `FormatoJogo` (`FUTSAL_5`, `FUTEBOL_3_3`, etc.) e é representado como string no JSON `DiagramaCampo`. Um campo de diagrama sem `campo` assume `FUTSAL_5`. Exercícios de uso geral (sem modalidade específica) mostram campo neutro — renderizado como `FUTSAL_5` por defeito até existir um preset "neutro" explícito.

**Convenção base ⇄ passos (delta com herança):** conforme v6 §11.2 — `elementos` é o keyframe 0; cada `PassoAnimacao` é um delta que herda do keyframe anterior; `construirKeyframes` reconstrói `[base, base⊕passo0, …]`. Funções puras em `components/campo/animacao.ts`, testadas em `tests/campo.test.ts`.

> **🎨 v7 — Cones multicolor (DEVE):** o elemento `Cone` tem um campo **opcional** `cor: "laranja" | "amarelo" | "vermelho" | "azul" | "verde" | "branco"`. Ausente → **laranja** (default/retrocompatível — diagramas gravados antes do multicolor continuam válidos). A paleta partilhada (preenchimento + contorno) vive em `components/campo/desenho.tsx` (`CONE_CORES`, `CONE_COR_DEFAULT`) e alimenta tanto o render (`ElementoSVG`) como a toolbar do `EditorCampo`. No editor, a ferramenta **Cone** mostra um seletor de cor (alvos de toque ≥44px) que define a cor do próximo cone; um cone já colocado pode ser **recolorido** ao selecioná-lo (modo Selecionar). A cor persiste no JSON do diagrama e valida por `corConeSchema` (`lib/schemas/exercicio.ts`).

> **🪜 v7 — Escadinha e barras para saltos (DEVE):** dois novos elementos de treino de agilidade/coordenação, ambos com **rotação** via `angulo` (graus, 0–360) para orientação livre no campo:
> - **`Escadinha`** (escada de agilidade deitada no chão): `{ tipo: "escadinha"; x; y; angulo; tamanho: "pequena" | "media" | "grande" }`. O `tamanho` determina o nº de degraus no render (pequena=4, média=6, grande=8 — `ESCADINHA_DEGRAUS` em `desenho.tsx`); render em amarelo (`ESCADINHA_COR`) como dois trilhos paralelos com degraus horizontais. Defaults: `tamanho="media"`, `angulo=0`.
> - **`Barras`** (mini-barreiras para saltos): `{ tipo: "barras"; x; y; angulo }`, render em azul (`BARRAS_COR`) com forma de ⊓ (duas hastes verticais + barra superior). Default: `angulo=0`.
>
> Validam por `escadinhaSchema`/`barrasSchema` (`lib/schemas/exercicio.ts`) e integram o `elementoCampoSchema`. Como qualquer elemento-ponto, suportam seleção, arrasto, teclado, animação (passos) e hit area ≥32px. No editor, cada ferramenta tem botão próprio (miniatura SVG inline, alvo ≥44px) com controlos contextuais: **tamanho** (escadinha) e **rotação** (ambos, presets 0°/45°/90°/135°), tanto ao colocar como ao selecionar um elemento já existente (com registo no histórico/undo). Rótulos acessíveis em `rotuloElemento` (`animacao.ts`).

> **⭕ v7 — Arco (DEVE):** elemento-ponto que representa um **aro/círculo deitado no chão** (arco de agilidade), visto de cima → **elipse achatada** (perspetiva): `{ tipo: "arco"; x; y; cor? }`. A `cor` é **opcional** — `"amarelo" | "vermelho" | "azul" | "verde" | "laranja" | "branco"`; ausente → **amarelo** (default/retrocompatível). Render em `ElementoSVG` (`components/campo/desenho.tsx`) como elipse `rx≈9`/`ry≈5` com contorno escuro por baixo para contraste (essencial para o arco branco sobre relvado); paleta partilhada `ARCO_CORES`/`ARCO_COR_DEFAULT`. Valida por `arcoSchema` (`lib/schemas/exercicio.ts`) e integra o `elementoCampoSchema`. Como qualquer elemento-ponto, suporta seleção, arrasto, teclado, animação (passos) e hit area ≥32px. No editor, a ferramenta **Arco** (miniatura SVG inline, alvo ≥44px) mostra um seletor de cor que define a cor do próximo arco; um arco já colocado pode ser **recolorido** ao selecioná-lo (modo Selecionar, com registo no histórico/undo). Rótulo acessível em `rotuloElemento` (ex.: «Arco (azul)»).

### 11.3 Animação (A→B) e qualidade (prioridade)
Conforme v6 §11.3 (inalterado): playback com tween + `requestAnimationFrame` + easing; controlos play/pause/reiniciar/loop/velocidade; `prefers-reduced-motion` avança keyframe-a-keyframe; setas (sólida/tracejada/ondulada); equipa própria azul, adversário vermelho; pointer events com `setPointerCapture`; hit area ≥32px; acessibilidade de teclado. O editor é um **diferenciador central** — a sua validação é prioritária **e serve as duas modalidades**.

### 11.4 Reutilização
O mesmo editor e formato servem **exercícios**, **modelos de jogo**, **bolas paradas** e **quadros táticos**, em **futsal e futebol** (o fundo muda pelo `campo`). A miniatura é o mesmo SVG num viewBox menor.

### 11.5 Campos de futebol 🥅 (todos os formatos — novo v7)
> **Princípio:** mesmo motor SVG do futsal, mudando apenas o **fundo de campo** (dimensões, marcações) e o **viewBox**. Coordenadas internas mantêm a convenção **1 unidade = 10 cm** para coerência de escala e de hit area entre modalidades.

**Componentes:** generaliza-se `CampoFutsal` para um `CampoDesenho` (ou `CampoFutebol` irmão) que recebe o `campo`/formato e desenha o fundo correspondente; `MiniaturaCampo` e `EditorCampo` recebem o mesmo parâmetro. O código de elementos, passos, animação e interação é **partilhado e agnóstico ao fundo**.

**Fundos por formato (dimensões oficiais de referência; ver Apêndice B para detalhe):**

| `TipoCampo` / `FormatoJogo` | Dimensões de campo (referência) | viewBox interno (1u=10cm) | Marcações-chave |
|---|---|---|---|
| `FUTSAL_5` ⚽ | 40×20 m | 400×200 | meio-campo, círculo central (r=30), áreas 6 m (quarto de círculo), penálti 6 m, 2.ª penalidade 10 m, balizas 3 m |
| `FUTEBOL_3_3` 🥅 | ~25×15 m (mini) | 250×150 | meio-campo, balizas pequenas; **sem** grandes áreas (formação inicial) |
| `FUTEBOL_5_5` 🥅 | ~40×20 m | 400×200 | meio-campo, círculo central, pequenas áreas, balizas reduzidas |
| `FUTEBOL_7` 🥅 | ~60×40 m | 600×400 | meio-campo, círculo central, área ~12×24 m, marca de penálti, balizas 6 m |
| `FUTEBOL_9` 🥅 | ~75×50 m | 750×500 | meio-campo, círculo central, grande área, penálti, balizas |
| `FUTEBOL_11` 🥅 | 100×64 m (referência) | 1000×640 | meio-campo, círculo central (r=91,5 dm), grandes áreas (16,5 m), pequenas áreas (5,5 m), marca de penálti (11 m), arcos de área, balizas 7,32 m |

> **Notas de implementação (DEVE):**
> - As dimensões são **de referência** (a formação juvenil varia por associação); o objetivo é um fundo **funcionalmente correto e reconhecível**, não uma medição federativa exata. ⚠️ afinar por formato na fase 26.
> - O `viewBox` escala com as dimensões reais mantendo 1u=10cm, para que o `raioHitEfetivo` (11.3) e a escala de elementos sejam coerentes entre campos.
> - As **convenções de cor e setas** (equipa própria azul, adversário vermelho; seta sólida/tracejada/ondulada) são **idênticas** em futsal e futebol.
> - O **fundo de pitch escuro** (12.0) aplica-se a todos os campos (holofotes).
> - **`prefers-reduced-motion`** e a acessibilidade de teclado são independentes do fundo.

---

## 12. Sistema de design

Prescritivo. Base Tailwind + shadcn/ui. **Marca do produto: Mister** (guia em `docs/BRAND.md`). Princípio: **a marca é fixa; a cor do clube é dinâmica**. **🔁 v7:** o **logótipo mantém-se** (decisão de produto) — a expansão multi-desporto **não** altera a identidade visual da marca.

### 12.0 Design Direction (decisão 2026-08-05)
**Base visual — tema escuro:** o **tema escuro é a base** (default). Fundo `#0F0E13`; superfícies `#1C1B22` (cartões) e `#2A2933` (elevadas). Laranja Mister `#F0531E` como acento primário. Bricolage Grotesque com presença; números de estatística grandes/bold. **Alternador claro/escuro** (F14) persistido (`next-themes`), escuro como default.

**Cor do clube como identidade:** sidebar e acentos adotam as cores dominantes do clube (`--cor-primaria`/`--cor-secundaria`); logótipo do clube presente. Individual = laranja Mister domina.

**Motion como linguagem (DEVE):** transições de página (fade+8px); listas em cascata (40ms/item); gráficos que se desenham; números que contam; micro-celebrações (presença, golo); skeleton com shimmer; 5 estados de botão.

**Empty states (DEVE):** desenhados, com ilustração e convite a agir.

**Editor de campo:** pitch escuro (todos os campos, futsal e futebol).

**Acessibilidade em tema escuro (DEVE):** contraste AA (≥4.5:1); respeitar `prefers-reduced-motion`.

### 12.1 Tokens de cor
Conforme v6 §12.1: base escura (fundo `#0F0E13`, superfície `#1C1B22`, elevada `#2A2933`); marca laranja 500 `#F0531E`/600 `#C7430F`/100/50; neutros quentes (cinza 900→50); verde 600 (sucesso), âmbar (aviso), vermelho 600 (erro), azul (legado/demo). Display Bricolage Grotesque; corpo Inter. Todos os tons existem em `tailwind.config.ts`.

### 12.2 Branding dinâmico do clube
Conforme v6 §12.2: `Clube.corPrimaria`/`corSecundaria` alimentam sidebar e acentos; o **logótipo do produto** (Mister) aparece na barra de topo (link para o dashboard) e no login; o **logótipo do clube** está presente na **barra de topo** (junto ao nome do clube, §8), na **marca de água** da área de conteúdo e no **cabeçalho dos PDF**; contraste AA sobre superfícies escuras. **Fallback:** quando o clube não tem `logoUrl`, o logótipo do clube degrada para um **disco com as iniciais** do clube na cor do clube (`--cor-primaria`).

### 12.3 Tipografia (Inter)
`titulo-pagina` 24/700 · `titulo-seccao` 18/600 · `subtitulo` 15/600 · `corpo` 14 · `corpo-sec` 13 · `legenda` 12. Linha 1.5.

### 12.4 Componentes e layout
shadcn/ui como base. Cantos `lg` 12px / `md` 8px / `sm` 6px. **Alvos de toque ≥44px.** Tema escuro base + alternador. Datas via `date-fns` locale `pt`. **🔁 v7:** o **seletor de secção** (quando >1) segue o mesmo padrão visual do seletor de época (barra de topo); os agrupamentos por secção nos módulos usam cabeçalhos claros com o rótulo da modalidade.

### 12.5 Dados visuais (gráficos)
Gráficos SVG próprios (`GraficoBarrasH/V`, `GraficoLinhas`) com a cor do clube + neutros quentes; nunca depender só de cor. Diagramas de campo (futsal e futebol) como âncoras visuais.

**🔁 `GraficoLinhas` — linha de referência (2026-08-31):** o `GraficoLinhas` (`components/graficos/GraficoLinhas.tsx`) ganha a prop **opcional** `mediaReferencia?: number`. Quando presente e válida (`> 0` e `≤` ao máximo do eixo Y), desenha uma **linha horizontal tracejada** no gráfico, com o rótulo «média {valor}» (1 casa decimal) — usada, p.ex., para sobrepor a média de golos da época à evolução por jogo do atleta (M3, §10.4). Ausente ou fora de escala → o gráfico rende como antes (retrocompatível).

---

## 13. Estados de UI, i18n, acessibilidade e requisitos não-funcionais

### 13.1 Estados de UI
- **Loading:** `loading.tsx` por rota com **skeleton + shimmer**; ações com estado "a processar".
- **Vazio:** cada listagem com estado vazio **desenhado**; nunca tabela vazia.
- **Erro:** validação inline (`camposInvalidos`); operação → toast; página → `error.tsx`; não encontrado → `not-found.tsx`.

### 13.2 PWA e offline (modo jornada)
- App instalável (manifest + service worker), Android/iOS.
- **Offline tolerante** onde importa (beira-campo): presenças, estatísticas/eventos ao vivo (futsal **e** futebol) — guardar em lote e sincronizar quando a rede volta.

### 13.3 i18n e acessibilidade
- pt-PT hardcoded (sem i18n). Contraste AA (superfícies escuras); foco visível; teclado; `label`/`aria-label`; não depender só de cor. **Respeitar `prefers-reduced-motion`**.

### 13.4 Requisitos não-funcionais
- **Desempenho:** listagens < 1s; ações otimistas < 500ms; editor fluido em tablet (todos os campos). Índices do schema (incl. `Seccao(clubeId)`, `Escalao(seccaoId)`, `Presenca(escalaoId, estado)` e `Presenca(sessaoId, estado)`).
- **Otimizações de desempenho aplicadas (2026-08-20):**
  - **Deduplicação de resolvers de contexto por request:** os resolvers de contexto — `obterMembroAtual`, `obterUtilizadorAtual`, `obterClubeAtivo`, `escaloesLegiveis` (`lib/permissoes.ts`) e `obterClubeIdAtual`, `obterEpocaAtiva` (`lib/epoca-context.ts`) — estão embrulhados em **`React.cache()`**, memorizando o resultado dentro do mesmo *render*/request. Elimina ~8–10 queries duplicadas por *page load* (o mesmo membro/época era resolvido repetidamente pela mesma action e pelas verificações de permissão).
  - **Paralelização de I/O no layout:** em `app/(app)/layout.tsx`, `temLicencaValida` corre em **`Promise.all`** com `listarEpocas`, `obterEpocaAtiva` e `obterSeccoes` (antes sequenciais).
  - **Code-splitting de componentes pesados (`next/dynamic`, `ssr: false`):** `EditorCampo` (em `components/exercicios/ExercicioForm.tsx`) e os gráficos SVG (`GraficoLinhas`, `GraficoBarrasH`, `GraficoBarrasV`, `CurvaCargaSemanal`) usados em `components/analiticos/`, `components/plantel/EstatisticasAtleta.tsx`, `app/(app)/relatorios/page.tsx` e `app/(app)/escaloes/[id]/analiticos/page.tsx` são carregados dinamicamente, mantendo-os fora do *bundle* inicial.
  - **`optimizePackageImports`:** `next.config.js` com `experimental.optimizePackageImports: ["lucide-react"]` (*tree-shaking* dos ícones importados).
  - **`next/image` para o logótipo do clube:** substituído `<img>` por `<Image fill>` com `images.remotePatterns` configurados em `next.config.js` (otimização/responsividade do logótipo servido pelo Supabase Storage).
  - **Agregação na base de dados:** `obterAnaliticoClubeEpoca` (`lib/actions/analise.ts`) usa `prisma.sessao.groupBy` e `prisma.presenca.groupBy` em vez de `findMany` + contagem em memória, reduzindo o volume de dados transferido.
- **Segurança:** ver 5.6. Queries por clube + época + âmbito (+ secção).
- **Integrações externas:** Google Calendar (OAuth, tokens encriptados) e, futuramente, Paddle — isoladas do login.
- **Custo operacional mínimo:** sem IA no núcleo; só alojamento + BD + Storage.
- **Escrita concorrente (last-write-wins):** as server actions **não** implementam optimistic locking; a última escrita prevalece sem aviso. Aceite para o perfil de utilização; revisitável com dados de usage. **Futuro:** `version` + verificação de `updatedAt` nos modelos de alta escrita (`EstatisticaAtleta`, `Sessao`, `Jogo`).

---

## 14. Estratégia de testes

Nível: essencial mas obrigatório sobre **lógica de negócio e Server Actions**. **Vitest** (`npm run test`).

**Obrigatório testar:**
- **Schemas Zod** (válidos/inválidos) — todos os módulos, incl. **novos v7** (secção, formato de jogo, posições de futebol, estatísticas de futebol, modalidade no exercício/template/métrica/habilidade).
- **`DiagramaCampo`** v2 (incl. passos e o novo campo `campo`/`TipoCampo`; retrocompatibilidade com diagramas sem `campo` → FUTSAL_5).
- **Agregações** (`lib/estatisticas.ts`): GR vs campo, `totalMinutos` null, tempo por blocos, taxa de presença por escalão, vista conjunta multi-escalão, agregação de eventos ao vivo, analytics de clube, **e o núcleo de futebol (§10.8)** + segmentação por modalidade da vista conjunta.
- **Server Actions:** sucesso, falha de validação/auth/capacidade/âmbito (incl. **âmbito `SECCAO`**), overrides e delegação, casos-limite da secção 9 — **incl. multi-desporto**: criação transparente de secção, `@@unique` de secção (idempotência), invariante do principal **por modalidade**, apagar secção com escalões, licença Individual = uma modalidade, derivação de modalidade pela secção.
- **Autorização** (`exigirCapacidade` + `capacidadesEfetivas`): matriz perfil × capacidade × âmbito (TODO_CLUBE/SECCAO/PROPRIOS_ESCALOES) × overrides, **incl. Coordenador de Secção** (6.9).
- **Regras de visibilidade das bibliotecas** (módulo puro): 🎒 pessoal visível ao autor **e aos treinadores que partilhem ≥1 escalão com ele** (§3.3), sempre portátil e só-de-leitura para não-autores; 🏛️ do clube a todos os membros; partilha por clube; filtro por modalidade.
- **Classificação** (`obterClassificacao`) e **relatório partilhável** (token, snapshot, expiração, segmentação por secção).

**Método:** Prisma/auth/época/permissões/**secção** mockados para actions; funções puras testadas diretamente. Manter e alargar os testes existentes (**1037** à data da v6). BD de teste isolada para integração.

---

## 15. Stack, setup e deployment

### 15.1 Stack
Next.js 15 (App Router) · React 19 · TypeScript strict · Prisma + PostgreSQL (Supabase) · Auth.js v5 · Zod · Tailwind + shadcn/ui · Vitest · PWA. **Supabase Storage** para logótipos/ficheiros. Integrações: **Google Calendar** (OAuth) e **Paddle** (billing, futuro). Sem IA no núcleo.

### 15.2 Estrutura de pastas
`app/` · `components/` (ui, campo, graficos, layout, por módulo — incl. `components/seccoes/`) · `lib/actions/` (incl. `seccoes.ts`) · `lib/schemas/` · `lib/` (db, auth, contexto, estatísticas, permissões, **config de modalidade — `lib/modalidade.ts`**) · `prisma/` · `tests/` · `docs/`.

### 15.3 Convenções fixas
Server Actions (`"use server"`); Zod em `lib/schemas/`; padrão de action (validar → auth/membro → capacidade/âmbito → época → **derivar modalidade pela secção** → `Resultado<T>` → `revalidatePath`); queries por clube + época + âmbito (+ secção).

### 15.4 Supabase / ligações
- **Pooler obrigatório:** Transaction pooler (6543, `?pgbouncer=true`) para a app; Session pooler (5432) para migrações (`DIRECT_URL`). Segredos em `.env`.
- **Co-localização de região (2026-08-20):** as *Functions* da Vercel correm em **`cdg1` (Paris, `eu-west-3`)**, alinhadas com a região do Supabase (`aws-0-eu-west-3`). Antes corriam em `iad1` (Washington DC), o que adicionava latência transatlântica a cada *round-trip* à base de dados. Configurado em `vercel.json`/definições do projeto.

### 15.5 Comandos
`npm run dev` · `typecheck` · `lint` · `test` · `db:migrate` · `db:seed` · `db:studio`. **🔁 v7:** o seed passa a semear a **biblioteca curada por modalidade** (futsal e futebol) e a criar a secção correspondente.

### 15.6 Deployment e custos
- **Arranque:** Vercel Pro + Supabase Free (keep-alive via GitHub Actions) ≈ **€19/mês**. Escala por upgrades. Billing Paddle deferido.

## 16. Ordem de desenvolvimento (fases)

Cada fase fica **funcional, testada e documentada** antes da seguinte. **"Definição de pronto":** implementado conforme a bíblia · validação Zod + `Resultado<T>` · **permissões verificadas** · estados loading/vazio/erro · responsivo · `typecheck`+`lint`+`test` limpos · secção da bíblia atualizada.

### Fases 1–10 — Produto final (base) ✅ CONCLUÍDAS
Resumo: **1** Esqueleto · **2** Reconversão de módulos · **3** Periodização · **4** Modelo de jogo + quadro tático · **5** Jogos avançado · **6** Animação de diagramas · **7** Reuniões · **8** Relatórios/tracking + PDF · **9** Biblioteca curada · **10** PWA/offline + polish + caderneta.

### Fases 11–24 — Evolução para o produto completo (v6) ✅ CONCLUÍDAS
- **11** Refactor do plantel (Atleta ao nível do clube + `AtletaEscalao`). **12** Editor de exercícios (gate de qualidade). **13** Bibliotecas (pessoal+clube) + templates de sessão. **14** Modelo de jogo (documento vivo) + bolas paradas. **15** Jogos: dia de jogo + scouting + tempos por blocos. **16** Competições + classificação (inserção manual). **17** Comunicação (WhatsApp) + calendário. **18** Sincronização Google Calendar. **19** Analytics 3 níveis + relatório partilhável. **20** Onboarding com vitória rápida. **21** Licenciamento e multi-tenant. **22** Conformidade FPF (levantamento). **23** Polish transversal. **24** Design direction (tema escuro + motion) + Dashboard contextual + Lembretes.
> (Ver changelog §19 e a `Mister_Spec_v6.md` para o detalhe verbatim de cada fase.)

### Fases 25–30 — Expansão multi-desporto (v7 — decisão 2026-08-19)

> **Princípio transversal:** todas as fases são **aditivas** (Apêndice C), **não tocam em auth** (Regra Sagrada), e cada uma fica **funcional/testada/documentada** antes da seguinte. Ordem obrigatória: a fase 25 é **pré-requisito** de todas as outras.

**Fase 25 — Fundação multi-desporto (Secção, enums, migração, helpers).**
- **Objetivo:** introduzir a camada de secção e a modalidade como âncora, sem alterar comportamento visível para clubes monomodalidade.
- **Entidades/ficheiros:** `prisma/schema.prisma` (novos: `Seccao`, `MembroSeccao`, enums `Modalidade`, `PapelSeccao`; `AmbitoPerfil` ganha `SECCAO`; `Escalao.seccaoId`; migração aditiva + **backfill** que cria uma secção FUTSAL por clube e liga os escalões — Apêndice C); `lib/modalidade.ts` (registry `ConfigModalidade` — secção 20.3; helper `modalidadeDoEscalao`); `lib/permissoes*.ts` (âmbito `SECCAO`, `seccoesCoordenadas`, `exigirCapacidade` com secção; capacidade `CLUBE_SECCOES`); `lib/actions/seccoes.ts` (`listarSeccoes`, `criarSeccao`, `atualizarSeccao`, `apagarSeccao`, `atribuirCoordenador`, `removerCoordenador`, `garantirSeccaoParaModalidade`); `lib/actions/escaloes.ts` (`criarEscalao` cria/garante a secção); `lib/actions/onboarding.ts`/`contas.ts` (registo Individual escolhe modalidade → cria secção); perfil de arranque **Coordenador de Secção** (`lib/permissoes-catalogo.ts`); UI mínima (`/definicoes/seccoes` — §8.22; seletor de secção condicional).
- **Critério de pronto:** migração aditiva aplicável; backfill idempotente; `@@unique([clubeId, modalidade])`; um clube 100% futsal continua a funcionar **sem qualquer UI nova**; testes de secção/permissões/backfill; **typecheck/lint/test limpos + bíblia atualizada (§3.1.1, §6.9, §8.22, Apêndice C)**; **não toca em auth**.

**Fase 26 — Campo de futebol SVG (todos os formatos).**
- **Depende de:** Fase 25.
- **Objetivo:** o editor de campo passa a desenhar os fundos de futebol (3×3 a 11×11), reutilizando todo o motor de elementos/passos/animação.
- **Entidades/ficheiros:** `components/campo/` (generalização `CampoFutsal`→`CampoDesenho`/`CampoFutebol`; parâmetro `campo`/`TipoCampo`; fundos por formato — Apêndice B); `DiagramaCampo.campo` (schema Zod + retrocompatibilidade FUTSAL_5); `MiniaturaCampo`/`EditorCampo` recebem o formato; `lib/schemas/exercicio.ts` (validação do `campo`).
- **Critério de pronto:** todos os fundos (Apêndice B) renderizam corretamente; diagramas legados sem `campo` assumem FUTSAL_5; hit area/escala coerentes (1u=10cm); animação e teclado funcionam em todos os campos; testes de `construirKeyframes`/`campo`; **typecheck/lint/test limpos + bíblia atualizada (§11.5)**; **não toca em auth**.

**Fase 27 — Posições e plantel multi-desporto.**
- **Depende de:** Fase 25.
- **Objetivo:** posições de futebol no enum e na UI; plantel e participações a respeitar a secção/modalidade.
- **Entidades/ficheiros:** `Posicao` (enum expandido — §3.2); `LABEL_POSICAO` agrupado por modalidade; seletor de posição filtrado pela modalidade; `lib/actions/atletas.ts`/`participacoes.ts` (invariante do principal **por modalidade** — §9); `lib/actions/atletas.ts` `listarAtletas` agrupado por secção; perfil do atleta com estatísticas/caderneta/percurso segmentados por modalidade (UI).
- **Critério de pronto:** um atleta pode ter participações em secções diferentes; invariante do principal por modalidade coberto por testes (transação Serializable); seletor de posições correto por modalidade; **typecheck/lint/test limpos + bíblia atualizada (§3.2, §8.5, §9)**; **não toca em auth**.

**Fase 28 — Jogos e estatísticas de futebol.**
- **Depende de:** Fases 25, 26 e 27.
- **Objetivo:** `Jogo.formato`, núcleo estatístico de futebol e registo ao vivo de futebol.
- **Entidades/ficheiros:** `Jogo.formato` (`FormatoJogo`) + derivação da secção + editável; `EstatisticaAtleta` (remates, cantos, foras-de-jogo, desarmes); `EventoJogo`/`TipoEventoJogo` (REMATE/CANTO/FORA_DE_JOGO/DESARME); grelha de estatísticas mostra o núcleo da modalidade (oculta faltas por parte em futebol); `MetricaConfig.modalidade`; agregações (`lib/estatisticas.ts`, `lib/actions/analise.ts`) com núcleo por modalidade e `MINUTOS_POR_BLOCO` parametrizável por formato (⚠️ §10.8); vista de dia de jogo com posições de futebol.
- **Critério de pronto:** jogos de futebol registam o núcleo correto; jogos de futsal inalterados; agregações e cards sociais corretos por modalidade; testes de agregação de futebol; **typecheck/lint/test limpos + bíblia atualizada (§3.7, §8.11, §10.4, §10.8)**; **não toca em auth**.

**Fase 29 — Conteúdo curado de futebol (exercícios, templates, caderneta).**
- **Depende de:** Fase 25.
- **Objetivo:** biblioteca curada e habilidades de futebol, para que uma secção de futebol nunca comece vazia.
- **Entidades/ficheiros:** `Exercicio.modalidade`/`ModeloSessao.modalidade`/`Habilidade.modalidade`; `lib/biblioteca-arranque.ts`/`lib/templates-arranque.ts` (conteúdo de futebol por formato/parte do treino); `instalarBibliotecaArranque(modalidade)`/`instalarTemplatesArranque(modalidade)`; seed por modalidade; filtros de biblioteca por modalidade (UI §8.6/§8.7); caderneta de futebol (§8.14).
- **Critério de pronto:** instalar a biblioteca de futebol é idempotente; filtros por modalidade funcionam; exercícios de futebol usam o campo correto; **typecheck/lint/test limpos + bíblia atualizada (§3.3, §3.4, §8.6, §8.7, §8.14, Apêndice B)**; **não toca em auth**.

**Fase 30 — Onboarding, navegação e billing multi-secção.**
- **Depende de:** Fases 25, 26, 27, 28 e 29.
- **Objetivo:** experiência de ponta a ponta multi-desporto e pricing por secção.
- **Entidades/ficheiros:** onboarding (registo Individual = modalidade; setup de clube com secções); seletor de secção condicional em toda a navegação (barra de topo, plantel, treinos, jogos, exercícios, analytics); agrupamento por secção; analytics de clube com filtro/comparação por secção (§10.3/§10.8); wizard «Nova Época» a respeitar secções (§8.21); licenciamento (§17.1 — Individual uma modalidade; Clube escala por secção; `Licenca.modalidade` ⚠️); Coordenador de Secção end-to-end (atribuição, gating de UI).
- **Critério de pronto:** clube com futsal **e** futebol totalmente utilizável; Individual bloqueia segunda modalidade com mensagem clara; pricing por secção documentado e refletido (aviso suave, enforcement de billing deferido); analytics transversal compara secções; **typecheck/lint/test limpos + bíblia atualizada (§8.1.1, §8.21, §10.3, §17)**; **não toca em auth**.

### Fase 31 — Plano semanal de treinos (2026-08-20)

- **Depende de:** produto base de treinos (Fases 1–10). Independente da expansão multi-desporto (25–30); as sessões geradas herdam a modalidade da secção do escalão (`modalidadeAtividade = null`).
- **Objetivo:** substituir a criação avulsa (um-a-um) por um horário recorrente que gera todas as sessões da época, com edição pontual e propagação "esta e todas as futuras".
- **Entidades/ficheiros:** `prisma/schema.prisma` (novos `PlanoSemanal`, `PlanoSemanalDia`; `Sessao.planoSemanalId`/`planoSemanalDiaId` `SetNull` + `personalizada`; migração **aditiva** `20260820134433_plano_semanal_treinos`, tudo nullable/default); `lib/schemas/planoSemanal.ts` (`criarPlanoSemanalSchema`: `escalaoId`, `nome?`, `dataInicioGeracao`, `dias[]` com `diaSemana` 1-7, `horaInicio`/`horaFim` "HH:MM" com refine `fim>inicio` e `diaSemana` único; `atualizarPlanoSemanalSchema`: `nome?`/`ativo?`/`dias?`; enum `alcanceSchema` `SO_ESTA`/`ESTA_E_FUTURAS`; enum `modoApagarSchema` `DESVINCULAR`/`APAGAR_FUTURAS_VAZIAS`); `lib/actions/planoSemanal.ts` (as 6 actions do plano: `preverPlanoSemanal`, `criarPlanoSemanal`, `listarPlanosSemanais`, `obterPlanoSemanal`, `atualizarPlanoSemanal`, `apagarPlanoSemanal`); `lib/actions/treinos.ts` (`atualizarSessao` ganha `alcance?`); `lib/plano-semanal.ts` (funções **puras** de geração de datas por intervalo+dias e helpers de hora, testáveis isoladamente); UI (`/treinos/novo` com toggle de modo, `components/treinos/PlanoSemanalForm.tsx` com pré-visualização; `/treinos/planos` + lista por escalão; `components/treinos/DialogoAlcance.tsx` integrado no `SessaoForm`; `EditarPlanoDialog`/`ApagarPlanoDialog`/`SeletorDiasPlano`).
- **Critério de pronto:** gerar um plano de 2 dias/semana produz o nº correto de sessões no intervalo, com deduplicação; "esta e futuras" altera só agendamento e só futuras não-personalizadas; "só esta" isola a sessão; apagar plano preserva conteúdo; guarda de época sem datas; geração e propagação em transação; **um plano ativo por (escalão, época)**; testes da função pura de geração + das actions (propagação, deduplicação, imutabilidade do passado); **`typecheck`/`lint`/`test` limpos + bíblia atualizada (§3.5, §7.3, §8.8.1, §9)**; **não toca em auth**.
- **Métrica de sucesso:** tempo para agendar a época completa de um escalão **< 2 min** (vs. dezenas de criações avulsas); **% de treinos criados via plano vs. avulso** (adoção); nº de propagações "esta e futuras" usadas (prova que a edição em massa resolve dor real).

### Fase 32 — Equipas, quadro competitivo e agendamento na criação de competição (2026-08-20)

- **Depende de:** competições + classificação (Fase 16). Independente da expansão multi-desporto (25–30) e do plano semanal (Fase 31); a competição herda a modalidade da secção do escalão.
- **Objetivo:** substituir o form de criação de competição de 1 passo por um **wizard de 3 passos** que regista as **equipas participantes** (entidade `EquipaCompeticao`), **gera o quadro competitivo** (LIGA todos-contra-todos / TORNEIO-TAÇA bracket eliminatório) e permite **agendar** os jogos — tudo numa gravação transacional.
- **Entidades/ficheiros:** `prisma/schema.prisma` (novo `EquipaCompeticao`; `Competicao.equipas`; `ResultadoCompeticao` ganha `ronda`/`dataHora`/`estado` e `golosCasa`/`golosFora` passam a nullable; enum `EstadoResultado`; migração **aditiva** com backfill — resultados legados `estado=REALIZADO`, `ronda=null`, `dataHora=null`, Apêndice C); `lib/schemas/competicao.ts` (schemas do wizard — equipas `min 2`, nome com `trim`, opções de geração `duasMaos`); `lib/quadro-competitivo.ts` (funções **puras** de geração: round-robin de LIGA com nº de jornada; bracket eliminatório com byes e codificação de ronda — testáveis isoladamente); `lib/actions/competicoes.ts` (`adicionarEquipaCompeticao`, `removerEquipaCompeticao`, `obterEquipasCompeticao`, `gerarQuadroCompeticao`, `criarCompeticaoCompleta`, `atualizarAgendamentoJogo`); `obterClassificacao` filtra `estado=REALIZADO` (§10.9); UI (wizard de 3 passos em `/competicoes/nova`, tabela de jogos gerados editável, edição de agendamento/resultado no detalhe da competição).
- **Critério de pronto:** LIGA de N equipas gera N×(N−1)/2 jogos por mão (N×(N−1) com "2 mãos") com jornadas corretas; TORNEIO/TAÇA gera bracket até à potência de 2 com byes corretos e rondas codificadas (1=final…); mínimo 2 equipas validado; unicidade de nome por competição; `criarCompeticaoCompleta` atómica; classificação ignora jogos `AGENDADO`; regenerar quadro exige confirmação; remover equipa bloqueado se tem jogos realizados; jogos avulsos coexistem com o quadro; competições legadas inalteradas; testes das funções puras de geração (round-robin + bracket + byes) e das actions; **`typecheck`/`lint`/`test` limpos + bíblia atualizada (§3.7, §7.3, §8.11, §9, §10.2, §10.9)**; **não toca em auth**.
- **Métrica de sucesso:** tempo para montar uma competição completa com calendário **< 3 min** (vs. inserção jogo-a-jogo); **% de competições criadas via wizard vs. resultado avulso**; nº de jogos agendados por competição (prova que o quadro gerado é usado).

### Fase 33 — Mano-a-Mano (duelos 1×1) (2026-08-24)

- **Depende de:** produto base de treinos (Fases 1–10), plantel (Fase 11) e — para a integração no detalhe da sessão — o plano semanal de treinos (Fase 31, opcional). Independente da expansão multi-desporto (25–30): cada competição 1×1 herda a **modalidade** da secção do seu escalão anfitrião (secção 22.4). **Especificação completa na secção 22.**
- **Objetivo:** introduzir competições de **duelos 1×1** (ligas anuais e torneios) entre atletas do clube e — em modo inter-clubes — contra atletas de clubes externos sem conta Mister, com geração automática de fixtures/brackets, registo de resultados, classificação calculada e distribuição automática dos duelos pelos treinos disponíveis.
- **Sub-passos (cada um funcional/testado/documentado antes do seguinte):**
  - **33.1 — Schema Prisma + migração (aditiva).** Novos modelos `CompeticaoManoMano`, `ClubeExterno`, `ParticipanteManoMano`, `MatchManoMano`; enums `TipoManoMano`, `AmbitoManoMano`, `FormatoTorneioManoMano`, `FormatoDuelo`, `EstadoManoMano`, `EstadoMatch`, `TipoParticipante`; índices e a `@@unique([competicaoId, atletaId])`; FK `MatchManoMano.sessaoId → Sessao` com `onDelete: SetNull` (secção 22.3, Apêndice C).
  - **33.2 — CRUD de competições + participantes + `ClubeExterno`** (Server Actions em `lib/actions/mano-a-mano.ts` + schemas Zod em `lib/schemas/mano-a-mano.ts`), com isolamento multi-tenant (clube+época) e capacidade `MANOAMANO_GERIR` (secção 22.6).
  - **33.3 — Geração de fixtures** (round-robin pelo algoritmo do círculo; bracket eliminatório com byes para os primeiros seeds) + **pré-visualização** (`preverFixturesManoMano`), com distribuição automática dos duelos pelos treinos futuros disponíveis (secção 22.5).
  - **33.4 — Registo de resultados + classificação calculada.** `registarResultadoManoMano` (deriva `vencedorParticipanteId`), `obterClassificacaoManoMano` (computada, não persistida). **Vitest:** algoritmo de fixtures (round-robin + bracket + byes), ordem de desempate e validação Zod do resultado (só 2–0 ou 2–1 em `PRIMEIRO_A_DOIS`) — funções puras testáveis isoladamente (secção 22.5).
  - **33.5 — Integração no detalhe do treino:** bloco «Mano-a-Mano» na sessão (`obterDuelosDaSessao`) com duelos agendados e registo de resultado, gated por `TREINOS_GERIR` (secção 22.7).
  - **33.6 — Frontend:** lista com tabs por escalão (`/mano-a-mano`), wizard de criação (`/mano-a-mano/novo`), detalhe com calendário/bracket (`/mano-a-mano/[id]`) e classificação (`/mano-a-mano/[id]/classificacao`) (secção 22.6).
  - **33.7 — Dashboard + integração analítica:** card «Próximo duelo Mano-a-Mano» no próximo treino e classificação final/campeão 1×1 no relatório de fim de época (secção 22.7).
- **Critério de pronto:** competição 1×1 (liga e torneio) totalmente utilizável intra-clube e inter-clubes; resultado `PRIMEIRO_A_DOIS` rejeita qualquer marcador que não seja 2–0/2–1; vencedor derivado automaticamente; round-robin de N participantes gera N×(N−1)/2 duelos (bye rotativo com N ímpar); bracket com byes corretos e avanço do vencedor via `proximoMatchId`; classificação calculada com a ordem de desempate da secção 22.5; regenerar bloqueado se já houver resultados; atleta que sai → futuros `ANULADO`, histórico preservado; todo o duelo pertence a uma competição; testes das funções puras (fixtures/desempates) e das actions; **`typecheck`/`lint`/`test` limpos + bíblia atualizada (§6.2, §6.6, §22, Apêndice C)**; **não toca em auth**.
- **Métrica de sucesso:** nº de duelos registados por época; **% de duelos registados em treino vs. registo manual**; adoção de ligas anuais 1×1 por escalão (prova que a gamificação leve do 1×1 gera uso recorrente).

---

## 17. Modelo de negócio e licenciamento

### 17.1 Duas licenças (🔁 v7 — multi-secção)
- **Individual (Treinador):** acesso completo ao produto de treinador, **para uma modalidade** (futsal **ou** futebol, escolhida na compra). **Sem** gestão de clube. Sem trial. **€4,99/mês** ou **€49/ano** (preço **mantém-se**, independentemente da modalidade). **Não** permite gerir as duas modalidades — para isso, licença de Clube.

> **Treinador individual e duas modalidades:** a licença Individual suporta uma única modalidade. Um treinador que dirija escalões de futsal e de futebol em simultâneo DEVE usar uma licença de Clube (ou Clube Técnico). Esta decisão é intencional: a gestão de duas secções implica funcionalidades de coordenação (permissões, analytics cruzados) que a licença Individual não comporta. A persona do treinador dual-sport individual é reconhecida e o seu caminho natural é o Clube Técnico (sem atletas, só escalões do próprio treinador).
- **Clube:** produto de treinador completo + **camada de gestão de clube** (secções, escalões, membros, perfis, branding, analytics, relatórios), com **uma ou várias secções**. **Tiers por número de escalões** (transversal às secções):

| Tier | Limite de escalões (total, todas as secções) | Mensal | Anual |
|---|---|---|---|
| **Pequeno** | ≤ 2 | €15 | €149 |
| **Médio** | ≤ 4 | €19 | €190 |
| **Grande** | ≤ 8 | €34 | €340 |
| **Parceiro** | negociado | negociado | negociado |

**🔁 Escala por secção/modalidade (decisão 2026-08-19 — fechada):** **Clube multi-secção:** o preço da segunda secção (modalidade adicional) é **+50% do tier base do clube**. Exemplo: clube com 3 escalões (tier Base €15/mês) que adiciona secção de futebol paga €22,50/mês. O sistema calcula automaticamente com base no tier da secção mais cara + 50% por cada secção adicional. O enforcement de billing ocorre na Fase 30.
- **1 secção:** preço do tier conforme a tabela acima (comportamento atual da v6).
- **2+ secções:** tier da secção mais cara + **50% por cada secção adicional**. O tier de cada secção é determinado pelo **nº de escalões** dessa secção.
- **Parceiro:** pricing multi-secção negociado.
- **Enforcement:** deferido até à **Fase 30** (com o Paddle); na versão atual há **aviso suave** ao criar escalões/secções além do plano. O modelo de dados (`Licenca`, tiers) suporta o cálculo por secção.

O tier **Parceiro** inclui features custom, **voz no roadmap** e reuniões periódicas.

### 17.2 Modelo de dados único (multi-tenant)
- O **`Clube` é sempre o tenant de topo**, mesmo na licença Individual (clube técnico invisível). **🔁 v7:** o clube técnico Individual tem **uma única secção** (a modalidade contratada).
- **Conta única por email pessoal.**
- A licença técnica fica modelada em `Licenca` (3.11); o enforcement efetivo entra com o billing. **🔁** `Licenca.modalidade` (ou derivação da secção do clube técnico) regista a modalidade Individual contratada (⚠️ 3.11).

### 17.3 Propriedade do conteúdo NÃO está ligada à licença
Decidida pelo treinador na criação (toggle pessoal vs clube). O pagamento não transfere o trabalho criativo. A biblioteca pessoal é sempre do treinador e viaja com ele (**futsal e futebol**); a do clube é a filosofia do clube.

### 17.4 Subscrições e absorção
- **Absorção:** crédito proporcional para a **carteira** (`CREDITO_ABSORCAO`). **🔁** se a modalidade da licença Individual absorvida não coincidir com nenhuma secção do clube, o clube cria a secção correspondente ao absorver o treinador (ou o treinador escolhe a secção onde entra).
- **Reembolso real:** só por pedido manual via email.
- **Clube paga preço normal.** **Sair do clube:** reativa a Individual por conta própria.

### 17.5 Billing
- **Provider:** **Paddle** (Merchant of Record). **Implementação deferida.** `Licenca`/`Carteira` desenhadas para suportar webhooks, `paddleSubscriptionId`, `paddleCustomerId` — e o **cálculo multi-secção** (17.1).
- **Fluxo de pagamento interino (enquanto o Paddle está deferido) — completo:**
  1. **Escolha de plano no onboarding.** No **wizard de onboarding** (§8.1), antes do submit final, o utilizador **escolhe o plano** (tier): Individual, ou Clube por tier de escalões (§17.1).
  2. **Licença `PENDENTE` na criação do clube.** Ao criar o clube, `criarClube` cria uma `Licenca` com **`estado: PENDENTE`**, o **tier escolhido** e o `ciclo`/`precoCentimos` correspondentes. `PENDENTE` **não concede acesso** (§3.11), pelo que o utilizador é encaminhado para o paywall.
  3. **Paywall com plano + valor exato.** O ecrã `/sem-licenca` mostra **o plano escolhido e o valor exato a transferir** (em vez da tabela completa de planos), com os **dados de transferência bancária** — IBAN, **referência** (nome do clube + email do titular) e **email para envio do comprovativo**.
  4. **Ativação manual pelo admin.** O utilizador **transfere** e **envia o comprovativo por email**. O admin, ao receber o comprovativo, **ativa a licença no backoffice** (§21.2): estado **`PENDENTE → ATIVA`**. A partir daí a guarda de licença (§3.11) concede acesso.
- **Integração Paddle: deferida.** `Licenca`/`Carteira` estão desenhadas para suportar webhooks, `paddleSubscriptionId`, `paddleCustomerId` e o **cálculo multi-secção** (17.1). Este fluxo interino por transferência bancária é **temporário** e será substituído pelo checkout automático do Paddle (que passará a criar/ativar/renovar licenças e a fazer a transição automática `ATIVA→EXPIRADA`).

### 17.6 Go-to-market
- Sem trial. Vídeo demonstrativo público. Reunião de demonstração a pedido. Parceiros fundadores (patrocínio mútuo). Suporte via WhatsApp. **🔁** a mensagem passa a incluir "futsal **e** futebol" — atrai clubes com as duas modalidades.

---

## 18. Roadmap futuro (fora da versão atual)

- **Quotas/mensalidades do clube** (o clube a cobrar aos pais).
- **App móvel nativa** (iOS/Android) — a PWA é suficiente por agora.
- **App/portal de pais e atletas.**
- **IA generativa** de exercícios/sessões/relatórios (plugin pago).
- **Análise de vídeo.**
- **GPS/wearables, wellness, RPE avançado.**
- **Gestão clínica/lesões avançada.**
- **Multi-idioma / multi-moeda.**
- **Integração automática com APIs de competições oficiais** (classificações/calendários) — de futsal **e** de futebol.
- **Portal de desporto** (projeto separado, potencial parceria).
- **Biblioteca partilhada/comunidade** de exercícios (em avaliação).
- **App via APK** (embrulho TWA/Capacitor da PWA).
- **🔁 Novos desportos** além de futsal e futebol (a arquitetura de secção/registry `ConfigModalidade` — secção 20 — está preparada; nenhum entra na versão atual).

## 19. Changelog da documentação

Do mais recente para o mais antigo.

- **2026-09-04** — **Presenças — botão "Guardar" só com alterações, sessão fechada em só-leitura, e aviso de sessões por fechar no dashboard (§8.8.2, §8.16).** Três melhorias na grelha de presenças e no incentivo a concluir sessões. **Só apresentação/agregação server-side + uma guarda de escrita — sem alteração de schema, migração, dados de negócio ou auth.** **(1) Guardar só com alterações pendentes (§8.8.2):** novo helper puro `lib/presencas.ts` — `presencasAlteradas(inicial, atual)` (compara estado/motivo/justificação por atleta, normalizando a justificação: `null`/`""`/espaços equivalem) e tipo partilhado `RegistoPresenca`. `components/treinos/MarcadorPresencas.tsx` memoiza o estado **inicial** vindo do servidor e desativa **"Guardar presenças"** (rótulo "Sem alterações") e **"Repor"** quando não há nada por guardar; `guardar` também aborta sem alterações. **(2) Sessão fechada em só-leitura (§8.8.2):** o componente ganha a prop `fechado?: boolean` (passada por `app/(app)/treinos/[id]/page.tsx` a partir de `s.fechado`); quando `true`, os segmentos de estado, botões de motivo e texto livre ficam **desativados**, os atalhos e a barra de guardar ficam **ocultos**, e surge o badge **"Sessão concluída · só leitura"** (`Lock`). **Reforço no servidor:** `marcarPresencas` (`lib/actions/treinos.ts`) passa a **rejeitar** a escrita quando `sessao.fechado` (erro `Resultado`) — defesa em profundidade. **(3) Aviso de sessões por fechar (§8.16):** `app/(app)/dashboard/page.tsx` conta as **sessões passadas por fechar** (`data < hoje` e `fechado = false`, respeitando época ativa + escalões legíveis §6.4/§6.5) e mostra um **banner âmbar** (`BannerSessoesPorFechar`, ícone `CircleAlert`) que liga a `/treinos?vista=lista&estado=aberto`, incentivando o treinador a concluí-las antes de acumular. Novo `tests/presencas.test.ts` (8) cobre `presencasAlteradas` (idênticos, mudança de estado/motivo/justificação, normalização de espaços, atleta só num mapa, marcar todos presentes). UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. **Não toca em auth.**
- **2026-09-04** — **Correção — analíticos do atleta perdiam o histórico quando o atleta saía do escalão (§10.1).** Quando um atleta era **removido de um escalão** (`terminarParticipacao` → participação `INATIVO`), **promovido/transferido** (`transferirEscalao` → origem `TRANSICAO_PERMANENTE`) ou **arquivado** (`Atleta.ativo=false`), as suas **estatísticas e presenças históricas desapareciam** do painel de Analytics do perfil (aba **Analytics**), que passava a devolver «Sem permissão»/vista vazia. **Causa raiz:** três Server Actions de leitura em `lib/actions/analise.ts` — `obterAnaliticoAtleta`, `obterEvolucaoAtleta` e `obterPresencasMensal` — derivavam o(s) escalão(ões) de contexto **apenas das participações `estado: "ATIVO"`** da época. Como as participações **não são apagadas** (só mudam de estado) e as `EstatisticaAtleta`/`Presenca` estão ligadas ao **atleta/jogo/sessão** (não ao estado da participação), o filtro por `ATIVO` esvaziava o conjunto de escalões, falhava o gate `podeLerAlgumEscalao([])` e escondia dados que continuavam a existir. **Correção (só leitura — sem alteração de schema, migração, dados de negócio ou auth):** as três queries passam a carregar **todas** as participações da época (`where: { epocaId }`, **sem** `estado`), restaurando o histórico de quem já saiu do escalão; variáveis `escaloesAtivos`→`escaloesParticipados` para refletir a semântica. **Fora de âmbito (inalterado):** `nAtletas` nas vistas de equipa/clube mantém o **plantel atual** (`estado: "ATIVO"` + `atleta.ativo`) como denominador das médias; os rankings ofensivos/assiduidade/disciplina do escalão já incluíam quem saiu (derivam de `EstatisticaAtleta`/`Presenca` por jogo/escalão). Novo teste de regressão em `tests/analise-f9.test.ts` (participação da época carregada sem filtro de estado → histórico preservado). §10.1 alinhada (nova regra **DEVE** de histórico persistente). `npm run typecheck` limpo · **`tests/analise-f9.test.ts` 34/34 verdes** (as 2 falhas em `tests/plano-semanal.test.ts` são **pré-existentes** e dependentes da data corrente, alheias a esta correção). **Não toca em auth.**
- **2026-08-31** — **Editor de campo — novo elemento `Arco` (aro/círculo no chão) (§11.2).** Novo elemento-ponto no sistema de diagramas de exercícios: **arco de agilidade** deitado no chão, visto de cima → **elipse achatada**. **Só apresentação/diagrama — sem alteração de auth, dados de negócio ou Server Actions.** **(1) Schema (`lib/schemas/exercicio.ts`):** novo `corArcoSchema` (enum `"amarelo" | "vermelho" | "azul" | "verde" | "laranja" | "branco"`) e `arcoSchema` (`{ tipo: "arco"; x; y; cor? }`), acrescentado ao `elementoCampoSchema`; campo `cor` **opcional** — ausente → **amarelo** (default/retrocompatível). Novos tipos exportados `CorArco`, `Arco`. **(2) Render (`components/campo/desenho.tsx`):** paleta partilhada `ARCO_CORES` (hex + contorno escuro por cor) e `ARCO_COR_DEFAULT`; `ElementoSVG` desenha o arco como elipse `rx≈9`/`ry≈5` com contorno escuro por baixo para contraste (essencial para o arco branco sobre relvado). Como todos os componentes de campo renderizam via `ElementoSVG`, o arco propaga a toda a app (editor, miniatura, animação). **(3) Editor (`components/campo/EditorCampo.tsx`):** nova ferramenta **Arco** na toolbar (miniatura SVG inline `IconeArco`, alvo ≥44px) com seletor de cor (alvos ≥44px, `aria-pressed`/`title`) que define a cor do próximo arco; no modo **Selecionar**, um arco já colocado pode ser **recolorido** (com registo no histórico/undo). Suporta seleção, arrasto, teclado e animação (passos) como qualquer elemento-ponto. **(4) Acessibilidade (`components/campo/animacao.ts`):** `rotuloElemento` inclui o arco no `aria-label` (ex.: «Arco (azul)»). O snapshot de exercícios (`lib/snapshot-exercicio.ts`) trata o diagrama como JSON opaco (sem filtragem por tipo), pelo que não requer alteração. §11.2 atualizada. Novos testes em `tests/schemas.test.ts` (arco sem cor → default; seis cores válidas; cor inválida rejeitada; coordenadas fora do campo). UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. `npm run typecheck` limpo. **Não toca em auth.**
- **2026-08-31** — **Analíticos — rácios por jogo e tendência de forma no painel do atleta (M1/M3), análise por período no painel de escalão (M6) e linha de referência no `GraficoLinhas` (§10.2, §10.4, §12.5).** Quatro melhorias de leitura analítica sobre dados já existentes. **Só apresentação + cálculo client-side / agregação leve — sem alteração de schema, migração, dados de negócio ou auth.** **(M1) Rácios por jogo no painel do atleta (`components/analiticos/PainelAtleta.tsx`):** cálculo client-side, sobre o agregado já recebido, de **golos/jogo** (`totalGolos / jogosUtilizados`), **golos/convocatória** (`totalGolos / jogosConvocado`) e **defesas/jogo** (só GR: `totalDefesas / jogosUtilizados`), apresentados junto às estatísticas agregadas existentes (2 casas decimais; «—» quando o denominador é 0). **(M3) Tendência de forma no painel do atleta:** indicador aplicado à métrica **golos** e **só para jogadores de campo**, comparando a média dos **últimos 5 jogos utilizados** (mínimo 3) com a **média de golos da época**; ícone **TrendingUp** (recente > média +0.1), **Minus** (estável, ±0.1) ou **TrendingDown** (recente < média −0.1); o gráfico de golos por jogo passa a mostrar a média da época como linha de referência. **(M6) Análise por período no painel de escalão (`components/analiticos/PainelEscalao.tsx`):** nova secção **«Análise por período»** (1ª vs 2ª parte), alimentada pelo campo `eventosPorParte` de `AnaliticoEscalao`; colunas **Golos · Assistências · Faltas · Remates · Cantos** (Remates/Cantos só futebol; cada coluna só surge com ≥1 registo); a secção **só aparece quando há registos ao vivo com eventos na 2ª parte** (snapshots antigos sem o campo ficam ocultos por default). **(GraficoLinhas) Linha de referência (`components/graficos/GraficoLinhas.tsx`):** nova prop **opcional** `mediaReferencia?: number` — quando presente e válida (`>0` e `≤` ao máximo do eixo Y), desenha uma **linha horizontal tracejada** com rótulo «média {valor}»; ausente/fora de escala rende como antes (retrocompatível). §10.2, §10.4 e §12.5 alinhadas. **Não toca em auth.**
- **2026-08-31** — **Analíticos — UI da comparação directa entre atletas (M4) e da evolução multi-época (M5) no painel do atleta (§10.1).** Implementação da **camada de UI** sobre as Server Actions `obterResumoAtletaParaComparacao` (M4) e `obterEvolucaoMultiEpoca` (M5), já existentes (changelog 2026-08-31 «novas Server Actions de agregação»). **Só apresentação + leitura server-side aditiva — sem alteração de schema, migração, Server Actions, dados de negócio ou auth.** **(1) `components/analiticos/PainelAtleta.tsx`:** duas props **opcionais** novas — `atletasEscalao?: {id, nome}[]` e `evolucaoEpocas?: EpocaResumoAtleta[]` (sem elas o painel funciona como antes, zero regressão). **(M4)** dentro do contexto de um escalão (quando `escalaoContexto` existe **e** `atletasEscalao.length > 0`), nova secção «Comparação directa» com um `Select` (Radix, `components/ui/select`) «Comparar com…» dos colegas; ao escolher, chama `obterResumoAtletaParaComparacao(colegaId, escalaoContexto.id, epoca.id)` client-side (estado `useState` + loading) e mostra tabela lado-a-lado (Golos · Jogos · Presenças · Golos/jogo) atual vs. colega, com botão «Limpar»; coexiste com a «Comparação com a média da equipa». **(M5)** nova `SecaoAnalitico` «Evolução por época» no fim do painel, **só com ≥2 épocas**: tabela por época (Época · Escalão · Golos · Jogos · Presenças % · Habilidades desbloqueadas/total), ordenada da mais antiga para a mais recente (ordem da action, `dataInicio` ASC), com a **época atual destacada** (fundo `primary/5` + rótulo «Atual»). **(2) `app/(app)/plantel/[id]/page.tsx`:** no `Promise.all` server-side, nova query `prisma.atletaEscalao.findMany` dos colegas do mesmo `escalaoContextoId`/`epocaId` com `estado: "ATIVO"` (o modelo usa `estado`, não `ativo`), ordenada por nome, excluindo o próprio atleta em memória; e `obterEvolucaoMultiEpoca(id)`. Ambos passados ao `PainelAtleta`. §10.1 alinhada. `npm run typecheck` limpo · `npm run lint` limpo · **1415 testes verdes**. **Não toca em auth.**
- **2026-08-31** — **Analíticos — UI das vistas de gestão do Diretor Técnico e Presidente (§10.10, §10.1–§10.3).** Implementação da **camada de UI** sobre as Server Actions DT1/DT2/DT3 (já existentes — changelog 2026-08-31 «novas Server Actions de agregação»). **Só apresentação — sem alteração de schema, migração, Server Actions, dados de negócio ou auth.** **(1) `PainelEquipaTecnica` (`components/analiticos/PainelEquipaTecnica.tsx`):** server component que chama `obterAnaliticoEquipaTecnica()` e renderiza a tabela de produtividade dos treinadores (Nome · Perfil · Escalões · Sessões · Jogos · Presenças · Taxa de presença média %), estilo "clean/global" consistente com `PainelClube` (`pct` de `Cartao`); estado vazio via `EstadoVazio` quando não há treinadores com escalões atribuídos. **(2) `WidgetAtividadeEquipa` (`components/dashboard/WidgetAtividadeEquipa.tsx`):** server component que chama `obterFeedAtividadeEquipa()` e mostra o feed cronológico dos últimos 3 dias com ícone por tipo (Calendar/Trophy/Users/MessageSquare), autor, detalhe, escalão e **tempo relativo** pt-PT ("agora"/"há Xmin"/"há Xh"/"ontem às HH:MM"/"dd mmm às HH:MM") — helper puro `tempoRelativo`; cada item liga ao `href`; "Sem atividade recente" quando vazio; devolve `null` em falha de permissão (não polui o dashboard). **(3) `TabelaEvolucaoEpocas` (`components/analiticos/TabelaEvolucaoEpocas.tsx`):** presentacional puro que recebe `LinhaEvolucaoEpoca[]` e renderiza a tabela por época (Atletas · Escalões · Jogos · Sessões · Presença média %) com a **época ativa destacada** (fundo `primary/5` + rótulo "Ativa"). **(4) `app/(app)/analiticos/page.tsx`:** obtém `obterMembroAtual()`; secção **"Equipa técnica"** (`<PainelEquipaTecnica />`) só para **âmbito TODO_CLUBE**; secção **"Evolução do clube"** (`<TabelaEvolucaoEpocas />` via `obterEvolucaoMultiepocaClube()`) para quem tem `RELATORIOS_VER` e **só com ≥2 épocas**. **(5) `app/(app)/dashboard/page.tsx`:** novo `derivarPapelDashboard(ctx)` → `DT_ADMIN`/`PRESIDENTE`/`TREINADOR`; **DT/Admin** ganha `<WidgetAtividadeEquipa />` e mantém as ações rápidas; o **Presidente** troca as ações rápidas de escrita por **KPIs de clube** (atletas, jogos, golos marcados, presença média — via `obterAnaliticoClubeEpoca`) + mini `<TabelaEvolucaoEpocas />` (últimas 3 épocas); o **Treinador** mantém o comportamento clássico do MVP **inalterado**. UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. §10.10 nova. `npm run typecheck` limpo · **1415 testes verdes**. **Não toca em auth.**
- **2026-08-31** — **Exercícios — nº de jogadores e espaço no exercício, override e snapshot por sessão, e enriquecimento do plano de treino imprimível (§3.3, §3.5, §4.2.1, §8.6, §8.8.2).** O modelo do exercício e a adaptação por sessão passam a captar **nº de jogadores** e **espaço**, e o plano de treino imprimível passa a mostrar nomenclatura técnica federativa e presenças no cabeçalho. **(1) `Exercicio` (§3.3):** dois campos novos, opcionais, texto livre — `numeroJogadores` (ex.: "4+GR", "3x3+GR", "Todos", "8") e `espaco` (ex.: "campo inteiro", "meio-campo", "20x20m"). **(2) `SessaoExercicio` (§3.5):** override por sessão `numeroJogadoresOverride`/`espacoOverride` (semeados a partir do valor base do exercício quando este é adicionado à sessão) e snapshot histórico `snapNumeroJogadores`/`snapEspaco` (mecanismo §4.2.1, que passa a congelar também nº de jogadores e espaço). **(3) Formulários:** `ExercicioForm` (§8.6) ganha os campos "Nº de jogadores" e "Espaço" na secção de detalhes; `AdaptarExercicioDialog` (§8.8.2) ganha os mesmos campos como override, **pré-preenchidos com o valor base**, validados por `sessaoExercicioOverrideSchema` (`numeroJogadoresOverride`/`espacoOverride`). **(4) Plano de treino imprimível (§8.8.2):** o cabeçalho do print passa a mostrar (quando disponíveis) **Microciclo** (UI: "Semana"), **Mesociclo**, **Período** e **Momento** (MD-X) — nomenclatura técnica federativa — e o **nº de presentes/registados** na sessão; cada exercício passa a mostrar (quando não nulos) o **nº de jogadores** e o **espaço** como badges. §3.3, §3.5, §4.2.1, §8.6 e §8.8.2 alinhadas.
- **2026-08-31** — **Analíticos — novas Server Actions de agregação (comparação de atletas, evolução multi-época, período por parte, painel do Diretor Técnico) (§10.1, §10.2, §10.3).** Camada de dados server-side para novas vistas analíticas. **Só agregação/leitura server-side + um parâmetro opcional aditivo — sem alteração de schema, migração, dados de negócio ou auth.** **(M4) `obterResumoAtletaParaComparacao(atletaId, escalaoId, epocaId)` (`lib/actions/analise.ts`):** versão leve de `obterAnaliticoAtleta` para comparar atletas do mesmo escalão/época — devolve `{ nome, posicoes, eGR, agregado }` reutilizando **exactamente** o mesmo padrão de queries do agregado individual (convocatórias, estatísticas, sessões `NORMAL` desde o ingresso e presenças; denominador = sessões executadas `data < agora`), pelo que os números batem por construção com o painel do atleta. Auth + multi-tenant pelo clube (sem exigir `RELATORIOS_VER` — é leitura de atleta do clube). **(M5) `obterEvolucaoMultiEpoca(atletaId)` + `obterCadernetaAtleta` ganha `epocaId?` opcional:** nova interface `EpocaResumoAtleta` (golos, assistências, jogos utilizados/convocado, taxa de presença e habilidades desbloqueadas/total por época); estratégia **batch anti-N+1** (1 query pelas participações — fonte das épocas — + `Promise.all` de estatísticas/convocatórias/presenças/progressos planas, agregadas em memória por época e ordenadas por `dataInicio` ASC). `obterCadernetaAtleta(atletaId, epocaId?)` passa a aceitar a época em contexto (validada contra o clube); omitida = época ativa (não-breaking). **(M6) Análise por período em `obterAnaliticoEscalao`:** a query `eventoJogo.findMany` passa a incluir `parte` no `select`; nova interface `EventosPorParte` (`parte1`/`parte2`, mapas parciais por `TipoEventoJogo`) e novo campo `eventosPorParte` em `AnaliticoEscalao`, acumulado no mesmo laço dos eventos por tipo (default `{ parte1: {}, parte2: {} }` para snapshots antigos). **(DT1) `obterAnaliticoEquipaTecnica(epocaId?)`:** produtividade dos treinadores (sessões/jogos criados, presenças marcadas e assiduidade média dos escalões atribuídos); guard `RELATORIOS_VER` + âmbito `TODO_CLUBE` (só DT/Admin); 5 queries paralelas (membros ativos + `groupBy` de sessões/jogos por `criadorId`, presenças por `marcadoPorId`, e reutilização de `obterAnaliticoClubeEpoca` para a taxa por escalão — sem duplicar lógica); só inclui membros com escalões atribuídos. **(DT2) `obterFeedAtividadeEquipa(horas?)`:** feed cronológico unificado (`SESSAO_CRIADA`/`JOGO_CRIADO`/`PRESENCAS_MARCADAS`/`REUNIAO_CRIADA`) numa janela `horas ?? 72` dentro da época ativa; guard `RELATORIOS_VER` + `TODO_CLUBE`; presenças (sem `criadoEm`) usam `sessao.data` na janela com `distinct` por `(marcadoPorId, sessaoId)` + dedup em memória; array plano ordenado por `quando` DESC. **(DT3) `obterEvolucaoMultiepocaClube()`:** uma linha por época (atletas, escalões, jogos, sessões fechadas, taxa de presença média); guard `RELATORIOS_VER` (Presidente também vê); estratégia batch (`findMany` de épocas + `groupBy` de participações/jogos/sessões + `Promise.all` de contagens de presença por época, com `Math.min(taxa, 1)`). §10.1/§10.2/§10.3 alinhadas. `npm run typecheck` limpo · `npm run lint` limpo · **1415 testes verdes**. **Não toca em auth.**
- **2026-08-31** — **Analíticos — rendimento casa/fora no painel de escalão (§10.2).** O painel de analíticos do escalão passa a expor o **rendimento por local do jogo** (casa vs fora), colmatando uma lacuna: o campo `Jogo.casaFora` existia mas não era lido nem agregado nos analíticos. **Só camada de agregação server-side + apresentação — sem alteração de schema, migração, dados de negócio ou auth.** **(1) `lib/actions/analise.ts`:** a query de jogos de `obterAnaliticoEscalao` passa a incluir `casaFora` no `select`; a interface `ResultadoJogoResumo` ganha `casaFora: CasaFora | null` (propagado a cada resultado jogo-a-jogo); nova interface `RecordCasaFora` (`vitorias`/`empates`/`derrotas`/`jogos`) e novos campos `recordCasa`/`recordFora` no retorno de `AnaliticoEscalao`, calculados no mesmo laço que já produz o V/E/D global — **só jogos com resultado** entram no balanço (jogos agendados/sem golos são ignorados), e como `casaFora` é obrigatório em BD (`@default(CASA)`), "FORA" separa os jogos fora e tudo o resto entra no balanço de casa. **(2) `components/analiticos/PainelEscalao.tsx`:** nova secção **«Rendimento casa/fora»** com mini-cards V-E-D para Casa e Fora, cada card só aparecendo quando há ≥1 jogo com resultado nesse local (sem cards vazios); cada linha da secção «Resultados» ganha uma **etiqueta Casa/Fora** junto ao adversário (Casa na cor do clube via `primary`; Fora em neutro). Snapshots de relatórios antigos (sem os campos) usam defaults (`{0,0,0,0}` / etiqueta omitida) — zero regressão na vista pública. **Nota:** o enum `CasaFora` do schema tem apenas `CASA` e `FORA` (não existe `NEUTRO`), pelo que não há balanço/card «Neutro». Novo teste em `tests/analise-f9.test.ts` (balanço V/E/D separado por local + jogo agendado ignorado + `casaFora` no select e nos resultados). `npm run typecheck` limpo · `npm run lint` limpo · **1415 testes verdes**. **Não toca em auth.**
- **2026-08-30** — **Sincronização eventos ao vivo → estatísticas + placar (§10.4).** O registo ao vivo (`EventoJogo`) passa a alimentar de forma coerente o resultado do jogo e as linhas de estatísticas, fechando a desconexão entre as três fontes (eventos, `Jogo.golosMarcados/Sofridos` e `EstatisticaAtleta`). **Só derivação/agregação server-side — sem alteração de schema, migração, dados de negócio ou auth.** **(1)** Novo módulo puro `lib/eventos-para-estatisticas.ts` — `derivarEstatisticasDeEventos(eventos, convocados, eFutebol, formato)` devolve `{ estatisticas: Map<atletaId, EstatisticaInput>, golosMarcados, golosSofridos }`: cada convocado começa `NAO_UTILIZADO`/zeros (`TITULAR` se `titularPrevisto`); `GOLO`/`GOLO_SOFRIDO` contam sempre para o placar e, com `atletaId`, para o atleta (`golos`/`golosSofridosGR`); `ASSISTENCIA`/`FALTA`/`CARTAO_AMARELO`/`CARTAO_VERMELHO`/`DEFESA` incrementam o campo do atleta; o núcleo de futebol (`REMATE`/`CANTO`/`FORA_DE_JOGO`/`DESARME`) só conta com `eFutebol=true` (em futsal fica `null`); `SUBSTITUICAO` marca o atleta que entra como `UTILIZADO` (sem despromover um titular) e regista o `bloco`; `minutos` derivam de `blocoTempo` via `blocoParaMinutos` (§10.1/§10.8). **(2) `lib/actions/jogos.ts`:** novo helper privado `recalcularResultadoJogo(tx, jogoId)` (conta `GOLO`/`GOLO_SOFRIDO` e atualiza `Jogo.golosMarcados/Sofridos`); `registarEventoJogo` e `removerEventoJogo` passam a correr em `$transaction` e, quando o evento é `GOLO`/`GOLO_SOFRIDO`, recalculam o placar na mesma transação; nova action pública `previewEstatisticasDeEventos(jogoId)` (auth + multi-tenant + `ESTATISTICAS_GERIR`) devolve as estatísticas derivadas **sem persistir**, para revisão antes de guardar. **(3)** Novo `tests/eventos-para-estatisticas.test.ts` (11) cobre golo com/sem atleta, golo sofrido, cartão, substituição (UTILIZADO + bloco + minutos), titular sem eventos, não-utilizado, remate em futsal (ignorado) e futebol, e agregação combinada; mocks de `jogos.test.ts`/`jogos-f5-actions.test.ts` estendidos com `eventoJogo.count`/`jogo.update`. `npm run typecheck` limpo · **1414 testes verdes**. **Não toca em auth.**
- **2026-08-30** — **Correções — dashboard filtra por escalões legíveis, registo ao vivo de futebol, minutos por blocos no relatório e gating de criação (§6.4/§6.5, §8.16, §10.1, §10.8).** Quatro correções de alinhamento entre a bíblia e a implementação no frontend. **Só apresentação/agregação/derivação server-side e client-side — sem alteração de schema, migração, dados de negócio ou auth.** **(1) Dashboard restrito aos escalões legíveis (§6.4/§6.5/§8.16):** `app/(app)/dashboard/page.tsx` mostrava próximo treino/jogo, contadores (atletas, sessões, jogos), eventos de hoje e o quadro «Atletas por escalão» de **todo o clube** (só filtrava por `clubeId`), pelo que um treinador de âmbito próprio via dados de escalões alheios. Passa a filtrar por `escaloesLegiveis()` — âmbito **TODO_CLUBE** (admin/DT) → sem filtro (vê tudo); caso contrário aplica `escalaoId ∈ legíveis` às queries de sessão/jogo e à `participacoes.some` da contagem de atletas, e `id ∈ legíveis` à listagem de escalões. Lista vazia (treinador sem escalões atribuídos) → nenhum dado de escalão. **(2) Registo ao vivo de futebol (§10.8):** `components/jogos/RegistoAoVivo.tsx` tinha as listas de tipos de evento **fixas para futsal** e nunca oferecia os eventos específicos de futebol. Recebe agora a prop `modalidade: Modalidade` (passada por `JogoDetalhe`) e escolhe entre listas separadas — `RAPIDOS_FUTSAL`/`OUTROS_FUTSAL` (com `TIMEOUT`) e `RAPIDOS_FUTEBOL`/`OUTROS_FUTEBOL` (sem `TIMEOUT`, com `REMATE`, `CANTO`, `FORA_DE_JOGO`, `DESARME`). **(3) Minutos por blocos no relatório do atleta (§10.1):** `app/(app)/plantel/[id]/relatorio/page.tsx` mostrava «—» nos minutos quando o tempo era registado **por blocos** (`totalMinutos` a `null`); passa a consolidar `totalMinutos ?? (tempoJogoAcumulado || "—")` — o registo minuto-a-minuto tem prioridade, cai no tempo derivado dos blocos, e só mostra «—» quando nenhuma forma foi registada. **(4) Gating de criação por capacidade (§6):** os botões «Novo atleta» (`app/(app)/plantel/page.tsx`) e «Novo jogo» (`app/(app)/jogos/page.tsx`), no cabeçalho e nos estados vazios, passam a exigir `PLANTEL_GERIR`/`JOGOS_GERIR` respetivamente (via `obterMembroAtual().capacidades`). **Encapsulamento:** os formulários de criação (treinos, plantel, jogos, reuniões, relatórios) passam a usar `listarEscaloesLegiveis()` em vez de `listarEscaloes()`, para não oferecer escalões fora do âmbito do membro (TODO_CLUBE continua a ver todos). `npm run typecheck` limpo · **1414 testes verdes**. **Não toca em auth.**
- **2026-08-30** — **Correção — quadro tático do plano de jogo: titulares sem posição passam a aparecer no campo (posições padrão) (§11.5).** No quadro tático do plano de dia de jogo (`components/jogos/PlanoTatico.tsx` → `QuadroTaticoJogo`), um titular **sem posição prevista** (`posicaoPrevista = null`) **não** era desenhado no campo — a construção do diagrama filtrava apenas os titulares cuja posição batia numa linha de formação, e os restantes ficavam listados abaixo do campo em chips «Sem posição». Resultado observado: com 5/5 titulares selecionados mas só 3 posicionados (ex.: Fixo, Guarda-redes, Pivô), o campo mostrava **3 tokens** e os 2 sem posição ficavam de fora. **Comportamento corrigido:** **todos** os titulares aparecem no campo; os que não têm posição são colocados em **posições padrão livres** da formação da modalidade/formato (mesma lógica que alimenta o botão «Repor formação»), e a lista/label «Sem posição» deixa de existir (era, a partir de agora, código morto). **Só apresentação/derivação client-side — sem alteração de schema, migração, dados de negócio ou auth.** **(1)** Nova lógica **pura e testável** extraída para `lib/formacao.ts` — `construirDiagramaFormacao(titulares, modalidade, formato)` (constrói o diagrama v2 com todos os titulares, semeando posições padrão a quem não as tem, via um *pool* da formação que remove primeiro as posições já ocupadas para preencher os lugares livres — ex.: 2 alas em falta no futsal), `formacaoPadrao(modalidade, formato)` (formação canónica ordenada por `FormatoJogo`, dimensão = jogadores em campo) e `linhasFormacao(modalidade)` (linhas GR/Defesa/Meio/Avançado no espaço 400×200). As linhas de formação e o `distribuirY` migraram de `PlanoTatico.tsx` para este módulo (sem alterar coordenadas — zero-regressão para titulares já posicionados). **(2)** `PlanoTatico.tsx` passa a delegar em `construirDiagramaFormacao` e remove o bloco «Sem posição» (chips) e a derivação inline do diagrama. Novo `tests/formacao.test.ts` (8) cobre: cenário do screenshot (3 posicionados + 2 sem posição → 5 no campo, os 2 preenchem os alas), titulares posicionados mantêm a linha, todos sem posição → formação padrão completa, mais titulares que lugares (posição de recurso), preservação do nº de camisola e futebol 11. `npm run typecheck` limpo · `npm run lint` limpo · **1403 testes verdes**. **Não toca em auth.**
- **2026-08-30** — **Correção de regressão — "sessão realizada" volta a `data < agora` (revoga a decisão `fechado = true` do mesmo dia) (§10.1, §10.2, §10.3).** A alteração anterior (que definiu **realizada/executada = `fechado = true`**) provocou uma **regressão crítica**: como o campo `Sessao.fechado`/`Jogo.fechado` tem `@default(false)` e **nenhuma** sessão/jogo tinha ainda sido fechada, todas as contagens de **sessões executadas** colapsaram para **0** (KPI «sessões realizadas» mostrava `0/89` em vez de, p.ex., `67/89`) e a assiduidade caiu a zero em todos os painéis (atleta, escalão, clube) e no perfil do atleta. Revertido o critério para **`data < agora`** (uma sessão está realizada quando a sua data já passou, independentemente de o treinador a ter fechado). **Só camada de agregação server-side — sem alteração de schema, migração, dados de negócio ou auth.** **(1) `lib/actions/analise.ts`:** `obterAnaliticoAtleta`, `calcularComparacaoEquipa`, `obterAnaliticoEscalao` e `obterAnaliticoClubeEpoca` voltam a calcular `sessoesExecutadas` e os denominadores de assiduidade por `data < agora` (removido o filtro `fechado: true` do denominador e do numerador de presenças). **(2) `lib/actions/atletas.ts` — `obterEstatisticasAtleta`:** numerador/denominador da assiduidade voltam a não filtrar por `fechado`. O **campo `fechado` mantém-se** como funcionalidade autónoma (fechar/reabrir sessão/jogo, badge de estado, filtro «Por fechar/Fechados» nas listagens) — apenas **deixa de condicionar** o que conta como realizado nos analíticos. As melhorias independentes do mesmo commit mantêm-se: ranking de assiduidade completo (sem top-5) e recálculo client-side do `PainelClube` a usar `sessoesExecutadas`. Testes de `analise-f9`/`export-csv` repostos para a semântica por data. `npm run typecheck` limpo · **testes verdes**. **Não toca em auth.**
- **2026-08-30** — **Analíticos — ranking de assiduidade do escalão mostra TODOS os atletas (não só o top 5) (§10.2).** O painel de analíticos do escalão (secção «Utilização e assiduidade») limitava o **ranking de assiduidade** aos **primeiros 5** atletas por taxa de presença (`.slice(0, 5)` em `obterAnaliticoEscalao`, `lib/actions/analise.ts`). Removido o corte: a lista passa a incluir **todos** os atletas com presenças registadas, ordenados por taxa (desc.), depois por nº de presenças e nome. **Só camada de agregação server-side — sem alteração de schema, migração, dados de negócio ou auth.** O componente presentacional `components/analiticos/RankingAssiduidade.tsx` já renderizava a lista completa recebida (sem corte próprio), pelo que só o servidor limitava; o export PDF (`components/pdf/PdfEstatisticaIndividual.ts`, que itera `rankingAssiduidade`) passa também a incluir todos os atletas por construção. Docstrings e comentários «Top 5» atualizados para «lista completa» (interface `RankingAssiduidade`, campo `AnaliticoEscalao.rankingAssiduidade`, cabeçalho do componente). O `PainelClube` mostra assiduidade por escalão (coluna «Presença») para todos os escalões — já sem limite N. Novo teste de regressão em `tests/analise-f9.test.ts` (8 atletas com presenças → os 8 aparecem no ranking). `npm run typecheck` limpo · `npm run lint` limpo · **1395 testes verdes**. **Não toca em auth.**
- **2026-08-30** — **Assiduidade — "sessão realizada" passa a `fechado = true` (não `data < agora`) (§10.1, §10.2, §10.3).** Decisão de produto confirmada: uma sessão só conta como **realizada/executada** quando o treinador a **fecha** (`Sessao.fechado = true`), e não pelo simples facto de a data já ter passado. Corrige uma **assimetria** no cálculo da assiduidade: o denominador (sessões executadas) usava `data < agora` mas o numerador (presenças) não filtrava por data, pelo que sessões futuras/por fechar com presenças marcadas inflavam a taxa até mostrar **100%** indevidamente. **Só camada de agregação server-side — sem alteração de schema (o campo `fechado` já existe), migração, dados de negócio ou auth.** **(1) `lib/actions/analise.ts`:** `obterAnaliticoEscalao` (denominador `sessoesExecutadas` = `sessoes.filter(s => s.fechado)`; numerador de presenças ganha `sessao: { fechado: true }`), `obterAnaliticoAtleta` (idem — `sessoes` traz `fechado`, presenças filtram `sessao.fechado`, `sessoesExecutadas` por `fechado`), `calcularComparacaoEquipa` (contagem de sessões `NORMAL` e de presenças passam a `fechado: true`) e `obterAnaliticoClubeEpoca` (o `groupBy` de executadas e o `groupBy` de presenças passam a `fechado: true`). A grelha mensal de presenças (`montarPresencasMensais`) e a distribuição de tipos de treino mantêm-se inalteradas. **(2) `lib/actions/atletas.ts` — `obterEstatisticasAtleta`:** numerador e denominador da assiduidade ganham `fechado: true`, em simetria com o painel analítico. **(3) `components/analiticos/PainelClube.tsx`:** o recálculo client-side com filtro de modalidade passa a usar `r.sessoesExecutadas` (que agora = fechadas) no denominador dos slots (`?? r.sessoes` como fallback para snapshots antigos). **Resultado:** sessão com data passada mas por fechar não entra em nenhum dos lados; sessão fechada entra em ambos (sem assimetria); sessão futura nunca entra; as estatísticas só surgem quando o treinador fecha efetivamente a sessão. §10.1/§10.2/§10.3 alinhadas. **Não toca em auth.**
- **2026-08-30** — **Treinos e Jogos — estado aberto/fechado (fechar/reabrir) (§8.8, §9).** Uma sessão de treino e um jogo passam a ter um **estado de fecho** (`Sessao.fechado`/`Jogo.fechado`, `Boolean @default(false)` — `false` = aberto/por fechar, `true` = fechado pelo treinador), permitindo ao treinador **finalizar** o registo depois de o realizar (e **reabrir** para voltar a editar — ação **reversível**, sem confirmação). **(1) Server Actions** (`lib/actions/treinos.ts`, `lib/actions/jogos.ts`): `fecharSessao`/`reabrirSessao` e `fecharJogo`/`reabrirJogo` — cada uma reforça clube do utilizador + capacidade (`TREINOS_GERIR`/`JOGOS_GERIR`) no escalão, faz `update` do flag e `revalidatePath` da lista e do detalhe; devolvem `Resultado<void>`. **(2) Filtro por estado nas listagens:** `listarSessoes(escalaoId?, estado?)` e `listarJogos(escalaoId?, modalidade?, estado?)` ganham um parâmetro opcional `estado: "aberto" | "fechado"` que aplica `where: { fechado }` (server-side, alinhado com os filtros de escalão/modalidade já existentes). **(3) UI:** novos botões cliente `components/treinos/FecharSessaoButton.tsx` e `components/jogos/FecharJogoButton.tsx` (`useTransition`, `toast`, `router.refresh()`; ícones `Lock`/`LockOpen`) no cabeçalho do detalhe — só visíveis quando a sessão/jogo **já se realizou** (`treinoConcluido(data)` / `data < agora`). As listagens de `/treinos` (vista de lista) e `/jogos` ganham um **badge de estado** para itens já realizados — «Por fechar» (âmbar, `CircleAlert`) quando `!fechado`, «Fechado» (verde, `CheckCircle2`) quando `fechado` — e um **filtro** de 3 opções (Todos / Por fechar / Fechados) via query param `estado`, que preserva os restantes filtros (escalão/modalidade). UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. `npm run typecheck` limpo · `npm run lint` limpo. **Não toca em auth.**
- **2026-08-27** — **Correção — biblioteca de exercícios: pessoais de colegas com escalão partilhado não apareciam (visibilidade por âmbito TODO_CLUBE/SECCAO) (§3.3, §4.2, §6.3/§6.5/§6.9).** O filtro de visibilidade da biblioteca de exercícios (`lib/biblioteca.ts`, `filtroExerciciosVisiveis`) devolvia **vazio** para a alternativa «🎒 pessoais de colegas que partilham um escalão com o utilizador», mesmo com dados válidos (ex.: Diretor Técnico de âmbito **TODO_CLUBE** cujos exercícios pessoais não eram vistos por um treinador do escalão, e vice-versa). **Causa raiz:** a cláusula era um **subquery correlacionado profundo** (`exercicio → autor → membros → clube → escaloes → cobertura do utilizador`, com back-references e vários `some` encadeados); a condição, para autores TODO_CLUBE, é **constante por (clube, utilizador)** — não depende da linha do exercício —, e o Prisma **não traduzia** esse aninhamento em SQL correto (o SQL cru equivalente encontrava as linhas; o filtro declarativo do Prisma não). **Correção (só camada de dados server-side — sem alteração de schema, migração, dados de negócio ou auth):** a alternativa passa a ser **pré-computada** em SQL simples e aplicada como `autorId in (…)`. Dois helpers novos exportados em `lib/biblioteca.ts`: **`escaloesCobertosPorUtilizador(clubeId, utilizadorId)`** — resolve os escalões cobertos ciente do âmbito (PROPRIOS_ESCALOES → atribuições explícitas; TODO_CLUBE → todos os escalões do clube; SECCAO → escalões das secções coordenadas) — e **`autoresComEscalaoPartilhado(clubeId, utilizadorId)`** — devolve os `autorId` de treinadores que cobrem, no clube ativo, ≥1 escalão em comum. `filtroExerciciosVisiveis` passa a **assíncrona** e compõe: (1) `autorId = utilizador` (pessoais próprios, portáteis); (2) `autorId in (autores partilhados)` (pessoais de colegas); (3)/(4) 🏛️ do clube (incl. linhas legadas `clubeProprietarioId = null`); (5) `partilhasClube`. Semântica documentada **inalterada** — só a implementação passa a funcionar. Call-sites atualizados para `await` (`lib/actions/exercicios.ts` ×6: listar/obter/atualizar/apagar/duplicar/partilhar; `lib/actions/templatesSessao.ts` ×1). Testes: `tests/biblioteca-visibilidade.test.ts` reescrito (helpers testados com mocks de Prisma + mini-interpretador dos operadores simples do filtro final) e `tests/templates-sessao.test.ts` alinhado à nova forma. `npm run typecheck` limpo · `npm run lint` limpo · `next build` compila com sucesso · **1394 testes verdes**. **Não toca em auth.**
- **2026-08-27** — **Correção — auto-play da animação no Modo treino reiniciava a cada segundo (parecia estático) (§8.8.2, §11.2).** O auto-play dos exercícios no **Modo treino** (`components/treinos/ModoTreino.tsx`) arrancava mas ficava **aparentemente estático**: o cronómetro da sessão (`setSegundos` a cada 1 s) **re-renderiza** o `ModoTreino` inteiro; o `DiagramaGrande` não tinha barreira de re-render, pelo que cada tick propagava para o `CampoAnimado` e — quando o `diagrama` (JSON do Prisma) chega como **nova referência de objeto** por render — o `useMemo([diagrama])` recomputava os `keyframes`, disparando o `useEffect([aPlay, keyframes])` que **reiniciava** o loop de `requestAnimationFrame` do frame base. Resultado: a animação começava e era reposta ~1 s depois, em ciclo, dando a impressão de imagem fixa. O `useMemo` interno adicionado na correção anterior (2026-08-26) era insuficiente porque a sua própria dependência (`diagrama`) mudava de referência a cada render. **Correção (Opção A — barreira de memoização; só apresentação, sem alteração de schema, dados de negócio, Server Actions ou auth):** `DiagramaGrande` passa a estar envolvido em **`React.memo`** com **comparador por CONTEÚDO** — `anterior.nome === seguinte.nome && JSON.stringify(anterior.diagrama) === JSON.stringify(seguinte.diagrama)`. Assim, o tick do cronómetro (que só muda `segundos`) **não atravessa** a barreira: `DiagramaGrande` (e todo o subárvore `CampoAnimado`) só re-renderiza quando o **exercício muda de facto** (novo `nome`/`diagrama` por conteúdo), mantendo os `keyframes` referencialmente estáveis e a animação a correr em ciclo sem reset. Ao navegar entre exercícios (`Próximo`/`Anterior`), o conteúdo do diagrama difere → re-render → nova animação, como esperado. O `useMemo` interno do parse mantém-se (memoiza o `safeParse` enquanto o componente não re-renderiza). Comportamento das vistas de arranque manual (detalhe do exercício §8.11, modelo/plano de jogo §8.10 — `autoPlay=false`) inalterado. §8.8.2 e §11.2 alinhadas. `npm run typecheck` limpo · **testes verdes**. **Não toca em auth.**
- **2026-08-27** — **Treinos — impressão do plano de treino: logótipo do clube, página em branco, rodapé cortado e aviso de cabeçalhos do browser (§8.8.2).** Quatro correcções ao template de impressão/PDF do plano de treino (`app/treinos/[id]/print/page.tsx`, `components/treinos/TreinoPrintTemplate.tsx`). **Só apresentação/impressão — sem alteração de schema, dados de negócio, Server Actions ou auth.** **(1) Logótipo do clube no cabeçalho:** o cabeçalho mostrava apenas o logótipo **Mister** + nome do clube em texto; passa a mostrar também o **emblema do clube** (`Clube.logoUrl`, já disponível no payload de `obterMembroAtual`) à direita, ao lado do nome/época (`<img className="h-10 w-10 object-contain">`), com o atributo `data-print-logo` para ficar garantidamente **visível em `@media print`** (regra existente em `globals.css`). O tipo `DadosImpressaoTreino` ganha o campo `clubeLogoUrl: string | null`, passado pela `page.tsx` (`membro?.clube.logoUrl ?? null`). **(2) Página em branco / footer isolado eliminados:** removido o `min-h-screen` do *wrapper* da rota de impressão (passa a `block` simples, sem distribuição vertical de espaço) que empurrava o rodapé para o fundo de uma página longa/vazia; o `<footer>` mantém-se no fluxo normal do documento (sem `fixed`/`sticky`/`mt-auto`) e os cartões de exercício mantêm `break-inside-avoid`. **(3) Rodapé cortado à direita corrigido:** o `<footer>` ganha `gap-4`, o nome do clube (esquerda) passa a `min-w-0 truncate` e o texto «Impresso em … · Mister» (direita) passa a `flex-shrink-0 text-right` — deixa de ser cortado na borda direita dentro da margem `@page` de 1,5 cm. **(4) Aviso sobre cabeçalhos nativos do browser:** como os cabeçalhos/rodapés nativos do Chrome (URL, data) não são removíveis de forma fiável via CSS, adicionado um **banner só em ecrã** (`print:hidden`, âmbar) a recomendar desativar «Cabeçalhos e rodapés» nas opções de impressão. §8.8.2 alinhada. UI 100% pt-PT, sem dark mode. `npm run typecheck` limpo · `npm run lint` limpo · **1399 testes verdes**. **Não toca em auth.**
- **2026-08-27** — **Jogo → Plano de jogo — quadro tático segue a formação viva + limite de titulares (futsal = 5) (§8.10, §8.11).** Duas regressões e uma feature no separador *Convocatória → Plano de jogo* do detalhe do jogo. **Só apresentação/validação client-side — sem alteração de schema Prisma, Server Actions ou auth.** **(1) Regressão — titulares não apareciam no quadro por defeito:** o `QuadroTaticoJogo` (`components/jogos/QuadroTaticoJogo.tsx`, introduzido em 2026-08-26) **congelava** a formação recebida (`diagramaFormacao`) num `useState` no *mount* e mostrava sempre esse *snapshot* — ao marcar/posicionar titulares **depois** do *mount*, o campo não atualizava (antes do refactor, a formação era desenhada diretamente do valor **vivo** via `<CampoDesenho diagrama={diagrama}>`). **Correção:** o estado gravado passa a ser `DiagramaCampo | null` (`null` = ainda não há quadro gravado); a **base visível** é `gravado ?? diagramaFormacao` — como `diagramaFormacao` é um *prop* recomputado a cada render, o quadro **acompanha a formação viva** enquanto não houver quadro gravado; depois de gravado, mostra o diagrama guardado (independente). **(2) Regressão — «Guardar quadro» partia de um snapshot obsoleto:** o editor abria com o *buffer* congelado no *mount* (podendo estar vazio mesmo com titulares marcados), pelo que a gravação persistia uma formação desatualizada. **Correção:** novo `abrirEditor()` (re)inicializa o *buffer* de edição a partir do estado visível **atual** (`gravado ?? diagramaFormacao`) ao entrar em edição; `cancelar()`/`reporFormacao()` alinhados. **(3) Feature — máximo de titulares = jogadores em campo (futsal = 5):** `PlanoTatico` (`components/jogos/PlanoTatico.tsx`) impede marcar mais titulares do que os lugares em campo do formato do jogo — novo helper puro **`maxTitulares(formato, modalidade)`** + tabela **`JOGADORES_EM_CAMPO: Record<FormatoJogo, number>`** em `lib/estatisticas.ts` (FUTSAL_5=5, FUTEBOL_3_3=3, FUTEBOL_5_5=5, FUTEBOL_7=7, FUTEBOL_9=9, FUTEBOL_11=11; sem formato cai na modalidade — futebol→11, futsal→5). Ao atingir o limite, o botão «Titular» dos restantes convocados fica **desativado** (com `title`) e uma tentativa mostra o *toast* **«Já tens N titulares selecionados»**; o cabeçalho do quadro passa a indicar **`X/N titulares`**. **Ficheiros:** `lib/estatisticas.ts` (+`JOGADORES_EM_CAMPO`, +`maxTitulares`), `lib/modalidade-escalao.ts` (reexporta), `components/jogos/QuadroTaticoJogo.tsx` (base viva + `abrirEditor`), `components/jogos/PlanoTatico.tsx` (limite de titulares + feedback), `tests/estatisticas.test.ts` (+`maxTitulares`/`JOGADORES_EM_CAMPO`). §8.10 e §8.11 alinhadas. UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. `npm run typecheck` limpo · **1399 testes verdes**. **Não toca em auth.**
- **2026-08-27** — **Treinos — correções no template de impressão do plano de treino (§8.8.2).** Seis correções ao fluxo de impressão/PDF do plano de treino (`app/treinos/[id]/print/page.tsx`, `components/treinos/TreinoPrintTemplate.tsx`, `app/globals.css`). **Só apresentação/impressão — sem alteração de schema, dados de negócio, Server Actions ou auth.** **(1) Página em branco no fim eliminada:** o `<footer>` do template ganha `break-inside-avoid` + `break-before: avoid` (nunca força quebra antes) e o *wrapper* da rota recebe `print:min-h-0` (neutraliza o `min-h-screen` que empurrava conteúdo para uma página extra vazia). **(2) Cabeçalhos/rodapés nativos do browser suprimidos:** adicionada regra `@page { margin: 1.5cm }` em `@media print` no `globals.css` — os browsers modernos deixam de imprimir o seu próprio cabeçalho/rodapé (URL, data, nº de página) quando a margem da página é definida via CSS. **(3) Artefactos de texto duplicado dos SVG corrigidos:** nova regra `@media print { svg text { display: none } }` — o browser deixava de extrair os `<text>` dos diagramas como camada de texto do PDF (artefactos tipo «ppiittoo» sobrepostos ao desenho); os rótulos do campo são ilegíveis a esta escala, pelo que são escondidos na impressão. **(4) Capitalização das datas corrigida:** `formatarDataLonga` deixa de depender da classe CSS `capitalize` (que produzia «Quinta-Feira De Agosto») e passa a formatar data + hora separadamente (`toLocaleDateString`/`toLocaleTimeString` `pt-PT`), capitalizando **só a primeira letra** e juntando com «às» → «Quinta-feira, 27 de agosto de 2026 às 18:00»; removidas as classes `capitalize` do título e da data. **(5) Cor da marca nos cabeçalhos preservada na impressão:** os `<h2>` de secção («Resumo da sessão», «Exercícios») ganham `data-brand` e o `globals.css` passa a excluí-los da regra de texto preto (`h1:not([data-brand]), h2:not([data-brand]), h3:not([data-brand]) { color:#141210 !important }`) e a garantir-lhes o laranja Mister `#F0531E` com `print-color-adjust: exact`; adicionado `print-color-adjust: exact` a `html, body` para as cores de acento (badges/números laranja) saírem na impressão. **(6) Dimensão consistente dos diagramas:** o *container* da `MiniaturaCampo` passa a ter dimensões fixas `w-[240px] h-[120px]` (rácio 2:1 do campo 400×200) com a miniatura a preencher (`h-full w-full`), uniformizando o tamanho entre exercícios. **Extra:** o título «Plano de treino» deixa de ser renderizado como «Plano De Treino» (removida a classe `capitalize`). §8.8.2 alinhada. UI 100% pt-PT, sem dark mode. `npx tsc --noEmit` limpo · `npm run lint` limpo · **1396 testes verdes**. **Não toca em auth.**
- **2026-08-27** — **Periodização — `momentoSemana` disponível para todos os tipos de sessão + Mesociclo visível por defeito no formulário de planeamento (§2, §8.9, §8.9.1).** Duas correcções de alinhamento entre a bíblia e a implementação. **Só apresentação/gravação de campos de periodização — sem alteração de schema, dados de negócio ou auth.** **(1) `momentoSemana` (posição do dia na semana, MD-X) deixa de estar restrito a sessões `NORMAL`:** o campo passa a aparecer e a ser gravado para **qualquer tipo de sessão** (`NORMAL`, `ABERTO`, `CAPTACAO`, `EVENTO`). A bíblia nunca impôs esta restrição (`momentoSemana` sempre foi `MomentoSemana?` opcional, distinto de `planeamentoId`, esse sim só válido em `NORMAL`); existia apenas um comentário enganador no código, agora removido — corrige a divergência spec vs implementação. **(2) Mesociclo passa a visível por defeito:** o formulário de planeamento (`components/planeamento/PlaneamentoLista.tsx`) mostra **micro e mesociclo visíveis por defeito**, sem o toggle «Avançado» colapsado; ambos continuam **opcionais**. A bíblia é actualizada em conformidade: o glossário §2 e a §8.9 deixam de descrever o **Mesociclo** como campo «interno/avançado, escondido por defeito» e passam a descrevê-lo como «opcional, visível no formulário de planeamento» (o **Microciclo** mantém-se termo interno — a UI mostra sempre «Semana»). §2, §8.9 e §8.9.1 alinhadas. UI 100% pt-PT, sem dark mode. **Não toca em auth.**
- **2026-08-27** — **Treinos — exportação/impressão em PDF do plano de treino completo (§8.8.2).** Novo fluxo para **levar o treino impresso** (sem tablet): botão **"Exportar PDF"** (`components/treinos/ExportarTreinoPdfBotao.tsx`, ícone `FileDown`) adicionado no cabeçalho do detalhe `/treinos/[id]`, ao lado de "Editar". **Só nova funcionalidade de apresentação — sem alteração de schema, dados de negócio, Server Actions ou auth.** **(1) Rota de impressão** `app/treinos/[id]/print/page.tsx` — *server component* **fora do grupo `(app)`** (herda só o root layout: fontes + `globals.css`; **sem sidebar/barra de topo**). Verifica a sessão via `auth()` (redirect `/login` sem sessão) e **reutiliza** `obterSessao` (§7.3, que reforça clube + `podeLerEscalao`), `obterEpocaAtiva` e `obterMembroAtual` (branding do clube). Resolve cada exercício com `resolverExercicioSessao` (fallback ao **snapshot** §4.2.1) aplicando os overrides por sessão (`duracaoMin`/`series`/`descricaoOverride`/`notas`); a duração total é `Sessao.duracaoMin` ou o somatório dos exercícios. **(2) Template** `components/treinos/TreinoPrintTemplate.tsx` (*server component*, **SVG sem JavaScript** para sair fiel na impressão): cabeçalho com o logótipo **Mister** (`components/layout/Logo`, `variant="light"`) + **clube/época** no contexto (§BRAND — sem lockup do logótipo do clube ao lado do produto); **resumo** (duração, nº de exercícios, tipo `TipoSessao`, local, objetivo, notas); **lista numerada** de exercícios com metadados (duração, fase `ParteTreino`, categoria `CategoriaExercicioPrincipal`, séries), **miniatura do diagrama** (`MiniaturaCampo`, via `diagramaSchema.safeParse`), objetivo, descrição e notas; **rodapé** com clube + data de impressão. Cabeçalhos de secção e número de ordem em **laranja Mister `#F0531E`**; cada exercício com `break-inside-avoid` (não parte entre páginas). **(3)** Barra de ações com `print:hidden`/`data-print-hidden` (link "Voltar ao treino" + `BotaoImprimir` reutilizado dos relatórios); `components/treinos/AutoImprimir.tsx` (*client*) dispara `window.print()` (**"Guardar como PDF"**) após ~350 ms para as fontes/SVG estarem pintados. **(4)** O botão do detalhe abre a rota numa **nova aba** (`window.open`), mantendo o ecrã de condução aberto. Abordagem **serverless-safe** (sem `@react-pdf`/WASM), coerente com o export dos analíticos (§8.15). §8.8.2 alinhada. UI 100% pt-PT, sem dark mode. `npm run typecheck` limpo · `npm run lint` limpo · `next build` **compila com sucesso** (a coleta estática subsequente requer BD, indisponível neste ambiente; a página de impressão é dinâmica — usa `auth()`/cookies) · **1396 testes verdes**. **Não toca em auth.**
- **2026-08-27** — **Dashboard — secção de lembretes compacta (estado vazio mínimo) (§8.19).** A secção de lembretes persistidos ocupava demasiado espaço no topo do dashboard: **sem pendentes**, o `LembretesPainel` (`components/lembretes/LembretesPainel.tsx`) renderizava o `EstadoVazio` (ícone de 64px + `py-16` ≈ 128px de padding vertical) — um bloco enorme mesmo quando não havia nada a fazer. **Só apresentação/layout — sem alteração de schema, dados de negócio, Server Actions ou auth.** **(1) Estado vazio:** passa a ser um **indicador discreto de uma só linha** (`min-h-[28px]`) — ícone `Bell` pequeno (`h-3.5`) + texto «Sem lembretes» em `cinza-400`, com o botão «Novo lembrete» (quando `podeGerir`) reduzido a `variant="ghost"` compacto à direita; deixa de importar/usar o `EstadoVazio`. **(2) Estado com lembretes:** o bloco destacado da marca (fundo `laranja-50`, borda `laranja-500/45`, `shadow-card`, ícone/título/contador `laranja-600`) mantém-se mas fica **mais compacto** — `p-3 sm:p-4` (era `p-4 sm:p-5`), `space-y-2.5`, disco do ícone `h-7 w-7`, lista `space-y-1.5` e cartões de cada lembrete em `p-3` (era `p-4`), título em `text-corpo-sec`. Os botões «Feito»/eliminar mantêm os alvos de toque ≥44px (variantes `sm`/`icon` do `Button`). O diálogo «Novo lembrete» é partilhado pelos dois estados. Resultado: o resto do dashboard (herói, próximo treino/jogo, ações rápidas) ganha destaque. §8.19 alinhada. UI 100% pt-PT, sem dark mode. `npm run typecheck` limpo · `npm run lint` limpo. **Não toca em auth.**
- **2026-08-26** — **Correção — auto-play da animação no Modo treino não arrancava + parse do diagrama tolerante a string JSON (§8.8.2, §11.2).** A animação dos exercícios no **Modo treino** (`components/treinos/ModoTreino.tsx`) não arrancava sozinha ao abrir o exercício, apesar de a feature de auto-play (changelog 2026-08-26 «Modo treino — auto-play…») estar implementada. **Duas causas + correção. Só apresentação/parse — sem alteração de schema, dados de negócio ou auth.** **(1) Causa raiz — parse silenciosamente falhado para diagramas gravados como string JSON:** o `diagramaSchema.safeParse` (`lib/schemas/exercicio.ts`) só aceitava **objeto**; um diagrama guardado como **string JSON** (ex.: conteúdo curado via `seed-sub11-pg.ts`, que faz `JSON.stringify`, ou valores legados/importados) devolvia `success: false`, pelo que o `DiagramaGrande` do Modo treino (e o detalhe do exercício §8.11) caía no ramo «sem diagrama» — o diagrama **e** a sua animação desapareciam sem erro visível. **Correção:** `diagramaSchema` passa a ser um **`z.preprocess`** que **desserializa strings JSON** antes de validar (a forma-objeto foi extraída para `diagramaObjetoSchema`); objetos passam intactos e strings não-JSON continuam a falhar de forma limpa. Corrige **todos** os call-sites de parse (Modo treino, detalhe do exercício, modelo de jogo, formulário) de uma só vez; retrocompatível e sem alteração do tipo de saída `DiagramaCampo`. **(2) Robustez do arranque do auto-play (`components/campo/CampoAnimado.tsx`):** o estado `aPlay` iniciava sempre `false` e dependia de um efeito assíncrono para passar a `true`, e o efeito de playback dependia apenas de `[aPlay]` — pelo que, ao **navegar entre exercícios animados** no Modo treino, `aPlay` mantinha-se `true` e o loop de `requestAnimationFrame` não reiniciava com os **novos** keyframes (e auto-desligava-se com `setAPlay(false)` quando o diagrama seguinte tinha menos passos). **Correção:** `aPlay` passa a **iniciar já ativo** quando `autoPlay && keyframes.length > 1` (inicializador *lazy* do `useState`), garantindo arranque logo no primeiro render/montagem; e o efeito de playback passa a depender de **`[aPlay, keyframes]`**, reiniciando limpo a partir do frame base sempre que o diagrama muda. Comportamento das vistas de arranque **manual** (detalhe do exercício §8.11, modelo de jogo §8.10 — `autoPlay=false`) inalterado. Novos testes de regressão em `tests/campo.test.ts` (diagrama como string JSON parseia e preserva os passos → `construirKeyframes` devolve base+passo; string não-JSON falha sem lançar). §8.8.2 e §11.2 alinhadas. `npm run typecheck` limpo · **1396 testes verdes**. **Não toca em auth.**

- **2026-08-26** — **Export PDF dos analíticos — substituição do motor `@react-pdf/renderer` por relatório HTML imprimível (serverless-safe) (§8.15).** O botão «Download PDF» dos analíticos falhava sistematicamente em produção (Vercel, App Router serverless) com o genérico **«Erro ao gerar o PDF»**, mesmo após a tentativa anterior de o corrigir via `serverExternalPackages: ["@react-pdf/renderer"]`. **Causa raiz:** o `@react-pdf/renderer` v4 é um pacote **ESM puro** cuja cadeia transitiva (`@react-pdf/layout` → `yoga-layout` v3) instancia um motor de layout **WASM/Emscripten** na inicialização do módulo. No runtime serverless da Vercel isto é fundamentalmente frágil: empacotá-lo parte a seleção dinâmica do reconciler e a init do WASM; externalizá-lo depende de o file-tracing (`@vercel/nft`) incluir todo o grafo ESM+WASM na lambda **e** de o runtime sobreviver à instanciação nativa do WASM, que pode **abortar fora do `try/catch`** JS. Sintoma confirmatório: o cliente mostrava o fallback **cliente** «Erro ao gerar o PDF» (e não a mensagem **servidor** tratada «Não foi possível gerar o PDF»), o que só acontece num 500 não tratado / crash da lambda — logo, nenhum toggle de config resolve. **Solução (serverless-safe, sem dependências nativas):** o route handler `app/api/pdf` passa a devolver um **documento HTML auto-contido e imprimível** (A4, `@page`, CSS de impressão), que o browser converte em PDF via **«Guardar como PDF»**. **(1)** Removida a dependência **`@react-pdf/renderer`** (`package.json`, `-50 pacotes`) e a entrada `serverExternalPackages` (`next.config.js`), eliminando a causa raiz e o peso de bundle. **(2)** Templates reescritos de JSX/`@react-pdf` para **geradores de string HTML** (`components/pdf/comum.ts` — CSS partilhado, cabeçalho/rodapé, KPIs, tabelas, barras, `esc()` de escapamento anti-injeção; `components/pdf/PdfEstatisticaIndividual.ts`; `components/pdf/PdfEstatisticaGeral.ts`), mantendo **exatamente** os mesmos dados, layout e paridade com o CSV (a fusão de rankings do `AnaliticoEscalao` é idêntica). **(3)** Pipeline `lib/pdf/gerar-pdf.ts` (`server-only`) passa a devolver `{ ok, html, titulo }` em vez de `Buffer`; mantém auth + `RELATORIOS_VER` + scope (delega em `obterAnaliticoEscalao`/`obterAnaliticoClubeEpoca` via `obterMembroAtual`) e o carregamento **best-effort** do logótipo como data URI (embutido para garantir que a imagem está pronta antes da impressão). **(4)** Route handler devolve `Content-Type: text/html; charset=utf-8` (removido `Content-Disposition`/`application/pdf`). **(5)** Botão `components/analiticos/DescarregarPdfBotao.tsx` passa de `fetch`→blob→download para **`window.open`** num novo separador (envia cookies de auth por navegação; o documento abre o diálogo de impressão automaticamente e inclui um botão «Guardar como PDF» / «Fechar», ocultos na impressão); label default «Download PDF» → **«Guardar PDF»**. **(6)** Testes `tests/pdf.test.ts` atualizados: validam agora **HTML imprimível válido** (`<!DOCTYPE html>` + `window.print()`), o `titulo`, a presença dos dados no documento e o **escapamento** de texto dinâmico; mantêm os casos 401/403. §8.15 alinhada. `npm run typecheck` limpo · `npm run lint` limpo · `next build` verde · **1394 testes verdes**. **Nota:** as 3 vulnerabilidades de produção remanescentes são da cadeia `next-auth`/`@auth/core`/`nodemailer` (pré-existentes, **intocadas** — auth). **Não toca em auth.**

- **2026-08-26** — **Correção — a aba «Pessoal» de exercícios escondia os exercícios de colegas de escalão (§8.6).** As duas correções anteriores tornaram o **filtro do servidor** (`filtroExerciciosVisiveis`) correto — o Server Action `listarExercicios` já devolvia os exercícios pessoais de treinadores com escalão partilhado. Mas o problema **persistia em runtime**: a página `/exercicios` (`app/(app)/exercicios/page.tsx`) **reclassificava** os resultados do lado do cliente e deixava-os cair. A aba «Pessoal» filtrava por `origem === "PESSOAL"`, e `origemDoItem` (`lib/biblioteca.ts`) só devolve `"PESSOAL"` quando `autorId === utilizador`; um exercício pessoal de um colega (ex.: «Gonçalo») visto por outro treinador (ex.: «Hugo») ficava com `origem === "CLUBE"` **mas** com `naBibliotecaDoClube === false` (não foi contribuído para o clube) — logo não aparecia **nem** na aba «Pessoal» (não é `origem PESSOAL`) **nem** na aba «Clube» (não está na biblioteca do clube). **Correção (só apresentação):** a aba «Pessoal» passa a filtrar por `proprietario === "TREINADOR"` — como o filtro de visibilidade do servidor já limita `res.dados` ao que o membro pode ver, qualquer item `TREINADOR` presente é um exercício de biblioteca pessoal legitimamente visível (próprio **ou** de colega com escalão partilhado, este último já só-de-leitura — `podeEditar`/`podeAlternarPartilha` dependem de `autorId === utilizador`). A aba «Clube» (`naBibliotecaDoClube`) e o campo `origem` (usado no badge «No clube») ficam inalterados. **Sem alteração de schema, Server Actions, `lib/biblioteca.ts` nem auth** — cumpre finalmente a §8.6 («a aba Pessoal mostra os exercícios do próprio treinador **e** os exercícios pessoais dos treinadores com quem partilha ≥1 escalão, em modo leitura»). **Não toca em auth.**

- **2026-08-26** — **Dashboard — mini-resumo da época conta só eventos já realizados (§8.16).** No cartão «Época {nome}» do dashboard (`app/(app)/dashboard/page.tsx`), os contadores de **sessões** e **jogos** mostravam o **total** da época (incluindo eventos **futuros/previstos**), o que inflacionava o «resumo da época». Passam a contar apenas eventos **já realizados** (`data <= agora`). **(1) Contagens (`app/(app)/dashboard/page.tsx`):** as queries inline `prisma.sessao.count`/`prisma.jogo.count` (alimentam `nSessoes`/`nJogos`) ganham o filtro `data: { lte: agora }`, mantendo o filtro de âmbito existente (`epocaId` + `escalao.clubeId`). O contador de **atletas** (`nAtletas`) fica **inalterado** (total de participações ativas na época). **(2) Empty state (deteção de «época vazia»):** como `nSessoes`/`nJogos` deixam de refletir o total, a condição `epocaVazia` passa a considerar também a existência de **sessão/jogos futuros** já carregados (`proximaSessao`, `proximosJogos`), para não tratar como vazia uma época recém-criada que só tem eventos por vir — evitando regressão no empty state motivacional. §8.16 atualizada. **Só agregação/apresentação — sem alteração de schema, dados de negócio ou auth.** `npm run typecheck` limpo · **1394 testes verdes**. **Não toca em auth.**
- **2026-08-26b** — **Navegação — Agenda substitui os itens de Treinos e Jogos no menu (§8, §8.13.1).** Na sequência da promoção da Agenda a vista central de eventos, os itens **separados** de **Treinos** e **Jogos** continuavam a figurar no menu ao **mesmo nível** da Agenda, tornando-o **redundante** (a Agenda já agrega e liga a esses eventos). **Correção (só navegação/apresentação):** **(1) `components/layout/Navegacao.tsx`:** removidos os itens `/treinos` e `/jogos` de `ITENS_BASE`; a nova ordem coloca a **Agenda** como item primário e a bottom-nav móvel passa a **Início · Plantel · Agenda · Exercícios** (`ITENS_BOTTOM = ITENS.slice(0, 4)`); os restantes (Mano-a-Mano, Analytics, Comunicações, Reuniões, Definições) ficam no menu «Mais». Removidos os ícones agora não usados (`CalendarCheck`, `Trophy`) do import de `lucide-react`. **(2)** A sidebar (desktop) partilha `ITENS_BASE`, pelo que Treinos e Jogos também deixam de figurar como itens de sidebar — **sem introduzir sub-navegação** (o padrão da sidebar é lista plana; decisão «simplifica»). **(3)** As rotas `/treinos` e `/jogos` **mantêm-se** (vistas de gestão: criar/editar/detalhe, plano semanal, classificação, scouting), acessíveis a partir da própria Agenda — cada evento liga ao detalhe (`/treinos/{id}`, `/jogos/{id}`) e os botões «Nova sessão»/«Novo jogo» abrem os formulários; os atalhos «Ver na Agenda» em Treinos e Jogos são o caminho de volta. §8 (bottom-nav: Início · Plantel · Agenda · Exercícios) e §8.13.1 alinhadas. UI 100% pt-PT, sem dark mode, TypeScript strict. `npx tsc --noEmit` limpo · `npm run lint` limpo. **Não toca em auth.**
- **2026-08-26** — **Agenda unificada como vista central de eventos (§8, §8.8, §8.11, §8.13.1, §8.16).** A rota **`/agenda`** passa a ser a **vista central de eventos** do clube, unificando **treinos + jogos + reuniões** num só ecrã, e é **promovida a item primário** da navegação. **Só apresentação/agregação — sem alteração de schema; não toca em auth.** **(1) Nova subsecção §8.13.1 «Agenda unificada»:** documenta os dois modos de vista (`?vista=lista|calendario`), o filtro por tipo (`?tipo=TREINO|JOGO|REUNIAO|todos`, aplicado server-side), o filtro por escalão (`?escalaoId=`, respeitando `escaloesLegiveis`), a navegação de mês no calendário (`?mes=YYYY-MM`) com **pills distintas por tipo** (treino=cor primária, jogo=âmbar, reunião=esmeralda), os botões «Nova sessão»/«Novo jogo» e o modelo `EventoAgenda`. **(2) `lib/actions/agenda.ts`:** `EventoAgenda` alargado com `tipoSessao?`, `tipoJogo?`, `casaFora?`, `descricao?`; o discriminador `tipo` inclui agora `"REUNIAO"`; `FiltrosAgenda` ganha `tipo?: "TREINO" | "JOGO" | "REUNIAO"` com filtro server-side; reuniões integradas na agregação via `Promise.all` com o mesmo filtro de âmbito (clube + escalões legíveis). **(3) `app/(app)/agenda/page.tsx`:** reescrita como vista central (suporta `?vista`, `?tipo`, `?mes`, `?escalaoId`; toggle Lista/Calendário; lista estendida aos 3 tipos de evento). **(4) Novos componentes:** `components/agenda/CalendarioAgenda.tsx` (calendário mensal unificado com pills por tipo e links corretos) e `components/agenda/FiltroTipoAgenda.tsx` (toggle client-side que escreve `?tipo=` sem apagar outros params). **(5) Navegação (`components/layout/Navegacao.tsx`):** Agenda promovida a **item primário na posição 4** da bottom-nav móvel (Início · Plantel · Treinos · Agenda); **Jogos** passa para a posição 5 (menu «Mais» no móvel); removida a lógica condicional `ITENS_COM_AGENDA`/`mostrarAgenda` (e a prop `mostrarAgenda` em `app/(app)/layout.tsx`). **(6) Atalhos «Ver na Agenda»:** `app/(app)/treinos/page.tsx` (`/agenda?vista=lista&tipo=TREINO`) e `app/(app)/jogos/page.tsx` (`/agenda?vista=lista&tipo=JOGO`). §8 (navegação), §8.8 (Treinos), §8.11 (Jogos), §8.13 (reuniões no calendário mensal) e §8.16 (dashboard) alinhadas. UI 100% pt-PT, sem dark mode. **Não toca em auth.**
- **2026-08-26** — **Correção — marca de água do logótipo do clube não carregava (quadrado escuro) (§8.4, §12.2).** A **marca de água** do logótipo do clube no fundo da área de conteúdo (`app/(app)/layout.tsx`) aparecia como um **quadrado escuro/partido** quando o `Clube.logoUrl` apontava para um host **fora** da allowlist `images.remotePatterns` do `next.config.js` (ex.: `www.cm-evora.pt`). **Causa raiz:** a marca de água era o **único** sítio que renderizava o logótipo via **`next/image` otimizado** — o otimizador (`/_next/image`) recusa hosts fora da allowlist com **HTTP 400**, e não havia **`onError`** para degradar. Como o `logoUrl` é um URL `https` **arbitrário** inserido no branding (§8.4, validado apenas como http(s) em `brandingSchema`), qualquer host não listado falhava. O `<LogoClube>` da barra de topo já estava correto (`unoptimized` + fallback às iniciais), pelo que o logótipo aparecia bem no cabeçalho mas partido na marca de água. **Correção:** novo Client Component **`components/layout/MarcaAguaClube.tsx`** que renderiza a marca de água com **`unoptimized`** (aceita qualquer host `https` sem depender da allowlist, à imagem do `<LogoClube>`) e **`onError`** que **remove** a marca de água se a imagem falhar (em vez do quadrado partido) — a identidade visível do clube, com **fallback às iniciais**, continua garantida pelo `<LogoClube>` na barra de topo. `app/(app)/layout.tsx` passa a usar `<MarcaAguaClube>` e deixa de importar `next/image`. **Decisão:** manter `unoptimized` (em vez de alargar `remotePatterns`) porque os logótipos vêm de URLs arbitrários dos utilizadores — não é praticável allowlistar todos os hosts possíveis; a CSP mantém `img-src` restrito a `https:`/`data:`. §8.4/§12.2 alinhadas. UI 100% pt-PT, sem dark mode. **Não toca em auth.**
- **2026-08-26** — **Fases de treino — renomear o label de display «Jogo reduzido» para «Jogo - campo inteiro/reduzido» (§2, §3.4).** Alteração **apenas do label de apresentação** da fase de treino associada ao enum `ParteTreino.JOGO_REDUZIDO`: `LABEL_PARTE_TREINO.JOGO_REDUZIDO` em `lib/schemas/exercicio.ts` passa de `"Jogo reduzido"` para `"Jogo - campo inteiro/reduzido"`, refletindo que a fase cobre tanto jogo em campo reduzido como em campo inteiro. **O enum `ParteTreino.JOGO_REDUZIDO` (schema Prisma) e os valores de `PARTES_TREINO` mantêm-se inalterados** — muda só o texto exibido ao utilizador. Bíblia alinhada: §2 (glossário «Parte do treino») e §3.4 (descrição de templates de sessão) atualizadas para o novo label. Sem alteração de schema, dados, Server Actions ou auth. **Não toca em auth.**
- **2026-08-26** — **Treinos — seletor de exercícios com pré-visualização do diagrama + visualização por fases (§3.5, §8.8.2).** Duas melhorias no plano de exercícios da sessão (`/treinos/[id]`). **Não toca em auth.** **(1) Melhoria 1 — pré-visualização no seletor:** o diálogo «Adicionar exercício da biblioteca» (`components/treinos/GestorExercicios.tsx`) passa a mostrar, para cada exercício, uma **miniatura do diagrama** (via `MiniaturaCampo`, só-leitura) ao lado do nome/categoria — placeholder tracejado quando o exercício não tem campo. Para isso, `app/(app)/treinos/[id]/page.tsx` passa `diagrama` (e `parteTreino`) nos itens da biblioteca (já vinham do `listarExercicios`, que devolve o `Exercicio` completo). **(2) Melhoria 2 — exercícios agrupados por fase:** novo campo **`parteTreino ParteTreino?`** no modelo **`SessaoExercicio`** (`prisma/schema.prisma`), migração aditiva `20260826130000_add_sessao_exercicio_parte_treino` (`ALTER TABLE … ADD COLUMN "parteTreino" "ParteTreino"`, rows legadas ficam `NULL`). **Reutiliza o enum `ParteTreino` existente** (`AQUECIMENTO | PRINCIPAL | JOGO_REDUZIDO | RETORNO_CALMA`), já usado em `Exercicio` e `ModeloSessaoExercicio` — **sem** criar um enum paralelo (evita duplicação; alinha com a terminologia da bíblia §3.3: Aquecimento / Parte principal / Jogo reduzido / Retorno à calma). A §3.5 volta a documentar o campo (removido em 2026-08-24 por nunca ter existido em código). **(3) Zod (`lib/schemas/treino.ts`):** `sessaoExercicioOverrideSchema` ganha `parteTreino` (`enum(PARTES_TREINO).nullable().optional()`) e novo `parteTreinoSessaoSchema` (validação do parâmetro de adição). **(4) Server Actions (`lib/actions/treinos.ts`):** `adicionarExercicioSessao(sessaoId, exercicioId, parteTreino?)` valida a fase e, quando ausente, **herda a `parteTreino` do próprio exercício** da biblioteca; `atualizarExercicioSessao` (Adaptar) passa a gravar também a fase (override por sessão). `reordenarExercicios` inalterado — a ordem continua a ser reatribuída globalmente. **(5) UI:** `GestorExercicios` renderiza os exercícios **agrupados por fase** com separador/contador por grupo (Aquecimento → Parte principal → Jogo reduzido → Retorno à calma → «Sem fase»), numeração global e **reordenação dentro da fase** (setas ↑/↓ operam por grupo, reatribuindo `ordem` global fase-a-fase); o diálogo de adicionar tem um **Select «Fase do treino»**; `components/treinos/AdaptarExercicioDialog.tsx` ganha um Select de fase (permite corrigir a fase de um exercício já adicionado, incl. «Sem fase»). Novos testes em `tests/schemas.test.ts` (schema da fase) e `tests/actions.test.ts` (adicionar com fase explícita e herdada). UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. **Não toca em auth.**
- **2026-08-26** — **Plano de jogo — quadro tático interativo (§8.10, §8.11).** O separador *Convocatória → Plano de jogo* do detalhe do jogo deixa de mostrar apenas a formação estática (read-only) e passa a incluir um **quadro tático interativo** que reutiliza o `EditorCampo`: os **titulares** posicionados aparecem como tokens arrastáveis (drag & drop no SVG), é possível **desenhar setas/jogadas** e **adicionar tokens genéricos do adversário**. **Persistência:** o estado (posições + setas + adversários) é guardado como JSON em **`QuadroTatico.diagrama`** (um único quadro-plano por jogo, identificado pelo novo nome canónico `NOME_QUADRO_PLANO_JOGO` = «Plano de jogo», tipo `GERAL`), via as Server Actions existentes `criarQuadroTatico`/`atualizarQuadroTatico`/`listarQuadrosTaticos` — **sem alteração de schema Prisma nem de auth**. **Edição sob `MODELO_JOGO_GERIR`** (só-de-leitura sem a capacidade); a posição/titularidade previstas por convocado mantêm-se guardadas à parte por `definirPlanoTatico` (`CONVOCATORIA_GERIR`) e continuam a **semear** a formação inicial do quadro (botão «Repor formação» volta a semeá-la). **Adversário (§11.3):** novo campo opt-in `permitirAdversario` no `EditorCampo` que expõe a ferramenta «Adversário» (coloca `jogador` com `equipa: "adversario"`); o render (`desenho.tsx`) desenha o adversário neutro/escuro (`#334155`), contorno tracejado e rótulo «A» — aditivo e retrocompatível (elementos sem `equipa` renderizam como antes). **Ficheiros:** `components/campo/desenho.tsx` (+`ADVERSARIO_COR`, render do adversário), `components/campo/animacao.ts` (`rotuloElemento` distingue «Adversário»), `components/campo/EditorCampo.tsx` (prop `permitirAdversario` + ferramenta + hint), `components/jogos/QuadroTaticoJogo.tsx` (**novo** — wrapper com editar/guardar/repor/só-leitura), `components/jogos/PlanoTatico.tsx` (substitui o preview estático pelo quadro interativo), `components/jogos/JogoDetalhe.tsx` + `app/(app)/jogos/[id]/page.tsx` (carregam o quadro e a capacidade e passam-nos abaixo), `lib/schemas/modeloJogo.ts` (+`NOME_QUADRO_PLANO_JOGO`), `tests/campo.test.ts` (rótulo do adversário + validação do diagrama com adversário). **Verificação:** `npm run typecheck` = 0 erros; `npm run test` = 1379 testes verdes.
- **2026-08-26** — **Dashboard — lembretes persistidos no topo + cor de destaque da marca (§8.16, §8.19).** Os **lembretes/tarefas persistidos** (§3.15/§8.19) deixam de estar no **fundo** do dashboard e passam para o **topo da página**, antes de qualquer outro conteúdo, com **cor de destaque da marca** para chamarem a atenção. **Só apresentação/posicionamento — sem alteração de schema, dados de negócio, Server Actions ou auth.** **(1) `app/(app)/dashboard/page.tsx`:** o `<ListaLembretes />` (Server Component que já carregava os pendentes do utilizador via `obterLembretes()`) é **movido** da última posição do `space-y-8` para a **primeira**, antes do bloco de identidade e de todo o resto do conteúdo. **(2) `components/lembretes/LembretesPainel.tsx`:** quando há lembretes pendentes (`destaque = lembretes.length > 0`), o painel passa a renderizar-se num bloco **destacado** — fundo `laranja-50` (`#FDF1EB`), borda `laranja-500/45`, cantos arredondados e `shadow-card` — com um **ícone `Bell`** em disco `laranja-500/15`, o título «Lembretes» em `laranja-600` (contraste AA sobre o creme) e um **contador de pendentes** (badge `laranja-600` sobre `laranja-500/15`); a animação de entrada (`animar-entrada`) mantém-se. **Sem pendentes**, o painel mantém-se **discreto** (título neutro `cinza-400` + `EstadoVazio`), para não pesar no topo quando não há nada a fazer. Os cartões de cada lembrete continuam em `card-base` (branco), garantindo contraste sobre o fundo laranja; os botões «Feito»/eliminar mantêm os alvos de toque ≥44px (variantes `sm`/`icon` do `Button`, já `h-11`). A **cor escolhida é a laranja fixa da marca** (`#F0531E`), distinta do tom **âmbar** do banner de eventos de hoje (§8.16), para separar visualmente «tarefas a fazer» de «eventos de hoje». §8.16/§8.19 alinhadas. UI 100% pt-PT, sem dark mode. `npm run typecheck` limpo · `npm run lint` limpo · **1377 testes verdes**. **Não toca em auth.**
- **2026-08-26** — **Identidade visual — logótipo do clube na barra de topo (§8, §12.2).** A **barra de topo** passa a mostrar o **logótipo do clube ativo** junto ao **nome do clube**, a seguir à marca do produto (Mister), cumprindo o que a §8 (navegação: «barra de topo — logótipo do clube…») e a §12.2 («logótipo na barra de topo») já prescreviam mas que a UI não implementava (o logótipo do clube só existia como **marca de água** e no **cabeçalho dos PDF**). Dá mais vida à interface e reforça a identidade do clube. **Só apresentação — sem alteração de schema, dados, actions ou auth.** **(1) Novo componente `components/layout/LogoClube.tsx`** (Client Component): renderiza o logótipo do clube via `next/image` quando há `Clube.logoUrl`, com **fallback para as iniciais** do clube num disco na **cor do clube** (`--cor-primaria`) quando não há logo **ou** a imagem falha (`onError`). Usa `unoptimized` para aceitar qualquer host `https` inserido no branding (§8.4) sem depender da allowlist de `remotePatterns` do next/image; a CSP restringe `img-src` a `https:`. **(2) `components/layout/BarraTopo.tsx`:** novas props `nomeClube` e `logoClube`; bloco de identidade do clube (logótipo 32×32 + nome) à esquerda, separado da marca Mister por um divisor subtil; o nome do clube esconde-se em ecrãs muito pequenos (`sm:`), o logótipo é sempre visível. **(3) `app/(app)/layout.tsx`:** passa `nomeClube={clube.nome}` e `logoClube={clube.logoUrl}` à `BarraTopo` (dados já carregados do `membro.clube`). O **login mantém-se só com a marca Mister** (§12.2 — sem contexto de clube) e o **PDF** já incluía o logótipo do clube (inalterado). §12.2 alinhada (logótipo do clube agora também na barra de topo + nota de fallback por iniciais). UI 100% pt-PT, alvos de toque ≥44px. `npm run typecheck` limpo · `npm run lint` limpo. **Não toca em auth.**
- **2026-08-26** — **Correção — visibilidade por escalão partilhado ciente do âmbito (§3.3, §6.3/§6.5/§6.9, §20).** A visibilidade da biblioteca pessoal por escalão partilhado (entrada anterior) **não funcionava na prática** para treinadores cuja cobertura de escalão **não vem de `AtribuicaoEscalao` explícita**. O filtro `filtroExerciciosVisiveis` (`lib/biblioteca.ts`) só reconhecia a via **PROPRIOS_ESCALOES** (atribuição direta membro↔escalão), ignorando os âmbitos **TODO_CLUBE** (Administrador, Diretor Técnico, Presidente — cobrem **todos** os escalões do clube) e **SECCAO** (Coordenador de Secção — cobre os escalões da secção). Consequência real: um Diretor Técnico (ex.: «Hugo», TODO_CLUBE) **não via** os exercícios pessoais de um treinador de escalão, apesar de cobrir esse escalão; e os exercícios pessoais de um autor TODO_CLUBE/SECCAO eram invisíveis aos colegas. **Correção:** «partilhar um escalão» passa a respeitar o **âmbito** em ambos os lados (autor e utilizador). A condição é: existe um escalão E do clube ativo que **o autor cobre** e que **o utilizador atual também cobre**, onde «cobrir E» = ter `AtribuicaoEscalao(E)` (PROPRIOS) **ou** ter perfil de âmbito **TODO_CLUBE** **ou** coordenar a **secção** de E. Continua a ser expresso de forma **declarativa** (uma única `WhereInput`, sem pré-query) — assinatura de `filtroExerciciosVisiveis(clubeId, utilizadorId)` inalterada, sem alterações aos call-sites nem à propriedade/portabilidade (secção 4.2 intacta). **(§20)** testes de visibilidade (`tests/biblioteca-visibilidade.test.ts`) alargados para os três âmbitos (incluindo o cenário reportado do Diretor Técnico) e o teste de forma da cláusula (`tests/templates-sessao.test.ts`) atualizado. **Não toca em auth.**
- **2026-08-26** — **Exercícios — visibilidade da biblioteca pessoal por escalão partilhado (§3.3, §4.2, §8.6, §20).** O modelo de visibilidade dos exercícios pessoais passa a basear-se em **escalões partilhados**: um exercício `proprietario = TREINADOR` deixa de ser visível **só ao autor** e passa a ser visível também a **qualquer treinador do clube que partilhe pelo menos um escalão** com o autor (via `AtribuicaoEscalao`/`escaloesLegiveis`), em **modo leitura** (duplicável, não editável). Exemplo: se A e B treinam os Benjamins, os exercícios pessoais de A são visíveis a B (e vice-versa); C, que só treina os Iniciados, não os vê enquanto não partilhar um escalão. **A propriedade e a portabilidade não mudam** (secção 4.2 intacta): o exercício continua `TREINADOR`, viaja com o autor e não gera snapshot por ser visto — a mudança é **só de visibilidade**, não de propriedade. Exercícios `CLUBE` mantêm-se visíveis a toda a equipa técnica. **(1) §3.3:** novo bloco «Visibilidade da biblioteca pessoal» + atualização da regra de Duplicar (o conjunto «visível» inclui agora exercícios pessoais de co-treinadores de escalão). **(2) §4.2:** nova nota «Visibilidade ≠ propriedade». **(3) §8.6:** a aba Pessoal passa a listar também os exercícios pessoais partilhados por escalão (só-leitura). **(4) §20:** módulo de testes de visibilidade atualizado (deixa de afirmar «só ao autor»). **Implementação:** filtro `filtroExerciciosVisiveis` em `lib/biblioteca.ts` atualizado para incluir os exercícios `TREINADOR` de autores que partilhem escalão com o utilizador. **Não toca em auth.**
- **2026-08-26** — **Plantel — estado de inscrição do atleta + vista de inscrições (§8.5).** Novo campo **`inscrito Boolean @default(false)`** no modelo `Atleta` (inscrição federativa/no clube), **independente de `ativo`** (um atleta ativo pode continuar por inscrever). **Não toca em auth.** **(1) Schema (`prisma/schema.prisma`):** campo `inscrito` no `Atleta` (default `false` → nasce «por inscrever»). **(2) Zod (`lib/schemas/atleta.ts`):** `atletaPessoalSchema` ganha `inscrito: z.boolean().optional()` (partilhado por criação e edição; ausente → a action assume `false`). **(3) Server Actions (`lib/actions/atletas.ts`):** o tipo de leitura `AtletaPessoal` e o `SELECT_PESSOAL` passam a incluir `inscrito`; `criarAtleta` grava `inscrito ?? false`; `atualizarAtleta` grava `inscrito` **só quando fornecido** (mesmo padrão de `ativo`, para não repor o valor a partir de callers que o omitam). **(4) Etiqueta (`components/plantel/BadgeInscricao.tsx`, novo):** chip pequeno (informação secundária) — **«Inscrito»** a **verde** (`verde-600`) / **«Por inscrever»** a **âmbar** suave (`ambar-500/600`). **(5) Vista de inscrições (`components/plantel/ListaInscricoes.tsx` + `components/plantel/SeletorVistaPlantel.tsx`, novos):** a página do plantel (`app/(app)/plantel/page.tsx`) ganha um **seletor de vista** (Cartões ↔ Inscrições) cujo estado vive na URL (`?vista=inscricoes`), preservando os filtros de escalão/secção/pesquisa/inativos; a vista **Inscrições** mostra uma lista responsiva com **nome, idade + data de nascimento, encarregado de educação (nome + contacto) e estado de inscrição**, cada linha ligada ao perfil (alvo de toque ≥44px). **(6) Badge na lista e no perfil:** a `BadgeInscricao` aparece nos **cartões** do plantel (junto ao «Inativo») e no **cabeçalho do perfil** (`app/(app)/plantel/[id]/page.tsx`). **(7) Edição (`components/plantel/AtletaForm.tsx`):** novo **`Switch` «Inscrito»** (estado local, enviado no objeto `pessoal`) no formulário de atleta. Testes: mock de `listarAtletas` (`tests/atletas.test.ts`) atualizado com `inscrito`. UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. **Nota de integração:** a **migração** do campo `inscrito` é entregue em paralelo (trabalho de base de dados); este passo cobre schema Prisma + código de aplicação. **Não toca em auth.**
- **2026-08-26** — **Segurança/Autorização — treinador de âmbito próprio lê exclusivamente os seus escalões (§6.5, §6.7).** Correção de fuga de autorização: um **Treinador Principal/Adjunto** (âmbito `PROPRIOS_ESCALOES`) conseguia **ver dados e tabs de escalões que não lhe estavam atribuídos** (ex.: um treinador dos Benjamins A via os Infantis). **Causa raiz:** a flag `Escalao.visivelOutrosTreinadores` tem `@default(true)`, e `escaloesLegiveis()`/`podeLerEscalao()`/`podeLerAlgumEscalao()` (`lib/permissoes.ts`) concediam leitura de **qualquer** escalão marcado visível a **todos** os âmbitos, incluindo o treinador de escalão — pelo que, com o default, todos os escalões eram legíveis por todos os treinadores. **Decisão (fechada 2026-08-26):** `visivelOutrosTreinadores` passa a conceder leitura transversal **apenas** a âmbitos não-próprios — `SECCAO` (Coordenador, fora da sua secção) e, implicitamente, `TODO_CLUBE`. Para **`PROPRIOS_ESCALOES`** a leitura restringe-se **estritamente** aos escalões atribuídos (`AtribuicaoEscalao`); `visivelOutrosTreinadores` deixa de lhe conceder acesso. **(1) `lib/permissoes.ts`:** `escaloesLegiveis()` devolve, para `PROPRIOS_ESCALOES`, apenas `escaloesAtribuidos` (sem consultar escalões visíveis); `podeLerEscalao()`/`podeLerAlgumEscalao()` devolvem `false` para escalão alheio em âmbito próprio (nem consultam a flag na BD) — mantendo intacto o comportamento de `SECCAO` (secção coordenada + visíveis fora da secção) e `TODO_CLUBE`. Novo helper **`filtrarEscaloesLegiveis(escaloes)`** para construir tabs/filtros alinhados com o filtro de dados. **(2) Tabs de escalão alinhadas com o servidor:** `app/(app)/treinos/page.tsx`, `app/(app)/agenda/page.tsx` e `app/(app)/jogos/page.tsx` renderizavam **todos** os escalões do clube (`resEscaloes.dados`) nas tabs/filtros, ignorando o âmbito — agora filtram por `filtrarEscaloesLegiveis` (o plantel já o fazia via `escaloesLegiveis`). Os dados já eram filtrados server-side (`listarSessoes`/`obterAgendaClube`/`listarJogos` usam `escaloesLegiveis`/`podeLerEscalao`), pelo que a navegação direta (`?escalaoId=…`) para um escalão alheio devolve vazio. §6.5 (reescrita por âmbito) e §6.7 (ponto 5) atualizadas. Novos testes em `tests/permissoes-seccao.test.ts` (`escaloesLegiveis`/`podeLerEscalao` para `PROPRIOS_ESCALOES` — só atribuídos, nunca `visivelOutrosTreinadores`, e nega direct-nav a escalão alheio). **Foca só autorização de escalões — não toca em autenticação.**
- **2026-08-26** — **Analíticos — export PDF ("Dossier do Treinador") + correção da taxa de assiduidade (BUG-P1-08) (§8.15, §10.2, §10.3, §12).** Duas alterações à camada de analíticos. **Não toca em auth.** **(1) BUG-P1-08 — assiduidade usa sessões executadas, não as programadas:** a taxa de assiduidade dos painéis usava como denominador o **total de sessões programadas** (`sessoes.length`), pelo que um escalão com muitas sessões futuras agendadas mas poucas realizadas mostrava uma taxa artificialmente baixa (ex.: 1 sessão realizada com todos presentes → **1%** em vez de **100%**). Corrigido em `lib/actions/analise.ts` para usar **`sessoesExecutadas`** (`data < agora`) como denominador, coerente com a regra «assiduidade do atleta = presenças / sessões executadas» e «assiduidade do escalão = média das individuais»: **`obterAnaliticoEscalao`** (`taxaPresencaMedia` e o denominador do `rankingAssiduidade`), **`obterAnaliticoClubeEpoca`** (por escalão em `EscalaoResumoClube.taxaPresencaMedia` e no `taxaPresencaMediaGlobal`, reutilizando o `groupBy` de executadas já existente) e **`calcularComparacaoEquipa`** (contagem de sessões `NORMAL` passa a filtrar `data < agora`, mantendo a simetria numerador/denominador). Mantido o cap a 100% (`Math.min`) em todas as taxas, agora estendido às taxas do painel de clube (denominador menor pode gerar >100% para atletas que saíram a meio da época). Sem alteração de schema. Novos testes em `tests/analise-f9.test.ts` (escalão com 1 sessão executada + 4 futuras e todos presentes → 100%; clube com 10 programadas/1 executada → 100%). **(2) Export PDF dos analíticos ("Dossier do Treinador"):** novo botão **«Download PDF»** nas páginas de analytics do **escalão** (`/escaloes/[id]/analiticos`) e do **clube** (`/analiticos`). Instalado **`@react-pdf/renderer`** (v4, compatível com React 19; **0 vulnerabilidades de produção novas** — as pré-existentes são da cadeia `nodemailer`/`next-auth`, intocadas). **Templates server-only** em `components/pdf/`: `comum.tsx` (cabeçalho com logótipo/nome/época do clube, KPIs, tabelas, barras e rodapé — na **cor do clube** `clube.corPrimaria`, fallback laranja Mister `#F0531E`), **`PdfEstatisticaIndividual.tsx`** (tabela por atleta — golos, assistências, jogos, tempo, cartões, presenças e assiduidade — construída da **união dos rankings** do `AnaliticoEscalao`, em paridade com o export CSV) e **`PdfEstatisticaGeral.tsx`** (visão do clube a partir de `AnaliticoClubeEpoca` — KPIs gerais, resultados V/E/D, tabela por escalão e barras de golos). Pipeline server-side em **`lib/pdf/gerar-pdf.tsx`** (`server-only`): delega nas Server Actions existentes (`obterAnaliticoEscalao`/`obterAnaliticoClubeEpoca`, que garantem auth + `RELATORIOS_VER` + scope), obtém o branding via `obterMembroAtual`, carrega o logótipo como data URI (best-effort, só PNG/JPEG, com timeout e limite de tamanho; falha → placeholder com a inicial) e renderiza para `Buffer`. Único **route handler** REST permitido além do Auth.js: **`app/api/pdf/route.ts`** (`runtime = "nodejs"`, valida query com Zod, devolve o PDF com `Content-Disposition: attachment`). Botão cliente `components/analiticos/DescarregarPdfBotao.tsx` (fetch → blob → download, com loading + toast, à imagem do `ExportarCsvBotao`). Novos testes em `tests/pdf.test.ts` (gera PDF válido — bytes `%PDF` — para escalão e clube; propaga «Sem permissão» → 403 e «Não autenticado» → 401). §8.15 (exports), §10.2/§10.3 (assiduidade) e §12 (identidade visual) alinhadas. `npm run typecheck` limpo · `npm run lint` limpo · `next build` verde · **1353 testes verdes**. **Não toca em auth.**
- **2026-08-26** — **Analíticos — redesenho visual dos painéis de clube e escalão (estilo "clean/global", §10.2, §10.3, §12).** Redesenho **puramente visual** dos painéis de analíticos (`components/analiticos/PainelClube.tsx` e `components/analiticos/PainelEscalao.tsx`), inspirado no layout limpo e global do «Dossier do Treinador». **Sem qualquer alteração a Server Actions, schema, dados de negócio ou auth** — os painéis continuam a receber os mesmos `AnaliticoClubeEpoca`/`AnaliticoEscalao` já calculados. **(1) Novo componente presentacional partilhado `components/analiticos/Kpi.tsx`:** `Kpi` (KPI de **número grande** + rótulo por baixo + nota opcional; acentos `primary|verde|ambar|vermelho|neutro` mapeados para as cores da marca, com o `primary` a seguir a cor do clube via `--cor-primaria`), `SecaoAnalitico` (título de secção discreto uppercase + slot de ação à direita) e `GrelhaMeses` (grelha mensal compacta, estilo dossier). Bordas subtis (`border-cinza-200`) **sem sombras pesadas** (removido `shadow-card` dos blocos). **(2) `PainelClube`:** secções «Geral» (6 KPIs — escalões, atletas, jogos, sessões realizadas/prog., golos marcados, presença média), «Resultados da época» (V/E/D com acentos verde/âmbar/vermelho **+ percentagem** de cada sobre o total de jogos) e «Escalões» (tabela limpa com hover de linha, link do escalão com alvo ≥44px e presença destacada na cor do clube). O filtro de modalidade (P2.4) passou para o cabeçalho da secção «Geral» (comportamento inalterado). **(3) `PainelEscalao`:** KPIs de «Balanço da época» (com % de V/E/D) e «Plantel e médias» convertidos para os novos `Kpi` (sem ícones lucide — visual mais limpo); nova secção «Treinos» com **grelha mensal de sessões** (nº de sessões por mês, **derivado** de `presencaMensal.total / nAtletas` — apenas apresentação, sem nova query) + os chips de tipos de treino; «Assiduidade mensal» passa a **grelha mensal de percentagens** (destaque abaixo de 60%) em vez do gráfico de barras; rankings, disciplina e resultados jogo-a-jogo mantidos com o mesmo estilo limpo (tabelas com hover, cartões só com borda). A presença média mantém o acento semântico (verde ≥85% / âmbar ≥60% / vermelho) via novo helper local `acentoTaxa`. **Nota:** não foi criada tabela consolidada por atleta porque os rankings do servidor são truncados (top 5/10) — fá-lo exigiria alterar as Server Actions, o que estava fora do âmbito. §10.2/§10.3 (apresentação) e §12 (sistema de design — KPIs e grelha mensal) alinhadas. UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. `npm run typecheck` limpo · `npm run lint` limpo · **1349 testes verdes**. **Não toca em auth.**
- **2026-08-26** — **Plantel — editar tipo de participação (principal/simultânea/ocasional) na aba Participações (§7.3, §8.5, §9).** A aba **Participações** do perfil do atleta passa a permitir **mudar o tipo** de uma participação ativa da época atual, além de a **terminar** — antes só existia «Terminar», pelo que não havia forma de, p. ex., trocar qual escalão é o **principal** sem transferir. **Não toca em auth.** **(1) Schema (`lib/schemas/participacao.ts`):** novo **`editarTipoParticipacaoSchema`** (`atletaId`/`escalaoId` cuid, `epocaId?` cuid, `tipo` ∈ `PRINCIPAL|SIMULTANEA|OCASIONAL` — obrigatório, sem default) e tipo `EditarTipoParticipacaoInput`. **(2) Server Action (`lib/actions/participacoes.ts`):** nova **`editarTipoParticipacao(dados)`** — valida Zod → `exigirCapacidade('PROMOVER_ATLETAS')` → isola por clube (atleta + escalão) → resolve época → transação **Serializable** que lê as participações ativas da época, aplica o invariante do principal **por modalidade** (§9) via os helpers puros já existentes `ficariaSemPrincipal`/`principaisADespromover`: passar a `PRINCIPAL` **despromove automaticamente** o principal anterior da mesma modalidade para `SIMULTANEA`; **recusa** despromover o único principal da modalidade («deixaria o atleta sem participação principal»); um principal de **outra** modalidade nunca é tocado. Revalida `/plantel`, `/plantel/[id]` e `/dashboard`. **(3) UI:** novo `components/plantel/EditarTipoParticipacaoButton.tsx` (dialog com select de tipo, atualização otimista via `router.refresh()` + `toast`, erro do servidor inline); `components/plantel/ParticipacoesAtleta.tsx` mostra o botão **«Editar»** ao lado de «Terminar» em cada participação ativa da época, com o mesmo gating `PROMOVER_ATLETAS` (`podeTerminar`). **Cenário resolvido:** promover «Infantis A» a principal despromove «Benjamins A» a simultânea na mesma transação; depois o utilizador pode editar «Benjamins A» de simultânea para ocasional. §8.5 (nova ação + bullet dedicado + gating) e §9 (lista de invariantes de escrita) atualizadas. Novos testes em `tests/participacoes.test.ts` (schema + action: permissão, isolamento multi-tenant, sem participação ativa, transação Serializable, alterar não-principal, promover com despromoção do principal anterior, não tocar noutra modalidade, recusa do único principal, revalidação, validação de época). UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. `npm run typecheck` limpo · `npm run lint` limpo · **1347 testes verdes**. **Não toca em auth.**
- **2026-08-26** — **Modo treino — auto-play da animação ao abrir o exercício (§8.8.2, §11.2).** No **Modo treino** (`components/treinos/ModoTreino.tsx`), ao visualizar um exercício cujo diagrama tem **animação guardada** (passos, §11.2), a animação passa a **arrancar sozinha em ciclo** assim que o painel do exercício abre — **sem clicar em play** — e recomeça automaticamente ao navegar para outro exercício com animação. **Só apresentação — sem alteração de schema, actions ou auth.** **(1) `CampoAnimado` (`components/campo/CampoAnimado.tsx`):** nova prop opcional **`autoPlay`** (default `false`, retrocompatível — as vistas de exercício §8.11 e de modelo de jogo §8.10 mantêm arranque manual). Com `autoPlay` e havendo animação (≥1 passo/keyframe além da base), o estado de ciclo inicia **ligado** (`loop`) e o efeito de reposição do frame base passa a **iniciar a reprodução** (`aPlay = autoPlay && keyframes.length > 1`) sempre que o diagrama muda; os controlos de play/pausa/reiniciar/velocidade/repetir mantêm-se disponíveis. **(2) `ModoTreino` (`DiagramaGrande`):** o parse do diagrama (`diagramaSchema.safeParse`) passa a ser **memoizado** (`useMemo` sobre o `diagrama`) — necessário porque o `CampoAnimado` deriva os keyframes da **identidade** do diagrama, e sem memo cada render reiniciaria a animação (ciclo de renders no autoPlay); quando o exercício tem passos, renderiza `CampoAnimado autoPlay` (em vez da `MiniaturaCampo` estática), caindo na miniatura estática quando não há animação. §8.8.2 (ponto 3, "Exercício atual em grande") atualizada. UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. `npm run typecheck` limpo · **1388 testes verdes**. **Não toca em auth.**
- **2026-08-26** — **Editor de campo — marcador da ponta da seta corrigido para setas à esquerda (§11.2).** Correção de um bug visual em que as setas a apontar para a **esquerda** (ângulo ~180°) mostravam a **cabeça deslocada/torta**. **Só apresentação/diagrama — sem alteração de schema, actions ou auth.** **Diagnóstico:** ao contrário do fix anterior (que corrigiu a *direção* do último segmento do trajecto de condução — verificada pelos testes que inspecionam o `d` do caminho), este defeito estava no próprio **`<marker>`**: a definição não tinha **`viewBox`** nem **`markerUnits`** explícito e o **`refX` (=4)** ficava a meio da cabeça (ponta em `x=6`). Sem `viewBox`, a auto-orientação (`orient="auto"`) é renderizada de forma **inconsistente no Chromium/WebKit** exatamente na rotação de ~180°, deixando a cabeça da seta desalinhada face ao fim da linha — daí só ser visível nas setas para a esquerda. Os testes existentes não o apanhavam por inspecionarem apenas a geometria do trajecto, não o marcador renderizado. **Correção:** novo componente **partilhado** `SetaMarker` (`components/campo/desenho.tsx`) com **`viewBox="0 0 10 10"`** (sistema de coordenadas bem definido → `orient="auto"` fiável em **todas** as direções), **`markerUnits="strokeWidth"`** explícito (preserva o tamanho visual anterior) e **`refX=9`/`refY=5`** (ponta quase coincidente com o fim da linha, cabeça assente sem sobreposição), com o triângulo `M0,0 L10,5 L0,10 z`. O `ElementoSVG` (setas do diagrama) e o `EditorCampo` (setas-fantasma da animação) passam ambos a usar o **mesmo** `SetaMarker`, eliminando a duplicação da definição do marcador. Novos testes de regressão em `tests/campo-setas.test.ts` (3 casos: por estilo, confirmam que o marcador renderizado tem `viewBox`, `orient="auto"` e `refX/refY` na ponta). §11.2 alinhada. `npm run typecheck` limpo · `npm run lint` limpo · **1329 testes verdes**. **Não toca em auth.**
- **2026-08-26** — **Listagens — etiqueta discreta de autor em Treinos, Jogos e Exercícios (§7.3, §8.8.2, §8.11, §3.3).** Cada item nas listas de **treinos (Sessão)**, **jogos** e **exercícios** passa a mostrar, num local discreto (texto `text-[10px]` em `text-cinza-400`), **«Criado por {nome}»** — para que dois treinadores do mesmo escalão saibam quem criou o quê. **Sem alteração de schema nem de auth** — reutiliza a relação **já existente** `criador Utilizador` (`Sessao.criadorId`/`Jogo.criadorId`/`Exercicio.criadorId`), que as três Server Actions de criação (`criarSessao`/`criarJogo`/`criarExercicio`) **já preenchiam** com o utilizador autenticado. **(1) Queries de listagem (`lib/actions/treinos.ts`, `lib/actions/jogos.ts`, `lib/actions/exercicios.ts`):** os `include` das listas (`INCLUDE_LISTA` de treinos e jogos; `listarExercicios`/`obterExercicio`) ganham `criador: { select: { id, nome } }`; em exercícios, o tipo `ExercicioBiblioteca` (e o interno `ExercicioComPartilhas`) ganham `criador: CriadorLite` (`{ id, nome } | null`), propagado por `anotar`. **(2) UI (`app/(app)/treinos/page.tsx`, `app/(app)/jogos/page.tsx`, `app/(app)/exercicios/page.tsx`):** cada card/linha mostra a etiqueta quando `criador` existe; registos legados sem `criador` (null) **não** mostram nada. **Investigação de permissão (treinador criar jogo no seu escalão):** confirmado por reprodução + regressão (`tests/permissoes-seccao.test.ts`) que `exigirCapacidade('JOGOS_GERIR', escalao)` **já autoriza** corretamente um treinador de âmbito `PROPRIOS_ESCALOES` com o escalão atribuído — sem defeito na lógica de permissão nem na associação Membro↔Escalão (`AtribuicaoEscalao` lida por `obterMembroAtual`); a causa real de um eventual «Sem permissão neste escalão» seria adesão ATIVA duplicada (agora impedida pela migração `MembroClube_utilizadorId_ativo_unique`) ou ausência de atribuição real do escalão. UI 100% pt-PT, sem dark mode. `npm run typecheck` limpo · **1326 testes verdes**. **Não toca em auth.**
- **2026-08-26** — **Analíticos — distinção entre sessões programadas e executadas (§10.2, §10.3).** O contador de sessões dos painéis de analíticos passa a **distinguir sessões programadas (todas as criadas) de sessões executadas / já realizadas (`data < agora`)**; as sessões futuras contam como programadas mas ainda por executar. **Só agregação/apresentação — sem alteração de schema, dados de negócio ou auth.** **(1) `obterAnaliticoEscalao` (`lib/actions/analise.ts`):** `AnaliticoEscalao` ganha o campo **`sessoesExecutadas`** (subconjunto de `sessoes`), calculado a partir da **mesma** lista de sessões já lida (que traz `data`) — sem query adicional (Regra Nº 6): `sessoes.filter(s => s.data < agora).length`. **(2) `obterAnaliticoClubeEpoca` (`lib/actions/analise.ts`):** `EscalaoResumoClube` e `AnaliticoClubeEpoca.totais` ganham **`sessoesExecutadas`**, via um segundo `sessao.groupBy` filtrado por `data: { lt: new Date() }` (por escalão), agregado nos totais. **(3) UI — `PainelEscalao`:** o KPI de sessões passa a **«sessões realizadas»** no formato `executadas/programadas` (ex.: `67/89`). **(4) UI — `PainelClube`:** o KPI equivalente mostra `executadas/programadas` e a tabela de escalões ganha a coluna **«Realizadas»**; o recálculo client-side do filtro de modalidade (`calcularTotais`) inclui `sessoesExecutadas`. Snapshots antigos de relatórios (sem o campo) fazem **fallback ao total** (`?? sessoes`), garantindo zero regressão na vista pública. A **taxa de assiduidade não muda** — continua a usar o total de sessões como denominador; a distinção é puramente informativa. §10.2 e §10.3 atualizadas. Novos testes em `tests/analise-f9.test.ts` (escalão com sessão futura → `sessoes=3`, `sessoesExecutadas=2`; clube com programadas≠executadas por escalão e nos totais). `npm run typecheck` limpo · **1326 testes verdes**. **Não toca em auth.**
- **2026-08-26** — **Treinos — estado "concluído" (badge, "Ver treino" e confirmação ao editar) + distinção visual na lista (§8.8.2, §8.9.1).** Um treino cuja data é **estritamente anterior a hoje** passa a ser tratado como **concluído** em toda a UI de treinos (um treino marcado para hoje ainda NÃO conta como concluído). **Sem alteração de schema, dados de negócio ou auth — só apresentação/navegação.** **(1) Helper puro (`lib/semana.ts`):** novos `inicioDoDia(d)` (00:00 local de `d`) e **`treinoConcluido(data, agora = new Date())`** (`data < inicioDoDia(agora)`), partilhados entre lista e detalhe. **(2) Detalhe (`app/(app)/treinos/[id]/page.tsx`):** calcula `concluido = treinoConcluido(s.data)`; cabeçalho ganha **badge "Concluído"** (cinza neutro, ícone `CheckCircle2` — nunca laranja, reservado a ações ativas); o CTA principal passa de **"Iniciar treino"** para **"Ver treino"**. **(3) `IniciarTreinoBotao` (`components/treinos/IniciarTreinoBotao.tsx`):** nova prop `concluido`; quando `true` o botão mostra **"Ver treino"** (estilo neutro/contorno, ícone `Eye`), abre o mesmo overlay `ModoTreino` em modo de revisão e **ignora sessões suspensas** (localStorage), que só fazem sentido na condução ao vivo. **(4) Editar treino concluído (`components/treinos/EditarTreinoBotao.tsx`, novo):** o botão "Editar" do detalhe passa por este componente cliente — treinos futuros/de hoje navegam diretamente (Next `Link`); treinos concluídos abrem um **`AlertDialog`** de confirmação (*"Editar treino já realizado?"* / *"Este treino já foi realizado. Tens a certeza que queres editá-lo?"* — **[Cancelar]** / **[Editar mesmo assim]** via `router.push`). **(5) Lista de treinos (`app/(app)/treinos/page.tsx`):** cada sessão calcula `treinoConcluido(s.data)`; as concluídas ficam **visualmente apagadas** (fundo `cinza-50/40`, data e etiqueta de momento em cinza) e ganham a badge **"Concluído"**, tornando imediata a distinção passado vs próximos **sem ler a data**; futuros mantêm o aspeto normal/ativo. §8.8.2 (cabeçalho, ponto 3, novo bloco "Estado concluído" e casos-limite) e §8.9.1 alinhadas. Novos testes em `tests/semana.test.ts` (`inicioDoDia` e `treinoConcluido` — ontem/hoje-manhã/hoje-noite/amanhã). UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. `npm run typecheck` limpo. **Não toca em auth.**
- **2026-08-26** — **Editor de campo — escadinha e barras para saltos (§11.2).** Dois novos elementos de treino de agilidade/coordenação no editor de campo, ambos com **rotação** (`angulo`) para orientação livre. **Só apresentação/diagrama — sem alteração de auth, dados de negócio ou actions.** **(1) Schema (`lib/schemas/exercicio.ts`):** novos `escadinhaSchema` (`x`, `y`, `angulo` 0–360 [default 0], `tamanho` `"pequena" | "media" | "grande"` [default `"media"`]) e `barrasSchema` (`x`, `y`, `angulo` 0–360 [default 0]), ambos acrescentados ao `elementoCampoSchema`; novos tipos exportados `TamanhoEscadinha`, `Escadinha`, `Barras`. **(2) Render (`components/campo/desenho.tsx`):** o `ElementoSVG` desenha a **escadinha** (amarela `ESCADINHA_COR`) como dois trilhos paralelos com degraus horizontais — nº de degraus derivado do tamanho via `ESCADINHA_DEGRAUS` (pequena=4, média=6, grande=8) — e as **barras** (azuis `BARRAS_COR`) em forma de ⊓ (duas hastes + barra superior); ambos aplicam `transform rotate(angulo)` em torno de (x,y). Como todos os componentes de campo renderizam via `ElementoSVG`, os elementos propagam a toda a app (editor, miniatura, animação). **(3) Editor (`components/campo/EditorCampo.tsx`):** duas novas ferramentas na toolbar com **miniatura SVG inline** (alvo ≥44px); controlos contextuais de **tamanho** (escadinha) e **rotação** (ambos — presets 0°/45°/90°/135°) ao colocar; no modo **Selecionar**, uma escadinha/barras já colocada pode ser **rodada** (e a escadinha **redimensionada**) com registo no histórico/undo. Suportam seleção, arrasto, teclado e animação (passos) como qualquer elemento-ponto. **(4) Acessibilidade (`components/campo/animacao.ts`):** `rotuloElemento` inclui os novos elementos (ex.: «Escadinha de agilidade (media)», «Barras para saltos»). §11.2 atualizada. Novos testes em `tests/schemas.test.ts` (escadinha mínima c/ defaults, ângulo/tamanho explícitos, tamanho inválido, ângulo fora do intervalo; barras c/ default, ângulo explícito, coordenadas fora do campo). UI 100% pt-PT, alvos de toque ≥44px. `npm run typecheck` limpo · `npm run lint` limpo · **1322 testes verdes**. **Não toca em auth.**
- **2026-08-26** — **Editor de campo — ponta da seta de condução alinhada com a direção (§11.2).** Correção da orientação da ponta (cabeça) das setas no editor de campo (`components/campo/desenho.tsx`, `pathOndulado`). **Só apresentação/diagrama — sem alteração de schema, actions ou auth.** **Diagnóstico:** as setas **retas** (estilos «movimento» e «passe») já orientavam a ponta corretamente em **todas** as direções (esquerda/direita/cima/baixo/diagonal) — o `<marker markerEnd orient="auto">` roda a cabeça pela direção do último segmento do trajecto, pelo que uma seta para a esquerda aponta para a esquerda (verificado: `head=180°` para a esquerda, `diff=0`); **não havia inversão** nas setas retas. O defeito real era nas setas de **condução** (trajecto ondulado): como a última ondulação terminava **fora** da linha central, o último segmento apontava ~14° ao lado da direção real do movimento, deixando a ponta «torta» (e a apontar para o lado em vez de para a frente). **Correção:** em `pathOndulado`, as **duas últimas amplitudes assentam na linha central** (`amp = k >= ondas - 1 || k % 2 === 0 ? 0 : 3`), garantindo que o segmento final fica colinear com a direção da seta e a ponta aponta no sentido correto — para condução em qualquer direção. Novo teste de regressão `tests/campo-setas.test.ts` (18 casos: 3 estilos × 6 direções) valida que o desvio da ponta face à direção real é < 1°. §11.2 alinhada. `npm run typecheck` limpo · **1315 testes verdes**. **Não toca em auth.**
- **2026-08-26** — **Dashboard — reuniões separadas em "Próximas" e "Reuniões anteriores" (§8.13, §8.16).** No Início, as reuniões afixadas já passadas deixavam de ser corretamente separadas: por serem ordenadas por data ascendente, as reuniões afixadas com data anterior a hoje surgiam no topo da secção **"Próximas reuniões"**. A apresentação passa a ter **dois grupos**: **(1) "Próximas reuniões"** — reuniões **futuras** (`data >= hoje`), afixadas ou não, ordenadas por data **ascendente**; **(2) "Reuniões anteriores"** — reuniões **afixadas já passadas** (`data < hoje`), ordenadas por data **descendente**. Reuniões passadas não afixadas continuam a não aparecer no dashboard. **(a) Server Action `obterReunioesParaDashboard` (`lib/actions/reunioes.ts`):** o tipo de retorno passa de `Resultado<Reuniao[]>` para `Resultado<{ proximas: Reuniao[]; anteriores: Reuniao[] }>`; usa **duas consultas independentes** em `Promise.all` (próximas: `data >= inicioHoje`, `orderBy asc`, `take 5`; anteriores: `afixada = true` + `data < inicioHoje`, `orderBy desc`, `take 5`) partilhando o mesmo **filtro de âmbito** (clube + escalões legíveis, respeitando `escaloesLegiveis`). **(b) Dashboard (`app/(app)/dashboard/page.tsx`):** consome os dois grupos e renderiza duas secções; o cartão de reunião foi extraído para o componente reutilizável `CartaoReuniao` (partilhado pelas duas secções, sem duplicação de markup). **(c) Testes (`tests/reunioes.test.ts`):** atualizados para validar os dois grupos (ordenação asc/desc, `take 5` por grupo, filtro de âmbito partilhado nas duas consultas). §8.13 e §8.16 atualizadas. **Só apresentação/agregação — sem alteração de schema; não toca em auth.** `npm run typecheck` limpo · **1377 testes verdes**.
- **2026-08-26** — **Editor de campo — cones multicolor (§11.2).** O elemento `Cone` do diagrama passa a suportar uma **cor opcional** para distinguir percursos/estações no mesmo exercício. **Só apresentação/diagrama — sem alteração de auth, dados de negócio ou actions.** **(1) Schema (`lib/schemas/exercicio.ts`):** novo `corConeSchema` (enum `"laranja" | "amarelo" | "vermelho" | "azul" | "verde" | "branco"`) e campo **opcional** `cor` no `coneSchema`; novo tipo exportado `CorCone`. Ausente → **laranja** (default/retrocompatível — diagramas gravados antes do multicolor continuam válidos). **(2) Render (`components/campo/desenho.tsx`):** paleta partilhada `CONE_CORES` (preenchimento + contorno escuro por cor) e `CONE_COR_DEFAULT`; `ElementoSVG` desenha o cone com a cor persistida (fallback laranja). Como todos os componentes de campo (`EditorCampo`, `MiniaturaCampo`, `CampoDesenho`, `CampoAnimado`) renderizam via `ElementoSVG`, a cor propaga a toda a app. **(3) Editor (`components/campo/EditorCampo.tsx`):** a ferramenta **Cone** ganha um seletor de cor (alvos de toque ≥44px, `aria-pressed`/`title`) que define a cor do próximo cone; no modo **Selecionar**, um cone já colocado pode ser **recolorido** (com registo no histórico/undo). **(4) Acessibilidade (`components/campo/animacao.ts`):** `rotuloElemento` inclui a cor no `aria-label` do cone (ex.: «Cone (azul)»). §11.2 atualizada. Novos testes em `tests/schemas.test.ts` (cone sem cor, seis cores válidas, cor inválida rejeitada). UI 100% pt-PT, sem dark mode. `npm run typecheck` limpo · `npm run lint` limpo · **1297 testes verdes**. **Não toca em auth.**
- **2026-08-24** — **Backoffice — atalho de navegação para admins + acesso robusto de conta híbrida (§21.1).** Solução definitiva para o acesso ao backoffice `/admin` a partir da app, **sem tocar em auth** (só Server Components/navegação e reutilização do `admin-guard.ts`). **(1) Atalho "Backoffice":** o componente `components/layout/Navegacao.tsx` ganha a prop **`mostrarAdmin`** e, quando `true`, apresenta um item **"Backoffice"** (ícone `ShieldCheck`) no **fim** da navegação (sidebar + menu "Mais" da bottom-nav), isolado das vistas de clube. **(2) Layout `(app)`:** `app/(app)/layout.tsx` avalia `eAdminPlataforma(email)` **uma vez** (`eAdmin`) e reutiliza o resultado para o redirect de onboarding (admin **sem** clube → `/admin`, comportamento existente) **e** para `mostrarAdmin={eAdmin}`. **(3) Conta híbrida:** um admin **com** `MembroClube` ativo deixa de ficar sem forma de chegar ao backoffice — não é redirecionado (permanece no dashboard) mas passa a ver o atalho. O item é **apenas visibilidade**; o acesso continua re-validado server-side por `exigirAdminPlataforma()` no grupo `(admin)`. O **seed** já marca `admin@mister.app` com `isAdmin: true` via upsert idempotente (re-correr `npm run db:seed` faz backfill em bases já semeadas). §21.1 atualizada. `npm run typecheck` limpo; 1294 testes verdes. **Não toca em auth.**
- **2026-08-24** — **Backoffice — admin persistido na BD (`Utilizador.isAdmin`) + gestão de contas dentro de uma licença de clube (§21.1, §21.2).** Duas melhorias do backoffice de plataforma, **sem tocar em auth** (o `admin-guard.ts` é camada de **autorização**, separada de `lib/auth.ts`/`middleware.ts`/JWT). **(1) Admin persistido na BD:** o `Utilizador` ganha o campo **`isAdmin Boolean @default(false)`** (migração aditiva `20260824140000_add_utilizador_is_admin` — uma coluna `BOOLEAN NOT NULL DEFAULT false`, sem impacto em dados existentes), substituindo a allowlist da variável de ambiente `ADMIN_EMAILS`. `lib/admin-guard.ts`: `eAdminPlataforma(email)` passa a **`async`** e consulta a BD (`Utilizador.isAdmin` por email case-insensitive) em vez de `process.env.ADMIN_EMAILS`; `exigirAdminPlataforma()` faz `await`; `app/(app)/layout.tsx` atualiza a chamada para `await eAdminPlataforma(...)` no routing do admin (rota pura, auth intocada). O **seed** marca `admin@mister.app` com `isAdmin: true` (upsert idempotente, `update: { isAdmin: true }` para bases já semeadas). `ADMIN_EMAILS` removida de `.env.example`. **(2) Gestão de contas dentro de uma licença de clube:** na `TabelaLicencas`, cada licença de **Clube** ganha um **drill-down** (chevron + botão "Contas") que lista os membros do clube (nome, email, perfil, estado, badge de Admin). Novas Server Actions cross-tenant em **`lib/actions/admin-membros.ts`** (`listarMembrosClube`, `editarUtilizadorAdmin`, `alterarEstadoMembroAdmin`), gated por `exigirAdminPlataforma()`: **editar** dados básicos de uma conta (nome + email, com erro tratável em colisão de email) e **suspender/reativar** uma conta individual (`MembroClube.estado` `INATIVO`↔`ATIVO`, com `dataSaida` e guarda da invariante de uma única adesão ativa por conta). Novos schemas Zod (`EditarUtilizadorSchema`, `AlterarEstadoMembroSchema`, `ClubeIdSchema` em `lib/schemas/admin.ts`) e componentes cliente `GestaoMembrosClube.tsx` + `DialogEditarUtilizador.tsx`. §21.1 e §21.2 atualizadas. `tests/admin.test.ts` reescrito (eAdminPlataforma agora DB-backed/async) + cobertura dos novos schemas. UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. **Não toca em auth.**
- **2026-08-24** — **Feat: especificação da feature Mano-a-Mano (duelos 1×1) (§6.2, §6.6, §16 Fase 33, §22, Apêndice C).** Adicionada a especificação funcional completa da nova feature **Mano-a-Mano** — competições de **duelos 1×1** entre atletas (ligas anuais e torneios), intra-clube ou inter-clubes (contra atletas de clubes externos sem conta Mister). **(1) Nova secção 22** com o modelo de dados (novos modelos `CompeticaoManoMano`, `ClubeExterno`, `ParticipanteManoMano`, `MatchManoMano`; enums `TipoManoMano`, `AmbitoManoMano`, `FormatoTorneioManoMano`, `FormatoDuelo`, `EstadoManoMano`, `EstadoMatch`, `TipoParticipante`), regras de negócio (formato por defeito «primeiro a marcar 2 golos» → só 2–0/2–1; vencedor derivado automaticamente; ordem de desempate; geração de fixtures round-robin/bracket com byes; classificação **calculada, não persistida**), Server Actions (`lib/actions/mano-a-mano.ts`), rotas (`/mano-a-mano*`) e integração com treinos/dashboard/analítica. **(2) §6.2:** nova capacidade **`MANOAMANO_GERIR`** (dados de equipa). **(3) §6.6:** distribuição da capacidade — Administrador/Diretor Técnico/Coordenador de Secção/Treinador Principal recebem `MANOAMANO_GERIR`; o Adjunto não a recebe mas regista duelos em treino via `TREINOS_GERIR`. **(4) §16:** nova **Fase 33 — Mano-a-Mano** (sub-passos 33.1–33.7). **Gamificação = FUTURO.** **Só documentação — a implementação de código segue este contrato; não toca em auth.**
- **2026-08-24** — **Doc — remoção do campo residual `parteTreino` do modelo `SessaoExercicio` (§3.5).** O bloco do modelo `SessaoExercicio` documentava o campo `parteTreino ParteTreino?`, que **nunca existiu** no `prisma/schema.prisma` real — sem schema Zod, sem Server Action e sem UI associados. Era um resíduo de documentação que dessincronizava a bíblia do schema real. Linha removida de §3.5, alinhando a bíblia com o `SessaoExercicio` efetivo. O enum `ParteTreino` mantém-se **inalterado** e correto nas suas referências legítimas noutros modelos (`Exercicio`, `ModeloSessaoExercicio`). **Só documentação — sem alteração de código, schema ou auth.**
- **2026-08-24** — **Treinos — adaptação de exercício por sessão + modal de diagrama + pausa do cronómetro (§3.5, §7.3, §8.8.2).** Concretização da adaptação de exercícios ao nível da sessão (não altera a biblioteca) e melhorias de condução, em duas fases. **(1) Schema (`prisma/schema.prisma` — `SessaoExercicio`):** dois campos novos — **`series Int?`** (nº de séries/repetições específico desta sessão) e **`descricaoOverride String? @db.Text`** (montagem/instrução própria desta sessão, sobrepõe a descrição da biblioteca); o campo `notas String? @db.Text` já existia. §3.5 alinhada. **(2) Backend:** novo schema Zod **`sessaoExercicioOverrideSchema`** (`lib/schemas/treino.ts` — `duracaoMin` 1–180, `series` 1–99, `descricaoOverride`/`notas` ≤2000, todos nullable/opcionais) e nova Server Action **`atualizarExercicioSessao(sessaoExercicioId, dados)`** (`lib/actions/treinos.ts`) que grava os overrides do exercício **por sessão**, com isolamento multi-tenant (`sessao.escalao.clubeId`) e capacidade **`TREINOS_GERIR`** no escalão; revalida `/treinos/[id]`. §7.3 anota a assinatura. **(3) Frontend — novos componentes:** `components/treinos/AdaptarExercicioDialog.tsx` (diálogo para adaptar um exercício a uma sessão específica — campos duração, séries, montagem, notas — sem modificar a biblioteca original) e `components/treinos/ModalDiagramaExercicio.tsx` (modal que mostra o diagrama do exercício em grande ao clicar no card). **(4) Frontend — componentes modificados:** `components/treinos/GestorExercicios.tsx` (botão **"Adaptar"** por exercício com ícone `SlidersHorizontal`; diagrama clicável para ver em grande); `components/treinos/ModoTreino.tsx` (**pausa/retoma do cronómetro** via botão `Pause`/`Play` sem reiniciar a contagem; mostra **séries**, **descrição override** e **notas do treinador** do exercício ativo); `app/(app)/treinos/[id]/page.tsx` (passa `notas`, `series` e `descricaoOverride` do `SessaoExercicio` aos componentes). §8.8.2 (secção "Exercícios com conteúdo real" e "Modo treino") atualizada. UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. **Não toca em auth.**
- **2026-08-24** — **UX — Sidebar colapsada por defeito em tablet (§8).** A navegação lateral (`components/layout/Navegacao.tsx`) ganha um **estado colapsado (só ícones, 64px)** além do expandido (ícone + rótulo, 224px), com um **botão de alternância** no topo (ícones `PanelLeftOpen`/`PanelLeftClose`, alvo ≥44px, `aria-label`/`aria-pressed`/`title`). **Por defeito arranca colapsada em tablet (md–xl, ~768–1279px, incluindo iPad em paisagem a 1024/1194px) e expandida em desktop (≥xl, ≥1280px)**; em móvel (<md) mantém-se a bottom-nav inalterada. O default responsivo é aplicado por classes CSS (sem `override`), garantindo **1.ª pintura sem flash nem divergência de hidratação**; quando o utilizador alterna manualmente, a preferência vence em todos os tamanhos ≥md e é **persistida em `localStorage`** (`mister:sidebar-colapsada`). No estado colapsado os `Link` mantêm `aria-label`/`title` com o rótulo para acessibilidade e tooltip. **Só apresentação — sem alteração de schema, actions ou auth.** §8 (descrição de navegação) atualizada. **typecheck 0 erros · lint limpo.**
- **2026-08-24** — **Fix — `mostrarCargaTreino` e `mostrarEncarregadoEducacao` reconhecem nomes tradicionais de escalão (§8.5, §8.8).** As duas funções de decisão de UI (`lib/utils.ts`) passam a reconhecer os **nomes tradicionais de escalão** de formação jovem — «Benjamins», «Infantis», «Iniciados», «Petizes», «Traquinas», «Juvenis», etc. — além dos padrões `Sub-N`. Antes, um escalão nomeado à maneira tradicional (em vez de «Sub-12», «Sub-15»…) não era detetado como formação jovem, pelo que a app **mostrava** indevidamente o RPE (carga de treino) a menores e **não abria** por defeito o bloco de encarregado de educação. Agora, escalões com nomes tradicionais de jovens: `mostrarCargaTreino` devolve `false` (RPE bloqueado, coerente com Sub-≤N) e `mostrarEncarregadoEducacao` devolve `true` (bloco EE aberto por defeito). **Só apresentação/heurística de UI — sem alteração de schema, actions ou auth.**
- **2026-08-24** — **Fix — Cartões e suspensões ocultos em jogos de formação jovem (§7.3, §8.11).** No detalhe do jogo, `JogoDetalhe` (`components/jogos/JogoDetalhe.tsx`) passa a receber um flag **`escalaoJovem`** — calculado na página `app/(app)/jogos/[id]/page.tsx` a partir do escalão do jogo — e, quando ativo, **oculta os campos de cartão amarelo/vermelho** na grelha de estatísticas e **suprime os alertas/badges de suspensão** por acumulação de cartões (§8.11). Na formação jovem o registo disciplinar de cartões não se aplica, pelo que estes controlos deixavam de fazer sentido e induziam erro. **Só apresentação — sem alteração de schema nem de actions; não toca em auth.**
- **2026-08-24** — **Fix — Bloco de encarregado de educação abre em modo edição para Sub-≤16 (§8.5).** No formulário de atleta (`components/plantel/AtletaForm.tsx`), o bloco colapsável de **encarregado de educação** deixava de abrir por defeito em **edição** de atleta menor devido a uma condição `!emEdicao` que só o expandia na criação. Removida essa condição: o bloco EE passa a **abrir sempre por defeito para escalões de formação jovem (Sub-≤16)**, tanto na **criação** como na **edição** do atleta, mantendo os campos sempre presentes no DOM (o `<details>` só controla a visibilidade). **Só apresentação — sem alteração de schema nem de actions; não toca em auth.**
- **2026-08-24** — **BUG-P1-09 — Botões de escrita nas Definições condicionados por capacidade + índice filtrado (§6.7, §8.4).** As páginas de Definições passam a **ocultar os controlos de escrita** (criar/editar/apagar) a utilizadores sem a capacidade relevante, deixando o conteúdo em modo leitura para quem só tem acesso de visualização (ex.: Presidente com `RELATORIOS_VER`). **Só gating de apresentação — sem alteração de schema, actions ou auth (o servidor já valida via `exigirCapacidade`; esta é a segunda linha, na UI).** **(1) 7 páginas de Definições** (`app/(app)/definicoes/*/page.tsx`) avaliam a capacidade correspondente e passam-na aos componentes de lista, que só renderizam botões de escrita quando presente: **escalões** (`CLUBE_ESCALOES`), **branding** (`CLUBE_BRANDING`), **épocas** (`CLUBE_EPOCAS`), **métricas** (`CLUBE_METRICAS`), **habilidades** (`CLUBE_HABILIDADES`), **subcategorias** (`CLUBE_SUBCATEGORIAS`) e **perfis** (`CLUBE_PERFIS`). Componentes de lista afetados em `components/definicoes/*Lista.tsx`. **(2) Índice de Definições filtrado:** a página-índice de `/definicoes` passa a mostrar **apenas as secções acessíveis** ao utilizador (cada card é gated pela capacidade da respetiva secção), evitando cul-de-sacs de "Sem permissão". Um utilizador só de leitura vê um índice reduzido às secções que pode efetivamente consultar. **typecheck 0 erros · lint limpo.**
- **2026-08-24** — **UX — Tabs de plantel limitados ao âmbito do utilizador (§6.7, §8.5).** Na lista do plantel (`app/(app)/plantel/page.tsx`), os **tabs por escalão** passam a respeitar o âmbito do utilizador: um treinador de âmbito **`PROPRIOS_ESCALOES`** vê apenas os tabs dos **seus escalões atribuídos** (via `escaloesLegiveis`), em vez de todos os escalões do clube. Utilizadores de âmbito `TODO_CLUBE`/`SECCAO` mantêm a visão alargada (todos os escalões / os da secção). Alinha a navegação com a autorização já aplicada no servidor (as queries de plantel já filtravam pelos escalões legíveis; faltava esconder os tabs vazios/inacessíveis). **Só apresentação — sem alteração de schema, actions ou auth.** UI 100% pt-PT, sem dark mode.
- **2026-08-24** — **Perfis de arranque — Diretor Técnico ganha gestão de utilizadores (BUG-P1-05) e novo perfil Presidente (§6.6).** Ajuste ao catálogo `PERFIS_ARRANQUE` (`lib/permissoes-catalogo.ts`), sem alteração de schema nem de auth. **(1) Diretor Técnico:** passa a incluir **`CLUBE_UTILIZADORES`** para poder **convidar e gerir treinadores/membros** (§8.2) — a mesma capacidade que as ações de `utilizadores.ts`/`membros.ts`/`seccoes.ts` (membros) exigem. **NÃO** recebe `CLUBE_PERFIS`: a definição de perfis de permissão e o estatuto de administrador (que exige `CLUBE_UTILIZADORES` **e** `CLUBE_PERFIS` — ativar licença demo, config de infra) continuam exclusivos do Administrador; assim o DT gere pessoas sem acesso financeiro nem de configuração de infra. Nenhuma outra capacidade em falta face ao Administrador se justificava (branding/épocas/escalões/perfis são estrutura/config de conta). **(2) Presidente:** novo modelo de arranque `TODO_CLUBE` com **apenas `RELATORIOS_VER`** — a única capacidade de leitura do catálogo (analíticos e relatórios). A **licença** é visível a qualquer membro (`obterLicenca` só exige adesão ativa, não é gated por capacidade) e a **configuração do clube** fica em leitura pela **ausência** das capacidades `CLUBE_*` de escrita; sem nenhuma capacidade `_GERIR`, não gere membros, perfis, treinos, jogos nem plantel. Segue o padrão do perfil «Presidente (Visualização)» já usado no `seed-teste.ts`, agora criado por defeito em cada clube novo. §6.6 e enumeração de arranque (§6) atualizadas. `tests/novaEpoca.test.ts` passa a esperar **6** perfis de arranque. **Não toca em auth.** **typecheck 0 erros · 1287 testes verdes.**
- **2026-08-24** — **Segurança — `listarMembros` passa a exigir `CLUBE_UTILIZADORES`; novo `listarMembrosBasico` para identidade não sensível (§7.3, §8.2).** Correção de fuga de dados: `listarMembros()` (`lib/actions/utilizadores.ts`) verificava apenas a adesão ativa (`obterMembroAtual`), pelo que **qualquer** membro do clube podia enumerar a lista completa de membros com **email, perfil, capacidades efetivas e escalões** — mesmo sem permissão de gestão. **(1)** `listarMembros` passa a exigir a capacidade **`CLUBE_UTILIZADORES`** (via `exigirCapacidade`), a mesma que autoriza as mutações de gestão de membros; um membro sem ela recebe "Sem permissão" e a query nem corre. **(2)** Como os perfis *Treinador Principal* e *Diretor Técnico* têm `LEMBRETES_EQUIPA_GERIR` mas **não** `CLUBE_UTILIZADORES`, o seletor de destinatários de lembretes (§8.19) e o seletor de coordenadores de secção (§8.22) precisavam apenas de **id + nome** — foi criada a Server Action de menor privilégio **`listarMembrosBasico()`** (devolve `{ membroId, utilizadorId, nome }`, legível por qualquer membro ativo, sempre filtrada pelo `clubeId` da adesão ativa, **sem expor email/perfil/capacidades**). `components/lembretes/ListaLembretes.tsx` e `app/(app)/definicoes/seccoes/page.tsx` passam a usar `listarMembrosBasico`; a página de administração `app/(app)/definicoes/utilizadores/page.tsx` mantém `listarMembros` (dados sensíveis, já com `EstadoErro` para quem não tem a capacidade). **(3)** Verificado que `listarEscaloes` (`lib/actions/escaloes.ts`) e `listarMetricas` (`lib/actions/metricas.ts`) — dados de configuração partilhados — mantêm o guard mínimo adequado via `obterClubeIdAtual()` (devolve `null` sem adesão ativa e filtra sempre pelo clube), pelo que **não** foram alteradas. §7.3 (assinaturas) atualizada. **Não toca em auth.** **typecheck 0 erros · 1287 testes verdes** (novos casos: guard de `listarMembros` + cobertura de `listarMembrosBasico`).
- **2026-08-24** — **Analíticos do clube — balanço de época agregado (GAP-P2-06) (§10.3).** O agregado transversal do clube passa a expor um **balanço de resultados de toda a época**, somando os `Jogo` de **todos os escalões visíveis** e de **todos os tipos** (campeonato, taça, amigável). **Só apresentação/agregação — sem alteração de schema nem de auth.** **(1) `obterAnaliticoClubeEpoca` (`lib/actions/analise.ts`):** o resultado ganha o campo `balanco: BalancoEpocaClube` (`vitorias`, `empates`, `derrotas`, `jogos`, `golosMarcados`, `golosSofridos`), derivado da **mesma fonte** que já alimentava `totais` (os jogos de todos os escalões, agregados por `resultadoJogo`), reexposto como bloco V/E/D + golos autónomo — sem query nem recálculo adicional (Regra Nº 6). Novo tipo exportado `BalancoEpocaClube`. **(2) UI (`components/analiticos/PainelClube.tsx`):** a grelha nua de V/E/D é substituída pela secção **«Resultados da época»** — 3 `Cartao` (🟢 vitórias · ⬜ empates · 🔴 derrotas) e uma linha secundária «X jogos | X golos marcados / X sofridos». O balanço **respeita o filtro de modalidade** client-side (com filtro ativo recalcula do subconjunto via `balancoDe`; sem filtro usa `dados.balanco`, com **fallback** aos totais em snapshots antigos sem o campo). **(3) Teste:** `tests/analise-f9.test.ts` — o cenário de agregação do clube passa a validar `dados.balanco` (V/E/D + golos somados dos 2 escalões). §10.3 atualizada. **typecheck 0 erros · lint limpo · 1282 testes verdes.**
- **2026-08-24** — **Jogo — suspensões por acumulação de cartões na convocatória (BUG-P1-04) (§7.3, §8.11).** Nova lógica que sinaliza, na convocatória do **próximo jogo** do escalão, os atletas **suspensos**. **Sem alteração de schema** (usa os campos existentes `EstatisticaAtleta.cartaoAmarelo`/`cartaoVermelho`) e **sem tocar em auth**. **(1) Server Action `obterSuspensoesPendentes(escalaoId): Resultado<SuspensaoPendente[]>` (`lib/actions/jogos.ts`):** segue o padrão do ficheiro (contexto → `contexto()` valida clube+época → `escalao.findFirst` isola o multi-tenant → `podeLerEscalao`). Resolve o **próximo jogo** do escalão (`data > agora`, `epocaId` ativa, `orderBy data asc`) e, para cada convocado, lê os cartões dos jogos **já jogados** (`data < agora`) do escalão/época; devolve suspensão quando (a) recebeu **cartão vermelho no último jogo jogado** (motivo `CARTAO_VERMELHO`, com `cartaoVermelhoNoJogoId`) ou (b) acumula **≥ `LIMITE_AMARELOS_SUSPENSAO` (3) amarelos na época** (motivo `ACUMULACAO_AMARELOS`, com `amarelosAcumulados`; simplificação assumida: contam-se todos os amarelos da época, sem purga por jornada). O **vermelho tem prioridade** sobre os amarelos. Sem próximo jogo ou sem convocados → `[]`. **(2) Tipos partilhados (`lib/schemas/jogo.ts`):** `SuspensaoMotivo`, `SuspensaoPendente`, `LABEL_SUSPENSAO` e a constante `LIMITE_AMARELOS_SUSPENSAO = 3` (módulo puro cliente/servidor). **(3) UI (`app/(app)/jogos/[id]/page.tsx` + `components/jogos/JogoDetalhe.tsx`):** a página só calcula/passa as suspensões quando o jogo aberto **é** o próximo jogo do escalão (evita falsos positivos em jogos passados ou noutros futuros); o sub-separador *Convocados* mostra um **alerta 🚫 no topo** com a lista de suspensos e um **badge por atleta** (motivo + nº de amarelos no *title*). **(4) Testes:** `tests/suspensoes.test.ts` (12) — auth/época/multi-tenant/permissão, sem próximo jogo, sem convocados, vermelho no último jogo, vermelho cumprido em jogo anterior, acumulação de 3 amarelos, <3 amarelos sem vermelho, prioridade do vermelho e múltiplos atletas. **typecheck 0 erros · lint limpo · 1282 testes verdes.**
- **2026-08-24** — **Analíticos do escalão — ranking de disciplina (GAP-P2-14) (§3.7, §8.16, §10.2).** Nova secção **«Disciplina»** no painel de escalão (`components/analiticos/PainelEscalao.tsx`), a seguir aos restantes KPIs. Mostra dois `CartaoKpi` com os **totais de cartões** da época — 🟨 amarelos e 🟥 vermelhos — e um **top 5 «Mais indisciplinados»** (atletas ordenados por cartões acumulados). A secção é **condicional** (`temDisciplina`): só aparece quando há pelo menos um cartão ou uma entrada de ranking, pelo que analíticos antigos sem os campos `cartoes`/`rankingDisciplina` degradam com segurança (defaults `{ amarelos: 0, vermelhos: 0 }` e `[]`). Alimentado pelos campos `cartaoAmarelo`/`cartaoVermelho` das estatísticas de jogo (§3.7). **Só apresentação — sem alteração de schema nem de actions.** UI 100% pt-PT, sem dark mode.
- **2026-08-24** — **Analíticos do clube — filtro por modalidade (GAP-P2-04) (§8.16, §10.2).** O painel de clube (`components/analiticos/PainelClube.tsx`) ganha um **selector client-side «Todos | Futsal | Futebol»**, visível **só quando o clube tem escalões de ≥2 modalidades** (`modalidadesPresentes.length >= 2`). Ao filtrar, o subconjunto de escalões é reduzido à modalidade escolhida e os **KPIs são recalculados** sobre esse subconjunto (rótulos via `LABEL_MODALIDADE`); com 1 modalidade o filtro não aparece e o comportamento mantém-se inalterado. Para o alimentar, `obterAnaliticoClubeEpoca` (`lib/actions/analise.ts`) passa a incluir `seccao: { select: { modalidade: true } }` na leitura dos escalões, expondo a **modalidade da secção** por escalão. **Só filtragem de apresentação — sem alteração de schema nem das agregações de fundo.** UI 100% pt-PT, sem dark mode.
- **2026-08-24** — **Plantel — bloco de encarregado de educação colapsável (UX-P3-08) (§8.5).** No formulário de atleta (`components/plantel/AtletaForm.tsx`), os campos do **encarregado de educação** (`encarregadoNome`/`encarregadoContacto`/`encarregadoEmail`) passam a viver dentro de um **`<details>`** que abre por omissão apenas quando o atleta é **menor** — a decisão usa `mostrarEncarregadoEducacao(escalao.nome)` (`lib/utils.ts`) sobre o escalão selecionado (Sub-≤16 → `open`; seniores → colapsado). Os campos **mantêm-se sempre no DOM** (o `<details>` apenas os esconde visualmente), pelo que a submissão do formulário e a validação Zod não mudam. **Só apresentação — sem alteração de schema nem de actions.** Alvos de toque ≥44px, 100% pt-PT, sem dark mode.
- **2026-08-24** — **Treinos — distinção clara entre Plano semanal e Periodização (UX-P3-05) (§8.8.1, §8.9.1).** Melhoria de UX para treinadores solo que não distinguiam os dois conceitos. **Só apresentação — sem alteração de lógica de negócio, dados ou actions.** **(1) Descrições nas páginas:** `/treinos/planos` (`app/(app)/treinos/planos/page.tsx`) ganha um subtítulo por baixo do `<h1>` — *«Distribui os treinos da semana por dias e objetivos.»*; a página `/treinos/periodizacao` (subtítulo em `components/treinos/PlaneamentoLista.tsx`) passa de *«Planos por escalão, organizados por semana.»* para *«Organiza a época em mesociclos e microciclos de treino.»*. **(2) Ajuda contextual «O que é isto?»:** novo componente `components/treinos/AjudaPlaneamento.tsx` — ícone `HelpCircle` (lucide-react) junto aos botões *Periodização* / *Planos semanais* no cabeçalho de `/treinos`, com um **tooltip puramente em CSS** (`group-hover` + `group-focus-within`, sem JS nem novas dependências — funciona em rato, teclado e toque) que explica lado a lado as duas descrições. Alvo de toque ≥44px, focus-visible acessível, 100% pt-PT, sem dark mode. **typecheck 0 erros · lint limpo.**
- **2026-08-24** — **Jogo — cartões na grelha de estatísticas (BUG-P1-03), 6→4 separadores (UX-P3-04) e relatório estruturado (UX-P3-07) (§3.7, §8.11).** Três melhorias no detalhe do jogo (`components/jogos/JogoDetalhe.tsx` + `app/(app)/jogos/[id]/page.tsx`), **sem tocar em auth**. **(1) BUG-P1-03 — cartões na grelha:** a grelha de estatísticas por atleta convocado ganha duas colunas **a seguir às faltas** — **🟨 Cartão amarelo** (input numérico 0–5) e **🟥 Cartão vermelho** (0–2), com o mesmo estilo/tamanho dos restantes campos (o `CampoNum` ganhou um prop opcional `max` que faz *clamp* do valor). Aplicam-se a **futsal e futebol** (gravados sempre). Os campos foram acrescentados ao schema Prisma (`EstatisticaAtleta.cartaoAmarelo`/`cartaoVermelho @default(0)`) pela migração **aditiva** `20260824105507_add_cartoes_estatistica` (duas colunas `INTEGER NOT NULL DEFAULT 0`, sem impacto em dados existentes) e ao schema Zod (`estatisticaSchema`); a action `guardarEstatisticas` persiste-os e a grelha passa a expô-los e a carregá-los em `estatisticasIniciais`. §3.7 (schema) alinhado — o modelo na bíblia estava dessincronizado do Prisma. **(GAP-Cartões).** **(2) UX-P3-04 — 6→4 separadores:** os 6 separadores de topo (Convocatória, Plano, Ao Vivo, Estatísticas, Scouting, Relatório) passam a **4**, com os mais usados primeiro: **Convocatória** (sub-separadores *Convocados* + *Plano de jogo*), **Estatísticas**, **Ao Vivo** e **Análise** (sub-separadores *Relatório* + *Scouting*). Nenhuma funcionalidade removida — consolidação por sub-`Tabs` aninhadas. **(3) UX-P3-07 — relatório estruturado:** o `Textarea` livre do relatório é substituído por **três secções** com labels — **Análise táctica**, **Destaques** e **Próximo jogo** — guardadas como **JSON** no campo existente `Jogo.relatorio`. Novo módulo puro **`lib/relatorio-jogo.ts`** (`parseRelatorio`/`serializarRelatorio`/`relatorioParaTexto`) é a fonte única de (de)serialização e garante **retrocompatibilidade**: relatórios antigos em texto puro são lidos como «Análise táctica»; quando as três secções estão vazias grava-se `null`. `lib/actions/comunicacao.ts` (`comentarioTreinador`) usa `relatorioParaTexto` para continuar a produzir texto legível (um relatório legado devolve exatamente o texto original). A action `guardarRelatorio` mantém a assinatura (recebe a string já serializada). **typecheck 0 erros · lint limpo · 1270 testes verdes.**
- **2026-08-24** — **Exercícios — duplicar exercício (UX-P3-06) + favoritos (UX-P3-06b) (§3.3, §7.3).** Duas melhorias de usabilidade na biblioteca de exercícios (`/exercicios`), **sem alteração ao schema Prisma nem a auth**. **(1) `duplicarExercicio(id)` (`lib/actions/exercicios.ts` — nova Server Action, exige `EXERCICIOS_GERIR`):** busca o exercício com o `filtroExerciciosVisiveis` (garante que é visível ao utilizador no clube ativo — pessoal próprio ou biblioteca do clube) e cria uma **cópia sempre 🎒 pessoal do utilizador** — `proprietario = TREINADOR`, `clubeProprietarioId = null`, `autorId`/`criadorId = utilizador atual`, `origemSeed = false` e sem partilhas —, com o nome sufixado por **" (cópia)"**; copia `descricao`/`objetivo`/`duracaoMin`/`categoriaPrincipal`/`subcategoriaId`/`modalidade`/`parteTreino`/`escalaoAlvo`/`diagrama` (diagrama nulo passa como `undefined`). Devolve `Resultado<Exercicio>` e revalida `/exercicios`. **(2) Favoritos por exercício (UX-P3-06b):** o schema não tem campo `favorito` na entidade `Exercicio`, pelo que o estado vive no **`localStorage`** do navegador (chave `"exercicios-favoritos"` = array de IDs), por utilizador/dispositivo — `components/exercicios/FavoritosContext.tsx` (provider + hook `useFavoritos`, com `// TODO: migrar para DB quando o schema suportar favoritos`). **Novos componentes cliente:** `MostrarFavoritosToggle.tsx` (toggle "Mostrar favoritos" na barra de filtros + mensagem `FavoritosVazio`) e `ExercicioCardCliente.tsx` (envolve o cartão renderizado no servidor: **estrela ⭐ de favorito** em overlay + **menu de ações** — "Editar" e "Duplicar" — via `DropdownMenu`; aplica o filtro "só favoritos" escondendo cartões não favoritos). `app/(app)/exercicios/page.tsx` envolve os filtros + resultados em `<FavoritosProvider>` e reserva espaço (`pr-24`) no topo do cartão para o overlay. §7.3 anota `duplicarExercicio(id)`. **typecheck 0 erros · lint limpo.**
- **2026-08-24** — **Assiduidade só conta sessões `NORMAL` (consistência BUG-P1-07) + Server Actions `atualizarSeccao`/`apagarSeccao` (GAP-P2-10) (§8.1.1, §10.1, §10.2).** Dois ajustes de servidor (**não tocam em auth**). **(1) Simetria do filtro `tipoSessao: "NORMAL"` em `lib/actions/analise.ts`:** duas funções que ainda calculavam assiduidade sobre **todas** as sessões passam a contar só sessões `NORMAL` (CAPTACAO/EVENTO/ABERTO não são treino regular e inflavam o denominador), em linha com `obterAnaliticoAtleta`/`obterAnaliticoEscalao`: **`calcularComparacaoEquipa`** (contagem de sessões do escalão **e** contagem de presenças — numerador/denominador simétricos) e **`obterPresencasMensal`** (query de sessões **e** filtro `sessao` das presenças). **(2) `lib/actions/seccoes.ts` — `atualizarSeccao(id, { nome })` e `apagarSeccao(id)` (novas):** estruturais, de nível clube (exigem `CLUBE_ESCALOES`, em coerência com `adicionarSeccaoAoClube`); `atualizarSeccao` valida com o novo `atualizarSeccaoSchema` (`lib/schemas/seccao.ts` — `nome` 1–50) e edita só o nome (modalidade é fixa); `apagarSeccao` bloqueia a remoção quando existem escalões associados («Não é possível apagar uma secção com escalões activos.»), evitando orfanar escalões (`Escalao.seccao` é opcional/SetNull). Ambas garantem isolamento multi-tenant pelo `clubeId` e revalidam `/definicoes`. **typecheck 0 erros · 1270 testes verdes.**
- **2026-08-20** — **Atleta — estado `ativo`: camada de UI (§8.5).** Superfícies de interface para o estado `ativo` do atleta (a camada de schema/actions já está documentada na entrada *«Atleta — estado `ativo` (plantel vs saiu/experimental)»*). **`components/plantel/FiltroInativos.tsx` (novo):** toggle *«Mostrar atletas inativos»* na lista do plantel, junto à pesquisa; o estado vive na **URL** (`?incluirInativos=1`), lido pelo server component `app/(app)/plantel/page.tsx` que o passa como 4.º argumento a `listarAtletas`, **preservando os restantes filtros** (escalão, secção, pesquisa); os atletas inativos surgem esbatidos (`opacity-60`) com badge **«Inativo»**. **`components/plantel/ToggleAtivoAtleta.tsx` (novo):** switch de estado no separador **«Dados»** do perfil do atleta (`app/(app)/plantel/[id]/page.tsx`), **visível só com `PLANTEL_GERIR`**; atualização **otimista** com reversão em falha e `toast` («Atleta reativado» / «Atleta marcado como inativo»), invocando a action `toggleAtivoAtleta` e um `router.refresh()`. §8.5 alinhada com a UI. UI 100% pt-PT, alvos de toque ≥44px, sem dark mode. **Só documentação — a UI já existia no código.**
- **2026-08-20** — **Plano semanal de treinos — implementação do backend (schema + migração + actions + testes) (§3.5, §7.3, §8.8.1, §9, §16, Fase 31).** Concretização da camada de servidor da Fase 31, previamente só desenhada (ver entrada "geração recorrente de sessões + propagação"). **Schema/migração aplicada:** migração **aditiva** `20260820134433_plano_semanal_treinos` cria `PlanoSemanal` (índices `@@index([epocaId, escalaoId])` e `@@index([clubeId])`) e `PlanoSemanalDia` (`@@unique([planoSemanalId, diaSemana])`, `@@index([planoSemanalId])`), e adiciona a `Sessao` os campos `planoSemanalId`/`planoSemanalDiaId` (FK `onDelete: SetNull`) e `personalizada Boolean @default(false)` — tudo nullable/default (sem impacto em dados existentes). **Schemas Zod (`lib/schemas/planoSemanal.ts`):** `planoSemanalDiaSchema` (`diaSemana` 1-7, `horaInicio`/`horaFim` "HH:MM" com refine `fim>inicio`), `criarPlanoSemanalSchema` (`escalaoId` cuid, `nome?`, `dataInicioGeracao`, `dias[]` ≥1 com `diaSemana` único), `atualizarPlanoSemanalSchema` (`nome?`/`ativo?`/`dias?`), `alcanceSchema` (`SO_ESTA`/`ESTA_E_FUTURAS`) e `modoApagarSchema` (`DESVINCULAR`/`APAGAR_FUTURAS_VAZIAS`). **Actions (`lib/actions/planoSemanal.ts` — ficheiro dedicado):** `preverPlanoSemanal` (dry-run: `geradas`/`ignoradas`/intervalo), `criarPlanoSemanal` (geração em **transação**, invariante de um plano `ativo` por (escalão, época), deduplicação por dia ocupado, `planeamentoId=null` nas geradas), `listarPlanosSemanais(escalaoId?)` (filtra por escalões legíveis), `obterPlanoSemanal(id)` (detalhe + sessões futuras), `atualizarPlanoSemanal` (add/remove/edita dias; propaga baseline às futuras não-personalizadas; desvincula/apaga futuras ao remover dia) e `apagarPlanoSemanal(id, modo)`. `atualizarSessao` (em `lib/actions/treinos.ts`) ganha o parâmetro `alcance?` — `SO_ESTA` marca `personalizada`, `ESTA_E_FUTURAS` propaga o agendamento e reporta "N atualizadas; M personalizadas mantidas". **Funções puras (`lib/plano-semanal.ts`):** `gerarDatasDePlano` (datas por intervalo+dias, excluindo o passado), `diaSemanaISO`, `combinarDataHora`, `duracaoEntreHoras`, `somarMinutos`, `chaveDia`, `inicioDoDia`. **Permissões:** todas as actions exigem `TREINOS_GERIR` no escalão. **Testes (`tests/plano-semanal.test.ts`):** função pura de geração (2 dias/semana, exclusão do passado, domingo ISO 7, vazios), helpers de hora, e actions (`criarPlanoSemanal` — nº correto + ligação; deduplicação; recusa 2.º plano ativo; guarda de época sem datas) e `atualizarSessao` (propagação só a futuras não-personalizadas; `SO_ESTA` isola e marca `personalizada`). **§16 (Fase 31) corrigida:** ficheiro real das 6 actions (`lib/actions/planoSemanal.ts`, não `treinos.ts`) e nomes reais dos schemas.
- **2026-08-20** — **Registo com escolha de plano + licença `PENDENTE` (§3.11, §17.5, §21.2).** O fluxo de registo/onboarding passa a integrar a **escolha de plano** e a criação de uma licença por ativar. **(1) Wizard de onboarding (§8.1 / §3.11):** ganha um **passo de escolha de plano (tier)** **antes do submit final** — o utilizador seleciona Individual ou Clube (tier por nº de escalões, §17.1). **(2) `criarClube` cria `Licenca` `PENDENTE`:** ao criar o clube, é criada uma `Licenca` com **`estado: PENDENTE`** e o **tier escolhido** (+ `ciclo`/`precoCentimos`); o `@default(ATIVA)` do schema mantém-se (criação administrativa/absorção), mas o onboarding grava `PENDENTE` **explicitamente**. **(3) Enum `EstadoLicenca` (§3.11):** passa a `PENDENTE | ATIVA | EXPIRADA | CANCELADA | SUSPENSA` — `PENDENTE` = "licença criada aquando do registo, aguarda confirmação de pagamento"; **não concede acesso** (a guarda de licença trata-a como sem licença e redireciona para `/sem-licenca`). **(4) Paywall `/sem-licenca` (§3.11):** passa a mostrar **o plano escolhido e o valor exato a transferir** (em vez da tabela completa de planos), com IBAN, referência (nome do clube + email do titular) e email de comprovativo. **(5) Ativação manual (§17.5 / §21.2):** o admin recebe o comprovativo e **ativa a licença no backoffice** (`PENDENTE → ATIVA`). **(6) §17.5 Billing:** documentado o fluxo interino completo (escolha de plano → licença `PENDENTE` → paywall com plano+valor → ativação manual); **integração Paddle mantém-se deferida**. **Apenas documentação neste passo — a implementação de código segue este contrato.**
- **2026-08-20** — **Otimizações de desempenho — deduplicação de contexto, code-splitting, agregação em BD, índices e co-localização de região (§13.4, §15.4).** Conjunto de otimizações de *performance* **sem alteração funcional** (apenas eficiência de execução e *bundle*). **(1) `React.cache()` nos resolvers de contexto:** `obterMembroAtual`, `obterUtilizadorAtual`, `obterClubeAtivo`, `escaloesLegiveis` (`lib/permissoes.ts`) e `obterClubeIdAtual`, `obterEpocaAtiva` (`lib/epoca-context.ts`) passam a memorizar o resultado por request — elimina ~8–10 queries duplicadas por *page load*. **(2) `Promise.all` no layout:** `app/(app)/layout.tsx` corre `temLicencaValida` em paralelo com `listarEpocas`, `obterEpocaAtiva` e `obterSeccoes` (antes sequenciais). **(3) `next/dynamic` (`ssr: false`) para componentes pesados:** `EditorCampo` (`components/exercicios/ExercicioForm.tsx`) e os gráficos SVG (`GraficoLinhas`, `GraficoBarrasH`, `GraficoBarrasV`, `CurvaCargaSemanal`) em `components/analiticos/`, `components/plantel/EstatisticasAtleta.tsx`, `app/(app)/relatorios/page.tsx` e `app/(app)/escaloes/[id]/analiticos/page.tsx` — mantidos fora do *bundle* inicial. **(4) `optimizePackageImports`:** `next.config.js` com `experimental.optimizePackageImports: ["lucide-react"]` (*tree-shaking* de ícones). **(5) `next/image` para o logótipo do clube:** `<img>` → `<Image fill>` com `images.remotePatterns` em `next.config.js`. **(6) Agregação em BD:** `obterAnaliticoClubeEpoca` (`lib/actions/analise.ts`) usa `prisma.sessao.groupBy` e `prisma.presenca.groupBy` em vez de `findMany` + contagem em memória. **(7) Índices na `Presenca`:** `@@index([escalaoId, estado])` e `@@index([sessaoId, estado])` em `prisma/schema.prisma` + migração aditiva `20260820150000_perf_presenca_indexes`. **(8) Co-localização de região:** *Functions* da Vercel movidas de `iad1` (Washington DC) para **`cdg1` (Paris, `eu-west-3`)**, alinhadas com o Supabase (`aws-0-eu-west-3`), eliminando latência transatlântica por *round-trip* à BD. Documentado em §13.4 (Desempenho) e §15.4 (Supabase / ligações). **Só otimização — sem alteração de comportamento nem de contratos de dados. Typecheck limpo (0 erros), 1223 testes verdes.**
- **2026-08-20** — **Atleta — estado `ativo` (plantel vs saiu/experimental) (§3.2, §7.3, §8.5, §10.1).** Formalização do campo booleano **`ativo`** do `Atleta` (já existente no schema desde a migração `init`, `@default(true)`, com índice `@@index([clubeId, ativo])`) como distinção explícita entre atletas **no plantel** e atletas que **saíram** ou estão em **período experimental** (nos primeiros treinos aparecem atletas a experimentar, criados e com presenças registadas antes de se saber se ficam). **Schema Zod (`lib/schemas/atleta.ts`):** `atletaPessoalSchema` ganha `ativo: z.boolean().optional()` (opcional e **sem default** de propósito — a edição de dados pessoais não deve fazer reset do estado); novo `toggleAtivoAtletaSchema` (valida `atletaId` cuid). **Actions (`lib/actions/atletas.ts`):** `criarAtleta` escreve `ativo` com **default `true`** explícito (permite criar já como experimental); `atualizarAtleta` só escreve `ativo` quando **explicitamente fornecido** (sem reativação/desativação implícita); `listarAtletas` ganha o **4.º parâmetro `incluirInativos = false`** — por defeito filtra `ativo:true` (nas duas ramificações: por escalão via `atleta.ativo`, e global via `where.ativo`), e `incluirInativos=true` remove o filtro; nova action **`toggleAtivoAtleta(atletaId): Resultado<void>`** que alterna `ativo` (verifica `PLANTEL_GERIR` num escalão do atleta usando **todas** as participações, para permitir reativar um atleta sem participações ativas) e revalida `/plantel`, `/plantel/[id]` e `/dashboard`. **Queries de histórico não filtradas:** as contagens/leituras de estatísticas, presenças e convocatórias passadas em `obterEstatisticasAtleta` (§10.1) **deliberadamente não** filtram por `ativo` — um atleta inativo mantém o seu histórico desportivo válido. Sem alteração ao schema Prisma nem nova migração (o campo e o índice já existiam). **Testes:** `tests/atletas.test.ts` cobre `toggleAtivoAtleta` (cuid inválido, não autenticado, isolamento multi-tenant, sem permissão, desativar, reativar) e o filtro `incluirInativos` nas duas ramificações de `listarAtletas`. **typecheck/lint limpos, 1233 testes verdes.**
- **2026-08-20** — **Plano semanal de treinos — implementação da UI (§8.8.1, Fase 31).** Implementada a camada de apresentação da Fase 31 sobre as actions/schema já existentes (sem alteração de dados, actions ou schema). **Novos componentes:** `components/treinos/PlanoSemanalForm.tsx` (criação com escalão, nome opcional, data de início de geração, dias da semana com hora início/fim, local e tipo por dia, **pré-visualização obrigatória** via `preverPlanoSemanal` — "Vais gerar N treinos entre DD/MM e DD/MM" + aviso de dias ignorados — e criação via `criarPlanoSemanal` só ativa após pré-visualizar); `components/treinos/SeletorDiasPlano.tsx` (seletor controlado de dias, partilhado entre criar e editar); `components/treinos/DialogoAlcance.tsx` (escolha **Só este treino** / **Este e todos os seguintes** ao guardar agendamento numa sessão ligada a plano); `components/treinos/EditarPlanoDialog.tsx` e `components/treinos/ApagarPlanoDialog.tsx` (editar nome/ativo/dias; apagar com modo **Desvincular** / **Apagar futuras vazias**). **Novas rotas/alterações:** `/treinos/novo` ganha **toggle de modo** (Treino avulso | Plano semanal) via `?modo=plano`; nova página `/treinos/planos` (lista agrupada por escalão com estado, dias configurados, contagem de sessões geradas e ações editar/apagar); `components/treinos/SessaoForm.tsx` integra o diálogo de alcance quando a sessão pertence a um plano e reporta "N atualizadas; M personalizadas mantidas"; `/treinos` ganha link "Planos semanais". UI 100% pt-PT, alvos de toque ≥44px, sem dark mode, estados de loading/erro. **typecheck e lint limpos.**
- **2026-08-20 — Backoffice Interno (Admin) §21:** Nova secção que define o backoffice interno para gestão de licenças (Tab 1: listar/ativar/suspender/cancelar/editar `dataFim` cross-tenant) e monitorização técnica (Tab 2: embeds Vercel Analytics + Sentry). Autorização via `ADMIN_EMAILS` env var, independente da camada de auth (§5).
- **2026-08-20** — **Detalhe da sessão de treino — ecrã de condução redesenhado (§8.8, §8.8.2).** Redesenho do ecrã `/treinos/[id]` orientado à condução do treino, **sem alteração ao modelo de dados** (usa `Sessao`, `SessaoExercicio` incl. `snap*`, `Presenca`, `Sessao.rpeSessao`, `RpeAtleta`). **Nova ordem das secções:** (1) cabeçalho, (2) **Iniciar treino**, (3) **Presenças**, (4) **Exercícios**, (5) **Carga da sessão (RPE)**, (6) **Notas** editáveis inline. **Exercícios com conteúdo real:** cada linha mostra miniatura do diagrama (quando existe), nome, categoria, duração e **objetivo em texto** abaixo do nome; **linha expansível** (toque abre painel inline com descrição/montagem completa); **linha clicável** para o detalhe do exercício; controlos de **reordenar só visíveis em modo "Editar ordem"** (toggle). **Presenças com toggle de 1 toque:** substitui os dropdowns `Select` por **controlo segmentado inline por atleta** — `Presente · Falta · Lesionado · Just.` (mapeados a `EstadoPresenca`); toque único altera o estado, **campo de motivo contextual** (`Presenca.motivo`/`justificacao`); mantêm-se "Marcar todos presentes", "Repor", contador e "Guardar presenças". **Modo treino (condução em campo):** botão **"▶ Iniciar treino"** (laranja, largura total em mobile) abre vista em ecrã cheio com exercício atual em grande (diagrama, nome, objetivo, descrição), **cronómetro crescente**, **barra de progresso** ("2/5") e botões "Anterior"/"Próximo"; ao terminar regressa ao detalhe e **foca o bloco de RPE**. **Notas editáveis inline** (`Sessao.notas`) sem entrar em "Editar". Mobile-first, alvos de toque ≥44px. Casos-limite documentados (sessão sem exercícios → "Iniciar treino" desativado; sem atletas → estado vazio nas presenças). **Só desenho/documentação neste passo — a implementação de código segue este contrato.**
- **2026-08-20** — **Equipas + quadro competitivo + agendamento na criação de competição (§3.7, §7.3, §8.11, §9, §10.2, §10.9, Fase 32).** Nova funcionalidade que transforma a criação de competição de um form de 1 passo num **wizard de 3 passos**. **Modelo de dados:** novo modelo **`EquipaCompeticao`** (`id`, `competicaoId`, `nome` com trim, `posicao` seed para bracket, `criadoEm`; `@@unique([competicaoId, nome])`, `@@index([competicaoId])`, `onDelete: Cascade`) — as equipas deixam de ser texto livre disperso pelos resultados e passam a ser entidade com identidade estável e seed; `Competicao` ganha a relação `equipas`; `ResultadoCompeticao` ganha **`ronda Int?`** (jornada de LIGA / fase de TORNEIO-TAÇA — 1=final, 2=meias, 4=quartos…), **`dataHora DateTime?`** (agendamento; `null` = "por definir") e **`estado EstadoResultado @default(AGENDADO)`**, e `golosCasa`/`golosFora` passam a **nullable** (jogo agendado sem resultado); novo enum **`EstadoResultado { AGENDADO REALIZADO }`**. Migração **aditiva** com backfill (resultados legados: `estado=REALIZADO`, `ronda=null`, `dataHora=null`). **Wizard (§8.11):** Passo 1 informação base (inalterado); Passo 2 equipas participantes (mínimo 2, add/remove inline, equipa do clube pré-adicionada pelo nome do escalão, ordem = seed); Passo 3 **"Gerar quadro"** — **LIGA** todos-contra-todos (N×(N−1)/2 por mão; opção "2 mãos" duplica com casa/fora trocadas) e **TORNEIO/TAÇA** bracket eliminatório até à potência de 2 mais próxima com **byes automáticos** ((próxima potência de 2)−N); tabela de jogos com ronda/casa-fora/data-hora editável ou "por definir". Guardar cria competição + equipas + resultados agendados em **transação única**. **Actions (§7.3):** `adicionarEquipaCompeticao`, `removerEquipaCompeticao` (bloqueia se a equipa tem jogos `REALIZADO`), `obterEquipasCompeticao`, `gerarQuadroCompeticao({ duasMaos })` (falha se já há quadro — regeneração pede confirmação), `criarCompeticaoCompleta(dados, equipas, jogos)`, `atualizarAgendamentoJogo(resultadoId, dataHora|null)`. **Classificação (§10.9):** `obterClassificacao` **mantém a fórmula** e passa a **filtrar só jogos `REALIZADO`** (ignora `AGENDADO`/sem golos); §10.2 alinhada. **Regras de negócio (§9):** mínimo 2 equipas, unicidade de nome por competição, jogos avulsos coexistem com o quadro, retrocompatibilidade dos dados legados. Documentado como **Fase 32** (§16) com critério de pronto e métricas de sucesso. **Só desenho/documentação neste passo — sem alteração de código, sem migração aplicada.**
- **2026-08-20** — **Reuniões — acordeões de conteúdo, afixar no Início e presença no dashboard/calendário (§3.9, §8.13).** Novos requisitos do módulo de reuniões: (1) o **cartão de reunião** passa a expor **dois acordeões colapsáveis** — *"Ordem de trabalhos"* (campo `ordemTrabalhos`) e *"Ata"* (campo `ata`) — **abertos por defeito quando têm conteúdo**; (2) **afixar no Início** — botão de toggle *"Afixar no Início"* que alterna o novo campo `Reuniao.afixada`; reuniões afixadas surgem **sempre** no dashboard, **independentemente da data**; (3) **reuniões futuras** (`data >= hoje`) surgem **automaticamente** na secção *"Próximas reuniões"* do dashboard e no **calendário mensal** (módulo de treinos), com **máximo de 5** reuniões no dashboard, **ordenadas por data**; reuniões passadas não afixadas ficam só na lista de reuniões. **Modelo de dados:** `Reuniao` ganha `afixada Boolean @default(false)` (§3.9) — alteração **aditiva** (default `false`). Requisitos em documentação para suportar a implementação em curso.
- **2026-08-20** — **Plano semanal de treinos — geração recorrente de sessões + propagação (§3.5, §7.3, §8.8.1, §9, Fase 31).** Nova funcionalidade: a criação de treinos passa a ter **dois modos** — *Treino avulso* (fluxo atual, inalterado) e *Plano semanal*. No modo plano, o treinador seleciona os **dias da semana** e, por dia, **hora início/fim, local e tipo de sessão**; o sistema **gera automaticamente todas as sessões da época** (de `dataInicioGeracao`, default hoje, até `época.dataFim`), com pré-visualização e confirmação obrigatórias e **deduplicação** (datas já com treino são ignoradas). Cada sessão gerada é editável; ao alterar **agendamento** numa sessão de plano, a UI oferece **Só esta sessão** (marca `personalizada`) ou **Esta e todas as futuras** (atualiza o baseline do dia e propaga às futuras não-personalizadas, **nunca ao passado**); o **conteúdo** (exercícios/presenças/notas/RPE) nunca é propagado nem tocado. **Modelo de dados:** novos `PlanoSemanal` e `PlanoSemanalDia` (baseline por dia); `Sessao` ganha `planoSemanalId`/`planoSemanalDiaId` (`SetNull`) e `personalizada` — migração **aditiva** (tudo nullable/default). **Actions:** `preverPlanoSemanal`/`criarPlanoSemanal`/`listarPlanosSemanais`/`obterPlanoSemanal`/`atualizarPlanoSemanal`/`apagarPlanoSemanal` + `alcance?` em `atualizarSessao` (§7.3). **Regras:** um plano `ativo` por (escalão, época); vários escalões → vários planos; apagar plano preserva sessões (desvincula ou apaga só futuras vazias); guarda para época sem datas válidas (§9). Documentado como **Fase 31** (§16) com critério de pronto e métricas de sucesso. **Ainda por implementar** (só desenho/documentação neste passo — sem alteração de código, sem migração aplicada).
- **2026-08-20** — **Pagamento interino por transferência bancária no paywall (§3.11 / §17.5).** Enquanto a integração **Paddle** permanece **deferida**, o fluxo de ativação da subscrição passa a ser por **transferência bancária manual**: o utilizador transfere para o IBAN indicado (referência = nome do clube + email do titular) e **envia o comprovativo por email**; a licença é ativada manualmente. O paywall `app/sem-licenca/page.tsx` passa a mostrar as **instruções de pagamento** — mensagem de ativação, **tabela de planos** (Individual €4,99/mês · €49/ano; Clube por tier de escalões — Pequeno €15/€149, Médio €19/€190, Grande €34/€340, Parceiro negociado; +50% por secção adicional, §17.1), **dados de transferência** (IBAN + referência) e **email para envio do comprovativo** —, mantendo os CTA "Ver planos" e "Terminar sessão". IBAN e email de comprovativo ficam como **placeholders** (`IBAN_PLACEHOLDER` / `EMAIL_PLACEHOLDER`) a preencher com os valores reais. Adicionada nota do fluxo interino em §17.5. **Alteração apenas de apresentação do paywall** (guardas de licença/auth intactas). **typecheck e 1181 testes verdes.**
- **2026-08-20** — **Guarda de licença — exceção para o onboarding (§3.11 / §8.1).** Refinamento da guarda de licença: `/onboarding` (e sub-rotas `/onboarding/...`) passa a estar **sempre acessível mesmo sem licença válida**, para o utilizador poder **concluir o wizard de setup do clube antes de ser confrontado com o paywall** (`/sem-licenca`). Antes, a guarda aplicava-se a **todo** o grupo `(app)` — incluindo o onboarding —, bloqueando o setup de quem ainda não tinha subscrição. Implementação sem tocar em auth nem no `middleware.ts` (**intocáveis**): (1) `lib/guarda-licenca.ts` (novo) — função **pura** `deveBloquearPorLicenca(licencaOk, pathname)` (sem `prisma`/`server-only`, para poder ir para o bundle do cliente e ser testável), com match **exato** de `/onboarding` (não apanha falsos positivos como `/onboarding-extra`) e comportamento **fail-safe** (pathname `null`/`undefined` → bloqueia); (2) `components/layout/GuardaLicenca.tsx` (novo, client) — recebe `licencaOk` (avaliado server-side no layout) e decide **no cliente** com `usePathname()` (o pathname não está disponível de forma limpa num layout server-side sem alterar o middleware); ao bloquear, faz `router.replace('/sem-licenca')` e **não renderiza os filhos** (evita *flash* de conteúdo protegido); (3) `app/(app)/layout.tsx` — remove o `redirect('/sem-licenca')` server-side, mantém a avaliação `temLicencaValida(...)` e envolve a árvore em `<GuardaLicenca licencaOk={...}>`. **Não toca em auth (middleware, `lib/auth.ts`, cookies/sessão intactos).** `tests/licenca.test.ts` (+6 → 12) — **typecheck, lint e 1181 testes verdes.**
- **2026-08-19** — **Guarda de licença — acesso à plataforma bloqueado sem subscrição válida (§3.11).** Correção de segurança de produto: qualquer utilizador que se registasse conseguia usar a app gratuitamente (não havia enforcement de acesso; só o *billing* estava deferido). Implementada uma **guarda de licença SEPARADA da autenticação** (Auth.js **intocável**): (1) `lib/licenca.ts` (novo) — função pura `licencaValida(licenca, agora)` (válida = `estado='ATIVA'` **e** sem `dataFim` ou `dataFim` ainda não passada; o enum não tem `TRIAL` — um trial é uma licença `ATIVA` com `dataFim` futura) + `temLicencaValida(clubeId, utilizadorId)` que aceita licença de **Clube** OU **Individual** (§3.1); (2) `app/(app)/layout.tsx` — após auth + adesão a clube, redireciona para `/sem-licenca` quem não tem licença válida; (3) `app/sem-licenca/page.tsx` (novo) — paywall **fora** do grupo `(app)` (sem ciclo de redirect), com CTA de contacto/planos e terminar sessão; redireciona de volta para `/dashboard` quem (entretanto) já tenha licença válida. O **billing Paddle** (checkout, webhooks, criação/renovação de licença e transição automática `ATIVA→EXPIRADA`) mantém-se deferido. **Não toca em auth (middleware, `lib/auth.ts`, cookies/sessão intactos).** `tests/licenca.test.ts` (6) — **typecheck e lint limpos; 1175 testes verdes.**
- **2026-08-19** — **Landing page e wordmark — rebranding Mister + copy multi-desporto (§1, §12).** Correção do último resíduo do nome antigo na experiência pública: o **wordmark** (`components/layout/Logo.tsx`) passou de *Futsal**coach*** (duas cores) para **Mister** (palavra única, Bricolage Grotesque peso 800, cor adaptada ao contexto; o acento laranja vive no símbolo ao lado). Copy da landing (`app/page.tsx`) atualizada de "plataforma de gestão de **futsal**" para "plataforma de gestão **desportiva** (futsal e futebol)"; removida a tagline "Futsal a sério, não futebol adaptado" (contradizia o produto multi-desporto). Metadados (`app/layout.tsx`, `app/manifest.ts`) e guia de marca (`docs/BRAND.md §1`) alinhados. **Não toca em auth. Typecheck e testes verdes; build de produção limpo.**
- **2026-08-19** — **Fase 30 (backend) — billing multi-secção, onboarding por modalidade, wizard Nova Época multi-secção (§8.1.1, §8.21, §17.1, §17.3).** Camada de servidor da Fase 30 (**não toca em auth; não toca em `components/`**):
  - **`lib/billing.ts` (novo) — `calcularPrecoLicenca(tier, numSeccoes, ciclo)` (§17.1).** Módulo puro: preço praticado em cêntimos, `base × (1 + 0.5 × (numSeccoes − 1))` (1 secção = tier base; 2 secções = +50%; PARCEIRO = 0/negociado). Tabela `PRECO_BASE_CENTIMOS` por tier/ciclo. Usado ao adicionar secção (criar/renovar licença ficam preparados).
  - **`lib/actions/seccoes.ts` — `adicionarSeccaoAoClube(modalidade)` (§17.1).** Estrutural, exige `CLUBE_ESCALOES` (um Coordenador de Secção não adiciona modalidades ao clube). Garante a secção (idempotente), recalcula `Licenca.numSeccoes` a partir das secções reais (bounded a 2) e atualiza `precoCentimos` (aviso suave — enforcement de billing deferido). Devolve `{ seccaoId, novoPreco, numSeccoes }`. **Bloqueio Individual = uma modalidade (DEVE, §17.1):** movido para `garantirSeccaoParaModalidade` — recusa a 2.ª modalidade num clube técnico Individual (licença `INDIVIDUAL` ou `Clube.clubeTecnico`), sugerindo a licença de Clube.
  - **`lib/actions/seccoes.ts` — `obterContextoSeccao(seccaoId)` (§6.9).** Guarda de acesso reutilizável: devolve a `Seccao` a um Coordenador da secção (âmbito SECCAO) ou a um membro de âmbito TODO_CLUBE; erro caso contrário.
  - **Onboarding por modalidade (§8.1.1) — `lib/actions/onboarding.ts` + `lib/schemas/onboarding.ts`.** `criarClubeSchema` ganha `modalidade` (`FUTSAL`|`FUTEBOL`, default `FUTSAL`). `criarClube` cria a **secção inicial** da modalidade e liga-lhe o escalão-semente, instala o **conteúdo curado da modalidade** (best-effort) e regista `Licenca.modalidade` se já existir licença.
  - **`lib/biblioteca-arranque-instalar.ts` (novo) — instaladores curados de FUTSAL + dispatcher.** `instalarConteudoArranqueFutsal(clubeId, db)` (subcategorias → exercícios → templates → habilidades, modalidade `null` = genérico, idempotente) e `instalarConteudoArranquePorModalidade(clubeId, modalidade, db)` que despacha para futsal ou para `instalarConteudoArranqueFutebol`. Sem migração (campos já existentes).
  - **Wizard «Nova Época» multi-secção (§8.21) — `lib/actions/novaEpoca.ts` + `lib/schemas/novaEpoca.ts`.** `criarEpocaRollover` ganha `seccaoId?` opcional: quando fornecido, valida a pertença da secção e **restringe o snapshot de plantel** aos escalões dessa secção; a época é de nível clube, pelo que a transição por secção **reutiliza** a época já criada por outra secção (mesmo nome) em vez de a duplicar. Omitir `seccaoId` mantém o comportamento v6 (transita todas as secções para a mesma época).
  - **Gating do Coordenador de Secção — confirmado end-to-end (§6.9).** `criarEscalao` verifica `SECCAO_ESCALOES_GERIR` contra `escalao.seccaoId ∈ seccoesCoordenadas` (Fase 25, sem alteração); `escaloesLegiveis` já restringe a leitura aos escalões da(s) secção(ões) coordenada(s).
  - **Verificação:** `typecheck` 0 erros · `lint` limpo · **1169 testes verdes** (novos: `tests/billing.test.ts`, `tests/seccoes.test.ts`, `tests/biblioteca-futsal.test.ts` + casos em `onboarding`/`novaEpoca`).
- **2026-08-19** — **Fase 30 (frontend) — navegação multi-secção, analytics e onboarding (§8.1.1, §8.2, §8.16, §8.21, §8.22, §17.1, §17.4).** UI transversal de secções, consumindo Server Actions do backend da Fase 30 (`obterSeccoes`, `adicionarSeccaoAoClube`, `garantirSeccaoParaModalidade`, `atribuirCoordenadorSeccao`, `removerMembroSeccao`, `listarMembros`, `listarEscaloes`, `criarEscalao` com `seccaoId`). **Não toca em auth (RegistarForm/sessão/cookies de auth intactos); não toca em `lib/actions/`, `components/jogos/`, `components/campo/`, `components/plantel/`.**
  - **`components/layout/SeletorSeccao.tsx` (novo) + `BarraTopo` + `app/(app)/layout.tsx` — seletor de secção transversal (§8.1.1).** Dropdown na barra de topo que **só aparece com 2+ secções**. Persiste a secção ativa num **cookie de UI** (`seccaoAtiva`, memória de contexto — nunca autorização, §5.4) lido no layout via `next/headers`; ao selecionar, reflete `seccaoId`+`modalidade` no URL para as páginas section-aware (plantel usa `seccaoId`, jogos usa `modalidade`) reagirem de imediato. Com 1 secção, experiência idêntica à v6.
  - **`app/(app)/definicoes/seccoes/page.tsx` + `components/definicoes/SeccoesLista.tsx` (novos) — gestão de secções (§8.22).** Lista as secções (modalidade, nome, nº de escalões, coordenadores); **adicionar modalidade** via `adicionarSeccaoAoClube` (que recalcula o preço com o módulo partilhado `lib/billing` e devolve `novoPreco`), com **aviso suave de billing** (§17.4) — texto pré-ação + toast com o preço praticado devolvido pelo servidor (fonte única de verdade; sem duplicar a tabela de preços no cliente); atribuir/remover coordenadores. Gating: `CLUBE_ESCALOES` para adicionar secções, `CLUBE_UTILIZADORES` para coordenadores (a capacidade dedicada `CLUBE_SECCOES` ainda não existe no catálogo). Estado vazio para clube mono-modalidade. Card adicionado ao índice de Definições.
  - **`app/(app)/dashboard/page.tsx` — analytics por secção (§8.16 v7).** Quando há >1 secção, os "atletas por escalão" passam a estar **agrupados por secção/modalidade** (subtítulo + `BadgeModalidade`); com 1 secção, comportamento inalterado.
  - **`components/onboarding/WizardOnboarding.tsx` — escolha de modalidade no passo de escalões (§8.1.1).** Seletor Futsal/Futebol; o escalão criado vai para a secção da modalidade escolhida (`garantirSeccaoParaModalidade` + `criarEscalao({ seccaoId })`). **Sem tocar no fluxo de auth/registo.**
  - **`components/definicoes/WizardNovaEpoca.tsx` + `app/(app)/definicoes/nova-epoca/page.tsx` — wizard «Nova Época» multi-secção (§8.21).** Quando há >1 secção, os "escalões que continuam" são **agrupados por secção** com opção de incluir/excluir a modalidade inteira; a página injeta o mapa `escalãoId→secçãoId` via `obterSeccoes`+`listarEscaloes` (frontend-only, sem alterar a action). Com 1 secção, lista plana inalterada.
  - **Verificação:** `npm run typecheck` (0 erros), `npm run lint` (0 avisos), `npm run test` (**1169 testes verdes**).
- **2026-08-19** — **Fase 30 (migração) — Licença multi-secção (§3.11, §17.1, Apêndice C.3).** Última migração em falta para completar a v7. Migração aditiva `20260819130000_fase30_licenca_multiseccao` adiciona ao modelo `Licenca` os dois campos multi-secção: **`modalidade Modalidade?`** (Individual — modalidade contratada; `null` em licenças de Clube — §17.1) e **`numSeccoes Int @default(1)`** (Clube — nº de secções faturadas; base do pricing "tier mais caro + 50%/secção adicional", §17.1). Backfill idempotente: `modalidade = 'FUTSAL'` para licenças Individual e Clube existentes (100% dos dados são futsal), e `numSeccoes` = contagem de `Seccao` por clube quando existem secções. Ambas as colunas nullable/com default; **não toca em auth**; `schema.prisma` sincronizado; `prisma validate`/`generate` OK; **typecheck e lint limpos; 1132 testes verdes.**
- **2026-08-19** — **Fase 28 (frontend) — jogos e estatísticas de futebol (§3.7, §10, §10.8, §11).** UI de jogos adaptada à modalidade/formato, consumindo os contratos backend da Fase 28. **Não toca em auth; não toca em `lib/actions/`, `components/campo/`, `components/plantel/`, nem nos schemas de `atleta`/`jogo`.**
  - **`components/jogos/JogoForm.tsx` — seletor de formato (§3.7).** Quando o escalão selecionado é de **futebol**, o formulário mostra um seletor **obrigatório** de `FormatoJogo` (rótulos PT-PT: "Futebol 3×3", "Futebol 5×5", "Futebol 7", "Futebol 9", "Futebol 11"); valida no cliente antes de submeter e envia `formato` no input de `criarJogo`/`atualizarJogo`. Em **futsal** o seletor não aparece (o backend deriva `FUTSAL_5`). O `EscalaoBasico` do form ganha `modalidade` (enriquecido nas páginas `novo`/`editar` via `obterSeccoes` + `escaloesComModalidade`); `JogoParaEdicao` ganha `formato`.
  - **`components/jogos/JogoDetalhe.tsx` — grelha de estatísticas condicional (§10.8).** Recebe `modalidade` e `formato`. Em **futebol** a coluna de faltas é substituída pelo núcleo `remates`/`cantos`/`forasDeJogo`/`desarmes` (inputs `number` `min=0`); em **futsal** mantém-se exatamente a grelha anterior (golos/assistências/faltas; GR: defesas/golos sofridos/faltas — **zero-regressão**). O `EstatLinha`/`estatDe`/payload e o `estatisticasIniciais` (página) ganham os 4 campos de futebol. O seletor "Tempo de jogo" mostra os minutos por bloco derivados do formato (`blocoParaMinutos(bloco, formato)` — ex.: "Jogo completo (90 min)" em futebol 11).
  - **`components/jogos/PlanoTatico.tsx` — vista de dia de jogo por modalidade (§11.5).** As posições dos seletores passam a vir de `posicoesPorModalidade(modalidade)`; as **linhas de formação** são específicas por modalidade (futsal: GR/Defesa/Meio/Avançado; futebol: GR/Defesa/Meio/Ataque). A formação prevista dos titulares é agora desenhada no **`CampoDesenho`** (Fase 26) com `formato={jogo.formato}` (jogadores posicionados por linha no espaço 400×200); titulares sem posição listam-se em chips à parte.
  - **`app/(app)/jogos/page.tsx` — badge e filtro de modalidade (§10.8).** Quando o clube é **multi-secção**, a lista mostra tabs "Todos | Futsal | Futebol" (filtra via `listarJogos(escalaoId, modalidade)`) e um `BadgeModalidade` por jogo; as tabs de escalão respeitam a modalidade ativa. Params de query validados (`cuid`/enum).
  - **`app/(app)/jogos/[id]/page.tsx` — cabeçalho do detalhe.** Mostra `BadgeModalidade` e, quando há `formato`, o rótulo do formato + duração por parte (`2 × MINUTOS_POR_PARTE[formato]` — ex.: "Futebol 11 · 2 × 45 min"). Passa `modalidade`/`formato` ao `JogoDetalhe`.
  - **`lib/modalidade-escalao.ts` — reexport.** Passa a reexportar `blocoParaMinutos` e `MINUTOS_POR_PARTE` da sua fonte única (`lib/estatisticas.ts`), para os consumidores de jogos os importarem junto dos restantes helpers de modalidade. **typecheck e lint limpos; 1132 testes verdes.**
- **2026-08-19** — **Fase 28 (código) — jogos e estatísticas de futebol (backend).** Núcleo de futebol + derivação de formato + agregações por modalidade nas Server Actions. Sem migração (campos `formato`, `remates`/`cantos`/`forasDeJogo`/`desarmes` e `modalidadeAtividade` já existem desde a Fase 25). **Não toca em auth. Não toca em `components/`** (frontend da Fase 28 vem depois).
  - **`lib/actions/jogos.ts` — derivação de `Jogo.formato` (§3.7 "Derivação do formato" — DEVE).** `criarJogo`/`atualizarJogo` resolvem o formato: o indicado prevalece; senão em `atualizarJogo` preserva-se o formato do jogo; senão deriva-se da **modalidade efetiva** da secção do escalão — `FUTSAL → FUTSAL_5`; `FUTEBOL` **exige** indicá-lo (5 formatos, sem default) e devolve `erro("Indica o formato de jogo…")` se ausente. `criarJogo` grava `formato`; `atualizarJogo` grava/preserva `formato`. `jogoSchema` ganha `formato: z.nativeEnum(FormatoJogo).nullable().optional()`.
  - **`lib/actions/jogos.ts` — núcleo estatístico de futebol no upsert (§10.8).** `guardarEstatisticas` calcula a modalidade efetiva do jogo (`modalidadeAtividade` ?? secção) e, em **futebol**, aceita e grava `remates`/`cantos`/`forasDeJogo`/`desarmes`; em **futsal** força esses 4 campos a `null` (não são núcleo — §10.8). `estatisticaSchema` (`lib/schemas/jogo.ts`) ganha os 4 campos como `z.number().int().min(0).nullable().optional()`.
  - **`lib/actions/jogos.ts` — modalidade nas leituras.** `listarJogos(escalaoId?, modalidade?)` filtra pela **modalidade efetiva** e devolve `JogoListaItem` com `modalidade` resolvida por jogo (para o seletor de secção do frontend). `obterJogo`/`JogoDetalhe` passam a expor `modalidade` (efetiva) — sinaliza que núcleo mostrar e se as faltas acumuladas por parte (só futsal, §8.11) são visíveis.
  - **`lib/estatisticas.ts` — `MINUTOS_POR_PARTE` + `blocoParaMinutos(bloco, formato?)` (§10.8).** Tempo de jogo por bloco parametrizável por formato (ver decisão em §10.8); `LinhaEstatistica` ganha `formato?` e `agregarEstatisticas` calcula `tempoJogoAcumulado` com o formato de cada linha. Retrocompatível: sem formato → tabela base de futsal (40/20).
  - **`lib/actions/analise.ts` — agregações por modalidade (§10.1/§10.8).** `obterAnaliticoAtleta(atletaId, escalaoId?, epocaId?, modalidade?)`: na vista conjunta segmenta os escalões (e portanto sessões/presenças) pela modalidade pedida e filtra os jogos pela modalidade efetiva; o `tempoJogoAcumulado`, `calcularComparacaoEquipa` e `maisUtilizados` (nível escalão) passam a ser sensíveis ao formato do jogo. Novo helper puro `analiticoAtletaSchema.modalidade`.
  - **`lib/modalidade-escalao.ts` — helpers puros:** `modalidadeEfetiva(modalidadeAtividade, modalidadeSeccao)` (pontual prevalece; fallback `FUTSAL`) e `filtroModalidadeJogo(modalidade?)` (fragmento `Prisma.JogoWhereInput` reutilizado nas actions).
  - **Testes:** `tests/futebol-fase28.test.ts` (24) — tabela `MINUTOS_POR_PARTE`/`blocoParaMinutos` por formato, `agregarEstatisticas` com formato, `modalidadeEfetiva`/`filtroModalidadeJogo`, derivação de formato em `criarJogo`, núcleo de futebol em `guardarEstatisticas` (futebol grava / futsal força `null`), filtro de modalidade em `listarJogos` e segmentação por modalidade em `obterAnaliticoAtleta`. **typecheck e lint limpos; 1132 testes verdes.**
- **2026-08-19** — **Fase 29 (código) — filtros de biblioteca por modalidade (backend).** Adicionados os filtros por modalidade nas Server Actions de leitura, para a UI (§8.6/§8.7/§8.14) poder segmentar por desporto. Sem migração (o campo `modalidade` existe desde a Fase 25). **Não toca em auth.**
  - **`lib/actions/exercicios.ts` — `listarExercicios` filtra por modalidade (§8.6).** Novo 4.º parâmetro `modalidade: FiltroModalidade = "TODAS"` (tipo exportado `FiltroModalidade = Modalidade | "TODAS"`). `"TODAS"` (default) não filtra (comportamento anterior); uma modalidade concreta acrescenta ao `AND` a cláusula `{ OR: [{ modalidade }, { modalidade: null }] }` — inclui sempre os itens **universais** (`modalidade = null`), que servem as duas modalidades. Os restantes filtros (parte do treino, categoria, pesquisa) e a anotação de origem/`naBibliotecaDoClube` mantêm-se inalterados.
  - **`lib/actions/habilidades.ts` — `listarHabilidades` filtra por modalidade (§3.8/§8.14).** Novo parâmetro opcional `modalidade?: Modalidade`. Sem filtro devolve todas (comportamento anterior); com modalidade concreta a query passa a `{ clubeId, OR: [{ modalidade }, { modalidade: null }] }` — habilidades da modalidade + universais. Isolamento multi-tenant por `clubeId` preservado.
  - **Subcategorias (§8.6) — não filtrável por modalidade (limitação de esquema).** `SubcategoriaExercicio` **não tem** campo `modalidade` no schema (só `sistema`), pelo que `listarSubcategorias` **não** ganhou filtro de modalidade (evita-se parâmetro morto sem coluna que o suporte; um filtro exigiria migração, fora do âmbito desta fase). As subcategorias curadas de futebol da Fase 29 são partilhadas (visíveis em ambas as modalidades).
  - **Orquestração de arranque de futebol — já ligada.** `prisma/seed.ts` já invoca `instalarConteudoArranqueFutebol` (Fase 29 database); não existe action de auto-instalação a corrigir nem uma `obterEstatisticasInstalacao` a estender — nada a alterar aqui.
  - **Testes:** `tests/exercicios-biblioteca-ui.test.ts` (filtro por omissão `TODAS` não injeta OR de modalidade; modalidade concreta injeta `{ OR: [{ modalidade: "FUTEBOL" }, { modalidade: null }] }`) e `tests/habilidades.test.ts` (sem modalidade não filtra; `FUTEBOL` inclui universais). **typecheck e lint limpos; 1108 testes verdes.**
- **2026-08-19** — **Fase 27 (código) — Posições e plantel multi-desporto (backend).** Lógica de negócio multi-desporto no plantel/participações; invariante do principal **por modalidade** (§9, Apêndice C B3) e validação posição↔modalidade (§2.3/§3.2/§9). **Não toca em auth.**
  - **`lib/actions/participacoes.ts` — invariante do principal POR MODALIDADE (§9).** `associarAEscalao` passa a correr numa transação **Serializable**: lê os `AtletaEscalao` PRINCIPAL ativos do atleta na época (com `escalao.seccao.modalidade`) e, se **não** existir principal na modalidade do escalão destino, cria a participação como **`PRINCIPAL`** — única exceção à regra «associar nunca força principal» (B3). Se já existir principal nessa modalidade, mantém o tipo pedido (`SIMULTANEA`/`OCASIONAL`). `transferirEscalao` passa a aplicar o invariante **dentro da modalidade de destino**: só as participações dessa modalidade entram em `ficariaSemPrincipal`/`principaisADespromover` — uma transferência dentro do futsal já **não despromove** o principal de futebol (e vice-versa). Escalões sem secção (fase expand, antes do backfill) formam o seu próprio balde de modalidade (`null`). `terminarParticipacao` inalterado (recusar terminar qualquer `PRINCIPAL` já é correto por modalidade).
  - **`lib/actions/atletas.ts` — `listarAtletas` por secção + modalidade (§8.5).** Novo 3.º parâmetro opcional `seccaoId?`: quando presente, restringe os atletas às participações ativas em escalões dessa secção (`participacoes.some.escalao.seccaoId`). `ParticipacaoResumo` ganha o campo **`modalidade: Modalidade | null`** (derivado de `escalao.seccao.modalidade`), incluído em todas as leituras que usam `paraResumo` (`listarAtletas`, `obterAtleta`) para a UI poder agrupar/segmentar por modalidade.
  - **`lib/actions/atletas.ts` — validação posição↔modalidade (§9).** `criarAtleta` valida que as `posicoes` declaradas pertencem à modalidade do escalão inicial; `atualizarAtleta` valida contra a **união** das modalidades das participações ativas do atleta (multi-desporto). Posição inválida → `erro("Posição inválida para esta modalidade")` com `camposInvalidos.posicoes`. Sem secção determinável, a validação é saltada. `GUARDA_REDES` e `UNIVERSAL` são partilhados (válidos em ambas).
  - **`lib/schemas/atleta.ts` — `posicoesPorModalidade(modalidade)`** (§2.3/§3.2): futsal `{GR, Fixo, Ala, Pivô, Universal}`; futebol `{GR, Defesa central, Laterais, Médios, Extremos, Avançado, Universal}`; sem modalidade devolve todas sem duplicar as partilhadas. Fonte única do seletor de posições e da validação.
  - **Testes:** invariante do principal por modalidade + B3 (`associar` força/mantém principal por modalidade; `transferir` não toca noutra modalidade), validação posição↔modalidade (`criarAtleta`), `posicoesPorModalidade`, e `listarAtletas` (filtro de secção + inclusão da modalidade). **typecheck/lint/test limpos — 1104 testes.**
- **2026-08-19** — **Fase 29 (código) — Conteúdo curado de futebol (exercícios, subcategorias, templates, caderneta).** Populado o conteúdo de arranque de **futebol**, equivalente ao de futsal, marcado com `modalidade: "FUTEBOL"` (§3.3/§3.4/§3.8) e `origemSeed`/`sistema` (sem migração — campos já existentes desde a Fase 25). **Não toca em auth.**
  - **Novo `lib/biblioteca-arranque-futebol.ts`**: dados curados + instaladores idempotentes por clube. **15 exercícios** (`EXERCICIOS_ARRANQUE_FUTEBOL`) distribuídos por parte do treino e categoria de núcleo (as áreas do plano — aquecimento/técnica/tática coletiva/bolas paradas/físico/guarda-redes — mapeiam para `CategoriaExercicioPrincipal` + `ParteTreino`, já que o enum não tem valores `AQUECIMENTO`/`TECNICA`/`TATICA_COLETIVA`): Rondos 4v2, Jogo de Posição 5v5 (AQUECIMENTO); Controlo orientado com condução, Passe e movimento (combinações), Finalização com cruzamento (TÉCNICA/ATAQUE); Pressing alto em bloco (DEFESA), Saída a jogar pelo GR (ATAQUE), Transição rápida ofensiva (TRANSICAO); Canto directo ao primeiro poste, Livre lateral em zona 3, Penálti: rotinas do executante (BOLAS_PARADAS); Sprints curtos com bola, Resistência com posse (FISICO); Saídas a cruzamentos, Jogo com os pés — construção (GUARDA_REDES). Exercícios sem diagrama (`diagrama: null` até ao editor de campo de futebol, Fase 26).
  - **13 subcategorias** (`SUBCATEGORIAS_ARRANQUE_FUTEBOL`, `sistema: true`): BOLAS_PARADAS (Canto, Livre directo, Livre indirecto, Lançamento de linha, Pontapé de baliza, Penálti); tática coletiva → DEFESA (Pressing) / ATAQUE (Saída a jogar) / TRANSICAO (Transição O→D, Transição D→O); GUARDA_REDES (Saídas, Jogo com os pés, Defesa de penálti).
  - **15 habilidades** (`HABILIDADES_ARRANQUE_FUTEBOL`, caderneta §8.14) em 3 níveis: BASICO (Passe curto, Controlo de bola, Condução com ambos os pés, Posição base, Posicionamento GR); INTERMEDIO (Passe longo, Recepção orientada, Drible 1v1, Cabeceamento básico, Saídas a cruzamentos); AVANCADO (Passe entre linhas, Jogo de costas, Finalização com ambos os pés, Bola parada executante, Jogo com os pés).
  - **`lib/templates-arranque.ts`**: novo `TEMPLATES_ARRANQUE_FUTEBOL` (3 templates, `modalidade: "FUTEBOL"` carimbada na instalação): "Treino de posse e pressão" (sub-15), "Treino de finalização" (sub-13), "Treino de bolas paradas" (sub-17). Cada template referencia por nome exato exercícios de `EXERCICIOS_ARRANQUE_FUTEBOL`.
  - **Instaladores idempotentes** (`instalarSubcategoriasFutebol`, `instalarBibliotecaArranqueFutebol`, `instalarTemplatesArranqueFutebol`, `instalarHabilidadesFutebol`, orquestração `instalarConteudoArranqueFutebol`): recebem `clubeId` e um cliente Prisma injetável (default = singleton `@/lib/db`; permite injeção nos seeds); idempotência por `(clubeId, nome[, categoria/modalidade])` — a 2.ª corrida cria 0. O criador/autor do conteúdo é o primeiro membro do clube.
  - **`prisma/seed.ts`**: o seed de demonstração passa a criar uma **secção FUTEBOL** ("Futebol") com um escalão "Sub-15 (Futebol)" e a instalar o conteúdo curado de futebol via `instalarConteudoArranqueFutebol`.
  - **`tests/biblioteca-futebol.test.ts`** (novo): integridade dos dados (categorias/níveis/partes válidos, sem duplicados, referências cruzadas exercícios↔templates↔subcategorias) e idempotência dos instaladores com um Prisma em memória. **1104 testes verdes; typecheck e lint limpos.**

- **2026-08-19** — **Fase 26 (frontend) — campo de futebol SVG, todos os formatos (§11.5, Apêndice B).** O editor/diagrama de campo passa a suportar todos os `FormatoJogo` (**não toca em auth**):
  - **`components/campo/desenho.tsx`**: `LinhasCampo` passa a receber `formato?: FormatoJogo` (ausente → `FUTSAL_5`, retrocompatível — Apêndice C) e despacha para o fundo correto. O fundo de futsal (quartos de círculo de 6 m + 2.ª penalidade) foi extraído para `FundoFutsal5`; adicionado `FundoFutebol` genérico configurado por formato (`CFG_FUTEBOL_3_3/5_5/7/9/11`) com helpers `Relvado`/`Baliza`/`AreaRect`/`MarcaPenalti`/`ArcoPenalti`. Marcações por formato conforme Apêndice B: 3×3 minimal (meio-campo + balizas pequenas, sem áreas nem círculo central); 5×5 (círculo central + pequenas áreas); 7 e 9 (círculo central + grande área + penálti); 11 (grandes + pequenas áreas + penáltis + arcos). Novo helper exportado `rotuloCampo(formato)` (aria-labels pt-PT: "campo de futsal"/"campo de futebol de 3…11").
  - **Decisão de escala (⚠️ desvio consciente):** o **espaço de coordenadas interno mantém-se 400×200 para todos os formatos** (não os `viewBox` por formato listados a título de referência em §11.5/Apêndice B). Fundamento: o schema do diagrama fixa (e testa) as coordenadas dos elementos em `0–400 / 0–200`, e a Fase 26 só toca no campo `campo` do schema; manter o espaço 400×200 garante retrocompatibilidade total e mantém a escala de *hit-area*, o teclado e a animação idênticos entre modalidades. As marcações de futebol são desenhadas em proporção reconhecível dentro dessa caixa (o `viewBox` real por formato — e o `1u=10cm` exato para campos grandes — fica para a Fase 28, quando `Jogo.formato` obrigar à colocação de elementos em toda a área).
  - **Novo `components/campo/CampoDesenho.tsx`**: render estático genérico (resolve `formato` por prop → `diagrama.campo` → `FUTSAL_5`). **`components/campo/CampoFutsal.tsx`** passa a ser alias fino de `CampoDesenho` (assinatura histórica preservada + `formato` opcional).
  - **`MiniaturaCampo`, `CampoAnimado`, `EditorCampo`**: aceitam `formato?: FormatoJogo` e passam-no a `LinhasCampo`/aria-label (derivação `prop → diagrama.campo → FUTSAL_5`). O `EditorCampo` **preserva o `campo`** em todas as gravações (`snapshotAtual`, `aplicarElementos`, `aplicarPassos`, `limparTudo`) e aceita um `formato` de contexto para carimbar novos diagramas de futebol.
  - **`lib/schemas/exercicio.ts`**: `diagramaSchema` ganha `campo: z.nativeEnum(FormatoJogo).optional()` (`TipoCampo` alinha com `FormatoJogo`; ausente/legado → `FUTSAL_5`). Nenhuma outra alteração ao schema (coordenadas dos elementos inalteradas).
  - **`vitest.config.ts`**: `esbuild.jsx = "automatic"` para os testes poderem renderizar componentes (React 19 usa o runtime automático). **Novo `tests/campo-fundos.test.ts`** (19 testes): cada formato renderiza sem erros; retrocompat (`sem formato === FUTSAL_5`); estrutura de marcações distinta por formato; `rotuloCampo`; resolução de `formato` em `CampoDesenho`/`MiniaturaCampo`/`CampoFutsal`; `diagramaSchema.campo` (aceita legado sem `campo`, aceita os 6 formatos, rejeita valor inválido). `typecheck` limpo; **suite completa verde (1104 testes)**.
  - **Nota (dependências de fase):** ligar o `formato` do contexto (exercício/modelo de jogo/jogo) ao `EditorCampo`/`CampoDesenho` nas páginas consumidoras pertence às fases de conteúdo/jogos (28/29); a Fase 26 entrega o motor de fundos e a retrocompatibilidade. Ficheiros de `lib/actions/` e `components/plantel/` são de agentes paralelos.
- **2026-08-19** — **Fase 27 (frontend) — plantel e posições multi-desporto (§3.2, §8.5, §9).** UI do plantel adaptada à secção/modalidade (**não toca em auth**):
  - **`lib/schemas/atleta.ts`**: `posicaoEnum` deixa de estar limitado ao futsal e passa a derivar de `z.nativeEnum(Posicao)` — o modelo do atleta aceita agora posições de futebol (§3.2; um atleta multi-desporto guarda todas em `Atleta.posicoes`). Novos `POSICOES_FUTSAL`, `POSICOES_FUTEBOL` (ambos incluem os partilhados GUARDA_REDES/UNIVERSAL) e helper `posicoesPorModalidade(modalidade)` (sem modalidade → todas). Teste `schemas.test.ts` atualizado (posição inválida passa de `AVANCADO`, agora válida, para `LIBERO`; novo caso a aceitar posições de futebol).
  - **`components/plantel/AtletaForm.tsx`**: o seletor de posições filtra as opções pela **modalidade do escalão selecionado** (na criação); na edição (sem escalão em contexto) mostra todas. Seleções ativas fora da modalidade em contexto permanecem visíveis (nunca se escondem). A prop `escaloes` passa a trazer `modalidade`.
  - **Novo `lib/modalidade-escalao.ts`** (helpers puros, sem Server Actions): `mapaModalidadePorEscalao` e `escaloesComModalidade`, para os Server Components enriquecerem escalões com a modalidade da secção sem tocar nas actions. Usado em `plantel/novo`, `plantel/[id]/editar`, `plantel` e `plantel/[id]`.
  - **`app/(app)/plantel/page.tsx`**: quando o clube tem escalões em **2+ secções**, a lista passa a ter **tabs de dois níveis** — 1.º nível por secção (com badge de modalidade), 2.º nível pelos escalões da secção ativa; com uma só secção mantém-se o comportamento atual. Filtragem de atletas por secção feita no Server Component (por cruzamento escalão→secção, sem alterar `listarAtletas`).
  - **Novo `components/plantel/BadgeModalidade.tsx`**: indicador de modalidade (emoji decorativo + rótulo pt-PT; `sr-only` no modo compacto). Mostrado nas tabs de secção/escalão e nos cartões de atleta quando o clube é multi-secção.
  - **`components/plantel/CadernetaAtleta.tsx` + `app/(app)/plantel/[id]/page.tsx`**: caderneta **segmentada por modalidade** — filtro Todas/Futsal/Futebol visível apenas para atletas com participações em 2+ modalidades; habilidades universais (`modalidade` null) aparecem em todas. As modalidades do atleta derivam das secções dos escalões das suas participações.
  - **Nota (dependências de fase):** a segmentação das **estatísticas** do perfil por modalidade depende de agregações por modalidade nas Server Actions (`obterEstatisticasAtleta`/analytics), que pertencem à **Fase 28** (Jogos e estatísticas de futebol) — não há ainda jogos de futebol no sistema; esta fase entrega a segmentação da **caderneta** (dados já disponíveis via `Habilidade.modalidade`). `typecheck` limpo; testes do domínio do plantel (`schemas`, `atletas`, `caderneta`, `habilidades`) verdes (79). Ficheiros de `lib/actions/` (invariante do principal por modalidade), `components/campo/` (Fase 26) e conteúdo curado (Fase 29) são de agentes paralelos.
- **2026-08-19** — **Fase 25 (código) — actions de secção e gestão de escalões por âmbito SECCAO.** Implementados os bloqueadores de QA da Fase 25 (§6.9, §8.1.1; **não toca em auth**):
  - **Novo `lib/actions/seccoes.ts`**: `garantirSeccaoParaModalidade(modalidade)` (upsert idempotente por `@@unique[clubeId, modalidade]`, usado no onboarding e em `criarEscalao`), `obterSeccoes()` (secções do clube com coordenadores), `atribuirCoordenadorSeccao({ seccaoId, membroClubeId, papel })` e `removerMembroSeccao({ seccaoId, membroClubeId })`. **Nota de terminologia:** a gestão de coordenadores exige **`CLUBE_UTILIZADORES`** (gestão de membros, §8.2) — a capacidade `CLUBE_SECCOES` referida em §6.9/§7.3/§8.4 **não existe** no catálogo `lib/permissoes-catalogo.ts`; as funções seguem os nomes pedidos na Fase 25 (`atribuirCoordenadorSeccao`/`removerMembroSeccao`/`garantirSeccaoParaModalidade`/`obterSeccoes`), que divergem dos rótulos de referência de §7.3 (`atribuirCoordenador`/`removerCoordenador`/`criarSeccao`/…).
  - **`lib/actions/escaloes.ts`**: as mutações (`atualizarEscalao`, `definirVisibilidadeEscalao`, `apagarEscalao`, `moverEscalao`) passam a aceitar **`SECCAO_ESCALOES_GERIR`** (resolvido por `exigirCapacidade` contra `escalao.seccaoId ∈ seccoesCoordenadas`) **ou** `CLUBE_ESCALOES` (nível clube), via helper `exigirGestaoEscalao`. `criarEscalao` passa a atribuir `seccaoId` (do payload ou derivado de `garantirSeccaoParaModalidade(FUTSAL)`) e valida o âmbito de secção do Coordenador na criação.
  - **`lib/schemas/escalao.ts`**: novo `criarEscalaoSchema` (= base + `seccaoId?` opcional); `escalaoSchema` (update) inalterado.
  - **`lib/permissoes-catalogo.ts`**: `PerfilArranque.ambito` alargado a `SECCAO`; adicionado o perfil de arranque **"Coordenador de Secção"** (âmbito `SECCAO`, capacidade `SECCAO_ESCALOES_GERIR`). Testes atualizados (`escaloes.test.ts`, `novaEpoca.test.ts`: 5 perfis de arranque). **1055 testes verdes.**
- **2026-08-19** — **Fase 25 (código) — labels/UI dos novos enums de futebol.** Adicionadas as entradas em falta nos `Record<Enum,…>` exaustivos para as 9 novas posições de futebol (`DEFESA_CENTRAL`, `LATERAL_DIREITO`, `LATERAL_ESQUERDO`, `MEDIO_DEFENSIVO`, `MEDIO_CENTRO`, `MEDIO_OFENSIVO`, `EXTREMO_DIREITO`, `EXTREMO_ESQUERDO`, `AVANCADO`) em `LABEL_POSICAO`/`ABREV_POSICAO` (`lib/schemas/atleta.ts`, rótulos pt-PT §2.3/§3.2; abreviaturas DC/LD/LE/MD/MC/MO/ED/EE/AV) e para os 4 novos eventos de futebol (`REMATE`, `CANTO`, `FORA_DE_JOGO`, `DESARME`) em `LABEL_TIPO_EVENTO` (`lib/schemas/jogo.ts`), `EMOJI_EVENTO` (`components/jogos/TimelineEventos.tsx`: 🎯/🚩/🚫/🛡️) e `EVENTO_TIPOS` (`lib/actions/analise.ts`) — §3.7. Teste `jogos-f5.test.ts` atualizado (posição inválida passa de `"AVANCADO"`, agora válida, para `"LIBERO"`). **Não toca em auth.**
- **2026-08-19** — **v7 — Revisão pós-auditoria.** Correções e decisões incorporadas na bíblia v7 (só documentação; **não toca em auth**):
  - **(B1)** Colisão de nome resolvida: o campo de formato de jogo em `Competicao` passa a **`formatoJogo FormatoJogo?`** (distinto do já existente `formato FormatoCompeticao` LIGA/TORNEIO/TACA) — §3.7, §19(D), Apêndice C.3.
  - **(B2)** Coordenador de Secção ganha **capacidade dedicada `SECCAO_ESCALOES_GERIR`** (âmbito `SECCAO`) em vez de `CLUBE_ESCALOES` restringido; `CLUBE_*` mantém-se sempre de nível clube — §6.2, §6.3, §6.6, §6.9. Uma pessoa pode ter `MembroSeccao` em múltiplas secções (raro, válido).
  - **(B3)** Regra do **primeiro principal de uma modalidade nova**: `associarAEscalao` cria `PRINCIPAL` automaticamente quando não há principal activo nessa modalidade (única excepção) — §9.
  - **(B4)** **Pré-requisito de migração**: concluir o *contract* v6 pendente (`Clube.clubeTecnico`, `Atleta.clubeId` NOT NULL, remover `Atleta.escalaoId` legado, `Exercicio.proprietario @default(TREINADOR)`) antes das migrações v7 — §0, Apêndice C.
  - **(D1)** **Pricing multi-secção fechado**: 2.ª secção = **+50% do tier base** (tier da secção mais cara + 50% por secção adicional); enforcement na Fase 30 — §17.1.
  - **(D2)** Persona do **treinador individual dual-sport**: Individual = uma modalidade; para duas, licença de Clube/Clube Técnico — §1.7.4, §17.1.
  - **(D3)** Nova funcionalidade **modalidade da actividade** em `Sessao` e `Jogo` (`modalidadeAtividade Modalidade?`, null = herda da secção; badge quando difere) + breakdown analítico — §3.5, §3.7, §8.8, §8.11, §10.2, Apêndice C.3.
  - **(M1)** Modelo `Licenca`/`Carteira`/`MovimentoCarteira` **transcrito integralmente** em §3.11 + campos multi-secção (`modalidade`, `numSeccoes`).
  - **(M2)** **Dependências explícitas** entre Fases 26–30 — §16.
  - **(M3)** `TipoCampo` formalizado (alinha com `FormatoJogo`; sem `campo` → `FUTSAL_5`; genérico → campo neutro) — §11.2.
  - **(M4)** Mapeamento escalão↔formato de futebol corrigido (inclui **Juvenis** → `FUTEBOL_11`) — §2.3, Apêndice B.
  - **(M5)** Invariante do principal por modalidade: garantido por lógica aplicacional em transacção `Serializable` (não por índice BD); `modalidadeDoEscalao` cacheável — §9.
  - **(M6)** Invariantes cross-entidade validadas na aplicação (clube↔secção↔escalão; posição↔modalidade da convocatória) — §9.
  - **(M7)** `criarEscalao` bloqueia segunda modalidade em clube técnico Individual — §7.3.
- **2026-08-19** — **Criação da bíblia v7 (`Mister_Spec_v7.md`) — Mister passa a plataforma multi-desporto (futsal + futebol).** Novo ficheiro que sucede à `Mister_Spec_v6.md` (**mantida intacta como histórico**, à semelhança do que a v6 fez à v5). Atualização **só de documentação** (nenhuma alteração de código; **não toca em auth**). A v7 expande o produto de dedicado ao futsal para **multi-desporto**, mantendo **um único código, um único modelo de dados multi-tenant e a mesma filosofia**. Todas as decisões de produto abaixo estão **fechadas**.
  - **(A) Nota de versão v7 (§0):** resumo executivo das 12 adições e do princípio de compatibilidade **aditiva** (colunas/tabelas novas, nullable/default + backfill; dados existentes 100% futsal migram sem perda).
  - **(B) Nova entidade `Secção` (§3.1.1, §20.2):** camada entre `Clube` e `Escalão`, **âncora da modalidade**. `Seccao` = `clubeId` + `modalidade` (`Modalidade { FUTSAL FUTEBOL }`) + `nome?` + escalões + membros (coordenadores). **`@@unique([clubeId, modalidade])`** — **uma secção por modalidade por clube**. Novo `MembroSeccao` (vínculo membro↔secção, `PapelSeccao { COORDENADOR }`). `Escalao` ganha **`seccaoId`** + relação. Criação **automática/transparente** ao criar o primeiro escalão de uma modalidade (§8.1.1). Backfill: uma secção FUTSAL por clube existente, com todos os escalões ligados (Apêndice C).
  - **(C) Coordenador de Secção (§6.9, §6.6):** novo papel de arranque + novo valor de âmbito **`AmbitoPerfil.SECCAO`** (todos os escalões de uma secção) + nova capacidade **`CLUBE_SECCOES`**. Vê/gere todos os escalões da sua secção, não os das outras. `exigirCapacidade` (§6.7) e `obterMembroAtual` (§7.2) passam a resolver o âmbito de secção (`seccoesCoordenadas`).
  - **(D) Formatos de futebol (§3.7, Apêndice B):** enum **`FormatoJogo { FUTSAL_5 FUTEBOL_3_3 FUTEBOL_5_5 FUTEBOL_7 FUTEBOL_9 FUTEBOL_11 }`**. `Jogo.formato` e `Competicao.formatoJogo` (`FormatoJogo`) — pré-preenchidos pela secção do escalão, editáveis; determinam o campo do editor e o núcleo estatístico. (Em `Competicao` o campo é `formatoJogo`, distinto do já existente `formato FormatoCompeticao` LIGA/TORNEIO/TACA.)
  - **(E) Posições de futebol (§3.2):** `Posicao` expandido com `DEFESA_CENTRAL`, `LATERAL_DIREITO`, `LATERAL_ESQUERDO`, `MEDIO_DEFENSIVO`, `MEDIO_CENTRO`, `MEDIO_OFENSIVO`, `EXTREMO_DIREITO`, `EXTREMO_ESQUERDO`, `AVANCADO` (mantendo `GUARDA_REDES` e `UNIVERSAL` partilhados; futsal `FIXO`/`ALA`/`PIVO` intactos). Seletor filtra por modalidade do contexto.
  - **(F) Estatísticas de futebol (§3.7, §10.8):** mesmo princípio do futsal — **núcleo fixo** (golos, assistências, defesas GR, **remates, cantos, foras-de-jogo, desarmes**) + **configurável** por cima (`MetricaConfig`, opcionalmente por `modalidade`). `EstatisticaAtleta` ganha `remates/cantos/forasDeJogo/desarmes` (nullable). `TipoEventoJogo` ganha `REMATE/CANTO/FORA_DE_JOGO/DESARME`. `faltas1aParte`/`faltas2aParte` **só visíveis em FUTSAL**. Sem bloqueio de substituições (informativo).
  - **(G) Campo de futebol SVG (§11.5):** todos os formatos (3×3 a 11×11) no mesmo motor de diagrama; `DiagramaCampo.campo?` (`TipoCampo`) determina o fundo (retrocompatível: legados sem `campo` → FUTSAL_5). Coordenadas mantêm 1u=10cm.
  - **(H) Atleta multi-desporto (§1.7.3, §3.2, §9):** um único `Atleta` por pessoa; participações (`AtletaEscalao`) em escalões de secções diferentes. Invariante "participação principal única" passa a ser **por (atleta, época, modalidade)**. Estatísticas/caderneta **segmentadas por modalidade/secção** na UI (§8.5, §10.1, §10.8).
  - **(I) Licenciamento multi-secção (§17):** Individual = **uma** modalidade (preço mantém-se €4,99/mês·€49/ano); Clube = **uma ou várias secções** (tier por total de escalões; **acréscimo por secção adicional** recomendado ≈ +50% do tier; enforcement de billing deferido). `Licenca.modalidade` (⚠️) regista a modalidade Individual.
  - **(J) Nova secção 20 — Arquitetura multi-desporto e extensibilidade:** camadas agnóstica/parametrizável/específica (20.1); Secção como âncora + Coordenador (20.2); registry `ConfigModalidade` (20.3); como adicionar um novo desporto no futuro (20.4).
  - **(K) Apêndices:** A (Configuração de Futsal), B (Configuração de Futebol, todos os formatos), C (Matriz de migração v6→v7, aditiva + backfill).
  - **(L) Fases 25–30 (§16):** roadmap de expansão com objetivo, entidades/ficheiros e **critério de pronto** por fase (25 Fundação · 26 Campo de futebol · 27 Posições/plantel · 28 Jogos/estatísticas · 29 Conteúdo curado · 30 Onboarding/navegação/billing). Fase 25 é pré-requisito das restantes; todas **aditivas** e **sem tocar em auth**.
  - **Compatibilidade:** nenhuma alteração é destrutiva; a modalidade deriva **sempre** da secção do escalão (nunca do cliente); um clube/treinador monomodalidade não vê complexidade nova. **A partir da v7, esta é a bíblia ativa do produto.**

> **📌 Nota de preservação do histórico (v7):** seguindo a mesma convenção que a v6 usou para a v5, o **detalhe verbatim completo** de todas as entradas de changelog anteriores a 2026-08-19 permanece **intacto** em [`Mister_Spec_v6.md`](./Mister_Spec_v6.md) (mantida como histórico). Abaixo preserva-se o **índice completo** (data + título) de **todas** as entradas até 2026-08-18, para que a v7 continue auto-navegável. Nenhuma entrada foi omitida.

### 19.1 Histórico herdado da v6 (índice — detalhe verbatim em `Mister_Spec_v6.md`)

- **2026-08-18** — Contacto na landing: formulário substituído por email direto (`app/page.tsx`).
- **2026-08-17** — Implementação da UI «Semana de trabalho» (§8.9.1).
- **2026-08-17** — Implementação da camada de Server Actions «Semana de trabalho» (§8.9.1).
- **2026-08-17** — Implementação do schema «Semana de trabalho» (§3.5, §8.9.1).
- **2026-08-16** — Implementação da UI do wizard «Nova Época» (§8.21) — cenários A/B/C.
- **2026-08-16** — Implementação da camada de servidor do wizard «Nova Época» (§8.21) — cenários A/B/C.
- **2026-08-16** — Implementação do mecanismo de snapshot §4.2.1 (`SessaoExercicio.snap*`).
- **2026-08-16** — Decisões de produto: semana de trabalho, propriedade/portabilidade definitiva, mecanismo de snapshot, propriedade da periodização e wizard «Nova Época» (§2, §3.3, §3.5, §4.2.1, §4.4, §8.4, §8.8, §8.9, §8.21).
- **2026-08-16** — Rótulo «Analytics» + redesign visual dos painéis + secção de Contacto na landing (§8.15, §10.2, landing).
- **2026-08-13** — F1.3 + F1.4 + F2.2 — Botão de download CSV, melhorias de impressão/PDF e tabela de ACWR individual (§8.15, §8.20).
- **2026-08-13** — F3.3 — Aviso não-bloqueante de conflito de pavilhão em `SessaoForm`/`JogoForm` (§8.16).
- **2026-08-13** — F1.1 + F1.2 — Export CSV dos analíticos: utilitário puro + Server Actions (§8.15).
- **2026-08-13** — Dois fixes de integridade de dados (`Reuniao.criadorId` FK + `Atleta.escalaoId` legado).
- **2026-08-13** — Cinco fixes visuais/UX (`Button` sm 44px, logótipo landing, cor de marca no `global-error`, agenda a todos os treinadores, Jogos na bottom-nav).
- **2026-08-13** — Fix visual da landing pública: fundo branco forçado independentemente do tema.
- **2026-08-13** — Fix de build: funções puras de carga de treino extraídas para fora do módulo de Server Actions (§8.20).
- **2026-08-12** — Testes de unidade para actions sem cobertura (P3.1).
- **2026-08-12** — Cards sociais nativos para Instagram: resultado, MVP e ranking (P4.7) (§3.16).
- **2026-08-12** — Análise de carga de treino: RPE / ACWR (P4.8) (§8.20).
- **2026-08-12** — Decisão documentada: escrita concorrente / audit log — last-write-wins aceite para o MVP (P3.3) (§13.4).
- **2026-08-12** — Enriquecimento do perfil do treinador: métricas de carreira + copiar link (P4.5) (§8.17).
- **2026-08-12** — Arranque de clube utilizável: semear época ativa + escalão e acionar o wizard de onboarding (P1.6+P1.7) (§8.1, §16 fase 20).
- **2026-08-12** — Perfil do treinador / histórico de carreira (P2.4) (§8.17).
- **2026-08-12** — Simplificação do `JogoForm`: agendar vs registar resultado (P4.3).
- **2026-08-12** — UI das métricas configuráveis nos analíticos (P1.9) (§10.1, §10.2).
- **2026-08-12** — Polish das presenças: marcar todos + barra de guardar fixa (P4.1+P4.2) (§8.5).
- **2026-08-12** — Touch targets a 44px em elementos interativos (P2.9) (§19.5).
- **2026-08-12** — `COMUNICACOES_GERIR` no perfil Treinador Principal (P1.8) (§6.6).
- **2026-08-12** — Sistema de Lembretes/Tarefas persistido (P2.1) (§3.15/§8.19).
- **2026-08-12** — Agenda agregada de todos os escalões (P2.2).
- **2026-08-12** — UI da visibilidade de escalão para outros treinadores (P2.8) (§6.4).
- **2026-08-12** — Filtro por competição nos analíticos de escalão (P2.5) (§10.2).
- **2026-08-12** — Aba «Carreira» no perfil do atleta (P2.3, §8.5).
- **2026-08-12** — Apagamento definitivo de atleta (hard-delete RGPD) (P1.3).
- **2026-08-12** — Contraste WCAG AA de texto branco sobre o laranja primário da marca (P2.7) (§12, §12.4).
- **2026-08-12** — Integridade referencial da BD: validação do índice de `AtletaEscalao` (P1.4) e constraints de FK em falta (P1.5).
- **2026-08-12** — Legibilidade da landing pública e da impressão/PDF de relatórios (§12.0/§12.4, §10.6/§10.7).
- **2026-08-12** — Integridade sessão↔periodização: só treinos NORMAL podem ter `planeamentoId` (model `Sessao`).
- **2026-08-11** — Agregação de métricas configuráveis nos analíticos (§10.1, §10.2).
- **2026-08-06** — F10 (Fase 20) — Frontend do onboarding com vitória rápida (§8.1, §16 fase 20).
- **2026-08-06** — F14 (Fase 24) — Tema escuro + motion subtil + dashboard melhorado + lembretes in-app (§12.0/§12.1, §12.4, §8.16, §13.1/§13.3).
- **2026-08-06** — F13 — Polish transversal de experiência (§13.1, §12.0, §16 fase 23 — subconjunto).
- **2026-08-06** — F9 (Fase 19) — Frontend de analytics em 3 níveis + relatório de época partilhável (§8.15, §10.1–10.7).
- **2026-08-06** — F9 (Fase 19) — Camada de servidor de analytics em 3 níveis + relatório de época partilhável (§3.10, §8.15, §10.1–10.6, §16 fase 19).
- **2026-08-06** — F6 (Fase 16) — Frontend de competições e classificação (§8.11, §16 fase 16).
- **2026-08-06** — F6 (Fase 16) — Camada de servidor de competições e classificação (§3.7, §8.11, §16 fase 16).
- **2026-08-06** — F6 (Fase 16) — Base de dados de competições e classificação por inserção manual (§3.7, §16 fase 16).
- **2026-08-06** — F5 (Fase 15) — Frontend de "dia de jogo": abas Plano, Ao Vivo, Scouting, tempos por blocos e cronologia (§3.7, §8.11, §10.4, §16 fase 15).
- **2026-08-06** — F5 (Fase 15) — Camada de actions de "dia de jogo", eventos ao vivo com bloco de tempo e scouting no jogo (§3.7, §16 fase 15).
- **2026-08-06** — F5 (Fase 15) — Camada de dados de "dia de jogo", scouting no jogo e tempos por blocos (§3.7, §16 fase 15).
- **2026-08-06** — F3 — Correções de code review (6 issues *major*) sobre as bibliotecas de exercícios e os templates de sessão.
- **2026-08-06** — F3 — Correção M4 da revisão de código: `parteTreino`/`escalaoAlvo` no formulário de exercício (§8.6).
- **2026-08-06** — F1/F0 — Correções minor da revisão de código: UI de overrides, gating de UI do plantel, revalidação e acessibilidade dos formulários de participação.
- **2026-08-06** — F3 — Cobertura de testes das bibliotecas e dos templates de sessão (QA).
- **2026-08-06** — F7 — UI do gerador de comunicações (WhatsApp).
- **2026-08-06** — F3 — UI das bibliotecas (🎒 pessoal / 🏛️ clube) e dos templates de sessão.
- **2026-08-06** — F1 — Correções de code review (6 issues *major*) sobre `AtletaEscalao` e overrides de membro.
- **2026-08-06** — F4 — UI do modelo de jogo (documento vivo) + editor de campo integrado.
- **2026-08-06** — F7 — Backend do gerador de comunicações (WhatsApp).
- **2026-08-06** — F3 — Backend das bibliotecas (🎒 pessoal / 🏛️ clube) e dos templates de sessão.
- **2026-08-06** — F4 — Backend do modelo de jogo (documento vivo) e dos quadros táticos.
- **2026-08-06** — F1 — UI do plantel alinhada com as participações (`AtletaEscalao`).
- **2026-08-06** — F7 M11 — Migração aditiva `f7_modelocomunicacao`.
- **2026-08-06** — F4 M8 — Migração aditiva `f4_modelojogo_quadro`.
- **2026-08-06** — F1 M3 — Switch de código para `AtletaEscalao`.
- **2026-08-06** — F3 M5 — Migração expand `f3a_exercicio_expand`.
- **2026-08-06** — F1 M2 — Migração expand `f1a_atletaescalao_expand`.
- **2026-08-06** — F8 — Integração Google Calendar (§3.12, §8.13, §16 fase 18) implementada.
- **2026-08-06** — F8 FE — UI de integração Google Calendar (§3.12, §8.13).
- **2026-08-05** — F2 — Editor de campo (gate de qualidade) (secção 11).
- **2026-08-05** — F0 — Fundação de permissões (concluído).
- **2026-08-05** — Criação da bíblia v6 (`Mister_Spec_v6.md`).
- **2026-08-05** — Atualização maior: modelo de negócio, ecossistema e novas funcionalidades (pós-brainstorming).

> **Nota:** as entradas abaixo (até 2026-07-31) foram herdadas da `Mister_Spec_v5.md` e mantêm-se como histórico do MVP e do produto final v1.

- **2026-08-02** — Preparação para deploy (Vercel). `binaryTargets` do Prisma; `docs/DEPLOY.md`.
- **2026-08-02** — Gráficos com a cor do clube + fluxo de entrada.
- **2026-08-02** — Rebranding: Mister → Mister + nova identidade visual.
- **2026-08-02** — Fix: sessão obsoleta em `criarClube`.
- **2026-08-02** — Sincronização da bíblia com o código (§3, §12, §5.5 RGPD).
- **2026-08-02** — Decisão RGPD — consentimento tratado pelo clube.
- **2026-08-02** — Auditoria de produção — Fases 0–6 (build, segurança, dados, ops, visual/a11y, testes). 51 testes.
- **2026-08-02** — Grupos D e E (categoria+subcategorias de exercício; gráficos SVG).
- **2026-08-02** — Grupo B (periodização smart + tipo de sessão).
- **2026-08-01** — Grupos A e C (modelo do atleta: posições múltiplas/escalão secundário/foto/encarregado; "Equipa técnica").
- **2026-08-01** — Fases 3–10 implementadas.
- **2026-07-31** — Fases 1–2 + bíblia completa.
- **2026-07-31** — Validação do modelo de dados e decisões de propriedade. *(A decisão "segue a licença" foi revogada em 2026-08-05 — ver §4.2.)*
- **2026-07-31** — Criação da bíblia v5.

---

## 20. Arquitetura multi-desporto e extensibilidade

> Esta secção fixa **como** o produto suporta múltiplas modalidades sem duplicar código, e como um novo desporto poderá ser acrescentado no futuro. É **prescritiva**.

### 20.1 Camadas: agnóstica / parametrizável / específica

O código organiza-se em **três camadas** face à modalidade (secção 1.7.6):

**1. Camada agnóstica — não sabe nada de modalidade.**
Funciona igual em qualquer desporto. Inclui: contas/autenticação, clubes, membros, perfis, **épocas**, **presenças**, **comunicação (WhatsApp)**, **reuniões**, **lembretes**, **caderneta** (a estrutura; o conteúdo pode ser específico), **licenciamento/carteira**, **relatório partilhável** (contentor), **dashboard** (temporal), **agenda/conflitos de pavilhão**. **Regra:** esta camada **nunca** ramifica por modalidade.

**2. Camada parametrizável — comporta-se conforme a modalidade via configuração.**
O comportamento muda por **dados de configuração** (registry `ConfigModalidade` — 20.3), não por `if (modalidade === …)` espalhados. Inclui: **estatísticas de núcleo** (que campos mostrar/agregar — §10.8), **posições** (que opções oferecer — §3.2), **formato de jogo** (`FormatoJogo` e minutos por bloco — §3.7/§10.8), **campo do editor** (fundo SVG por `TipoCampo` — §11.5), **biblioteca curada** (conteúdo por modalidade — §8.6/§8.7), **rótulos** (terminologia FPF por modalidade). **Regra:** a lógica lê a config da modalidade (derivada da secção); acrescentar/afinar uma modalidade é **editar a config**, não reescrever a lógica.

**3. Camada específica — regras que só existem numa modalidade.**
Exceções irredutíveis. Inclui: **faltas acumuladas por parte** e **power play/GR-jogador** (só futsal — §10.5); **foras-de-jogo, cantos, desarmes, remates** como **núcleo** (só futebol — §10.8). **Regra:** isolar em módulos/funções claramente marcados (⚽/🥅), acionados pela config da camada parametrizável; **nunca** contaminam a camada agnóstica.

> **Objetivo (DEVE):** minimizar a camada específica; a maioria das diferenças futsal↔futebol resolve-se na camada **parametrizável** (config), não em ramos `if`.

### 20.2 Secção como entidade e papel de Coordenador

- A **`Secção`** (§3.1.1) é a **única fonte de verdade da modalidade**. Tudo o que precisa de saber a modalidade sobe do `Escalao` → `Seccao.modalidade`. Não há campo `modalidade` disperso por atletas/jogos/exercícios (os campos `modalidade?` em exercício/template/métrica/habilidade são **de organização/filtro**, não de derivação operacional).
- **Invariante:** `@@unique([clubeId, modalidade])` — um clube tem no máximo uma secção por modalidade.
- **Onboarding transparente:** a secção nasce ao criar o primeiro escalão da modalidade (§8.1.1). Quem só faz uma modalidade nunca vê a secção.
- **Coordenador de Secção** (§6.9): âmbito `SECCAO` — "DT de uma modalidade". Escala organizações grandes/multi-desporto sem dar acesso ao resto do clube.
- **Autorização:** `exigirCapacidade` resolve `TODO_CLUBE`/`SECCAO`/`PROPRIOS_ESCALOES` (§6.7); a secção **nunca** é fonte de autorização por si só — é um filtro de contexto de UI (§5.4) validado no servidor pelo âmbito.

### 20.3 Registry `ConfigModalidade`

Módulo puro `lib/modalidade.ts` (sem `"use server"`, testável, importável no cliente) que centraliza a configuração de cada modalidade. Estrutura de referência (⚠️ afinar na implementação, fases 25–29):

```typescript
type Modalidade = "FUTSAL" | "FUTEBOL";

interface ConfigModalidade {
  modalidade: Modalidade;
  rotulo: string;                       // "Futsal" | "Futebol"
  formatosPermitidos: FormatoJogo[];    // FUTSAL: [FUTSAL_5]; FUTEBOL: [FUTEBOL_3_3..FUTEBOL_11]
  formatoPorDefeito: FormatoJogo;
  posicoes: Posicao[];                  // opções do seletor (inclui partilhadas)
  nucleoEstatistico: CampoEstatistica[];// campos de EstatisticaAtleta a mostrar/agregar (§10.8)
  eventosAoVivo: TipoEventoJogo[];      // subconjunto do enum relevante à modalidade
  mostraFaltasAcumuladas: boolean;      // true só futsal
  minutosPorBloco: Record<BlocoTempo, number> | ((formato: FormatoJogo) => Record<BlocoTempo, number>);
  campoPorFormato: Record<FormatoJogo, TipoCampo>; // fundo SVG do editor (§11.5)
  // biblioteca/rotulos curados podem ser referenciados por modalidade
}

const CONFIG_MODALIDADE: Record<Modalidade, ConfigModalidade> = {
  FUTSAL: { /* Apêndice A */ },
  FUTEBOL: { /* Apêndice B */ },
};

// Resolução operacional: sempre a partir da secção do escalão.
function configDaModalidade(m: Modalidade): ConfigModalidade { return CONFIG_MODALIDADE[m]; }
```

**Regras (DEVE):**
- A camada parametrizável (20.1) **lê sempre** a config via `configDaModalidade(modalidade)`, onde `modalidade` vem da secção do escalão em contexto — **nunca** hard-coded no fluxo.
- Adicionar/afinar uma modalidade = **editar `CONFIG_MODALIDADE`** (+ eventuais funções da camada específica), sem tocar na camada agnóstica.
- O registry é a **fonte única** que a UI (seletores, grelhas, editor) e as agregações consultam.

### 20.4 Como adicionar um novo desporto no futuro

> **FUTURO** (nenhum desporto além de futsal/futebol entra na versão atual — §1.6). A arquitetura fica preparada; os passos abaixo são o "manual" de extensão.

1. **Enum `Modalidade`:** acrescentar o novo valor (ex.: `ANDEBOL`). Migração aditiva.
2. **`FormatoJogo` / `TipoCampo`:** acrescentar os formatos e o(s) fundo(s) de campo do novo desporto (Apêndice B como modelo).
3. **`Posicao`:** acrescentar as posições próprias (partilhando `GUARDA_REDES`/`UNIVERSAL` se aplicável).
4. **`EstatisticaAtleta` / `TipoEventoJogo`:** acrescentar os campos/eventos de núcleo próprios (nullable, aditivos).
5. **`CONFIG_MODALIDADE`:** adicionar a entrada do novo desporto (rótulos, formatos, posições, núcleo estatístico, eventos, campo por formato, minutos por bloco).
6. **Camada específica:** isolar as regras irredutíveis do novo desporto (se existirem) em módulos marcados, acionados pela config.
7. **Campo SVG:** desenhar o(s) fundo(s) no `CampoDesenho` (11.5), mantendo 1u=10cm.
8. **Biblioteca curada + habilidades:** conteúdo de arranque do novo desporto (por formato/parte do treino).
9. **Licenciamento:** decidir a modalidade Individual e o pricing de secção (17.1).
10. **Testes + bíblia:** cobrir o novo desporto (schemas, agregações, autorização de secção) e atualizar esta bíblia (nova entrada de changelog + Apêndice próprio).

**Princípio-guia:** se o passo obriga a mexer na **camada agnóstica**, algo está errado — reavaliar para o resolver na config (parametrizável) ou numa função específica isolada.

---

## 21. Backoffice Interno (Admin)

### 21.1 Âmbito e acesso

O backoffice interno é uma interface exclusiva para o criador da plataforma — não é acessível ao público nem a utilizadores regulares.

**Rota:** `/admin` (grupo de rotas `(admin)`, separado do grupo `(app)`)

**Autorização:** Camada server-side independente da autenticação (ver §5). O admin de plataforma é identificado pelo campo **persistente `Utilizador.isAdmin`** na base de dados (fonte de verdade), **não** por variável de ambiente. O layout do grupo `(admin)` (via `exigirAdminPlataforma()` em `lib/admin-guard.ts`) consulta a BD pelo email do utilizador autenticado (`eAdminPlataforma(email)`); se não existir um `Utilizador` com `isAdmin = true`, redireciona para `/dashboard`. Esta camada **não altera** `lib/auth.ts`, `middleware.ts`, nem o JWT/sessão — segue o mesmo padrão do guarda de licença (`lib/guarda-licenca.ts`).

**Persistência do admin:** `Utilizador.isAdmin Boolean @default(false)` (aditivo — ninguém é admin por omissão). O seed marca `admin@mister.app` com `isAdmin: true`. Para promover/despromover um admin, altera-se o campo na BD (não há allowlist de ambiente).

**Acesso a partir da app (atalho de navegação + redirect):** o backoffice é sempre alcançável por um admin de plataforma, mesmo em **conta híbrida** (admin **com** `MembroClube` ativo). O layout do grupo `(app)` avalia `eAdminPlataforma(email)` **uma vez** e usa o resultado para dois efeitos: **(1)** se o admin **não tiver** clube ativo, o routing de onboarding encaminha-o para `/admin` (comportamento existente); **(2)** o componente `Navegacao` recebe `mostrarAdmin` e, quando `true`, apresenta um item **"Backoffice"** (ícone `ShieldCheck`) no **fim** da navegação (sidebar e menu "Mais" da bottom-nav), isolado das vistas de clube. Um admin **com** clube (híbrido) **não** é redirecionado — permanece no dashboard e acede ao backoffice por este atalho. O item de navegação é **apenas visibilidade**; o acesso continua a ser re-validado server-side por `exigirAdminPlataforma()` no layout do grupo `(admin)`. Rota pura — auth intocada.

### 21.2 Tab 1 — Gestão de Licenças

Lista todas as licenças da plataforma (cross-tenant), com as seguintes colunas:
- Titular: nome do clube (licença Clube) ou email do utilizador (licença Individual)
- Tipo: `INDIVIDUAL` / `CLUBE`
- Tier: `PEQUENO` / `MEDIO` / `GRANDE` / `PARCEIRO` (apenas licenças Clube)
- Estado: `PENDENTE` (aguarda confirmação de pagamento) / `ATIVA` / `SUSPENSA` / `CANCELADA` / `EXPIRADA`
- Ciclo: `MENSAL` / `ANUAL`
- `dataFim`
- `precoCentimos`

**Operações disponíveis por licença:**
- **Ativar** → estado `ATIVA`
- **Suspender** → estado `SUSPENSA`
- **Cancelar** → estado `CANCELADA`
- **Editar `dataFim`** → renovar ou reduzir o prazo

**Nota:** O estado `EXPIRADA` é derivado automaticamente pelo sistema quando `dataFim` é ultrapassado — não é uma operação manual do admin.

**Titular polimórfico:** cada `Licenca` tem `utilizadorId` (Individual) XOR `clubeId` (Clube), conforme §3.11. A listagem resolve e apresenta os dois tipos sem assumir que um deles está preenchido.

**Gestão de contas dentro de uma licença de Clube (drill-down):** cada licença de Clube pode ser **expandida** (chevron / botão "Contas") para revelar os **membros/contas** associados ao clube — nome, email, perfil e estado da adesão (`ATIVO` / `INATIVO` / `CONVIDADO`), com badge de **Admin** para quem tem capacidades efetivas de administrador do clube. O admin de plataforma pode aí:
- **Editar dados básicos de uma conta** (nome + email) — `editarUtilizadorAdmin`; colisão de email devolve erro tratável (email único na plataforma).
- **Suspender / reativar uma conta individual** (não o clube inteiro) — `alterarEstadoMembroAdmin` alterna `MembroClube.estado` entre `INATIVO` (suspensa, regista `dataSaida`) e `ATIVO` (reativada, limpa `dataSaida`); a reativação recusa se a conta já tem outra adesão ativa noutro clube (invariante "no máximo uma adesão ATIVA por utilizador").

Estas operações são **cross-tenant** (só admins de plataforma, gate `exigirAdminPlataforma()`), em `lib/actions/admin-membros.ts` (`listarMembrosClube`, `editarUtilizadorAdmin`, `alterarEstadoMembroAdmin`). Nunca usam `obterMembroAtual()` (o admin não tem adesão a clube).

**Integração com Paddle:** deferida (Fase 30). Todas as operações desta tab são administrativas manuais e não interagem com `paddleSubscriptionId` / `paddleCustomerId`.

### 21.3 Tab 2 — Monitorização Técnica

Embeds ou links diretos para ferramentas externas de observabilidade. Sem logging próprio na app.

- **Vercel Analytics** — métricas de performance e tráfego (disponível no plano Vercel, zero custo adicional)
- **Sentry** — erros client-side e server-side (setup pendente, ver `docs/DEPLOY.md §6`)

A tab degrada graciosamente: se `SENTRY_DSN` ou as URLs relevantes não estiverem configurados, mostra mensagem "Por configurar" em vez de iframe partido.

---

## 22. Mano-a-Mano (duelos 1×1)

> **Estatuto:** especificação da feature **Mano-a-Mano** — competições de **duelos 1×1** entre atletas. Corresponde à **Fase 33** (secção 16). Migração **aditiva** (Apêndice C). **Não toca em auth.**
> **Nota de numeração:** esta secção é a **22** (as secções 20 e 21 já estavam ocupadas por «Arquitetura multi-desporto» e «Backoffice Interno»); a designação interna da feature é «Mano-a-Mano».

### 22.1 Visão e âmbito

O **Mano-a-Mano** organiza **duelos 1×1** entre atletas em torno de uma **competição** (nunca duelos soltos): uma **liga anual** (todos-contra-todos ao longo da época) ou um **torneio** (eliminatório ou round-robin). É uma camada leve e competitiva que aproveita os treinos existentes — os duelos são **distribuídos automaticamente pelos treinos disponíveis** — e alimenta o desenvolvimento do atleta com um registo de confrontos diretos.

**Princípios (fechados):**
- **Formato por defeito:** primeiro a marcar **2 golos** — resultados possíveis **2–0** ou **2–1**, **sem empate**. Configurável por competição (secção 22.4).
- **Todo o duelo pertence a uma competição** (liga ou torneio). Não há duelos avulsos sem prova associada.
- **Inter-clubes sem contas externas:** um clube adversário é registado como **`ClubeExterno`** (nome + localidade, sem conta Mister) e os seus atletas como **participantes externos** — sem qualquer acesso à plataforma.
- **Distribuição automática:** os duelos são espalhados pelos treinos futuros disponíveis, **sem número fixo** por treino.
- **Formatos de torneio:** apenas **`ELIMINATORIO`** e **`ROUND_ROBIN`** (não há fase de grupos + eliminatória nesta versão).
- **Gamificação (badges, pontos de XP, celebrações dedicadas): FUTURO** — não implementar agora (ver secção 18).

**Modalidade:** cada competição 1×1 pertence a um **escalão anfitrião** e herda a **modalidade** da secção desse escalão (secção 1.7.1). Não há campo de modalidade próprio.

### 22.2 Glossário da feature

- **Competição Mano-a-Mano** — a prova (liga anual ou torneio) que agrupa participantes e duelos.
- **Participante** — um competidor da prova: um **atleta** do clube ou um **atleta externo** (de um `ClubeExterno`).
- **Duelo (match)** — um confronto 1×1 entre dois participantes (um dos lados pode ser **bye**).
- **Bye** — passagem automática à ronda seguinte quando um participante não tem adversário (bracket ou N ímpar em round-robin).
- **Fixtures** — o conjunto de duelos gerado automaticamente (jornadas de liga ou bracket de torneio).
- **Classificação** — tabela **calculada** (não persistida) a partir dos duelos `REALIZADO`.

### 22.3 Modelo de dados

Stack de persistência conforme secção 3 (Prisma + PostgreSQL, `id` = `cuid`). Todas as entidades são **multi-tenant** (isoladas por `clubeId`) e, quando aplicável, por `epocaId`.

```prisma
// A prova 1×1 (liga anual ou torneio). Herda a modalidade da secção do escalão anfitrião.
model CompeticaoManoMano {
  id              String                   @id @default(cuid())
  clubeId         String                   // scope multi-tenant
  clube           Clube                    @relation(fields: [clubeId], references: [id], onDelete: Cascade)
  epocaId         String                   // isolamento por época
  epoca           Epoca                    @relation(fields: [epocaId], references: [id], onDelete: Cascade)
  escalaoId       String?                  // anfitrião; nullable só para torneios inter-escalões
  escalao         Escalao?                 @relation(fields: [escalaoId], references: [id], onDelete: SetNull)
  nome            String                   // ex.: "Liga 1×1 Sub-13 2025/26"
  tipo            TipoManoMano             // LIGA_ANUAL | TORNEIO
  ambito          AmbitoManoMano           @default(INTRA_CLUBE) // INTRA_CLUBE | INTER_CLUBES
  formatoTorneio  FormatoTorneioManoMano?  // só se tipo=TORNEIO: ELIMINATORIO | ROUND_ROBIN
  formatoDuelo    FormatoDuelo             @default(PRIMEIRO_A_DOIS)
  golosParaVencer Int                      @default(2)
  duracaoLimiteMin Int?                    // só FormatoDuelo.TEMPO_LIMITE
  pontosVitoria   Int                      @default(3)
  pontosEmpate    Int                      @default(1)
  pontosDerrota   Int                      @default(0)
  criteriosDesempate Json?                 // lista ordenada; default em 22.5
  integraTreinos  Boolean                  @default(false)
  estado          EstadoManoMano           @default(ATIVA) // ATIVA | CONCLUIDA | ARQUIVADA
  criadorId       String
  criador         Utilizador               @relation(fields: [criadorId], references: [id])
  criadoEm        DateTime                 @default(now())
  atualizadoEm    DateTime                 @updatedAt

  participantes   ParticipanteManoMano[]
  matches         MatchManoMano[]

  @@index([clubeId])
  @@index([epocaId, escalaoId])
  @@index([estado])
}

// Clube adversário sem conta Mister (modo inter-clubes). Só identificação.
model ClubeExterno {
  id                 String                 @id @default(cuid())
  nome               String
  localidade         String?
  criadoPorClubeId   String                 // clube que criou este registo
  criadoPorClube     Clube                  @relation(fields: [criadoPorClubeId], references: [id], onDelete: Cascade)
  criadoEm           DateTime               @default(now())

  participantes      ParticipanteManoMano[]

  @@index([criadoPorClubeId])
}

// Um competidor da prova: atleta do clube OU atleta externo.
model ParticipanteManoMano {
  id                String              @id @default(cuid())
  competicaoId      String
  competicao        CompeticaoManoMano  @relation(fields: [competicaoId], references: [id], onDelete: Cascade)
  tipo              TipoParticipante    // ATLETA | EXTERNO
  atletaId          String?             // preenchido se tipo=ATLETA
  atleta            Atleta?             @relation(fields: [atletaId], references: [id], onDelete: Cascade)
  atletaExternoNome String?             // nome se tipo=EXTERNO
  clubeExternoId    String?             // clube externo se tipo=EXTERNO
  clubeExterno      ClubeExterno?       @relation(fields: [clubeExternoId], references: [id], onDelete: SetNull)
  seed              Int?                // cabeça de série (bracket)
  grupo             String?             // fase de grupos (FUTURO)
  ativo             Boolean             @default(true)
  criadoEm          DateTime            @default(now())

  matchesA          MatchManoMano[]     @relation("ParticipanteA")
  matchesB          MatchManoMano[]     @relation("ParticipanteB")
  vitoriasEm        MatchManoMano[]     @relation("VencedorMatch")

  @@unique([competicaoId, atletaId]) // um atleta por competição
  @@index([competicaoId])
}

// Um duelo 1×1. O lado B pode ser null (bye). O vencedor é derivado do resultado.
model MatchManoMano {
  id                     String                @id @default(cuid())
  competicaoId           String
  competicao             CompeticaoManoMano    @relation(fields: [competicaoId], references: [id], onDelete: Cascade)
  participanteAId        String
  participanteA          ParticipanteManoMano  @relation("ParticipanteA", fields: [participanteAId], references: [id], onDelete: Cascade)
  participanteBId        String?               // null = bye
  participanteB          ParticipanteManoMano? @relation("ParticipanteB", fields: [participanteBId], references: [id], onDelete: Cascade)
  ronda                  Int?                  // jornada (liga) ou fase codificada (bracket: 1=final, 2=meias, 4=quartos…)
  ordemNaRonda           Int?
  chaveBracket           String?               // posição no bracket para progressão
  proximoMatchId         String?               // self-FK: avanço do vencedor (eliminatória)
  proximoMatch           MatchManoMano?        @relation("ProgressaoBracket", fields: [proximoMatchId], references: [id], onDelete: SetNull)
  origemProximo          MatchManoMano[]       @relation("ProgressaoBracket")
  data                   DateTime?             // agendamento (null = por definir)
  local                  String?
  sessaoId               String?               // duelo agendado num treino
  sessao                 Sessao?               @relation(fields: [sessaoId], references: [id], onDelete: SetNull)
  estado                 EstadoMatch           @default(AGENDADO) // AGENDADO | REALIZADO | ADIADO | ANULADO
  golosA                 Int?
  golosB                 Int?
  vencedorParticipanteId String?               // derivado automaticamente
  vencedor               ParticipanteManoMano? @relation("VencedorMatch", fields: [vencedorParticipanteId], references: [id], onDelete: SetNull)
  empate                 Boolean               @default(false)
  registadoPorId         String?
  registadoPor           MembroClube?          @relation(fields: [registadoPorId], references: [id], onDelete: SetNull)
  criadoEm               DateTime              @default(now())
  atualizadoEm           DateTime              @updatedAt

  @@index([competicaoId, ronda])
  @@index([sessaoId])
  @@index([estado])
}

enum TipoManoMano {
  LIGA_ANUAL
  TORNEIO
}

enum AmbitoManoMano {
  INTRA_CLUBE
  INTER_CLUBES
}

// Só ELIMINATORIO e ROUND_ROBIN (sem fase de grupos + eliminatória nesta versão).
enum FormatoTorneioManoMano {
  ELIMINATORIO
  ROUND_ROBIN
}

enum FormatoDuelo {
  PRIMEIRO_A_DOIS   // por defeito: primeiro a marcar 2 golos (2–0 ou 2–1)
  MELHOR_DE_2_JOGOS
  TEMPO_LIMITE      // usa duracaoLimiteMin
}

enum EstadoManoMano {
  ATIVA
  CONCLUIDA
  ARQUIVADA
}

enum EstadoMatch {
  AGENDADO
  REALIZADO
  ADIADO
  ANULADO
}

enum TipoParticipante {
  ATLETA
  EXTERNO
}
```

> **Classificação — calculada, não persistida:** não há tabela de classificação. A função `obterClassificacaoManoMano` (secção 22.6) computa a tabela a partir dos `MatchManoMano` em estado `REALIZADO`, aplicando pontos e a ordem de desempate (secção 22.5). Isto segue o mesmo princípio de `obterClassificacao` das competições (secção 3.7/10.9).

> **Relações inversas (DEVE):** as coleções acima (`Clube.competicoesManoMano`, `Clube.clubesExternos`, `Epoca.competicoesManoMano`, `Escalao.competicoesManoMano`, `Atleta.participacoesManoMano`, `Utilizador.competicoesManoManoCriadas`, `Sessao.duelosManoMano`, `MembroClube.duelosRegistados`) DEVEM ser declaradas nos modelos-alvo aquando da migração (aditivas — Apêndice C).

### 22.4 Configuração da competição

- **`tipo`** — `LIGA_ANUAL` (todos-contra-todos ao longo da época; classificação por pontos) ou `TORNEIO` (prova pontual).
- **`formatoTorneio`** (só torneios) — `ELIMINATORIO` (bracket com byes) ou `ROUND_ROBIN` (todos-contra-todos numa janela curta).
- **`ambito`** — `INTRA_CLUBE` (atletas do próprio clube; por defeito) ou `INTER_CLUBES` (mistura atletas do clube com participantes externos de `ClubeExterno`).
- **`formatoDuelo`** — `PRIMEIRO_A_DOIS` (por defeito), `MELHOR_DE_2_JOGOS` ou `TEMPO_LIMITE` (com `duracaoLimiteMin`).
- **`golosParaVencer`** — por defeito **2** (usado por `PRIMEIRO_A_DOIS`).
- **Pontuação** — `pontosVitoria`/`pontosEmpate`/`pontosDerrota` (por defeito 3/1/0). No formato por defeito não há empates, mas os campos suportam formatos alternativos.
- **`integraTreinos`** — quando `true`, a geração distribui os duelos pelos treinos futuros disponíveis (secção 22.5/22.7).

### 22.5 Regras de negócio

1. **Validação de resultado (`PRIMEIRO_A_DOIS`):** o único marcador válido é **2–0** ou **2–1** (o vencedor tem exatamente `golosParaVencer` golos; o perdedor tem menos). Qualquer outro marcador é **rejeitado por Zod** (secção 22.6). `TEMPO_LIMITE` admite empate; `MELHOR_DE_2_JOGOS` decide por soma/critério da competição.
2. **Vencedor derivado (DEVE):** `vencedorParticipanteId` e `empate` são **calculados automaticamente** a partir de `golosA`/`golosB` no registo do resultado — **nunca** introduzidos à mão.
3. **Ordem de desempate (default de `criteriosDesempate`):** `pontos → vitórias → diferença de golos → golos marcados → confronto direto → ordem alfabética`. Configurável por competição (lista ordenada em `criteriosDesempate`).
4. **Geração round-robin:** **algoritmo do círculo**; com **N ímpar**, introduz-se um **bye rotativo** (cada participante folga uma jornada). N participantes → **N×(N−1)/2** duelos (uma volta). Distribuição automática pelos **treinos futuros disponíveis** quando `integraTreinos = true`.
5. **Bracket eliminatório:** **byes atribuídos aos primeiros seeds** para completar até à potência de 2; o vencedor de cada duelo avança para `proximoMatchId`; a **ronda é codificada** (1 = final, 2 = meias, 4 = quartos…). **Regenerar o bracket é bloqueado** se já existirem resultados registados.
6. **Participante elegível (registo em treino):** atleta **ativo** no escalão **e presente** na sessão (a marcação de presença é a fonte de elegibilidade — secção 22.7).
7. **Atleta que sai:** os seus duelos **futuros** passam a `ANULADO`; o **histórico** (duelos `REALIZADO`) é **preservado**; o participante fica `ativo = false`.
8. **Todo o duelo pertence a uma competição** — não é possível criar um `MatchManoMano` sem `competicaoId` (mesmo o duelo ad-hoc, secção 22.6, exige `competicaoId`).
9. **Isolamento:** todas as leituras/escritas filtram por `clubeId` e, quando aplicável, `epocaId` (época ativa via `obterEpocaAtiva`).

### 22.6 Server Actions e rotas

**Server Actions (`lib/actions/mano-a-mano.ts`)** — padrão da secção 7.1 (Zod → `obterMembroAtual` → `exigirCapacidade` → época → operar filtrando por clube+época → `revalidatePath` → `Resultado<T>`). Capacidade **`MANOAMANO_GERIR`** para escrita (exceto o registo de duelo em sessão, que aceita `TREINOS_GERIR` — secção 22.7). Schemas Zod em `lib/schemas/mano-a-mano.ts`.

```
listarCompeticoesManoMano(escalaoId?)          // leitura, filtrada por época + escalões legíveis
obterCompeticaoManoMano(id)
criarCompeticaoManoMano(dados)                 // transacional: competição + participantes + fixtures
atualizarCompeticaoManoMano(id, dados)
concluirCompeticaoManoMano(id)                 // estado → CONCLUIDA
arquivarCompeticaoManoMano(id)                 // estado → ARQUIVADA
apagarCompeticaoManoMano(id)
adicionarParticipante(competicaoId, dados)     // ATLETA ou EXTERNO
removerParticipante(participanteId)            // aplica a regra do atleta que sai (22.5.7)
preverFixturesManoMano(competicaoId, opcoes)   // dry-run (pré-visualização, sem gravar)
gerarFixturesManoMano(competicaoId)            // round-robin (liga / round-robin)
gerarBracketManoMano(competicaoId)             // bracket eliminatório (bloqueado se há resultados)
agendarDuelo(matchId, { data?, local?, sessaoId? })
registarResultadoManoMano(matchId, { golosA, golosB }) // deriva vencedor/empate
anularDuelo(matchId)                           // estado → ANULADO
reabrirDuelo(matchId)                          // REALIZADO → AGENDADO (limpa resultado)
criarDueloAdHoc(dados)                         // competicaoId OBRIGATÓRIO
obterClassificacaoManoMano(competicaoId)       // CALCULADA a partir dos REALIZADO
obterDuelosDaSessao(sessaoId)                  // bloco Mano-a-Mano no detalhe do treino
criarClubeExterno(dados)                       // { nome, localidade? }
listarClubesExternos()
```

**Rotas (App Router):**
- `/mano-a-mano` — lista de competições, **tabs por escalão**.
- `/mano-a-mano/novo` — **wizard de criação** (tipo/formato/âmbito → participantes → pré-visualização de fixtures → gravação transacional).
- `/mano-a-mano/[id]` — detalhe da competição + **calendário** (liga) ou **bracket** (torneio), com agendamento e registo de resultados.
- `/mano-a-mano/[id]/classificacao` — **tabela de classificação** calculada.

### 22.7 Integração com features existentes

- **Sessões de treino (§8.8):** o detalhe da sessão ganha um bloco **«Mano-a-Mano»** com os duelos agendados para esse treino (`obterDuelosDaSessao`) e o **registo de resultado** in-loco. Este registo é gated por **`TREINOS_GERIR`** (além de `MANOAMANO_GERIR`), para que o adjunto que conduz o treino possa fechar os duelos. A elegibilidade dos participantes segue as presenças da sessão (secção 22.5.6).
- **Dashboard (§8.13):** card **«Próximo duelo Mano-a-Mano»** associado ao próximo treino, quando existem duelos agendados.
- **Plantel (§8.5):** a ficha do atleta pode mostrar o **registo 1×1 da época** (vitórias/derrotas, confrontos) — **FUTURO**.
- **Analytics / Relatório de época (§10, §8.16):** a **classificação final** e o **campeão 1×1** entram no relatório de fim de época partilhável, visíveis via `RELATORIOS_VER`.

### 22.8 Testes (Vitest)

- **Funções puras de geração** (`lib/mano-a-mano.ts`): round-robin (algoritmo do círculo, N par e N ímpar com bye rotativo, nº correto de duelos), bracket eliminatório (byes aos primeiros seeds, codificação de ronda, avanço via `proximoMatchId`).
- **Ordem de desempate:** pontos → vitórias → DG → GM → confronto direto → alfabético.
- **Validação Zod do resultado:** `PRIMEIRO_A_DOIS` aceita só 2–0/2–1 e rejeita o resto; derivação de `vencedorParticipanteId`/`empate`.
- **Actions:** isolamento multi-tenant, capacidade `MANOAMANO_GERIR`, transacionalidade de `criarCompeticaoManoMano`, regra do atleta que sai (futuros `ANULADO`, histórico preservado), bloqueio de regeneração com resultados existentes, `criarDueloAdHoc` exige `competicaoId`.

---

## Apêndice A — Configuração de Futsal ⚽

Referência da entrada `CONFIG_MODALIDADE.FUTSAL` (registry — 20.3). Reflete o comportamento já existente (v6), agora explicitado como configuração.

- **Rótulo:** "Futsal".
- **Formatos permitidos:** `[FUTSAL_5]`. **Formato por defeito:** `FUTSAL_5`.
- **Campo (editor):** `FUTSAL_5` → 40×20 m, viewBox 400×200 (1u=10cm); meio-campo, círculo central (r=30), áreas de baliza (quarto de círculo 6 m), marca de grande penalidade (6 m), **segunda penalidade (10 m)**, balizas 3 m (§11.1).
- **Posições:** `GUARDA_REDES`, `FIXO`, `ALA`, `PIVO`, `UNIVERSAL`.
- **Núcleo estatístico (`EstatisticaAtleta`):** `golos`, `assistencias`, `faltasCometidas`, e (só GR) `defesas`, `golosSofridosGR`. **Não usa:** `remates`, `cantos`, `forasDeJogo`, `desarmes` (ficam a `null`).
- **Estatística de equipa (`Jogo`):** `faltas1aParte`, `faltas2aParte` (**faltas acumuladas por parte** — destaque à 5.ª). **`mostraFaltasAcumuladas = true`.**
- **Eventos ao vivo:** `GOLO`, `ASSISTENCIA`, `FALTA`, `CARTAO_AMARELO`, `CARTAO_VERMELHO`, `SUBSTITUICAO`, `DEFESA`, `GOLO_SOFRIDO`, `TIMEOUT`.
- **Camada específica:** faltas acumuladas por parte; **power play / GR-jogador** (derivado dos eventos de substituição — §10.5); quintetos/rotações.
- **Tempo por bloco (`minutosPorBloco`):** `JOGO_COMPLETO=40`, `MEIA_PARTE=20`, `BLOCO_10MIN=10`, `BLOCO_5MIN=5`, `NAO_JOGOU=0` (§10.1).
- **Biblioteca curada / caderneta:** conteúdo de futsal (v6 — `lib/biblioteca-arranque.ts`, `lib/templates-arranque.ts`).

## Apêndice B — Configuração de Futebol 🥅 (todos os formatos)

Referência da entrada `CONFIG_MODALIDADE.FUTEBOL` (registry — 20.3). **Produto final — todos os formatos.** Dimensões de **referência** (a formação juvenil varia por associação; ⚠️ afinar por formato nas fases 26/28).

- **Rótulo:** "Futebol".
- **Formatos permitidos:** `[FUTEBOL_3_3, FUTEBOL_5_5, FUTEBOL_7, FUTEBOL_9, FUTEBOL_11]`.
- **Formato por defeito por escalão (recomendação, editável):** petizes → `FUTEBOL_3_3`; traquinas → `FUTEBOL_5_5`; Benjamins (Sub-10/11) → `FUTEBOL_7`; Infantis/Iniciados (Sub-12/13) → `FUTEBOL_9`; Juvenis (Sub-15/17)/Juniores (Sub-19)/Seniores → `FUTEBOL_11`.
- **Posições:** `GUARDA_REDES`, `DEFESA_CENTRAL`, `LATERAL_DIREITO`, `LATERAL_ESQUERDO`, `MEDIO_DEFENSIVO`, `MEDIO_CENTRO`, `MEDIO_OFENSIVO`, `EXTREMO_DIREITO`, `EXTREMO_ESQUERDO`, `AVANCADO`, `UNIVERSAL`.
- **Núcleo estatístico (`EstatisticaAtleta`):** `golos`, `assistencias`, `remates`, `cantos`, `forasDeJogo`, `desarmes`, e (só GR) `defesas`, `golosSofridosGR`. `faltasCometidas` opcional. **Não usa:** `faltas1aParte`/`faltas2aParte` (equipa) — **`mostraFaltasAcumuladas = false`**.
- **Eventos ao vivo:** `GOLO`, `ASSISTENCIA`, `FALTA`, `CARTAO_AMARELO`, `CARTAO_VERMELHO`, `SUBSTITUICAO`, `DEFESA`, `GOLO_SOFRIDO`, **`REMATE`**, **`CANTO`**, **`FORA_DE_JOGO`**, **`DESARME`**. (`TIMEOUT` não se aplica.)
- **Camada específica:** foras-de-jogo, cantos, desarmes e remates como núcleo (não existem/não são núcleo em futsal). **Sem** power play nem faltas acumuladas por parte.
- **Campos SVG (`campoPorFormato` / `TipoCampo`) — dimensões e viewBox de referência (1u=10cm):**

| Formato | Dimensões (referência) | viewBox interno | Marcações-chave |
|---|---|---|---|
| `FUTEBOL_3_3` | ~25×15 m (mini-campo) | 250×150 | meio-campo, balizas pequenas; **sem** grandes áreas |
| `FUTEBOL_5_5` | ~40×20 m | 400×200 | meio-campo, círculo central, pequenas áreas, balizas reduzidas |
| `FUTEBOL_7` | ~60×40 m | 600×400 | meio-campo, círculo central, área ~12×24 m, marca de penálti, balizas 6 m |
| `FUTEBOL_9` | ~75×50 m | 750×500 | meio-campo, círculo central, grande área, penálti, balizas |
| `FUTEBOL_11` | 100×64 m (referência) | 1000×640 | meio-campo, círculo central (r≈91,5 dm), grandes áreas (16,5 m), pequenas áreas (5,5 m), penálti (11 m), arcos de área, balizas 7,32 m |

- **Tempo por bloco (`minutosPorBloco`):** parametrizável por formato (o "jogo completo" varia por escalão/formato — ex.: petizes/traquinas jogam menos tempo que juniores). Recomendação base: `JOGO_COMPLETO` = duração regulamentar do formato (ex.: FUTEBOL_11 séniores = 90; escalões jovens menos), `MEIA_PARTE` = metade, `BLOCO_10MIN=10`, `BLOCO_5MIN=5`, `NAO_JOGOU=0`. ⚠️ fixar a tabela exata por formato na fase 28 (§10.8).
- **Biblioteca curada / caderneta:** conteúdo de futebol por formato/parte do treino (fase 29).

## Apêndice C — Matriz de migração v6→v7

> **Pré-requisito de migração:** o schema da v6 tem fases *expand* pendentes não concluídas: `Atleta.escalaoId` (NOT NULL legado), `Atleta.clubeId` (nullable legado), `Exercicio.proprietario @default(CLUBE)` (deve ser `TREINADOR`), `Clube.clubeTecnico` (campo não existe no schema). Antes de aplicar as migrações v7, DEVE concluir-se o *contract* v6: criar `Clube.clubeTecnico Boolean @default(false)`, fixar `Atleta.clubeId` como NOT NULL, remover `Atleta.escalaoId`/`escalaoSecundarioId`/`epocaId` legados, e corrigir `Exercicio.proprietario @default(TREINADOR)`. Este apêndice pressupõe o modelo *contracted* como ponto de partida.

Todas as alterações são **aditivas** (colunas/tabelas novas, nullable ou com default) + **backfill idempotente**. **Nenhum** `DROP`, `RENAME`, `SET NOT NULL` destrutivo sobre dados existentes, **nenhum** `ALTER COLUMN` que perca dados. **Não toca em auth.**

### C.1 Tabelas novas
| Tabela | Descrição | Notas |
|---|---|---|
| `Seccao` | Secção (modalidade) do clube (§3.1.1) | `@@unique([clubeId, modalidade])`, `@@index([clubeId])` |
| `MembroSeccao` | Vínculo membro↔secção (coordenador) | `@@unique([seccaoId, membroClubeId])`, `@@index([membroClubeId])` |

### C.2 Enums novos / alterados
| Enum | Alteração |
|---|---|
| `Modalidade` | **novo** — `FUTSAL`, `FUTEBOL` |
| `PapelSeccao` | **novo** — `COORDENADOR` |
| `FormatoJogo` | **novo** — `FUTSAL_5`, `FUTEBOL_3_3`, `FUTEBOL_5_5`, `FUTEBOL_7`, `FUTEBOL_9`, `FUTEBOL_11` |
| `AmbitoPerfil` | **valor novo** — `SECCAO` (aditivo; `TODO_CLUBE`/`PROPRIOS_ESCALOES` intactos) |
| `Posicao` | **valores novos** — `DEFESA_CENTRAL`, `LATERAL_DIREITO`, `LATERAL_ESQUERDO`, `MEDIO_DEFENSIVO`, `MEDIO_CENTRO`, `MEDIO_OFENSIVO`, `EXTREMO_DIREITO`, `EXTREMO_ESQUERDO`, `AVANCADO` (futsal `GUARDA_REDES`/`FIXO`/`ALA`/`PIVO`/`UNIVERSAL` intactos) |
| `TipoEventoJogo` | **valores novos** — `REMATE`, `CANTO`, `FORA_DE_JOGO`, `DESARME` (existentes intactos) |

### C.3 Colunas novas (todas nullable ou com default)
| Modelo | Coluna | Tipo | Default/Nullable |
|---|---|---|---|
| `Escalao` | `seccaoId` | `String` (FK `Seccao`) | preenchido por **backfill** (C.4); NOT NULL após backfill |
| `Jogo` | `formato` | `FormatoJogo?` | nullable (derivado da secção quando ausente) |
| `Sessao` | `modalidadeAtividade` | `Modalidade?` | nullable — sem backfill (null = herda da secção) |
| `Jogo` | `modalidadeAtividade` | `Modalidade?` | nullable — sem backfill (null = herda da secção) |
| `EstatisticaAtleta` | `remates`, `cantos`, `forasDeJogo`, `desarmes` | `Int?` | nullable |
| `Exercicio` | `modalidade` | `Modalidade?` | nullable (genérico) |
| `ModeloSessao` | `modalidade` | `Modalidade?` | nullable |
| `MetricaConfig` | `modalidade` | `Modalidade?` | nullable |
| `Habilidade` | `modalidade` | `Modalidade?` | nullable |
| `Competicao` | `formatoJogo` | `FormatoJogo?` | ⚠️ distinto do campo `formato FormatoCompeticao` (LIGA/TORNEIO/TACA) já existente; nullable, derivável |
| `Licenca` | `modalidade` | `Modalidade?` | nullable (⚠️ ou derivar da secção do clube técnico — §3.11) |
| `Licenca` | `numSeccoes` | `Int` | default `1` (pricing multi-secção — §17.1) |
| `DiagramaCampo` (Json) | `campo` | `TipoCampo?` (no JSON) | ausente = `FUTSAL_5` (retrocompatível — §11.2) |

### C.4 Backfill (idempotente; execução manual após deploy, como as migrações anteriores)
1. **Secção por clube:** para cada `Clube` existente, criar **uma `Seccao` FUTSAL** (`upsert` por `@@unique([clubeId, modalidade=FUTSAL])`).
2. **Ligar escalões:** `UPDATE Escalao SET seccaoId = <secção FUTSAL do clube>` para todos os escalões do clube (todos os dados existentes são futsal).
3. **`Escalao.seccaoId` NOT NULL:** só depois de 1+2 (evita nulos transitórios).
4. **`Jogo.formato`:** deixar `null` (derivado como `FUTSAL_5` na leitura) **ou** preencher `FUTSAL_5` em jogos existentes (opcional; ambos corretos porque os dados são futsal).
5. **Perfis de arranque:** acrescentar o perfil "Coordenador de Secção" aos clubes existentes é **opcional** (só necessário quando o clube adotar uma segunda secção); a capacidade `CLUBE_SECCOES` é adicionada ao catálogo e aos perfis Admin/DT.
6. **Diagramas:** nenhum backfill — leitura assume `FUTSAL_5` quando `campo` ausente.

### C.5 Garantias de compatibilidade
- Um clube 100% futsal após o backfill comporta-se **exatamente como na v6** (uma única secção FUTSAL, sem seletor de secção, sem UI nova).
- Nenhuma query existente quebra: os filtros por `clubeId`/`epocaId`/`escalaoId` mantêm-se; `seccaoId` é um filtro adicional opcional.
- Diagramas, estatísticas e jogos legados permanecem válidos e legíveis.
- **Rollback de código** possível sem migração inversa enquanto as colunas novas forem nullable e o código antigo as ignorar (exceto `Escalao.seccaoId` NOT NULL, que exige o backfill aplicado — recomenda-se manter `seccaoId` nullable durante uma fase *expand* e torná-lo NOT NULL numa fase *contract*, como no padrão `AtletaEscalao` da v6).

### C.6 Migração aditiva da feature Mano-a-Mano (Fase 33 — §22)

> Alterações **posteriores** à matriz v6→v7 acima, introduzidas pela **Fase 33** (2026-08-24). Todas **aditivas** (tabelas/enums novos + relações inversas), **sem backfill** (a feature nasce vazia) e **sem tocar em dados existentes nem em auth**.

**Tabelas novas:**
| Tabela | Descrição | Notas |
|---|---|---|
| `CompeticaoManoMano` | Prova 1×1 (liga anual ou torneio) | `@@index([clubeId])`, `@@index([epocaId, escalaoId])`, `@@index([estado])` |
| `ClubeExterno` | Clube adversário sem conta Mister (inter-clubes) | `@@index([criadoPorClubeId])` |
| `ParticipanteManoMano` | Competidor da prova (atleta ou externo) | `@@unique([competicaoId, atletaId])`, `@@index([competicaoId])` |
| `MatchManoMano` | Duelo 1×1 (lado B nullable = bye) | `@@index([competicaoId, ronda])`, `@@index([sessaoId])`, `@@index([estado])`; self-FK `proximoMatchId` |

**Enums novos:** `TipoManoMano`, `AmbitoManoMano`, `FormatoTorneioManoMano`, `FormatoDuelo`, `EstadoManoMano`, `EstadoMatch`, `TipoParticipante` (§22.3).

**Relações inversas (aditivas nos modelos existentes):** `Clube.competicoesManoMano`/`Clube.clubesExternos`, `Epoca.competicoesManoMano`, `Escalao.competicoesManoMano` (FK `SetNull`), `Atleta.participacoesManoMano`, `Utilizador.competicoesManoManoCriadas`, `Sessao.duelosManoMano` (FK `SetNull`), `MembroClube.duelosRegistados` (FK `SetNull`).

**Garantias:** nenhuma coluna alterada em tabelas existentes (só relações inversas); a classificação é **calculada** (não há tabela nova de classificação); rollback de código possível sem migração inversa (as tabelas novas são ignoradas pelo código antigo).

---

**Fim da `Mister_Spec_v7.md`.** A `Mister_Spec_v6.md` mantém-se **intacta** como histórico (detalhe verbatim do changelog anterior a 2026-08-19). Esta v7 é a **bíblia ativa** do produto a partir de 2026-08-19.
