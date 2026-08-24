# UC-P3 — Treinador de Clube (André Costa, SC Estrela)

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Persona**: André Costa — treinador num clube multi-escalão/multi-modalidade
> **Clube**: SC Estrela
> **Conta**: `clube.seniores@teste.pt` / `Mister#2026!`
> **Porta**: 3022

## Contexto da Persona

André trabalha num clube estruturado, com vários escalões e um assistente (Bruno). Precisa de colaboração (partilha de exercícios, autoria de registos), gestão multi-escalão/multi-modalidade e ferramentas tácticas (modelo de jogo, scouting).

## Resumo de Estados

| ID | Nome | Prioridade | Estado |
|---|---|---|---|
| UC-P3-01 | Login e estrutura multi-escalão | CRÍTICO | PASS ✅ |
| UC-P3-02 | Atleta com escalão secundário | ALTO | PASS ✅ |
| UC-P3-03 | Editor SVG — partilha entre treinadores | ALTO | PASS ✅ |
| UC-P3-04 | Presenças — autor registado | ALTO | FAIL ❌ |
| UC-P3-05 | Edição simultânea — race condition | ALTO | FAIL ❌ |
| UC-P3-06 | Cartões na grelha pós-jogo | ALTO | FAIL ❌ |
| UC-P3-07 | Gestão de suspensões | ALTO | FAIL ❌ |
| UC-P3-08 | Scouting de adversário | MÉDIO | PARCIAL ⚠️ |
| UC-P3-09 | Analíticos — filtro por modalidade | MÉDIO | FAIL ❌ |
| UC-P3-10 | Conflito de pavilhão entre escalões | ALTO | PASS ✅ |
| UC-P3-11 | Modelo de jogo — ligação a exercícios | MÉDIO | FAIL ❌ |
| UC-P3-12 | Relatório de jogo estruturado | MÉDIO | FAIL ❌ |

---

### UC-P3-01: Login e estrutura multi-escalão

**Perfil:** P3
**Área:** Autenticação / Navegação
**Prioridade:** CRÍTICO

**Pré-condições:**
- Conta: `clube.seniores@teste.pt` / `Mister#2026!`
- Servidor: `npm run dev -- --port 3022`
- SC Estrela com 2 escalões (Seniores Futsal + Sub-15 Futebol).

**Passos:**
1. Autenticar.
2. Verificar menu com 2 escalões.
3. Verificar separação por secções (Futsal / Futebol).

**Resultado esperado:**
- Menu mostra ambos os escalões, agrupados por secção/modalidade.

**Critério de PASS/FAIL:**
- PASS: 2 escalões visíveis e separados por secção.
- FAIL: escalões em falta ou sem separação.

**Estado atual:** PASS ✅
**Notas:** Estrutura multi-escalão e secções visíveis.

---

### UC-P3-02: Atleta com escalão secundário

**Perfil:** P3
**Área:** Plantel
**Prioridade:** ALTO

**Pré-condições:**
- Atleta elegível para dois escalões.

**Passos:**
1. Associar atleta a segundo escalão.
2. Verificar que aparece em ambos.
3. Convocar no jogo do segundo escalão.

**Resultado esperado:**
- Atleta visível nos dois escalões e convocável em ambos, com participação registada.

**Critério de PASS/FAIL:**
- PASS: dupla associação e convocação funcionam.
- FAIL: atleta não aparece ou não é convocável no secundário.

**Estado atual:** PASS ✅
**Notas:** Funciona com participação registada no segundo escalão.

---

### UC-P3-03: Editor SVG — partilha entre treinadores do clube

**Perfil:** P3
**Área:** Exercícios / Colaboração
**Prioridade:** ALTO

**Pré-condições:**
- Assistente Bruno na equipa técnica.

**Passos:**
1. Criar exercício como "pessoal".
2. Partilhar com o clube via `PartilhaExercicioClube`.
3. Confirmar que o Bruno consegue usar o exercício.

**Resultado esperado:**
- Exercício partilhado fica acessível aos outros treinadores do clube.

**Critério de PASS/FAIL:**
- PASS: partilha efetiva e visível ao assistente.
- FAIL: exercício não aparece para outros.

**Estado atual:** PASS ✅
**Notas:** Partilha de exercícios entre treinadores do clube funciona.

---

### UC-P3-04: Presenças — autor registado

**Perfil:** P3
**Área:** Treinos / Presenças / Auditoria
**Prioridade:** ALTO

**Pré-condições:**
- Assistente com acesso a marcar presenças.

**Passos:**
1. Assistente marca presenças numa sessão.
2. Verificar se a presença regista `marcadoPorId` (autor).

**Resultado esperado:**
- Cada marcação regista quem a fez.

**Critério de PASS/FAIL:**
- PASS: `marcadoPorId` persistido.
- FAIL: presenças anónimas.

**Estado atual:** FAIL ❌
**Notas:** Presenças são anónimas — não guardam autor. Impede auditoria de quem marcou.

---

### UC-P3-05: Edição simultânea — race condition

**Perfil:** P3
**Área:** Treinos / Concorrência
**Prioridade:** ALTO

**Pré-condições:**
- Dois utilizadores com acesso ao mesmo treino.

**Passos:**
1. Dois utilizadores editam o mesmo treino em simultâneo.
2. Ambos guardam.

**Resultado esperado:**
- Aviso de conflito ou lock optimista que evite perda silenciosa.

**Critério de PASS/FAIL:**
- PASS: conflito detetado/avisado.
- FAIL: último a guardar sobrescreve sem aviso.

**Estado atual:** FAIL ❌
**Notas:** Sem controlo de concorrência — o último a guardar sobrescreve o outro sem aviso.

---

### UC-P3-06: Cartões na grelha pós-jogo

**Perfil:** P3
**Área:** Jogos / Estatísticas
**Prioridade:** ALTO

**Pré-condições:**
- Jogo com convocatória.

**Passos:**
1. Detalhe de jogo → Estatísticas.
2. Procurar campo de cartão amarelo/vermelho por atleta.

**Resultado esperado:**
- Cartões editáveis na grelha por atleta.

**Critério de PASS/FAIL:**
- PASS: campos de cartão presentes.
- FAIL: só evento ao vivo.

**Estado atual:** FAIL ❌
**Notas:** Igual ao UC-P2-10 — cartões só como evento ao vivo, não na grelha.

---

### UC-P3-07: Gestão de suspensões

**Perfil:** P3
**Área:** Jogos / Disciplina
**Prioridade:** ALTO

**Pré-condições:**
- Atleta com acumulação de cartões.

**Passos:**
1. Verificar alerta "jogador X suspenso no próximo jogo" por acumulação.

**Resultado esperado:**
- Sistema calcula suspensões por acumulação e alerta.

**Critério de PASS/FAIL:**
- PASS: alerta de suspensão presente.
- FAIL: não existe.

**Estado atual:** FAIL ❌
**Notas:** Sem gestão de suspensões — depende de os cartões existirem primeiro (UC-P3-06).

---

### UC-P3-08: Scouting de adversário

**Perfil:** P3
**Área:** Jogos / Scouting
**Prioridade:** MÉDIO

**Pré-condições:**
- Jogos com adversários.

**Passos:**
1. Jogos → Scouting.
2. Verificar sistema/pontos fortes/fracos/jogadores adversários.
3. Verificar base de dados de adversários por clube (histórico).

**Resultado esperado:**
- Scouting por jogo + histórico acumulado por adversário.

**Critério de PASS/FAIL:**
- PASS: scouting com histórico por adversário.
- FAIL: apenas notas soltas por jogo.

**Estado atual:** PARCIAL ⚠️
**Notas:** Scouting existe por jogo, mas **sem histórico/base de dados de adversário** reutilizável entre jogos.

---

### UC-P3-09: Analíticos — filtro por modalidade no clube

**Perfil:** P3
**Área:** Análise
**Prioridade:** MÉDIO

**Pré-condições:**
- Clube com futsal e futebol.

**Passos:**
1. Painel do clube.
2. Filtrar só futsal ou só futebol.

**Resultado esperado:**
- Filtro por modalidade nos analíticos.

**Critério de PASS/FAIL:**
- PASS: filtro por modalidade presente.
- FAIL: dados de modalidades misturados.

**Estado atual:** FAIL ❌
**Notas:** Analíticos misturam modalidades — sem filtro futsal/futebol.

---

### UC-P3-10: Conflito de pavilhão entre escalões

**Perfil:** P3
**Área:** Treinos / Agenda
**Prioridade:** ALTO

**Pré-condições:**
- Um pavilhão partilhado.

**Passos:**
1. Criar treino Sub-17 às 18h no Pavilhão A.
2. Criar treino Sub-15 às 18:30h no Pavilhão A.
3. Verificar aviso de conflito na criação.

**Resultado esperado:**
- Aviso de sobreposição de pavilhão no momento de criar.

**Critério de PASS/FAIL:**
- PASS: conflito detetado e avisado.
- FAIL: sem aviso.

**Estado atual:** PASS ✅
**Notas:** Deteção de conflito de pavilhão funciona.

---

### UC-P3-11: Modelo de jogo — ligação a exercícios

**Perfil:** P3
**Área:** Modelo de Jogo / Exercícios
**Prioridade:** MÉDIO

**Pré-condições:**
- Modelo de jogo com princípios.

**Passos:**
1. Criar princípio no Modelo de Jogo.
2. Etiquetar um exercício com esse princípio.
3. Filtrar biblioteca por princípio.

**Resultado esperado:**
- Ligação directa princípio ↔ exercício, com filtro.

**Critério de PASS/FAIL:**
- PASS: ligação e filtro por princípio existem.
- FAIL: sem ligação directa.

**Estado atual:** FAIL ❌
**Notas:** Não há ligação entre princípios do modelo de jogo e exercícios.

---

### UC-P3-12: Relatório de jogo estruturado

**Perfil:** P3
**Área:** Jogos / Relatórios
**Prioridade:** MÉDIO

**Pré-condições:**
- Jogo concluído.

**Passos:**
1. Detalhe de jogo → Relatório.
2. Verificar secções estruturadas (análise táctica, destaques, próximo jogo).

**Resultado esperado:**
- Relatório com secções estruturadas.

**Critério de PASS/FAIL:**
- PASS: secções estruturadas presentes.
- FAIL: apenas texto livre.

**Estado atual:** FAIL ❌
**Notas:** Relatório de jogo é texto livre, sem estrutura por secções.

---

## Referências

- [Setup do ambiente](../ambiente/setup.md)
- [Contas de teste](../ambiente/contas.md)
- [Bíblia funcional — Mister_Spec_v7.md](../../Mister_Spec_v7.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial |
