# UC-P2 — Treinador Solo Seniores (Miguel Ferreira)

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Persona**: Miguel Ferreira — treinador solo de seniores
> **Clube**: FC Independente
> **Conta**: `solo.seniores@teste.pt` / `Mister#2026!`
> **Porta**: 3021

## Contexto da Persona

Miguel treina uma equipa sénior de futsal. É metódico: planeia periodização, desenha esquemas tácticos, analisa carga de treino (ACWR) e disciplina. Espera analíticos ricos e ferramentas tácticas. A ficha de atleta de formação não serve o seu contexto.

## Resumo de Estados

| ID | Nome | Prioridade | Estado |
|---|---|---|---|
| UC-P2-01 | Login e dashboard | CRÍTICO | PASS ✅ |
| UC-P2-02 | Ficha do atleta sénior | ALTO | FAIL ❌ |
| UC-P2-03 | Histórico multi-época | ALTO | FAIL ❌ |
| UC-P2-04 | Editor SVG — esquema táctico | MÉDIO | PASS ✅ |
| UC-P2-05 | Filtro de exercícios por objectivo táctico | MÉDIO | FAIL ❌ |
| UC-P2-06 | Duplicar exercício / favoritos | BAIXO | FAIL ❌ |
| UC-P2-07 | Periodização — sugestão automática | ALTO | PARCIAL ⚠️ |
| UC-P2-08 | Plano Semanal vs Periodização — distinção | MÉDIO | FAIL ❌ |
| UC-P2-09 | ACWR — carga de treino | ALTO | PASS ✅ |
| UC-P2-10 | Cartões na grelha de estatísticas | ALTO | FAIL ❌ |
| UC-P2-11 | Total de cartões por atleta na época | MÉDIO | FAIL ❌ |
| UC-P2-12 | Analíticos — análise casa/fora | MÉDIO | FAIL ❌ |
| UC-P2-13 | Tendência do atleta (forma) | MÉDIO | FAIL ❌ |
| UC-P2-14 | Export CSV — abrir no Excel | MÉDIO | PASS ✅ |
| UC-P2-15 | Relatório partilhável | ALTO | PASS ✅ |
| UC-P2-16 | Competições — criar liga regional | ALTO | PARCIAL ⚠️ |

---

### UC-P2-01: Login e dashboard

**Perfil:** P2
**Área:** Autenticação / Dashboard
**Prioridade:** CRÍTICO

**Pré-condições:**
- Conta: `solo.seniores@teste.pt` / `Mister#2026!`
- Servidor: `npm run dev -- --port 3021`

**Passos:**
1. Autenticar via Auth.js v5.
2. `GET /dashboard`.

**Resultado esperado:**
- HTTP 200 com dados do FC Independente.

**Critério de PASS/FAIL:**
- PASS: dashboard 200 com dados reais.
- FAIL: erro ou dashboard vazio.

**Estado atual:** PASS ✅
**Notas:** Login e dashboard funcionais.

---

### UC-P2-02: Ficha do atleta sénior

**Perfil:** P2
**Área:** Plantel
**Prioridade:** ALTO

**Pré-condições:**
- Escalão de seniores.

**Passos:**
1. Abrir ficha de atleta sénior.
2. Verificar campos relevantes para seniores: altura/peso, clube anterior, federação, contacto próprio.
3. Verificar presença do bloco "Encarregado de Educação".

**Resultado esperado:**
- Ficha adaptada a seniores.
- Bloco de encarregado de educação **oculto** para seniores.

**Critério de PASS/FAIL:**
- PASS: ficha adaptada, sem campos de formação irrelevantes.
- FAIL: ficha de formação aplicada a seniores.

**Estado atual:** FAIL ❌
**Notas:** Ficha pensada para formação, não para seniores. Bloco "Encarregado de Educação" aparece (irrelevante). Faltam campos de seniores (clube anterior, federação, contacto próprio).

---

### UC-P2-03: Histórico multi-época

**Perfil:** P2
**Área:** Plantel / Perfil de atleta
**Prioridade:** ALTO

**Pré-condições:**
- Atleta com dados em mais do que uma época.

**Passos:**
1. Aceder ao perfil de um atleta.
2. Verificar estatísticas de épocas anteriores.

**Resultado esperado:**
- Estatísticas cumulativas / por época, incluindo épocas passadas.

**Critério de PASS/FAIL:**
- PASS: histórico multi-época visível.
- FAIL: apenas época ativa.

**Estado atual:** FAIL ❌
**Notas:** Só mostra a época ativa. Sem histórico multi-época no perfil.

---

### UC-P2-04: Editor SVG — criação de esquema táctico

**Perfil:** P2
**Área:** Exercícios / Editor de campo
**Prioridade:** MÉDIO

**Pré-condições:**
- Sessão autenticada.

**Passos:**
1. Criar exercício com diagrama.
2. Adicionar jogadores com cores (equipa A vs B).
3. Adicionar setas de passe / movimento / condução.
4. Definir passos de animação (passo 1 → passo 2).
5. Verificar miniatura na lista.

**Resultado esperado:**
- Editor táctico completo com equipas, setas e animação.
- Miniatura correta na lista.

**Critério de PASS/FAIL:**
- PASS: editor táctico funcional e miniatura presente.
- FAIL: ferramentas em falta ou miniatura ausente.

**Estado atual:** PASS ✅
**Notas:** Editor é bom — equipas com cores, setas distintas e animação em passos funcionam.

---

### UC-P2-05: Filtro de exercícios por objectivo táctico

**Perfil:** P2
**Área:** Exercícios
**Prioridade:** MÉDIO

**Pré-condições:**
- Biblioteca com exercícios.

**Passos:**
1. Tentar filtrar por objectivo (ex.: "pressão alta", "transição").
2. Verificar se o objectivo é taxonomia estruturada ou texto livre.

**Resultado esperado:**
- Filtro por taxonomia táctica estruturada.

**Critério de PASS/FAIL:**
- PASS: taxonomia táctica filtrável.
- FAIL: objectivo é texto livre, sem taxonomia.

**Estado atual:** FAIL ❌
**Notas:** Objectivo táctico é texto livre — não há taxonomia nem filtro por conceito táctico.

---

### UC-P2-06: Duplicar exercício / favoritos

**Perfil:** P2
**Área:** Exercícios
**Prioridade:** BAIXO

**Pré-condições:**
- Exercício existente.

**Passos:**
1. Procurar botão "Duplicar".
2. Procurar botão "Favorito".

**Resultado esperado:**
- Duplicação e marcação de favoritos disponíveis.

**Critério de PASS/FAIL:**
- PASS: ambos existem.
- FAIL: inexistentes.

**Estado atual:** FAIL ❌
**Notas:** Nem duplicar nem favoritos existem — fricção para quem gere biblioteca grande.

---

### UC-P2-07: Periodização — sugestão automática

**Perfil:** P2
**Área:** Treinos / Periodização
**Prioridade:** ALTO

**Pré-condições:**
- Periodização configurada (seed-rico).

**Passos:**
1. Criar nova entrada de planeamento.
2. Verificar `sugerirPlaneamento` pré-preenche data, microciclo e período.
3. Verificar vista de planeamento (lista vs gantt).

**Resultado esperado:**
- Pré-preenchimento inteligente.
- Vista gantt disponível além da lista.

**Critério de PASS/FAIL:**
- PASS: sugestão automática funciona e existe vista gantt.
- FAIL: sem sugestão ou sem gantt.

**Estado atual:** PARCIAL ⚠️
**Notas:** `sugerirPlaneamento` pré-preenche corretamente (PASS ✅). Não existe **vista gantt** — só lista (FAIL ❌).

---

### UC-P2-08: Plano Semanal vs Periodização — distinção clara

**Perfil:** P2
**Área:** Treinos
**Prioridade:** MÉDIO

**Pré-condições:**
- Sessão autenticada.

**Passos:**
1. Aceder a `/treinos/planos` e `/treinos/periodizacao`.
2. Avaliar se a diferença é compreensível sem tutorial.

**Resultado esperado:**
- Distinção clara entre plano semanal e periodização.

**Critério de PASS/FAIL:**
- PASS: utilizador percebe a diferença sozinho.
- FAIL: conceitos confundem-se.

**Estado atual:** FAIL ❌
**Notas:** Diferença não é óbvia — falta contexto/ajuda que separe os dois conceitos.

---

### UC-P2-09: ACWR — carga de treino

**Perfil:** P2
**Área:** Análise / Carga
**Prioridade:** ALTO

**Pré-condições:**
- Dados de seed-rico com RPE por sessão.

**Passos:**
1. Abrir painel de carga.
2. Verificar curva de carga semanal.
3. Verificar tabela de atletas com zonas verde/âmbar/vermelho.

**Resultado esperado:**
- Curva de carga e zonas ACWR visíveis com dados suficientes.

**Critério de PASS/FAIL:**
- PASS: curva e zonas presentes e coerentes.
- FAIL: sem cálculo de ACWR ou zonas erradas.

**Estado atual:** PASS ✅
**Notas:** Funciona com dados suficientes — curva semanal e zonas de risco presentes.

---

### UC-P2-10: Cartões na grelha de estatísticas

**Perfil:** P2
**Área:** Jogos / Estatísticas
**Prioridade:** ALTO

**Pré-condições:**
- Jogo com convocatória.

**Passos:**
1. Detalhe de jogo → aba Estatísticas.
2. Procurar campos "Cartão Amarelo" e "Cartão Vermelho" por atleta.

**Resultado esperado:**
- Cartões registáveis na grelha pós-jogo por atleta.

**Critério de PASS/FAIL:**
- PASS: campos de cartão na grelha.
- FAIL: cartões só como evento ao vivo.

**Estado atual:** FAIL ❌
**Notas:** Cartões apenas como evento ao vivo — não é possível editar na grelha pós-jogo.

---

### UC-P2-11: Total de cartões por atleta na época

**Perfil:** P2
**Área:** Análise / Disciplina
**Prioridade:** MÉDIO

**Pré-condições:**
- Jogos com cartões registados.

**Passos:**
1. Analíticos do escalão → ranking de disciplina.
2. Verificar total de amarelos/vermelhos por atleta na época.

**Resultado esperado:**
- Ranking de disciplina com totais por atleta.

**Critério de PASS/FAIL:**
- PASS: ranking de disciplina existe.
- FAIL: não existe.

**Estado atual:** FAIL ❌
**Notas:** Não existe ranking de disciplina nem totais de cartões por época.

---

### UC-P2-12: Analíticos — análise casa/fora

**Perfil:** P2
**Área:** Análise
**Prioridade:** MÉDIO

**Pré-condições:**
- Jogos com campo `casaFora` preenchido.

**Passos:**
1. Painel de escalão → filtro "Casa" vs "Fora".

**Resultado esperado:**
- Painel com quebra casa/fora.

**Critério de PASS/FAIL:**
- PASS: filtro casa/fora presente.
- FAIL: sem painel apesar de os dados existirem.

**Estado atual:** FAIL ❌
**Notas:** O dado existe (`casaFora` no Jogo) mas não há painel/analítico que o use.

---

### UC-P2-13: Tendência do atleta (em alta / em queda)

**Perfil:** P2
**Área:** Análise / Perfil
**Prioridade:** MÉDIO

**Pré-condições:**
- Atleta com histórico de jogos.

**Passos:**
1. Perfil do atleta → procurar indicador de forma/tendência.

**Resultado esperado:**
- Indicador "em alta" / "em queda" baseado em desempenho recente.

**Critério de PASS/FAIL:**
- PASS: indicador de tendência presente.
- FAIL: não existe.

**Estado atual:** FAIL ❌
**Notas:** Sem indicador de tendência/forma no perfil.

---

### UC-P2-14: Export CSV — abrir no Excel

**Perfil:** P2
**Área:** Análise / Export
**Prioridade:** MÉDIO

**Pré-condições:**
- Escalão com dados.

**Passos:**
1. Escalão → Export CSV.
2. Abrir no Excel e verificar cabeçalhos PT-PT e datas DD/MM/YYYY.

**Resultado esperado:**
- CSV com cabeçalhos em português e datas no formato PT.

**Critério de PASS/FAIL:**
- PASS: cabeçalhos PT-PT e datas DD/MM/YYYY.
- FAIL: encoding partido ou formato errado.

**Estado atual:** PASS ✅
**Notas:** Export correto para Excel.

---

### UC-P2-15: Relatório partilhável — link para clube/direção

**Perfil:** P2
**Área:** Relatórios
**Prioridade:** ALTO

**Pré-condições:**
- Escalão com dados.

**Passos:**
1. Gerar relatório → link público.
2. Abrir sem conta e verificar marca do clube.
3. Botão imprimir → PDF.

**Resultado esperado:**
- Link público sem login, com marca do clube e impressão em PDF.

**Critério de PASS/FAIL:**
- PASS: link público funcional, com marca e impressão.
- FAIL: exige login ou sem marca.

**Estado atual:** PASS ✅
**Notas:** Relatório partilhável funciona bem.

---

### UC-P2-16: Competições — criar liga regional

**Perfil:** P2
**Área:** Competições
**Prioridade:** ALTO

**Pré-condições:**
- Sessão autenticada.

**Passos:**
1. Abrir wizard de competição.
2. Criar liga com 8 equipas, 14 jornadas.
3. Introduzir resultados e verificar classificação automática.
4. Verificar importação de calendário externo.

**Resultado esperado:**
- Liga criada, classificação automática, e possibilidade de importar calendário externo.

**Critério de PASS/FAIL:**
- PASS: criação + classificação automática funcionam.
- FAIL: classificação incorreta.

**Estado atual:** PARCIAL ⚠️
**Notas:** Criação e classificação automática funcionam. **Não é possível importar calendário externo** — introdução manual de todas as jornadas.

---

## Referências

- [Setup do ambiente](../ambiente/setup.md)
- [Contas de teste](../ambiente/contas.md)
- [Bíblia funcional — Mister_Spec_v7.md](../../Mister_Spec_v7.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial |
