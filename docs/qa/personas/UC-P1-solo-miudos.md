# UC-P1 — Treinador Solo Miúdos (Rui Santos, Sub-10)

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Persona**: Rui Santos — treinador solo de um escalão de formação (Sub-10)
> **Clube**: Atlético dos Miúdos
> **Conta**: `solo.miudos@teste.pt` / `Mister#2026!`
> **Porta**: 3020

## Contexto da Persona

Rui é treinador voluntário de um Sub-10 de futsal. Trabalha sozinho, usa quase sempre o telemóvel à beira do campo e comunica com os pais por WhatsApp. Valoriza simplicidade, rapidez e não precisa de funcionalidades táticas avançadas.

## Resumo de Estados

| ID | Nome | Prioridade | Estado |
|---|---|---|---|
| UC-P1-01 | Login e primeira sessão | CRÍTICO | PASS ✅ |
| UC-P1-02 | Onboarding — Vitória Rápida | ALTO | PASS ✅ |
| UC-P1-03 | Formulário de criação de atleta | ALTO | PARCIAL ⚠️ |
| UC-P1-04 | Aviso de número duplicado | MÉDIO | PASS ✅ |
| UC-P1-05 | Marcar presenças do treino | CRÍTICO | PARCIAL ⚠️ |
| UC-P1-06 | Exercícios — biblioteca e editor SVG | MÉDIO | PARCIAL ⚠️ |
| UC-P1-07 | Criar sessão de treino | ALTO | FAIL ❌ |
| UC-P1-08 | Criar jogo e convocatória | ALTO | PARCIAL ⚠️ |
| UC-P1-09 | Gerador de comunicação WhatsApp | ALTO | PASS ✅ |
| UC-P1-10 | Caderneta de habilidades | MÉDIO | FAIL ❌ |
| UC-P1-11 | Analíticos com poucos dados | MÉDIO | PASS ✅ |
| UC-P1-12 | Dashboard mobile (alvos de toque) | CRÍTICO | PASS ✅ |

---

### UC-P1-01: Login e primeira sessão

**Perfil:** P1 — treinador solo miúdos
**Área:** Autenticação / Dashboard
**Prioridade:** CRÍTICO

**Pré-condições:**
- Conta: `solo.miudos@teste.pt` / `Mister#2026!`
- Servidor: `npm run dev -- --port 3020`
- Dados: seed-rico do Atlético dos Miúdos (12 atletas, 20 sessões, 8 jogos)

**Passos:**
1. Autenticar via fluxo Auth.js v5 (ver setup.md).
2. `GET /dashboard`.

**Resultado esperado:**
- HTTP 200 no dashboard.
- Cartão-herói com próximo treino visível.
- Ações rápidas presentes.
- Dados do clube carregados (não vazio).

**Critério de PASS/FAIL:**
- PASS: dashboard responde 200 e mostra próximo treino + ações rápidas com dados reais.
- FAIL: dashboard vazio, erro ou sem próximo evento.

**Estado atual:** PASS ✅
**Notas:** Dashboard carrega com dados do clube; cartão-herói e ações rápidas presentes.

---

### UC-P1-02: Onboarding — Vitória Rápida

**Perfil:** P1
**Área:** Onboarding
**Prioridade:** ALTO

**Pré-condições:**
- Sessão autenticada.

**Passos:**
1. `GET /vitoria-rapida`.
2. Verificar os 3 passos: Plantel → Treino → Convocatória.
3. Confirmar CTA claro em cada passo.

**Resultado esperado:**
- HTTP 200.
- 3 passos com CTA claro e orientador.

**Critério de PASS/FAIL:**
- PASS: os 3 passos aparecem, com CTA claro cada um.
- FAIL: passos em falta ou CTA ambíguo.

**Estado atual:** PASS ✅
**Notas:** Funciona bem — fluxo de onboarding claro para o treinador solo.

---

### UC-P1-03: Formulário de criação de atleta

**Perfil:** P1
**Área:** Plantel
**Prioridade:** ALTO

**Pré-condições:**
- Sessão autenticada.

**Passos:**
1. `GET /plantel` — listar atletas existentes.
2. Abrir formulário de criação de atleta.
3. Verificar campos: nome, data de nascimento, data de ingresso, posições, fotoUrl, escalão, número, encarregado (nome/contacto/email).

**Resultado esperado:**
- Formulário com todos os campos relevantes para um atleta de formação.
- Foto por **upload** de ficheiro.
- Campos de contacto de emergência e notas médicas.

**Critério de PASS/FAIL:**
- PASS: todos os campos esperados presentes, incluindo upload de foto, contacto de emergência e notas médicas.
- FAIL: campos essenciais em falta.

**Estado atual:** PARCIAL ⚠️
**Notas:** `fotoUrl` é campo de **URL** (deveria permitir upload de ficheiro). Não existe **contacto de emergência** nem **notas médicas** — relevantes num escalão de formação.

---

### UC-P1-04: Aviso de número duplicado

**Perfil:** P1
**Área:** Plantel
**Prioridade:** MÉDIO

**Pré-condições:**
- Existe atleta com número N no escalão Sub-10.

**Passos:**
1. Criar novo atleta com o número N já usado no mesmo escalão.

**Resultado esperado:**
- Aviso visual em âmbar, **não bloqueante** (o clube pode ter numeração temporária).

**Critério de PASS/FAIL:**
- PASS: aviso âmbar aparece e o utilizador pode prosseguir.
- FAIL: sem aviso, ou bloqueio total indevido.

**Estado atual:** PASS ✅
**Notas:** Conforme spec (secção 8 — plantel). Aviso âmbar não bloqueante.

---

### UC-P1-05: Marcar presenças do treino

**Perfil:** P1
**Área:** Treinos / Presenças
**Prioridade:** CRÍTICO

**Pré-condições:**
- Existe sessão de treino com atletas do escalão.

**Passos:**
1. Navegar para uma sessão de treino existente → presenças.
2. Verificar "Marcar todos presentes".
3. Verificar estados: Presente / Falta / Lesionado / Justificado, com botões ≥44px.
4. Verificar barra de guardar fixa no fundo.
5. Verificar como se regista o motivo de falta.

**Resultado esperado:**
- Marcação em lote e por atleta.
- Estados com alvos de toque ≥44px.
- Barra de guardar fixa.
- Motivo de falta com **botões rápidos** (não só texto livre).

**Critério de PASS/FAIL:**
- PASS: marcação, estados, alvos de toque e barra fixa funcionam.
- FAIL: motivo de falta apenas em texto livre (fricção à beira-campo).

**Estado atual:** PARCIAL ⚠️
**Notas:** Presenças funcionam (PASS ✅ na mecânica). Motivo de falta é **texto livre** (FAIL ❌) — deveria ter botões rápidos (doente, escola, lesão...) para uso mobile.

---

### UC-P1-06: Exercícios — biblioteca e editor SVG

**Perfil:** P1
**Área:** Exercícios
**Prioridade:** MÉDIO

**Pré-condições:**
- Biblioteca de arranque carregada (12 exercícios).

**Passos:**
1. `GET /exercicios`.
2. Avaliar adequação dos exercícios de arranque para Sub-10.
3. Abrir editor de campo → verificar ferramentas (jogador, bola, cone, seta, texto).
4. Verificar modo simples vs avançado (animação).

**Resultado esperado:**
- Exercícios de arranque adequados à faixa etária.
- Editor com ferramentas essenciais e modo simples para uso rápido.

**Critério de PASS/FAIL:**
- PASS: exercícios adequados e editor acessível para um treinador solo.
- FAIL: exercícios desadequados ou editor demasiado complexo.

**Estado atual:** PARCIAL ⚠️
**Notas:** Exercícios de arranque pouco adequados para Sub-10 (demasiado avançados). Editor funciona corretamente mas é **demasiado complexo** para o perfil solo de formação.

---

### UC-P1-07: Criar sessão de treino

**Perfil:** P1
**Área:** Treinos
**Prioridade:** ALTO

**Pré-condições:**
- Sessão autenticada; escalão Sub-10.

**Passos:**
1. Abrir formulário de nova sessão.
2. Verificar campos: data, duração, escalão, local, tipo (NORMAL/ABERTO/CAPTACAO/EVENTO).
3. Verificar se RPE/carga é visível para o escalão Sub-10.

**Resultado esperado:**
- Campos essenciais presentes.
- RPE/carga **oculto** para escalões de formação (irrelevante em Sub-10).

**Critério de PASS/FAIL:**
- PASS: RPE/carga não aparece em Sub-10.
- FAIL: RPE/carga visível num escalão de formação.

**Estado atual:** FAIL ❌
**Notas:** RPE visível em Sub-10 — irrelevante e confuso para o treinador de formação. Deveria adaptar-se ao escalão.

---

### UC-P1-08: Criar jogo e convocatória

**Perfil:** P1
**Área:** Jogos
**Prioridade:** ALTO

**Pré-condições:**
- Sessão autenticada.

**Passos:**
1. Criar jogo: adversário, data, local, formato.
2. Abrir detalhe do jogo — contar separadores.
3. Testar registo de golo ao vivo — contar toques necessários.

**Resultado esperado:**
- Formulário simples.
- Número de separadores adequado ao perfil solo.
- Registo de golo rápido (1 toque).

**Critério de PASS/FAIL:**
- PASS: fluxo simples e golo em 1 toque.
- FAIL: demasiados separadores; golo exige 3+ toques.

**Estado atual:** PARCIAL ⚠️
**Notas:** Demasiados separadores no detalhe do jogo (6) para um treinador solo. Registar um golo exige 3+ toques — fricção alta ao vivo.

---

### UC-P1-09: Gerador de comunicação WhatsApp

**Perfil:** P1
**Área:** Comunicações
**Prioridade:** ALTO

**Pré-condições:**
- Existe jogo agendado com convocatória.

**Passos:**
1. `GET /comunicacoes` — ver tipos disponíveis.
2. Selecionar "Convocatória" para um jogo.
3. Verificar pré-preenchimento com dados do jogo.
4. Verificar botão "Partilhar no WhatsApp".

**Resultado esperado:**
- Tipos de comunicação disponíveis.
- Pré-preenchimento com dados do jogo.
- Botão de partilha WhatsApp funcional.

**Critério de PASS/FAIL:**
- PASS: pré-preenchimento correto e botão de partilha presente.
- FAIL: sem pré-preenchimento ou sem partilha.

**Estado atual:** PASS ✅
**Notas:** Funciona bem — grande valor para o perfil solo de formação.

---

### UC-P1-10: Caderneta de habilidades

**Perfil:** P1
**Área:** Caderneta
**Prioridade:** MÉDIO

**Pré-condições:**
- Habilidades configuradas; progresso registado.

**Passos:**
1. `GET /caderneta` — habilidades por atleta.
2. Verificar níveis BÁSICO / INTERMÉDIO / AVANÇADO.
3. Verificar se atleta/pai consegue ver a sua caderneta (portal externo).

**Resultado esperado:**
- Caderneta por atleta com níveis.
- Portal externo (sem conta) para atleta/pai consultar progresso.

**Critério de PASS/FAIL:**
- PASS: caderneta interna + portal externo para pais.
- FAIL: sem portal para atletas/pais.

**Estado atual:** FAIL ❌
**Notas:** Caderneta interna existe, mas **não há portal para atletas/pais** consultarem o progresso — valor central desta persona.

---

### UC-P1-11: Analíticos com poucos dados

**Perfil:** P1
**Área:** Análise
**Prioridade:** MÉDIO

**Pré-condições:**
- Escalão com poucos dados (ex.: 2 sessões + 1 jogo).

**Passos:**
1. `GET /analise`.
2. Verificar estados vazios com mensagem orientadora.
3. Verificar ranking de assiduidade.

**Resultado esperado:**
- Estados vazios tratados com mensagens úteis.
- Ranking de assiduidade visível mesmo com poucos dados.

**Critério de PASS/FAIL:**
- PASS: estados vazios orientadores e ranking presente.
- FAIL: erro, gráficos partidos ou mensagens genéricas.

**Estado atual:** PASS ✅
**Notas:** Estados vazios bem tratados.

---

### UC-P1-12: Dashboard mobile (alvos de toque)

**Perfil:** P1
**Área:** Mobile / Acessibilidade
**Prioridade:** CRÍTICO

**Pré-condições:**
- Testar em viewport mobile.

**Passos:**
1. Verificar botões ≥44px em: presenças, jogos, plantel, ações rápidas.
2. Verificar bottom-nav utilizável a uma mão.

**Resultado esperado:**
- Alvos de toque ≥44px em todas as ações principais.
- Bottom-nav ergonómica.

**Critério de PASS/FAIL:**
- PASS: todos os alvos ≥44px e bottom-nav funcional a uma mão.
- FAIL: alvos abaixo de 44px em áreas críticas.

**Estado atual:** PASS ✅
**Notas:** Conforme sistema de design (secção 12). Ergonomia mobile adequada.

---

## Referências

- [Setup do ambiente](../ambiente/setup.md)
- [Contas de teste](../ambiente/contas.md)
- [Bíblia funcional — Mister_Spec_v7.md](../../Mister_Spec_v7.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial |
