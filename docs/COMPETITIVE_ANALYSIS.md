# Análise Competitiva: Mister vs. EMJOGO
**Data:** 2026-08-20

## Sumário Executivo

O Mister e o EMJOGO **não competem no mesmo campo, apesar de partilharem clientes**. O EMJOGO é um **ERP de clube desportivo** — a sua gravidade está na administração (sócios, quotas, faturação certificada Moloni, pagamentos MB WAY, website, inscrições federativas, departamentos médico/escolar/psicológico). O comprador natural do EMJOGO é o **presidente/tesoureiro/secretaria**. O Mister é uma **ferramenta de treino centrada no treinador** — plantel, editor de campo animado, treinos, presenças, carga (ACWR), jogos, caderneta, analytics e comunicação. O comprador natural do Mister é o **treinador**.

Isto tem uma consequência estratégica que domina tudo o resto: **se o Mister tentar competir de frente com o EMJOGO no terreno administrativo/financeiro, perde — e nem sequer devia jogar lá.** O EMJOGO tem anos de vantagem em faturação, cobranças e módulos federativos, e o Mister declarou explicitamente (anti-âmbito, spec §1.6) que **não faz** quotas, faturação, nem gestão clínica. Essa é uma decisão de produto correta, mas só é defensável se o Mister ganhar decisivamente o terreno do treinador — que é onde o EMJOGO é mais fraco (editor gráfico estático, sem ACWR, sem portabilidade do treinador, UX de back-office).

**A verdade dura:** hoje o Mister **ainda não está pronto para vender contra o EMJOGO a um clube estruturado.** O QA interno (2026-08-20) reporta 50% dos use cases em FAIL, um cluster de bugs P0 de segurança (escrita cross-tenant, XSS em URL, rota pública a devolver 500, password de admin em logs), perfis de presidente/DT que "rebentam" no menu, ausência de recuperação de password e IBAN de pagamento por confirmar. O Mister serve **hoje, e bem, um treinador solo de formação**. Serve mal um clube com hierarquia. O caminho para competir é claro e faseado, mas o produto está **1 a 2 sprints de segurança + 1 ciclo de perfis** de sequer poder entrar numa comparação séria ao nível de clube.

**Onde o Mister pode ganhar:** o treinador individual (segmento que o EMJOGO **não serve de todo** — não tem produto individual de treinador) e o pequeno clube/escola de futsal ou futebol liderado pelo treino, não pela secretaria. Aí o Mister é mais barato, mais bonito, mais rápido na beira-campo, e tem duas ou três features que o EMJOGO não tem.

---

## Checklist de Comparação (preenchida)

Legenda: ✅ tem · ⚠️ parcial/frágil · ❌ não tem · 🔵 anti-âmbito deliberado

### Fundações / Plataforma
| Feature | EMJOGO | Mister | Estado Mister | Nota |
|---|---|---|---|---|
| Multi-tenant por clube | ✅ | ✅ | Implementado (⚠️ hardening) | QA: `Sessao`/`Jogo` sem `clubeId` direto; 1 escrita cross-tenant P0 |
| Época com arquivo histórico imutável | ✅ | ⚠️ | Parcial | Época ativa + rollover existem; QA GAP-P2-03: sem comparação multi-época na UI |
| Multi-desporto | ✅ (7 desportos) | ⚠️ (2: futsal+futebol) | Implementado p/ 2 | EMJOGO cobre andebol/basquete/voleibol/rugby/hóquei; Mister só 2, mas "a sério" |
| Papéis/permissões configuráveis | ✅ | ✅ | Implementado (⚠️) | QA BUG-P1-05/09: DT sem gerir equipa técnica; só-leitura com escrita possível |
| Branding / cor do clube | ✅ (website) | ✅ | Implementado | Cor dinâmica alimenta todos os acentos — bom |
| PWA / offline beira-campo | ✅ (app do clube) | ⚠️ | PWA sim, offline não | QA GAP-P2-11: sem fila de escrita offline |
| App nativa | ⚠️ (PWA) | 🔵 | Anti-âmbito | Empate — nenhum tem nativa real |
| Recuperação de password | ✅ (assumido) | ❌ | Ausente | QA BUG-P0-05: bloqueador de uso real |
| Segurança pronta p/ produção | ✅ (maduro) | ❌ | 5× P0 abertos | Cross-tenant, XSS, 500 público, seed password |

### Desportivo (o terreno do treinador)
| Feature | EMJOGO | Mister | Estado Mister | Nota |
|---|---|---|---|---|
| Ficha de atleta desportiva | ✅ | ✅ | Implementado | Mister: N-N atleta↔escalão, posições múltiplas, escalão secundário |
| Ficha multi-dimensional (médica/escolar/psicológica/antropométrica) | ✅ | 🔵 | Anti-âmbito | Mister: lesão só como motivo de falta; sem módulo clínico |
| Semáforo de estado do atleta | ✅ | ❌ | Ausente | Alimentado por sinais financeiros/clínicos que o Mister não tem |
| Editor gráfico de exercícios | ✅ (estático) | ✅ (animado A→B) | Implementado | **Vantagem Mister:** animação por passos; EMJOGO é estático |
| Biblioteca de exercícios | ✅ (pública/privada) | ✅ (pessoal portátil + clube + curada) | Implementado | **Vantagem Mister:** biblioteca do treinador viaja com ele |
| Templates de sessão | ✅ | ✅ | Implementado | Paridade |
| Duplicar exercício / favoritos | ✅ | ❌ | Ausente | QA UX-P3-06 |
| Tempo planeado vs. real por exercício | ✅ | ⚠️ | Parcial | Mister tem cronómetro; sem análise plan-vs-real |
| Periodização (meso/microciclos) | ✅ (c/ numeração auto) | ✅ | Implementado (lista) | QA BL-03: sem vista Gantt |
| Carga de treino / ACWR | ❌ | ✅ | Implementado | **Vantagem Mister forte:** EMJOGO não faz ACWR |
| RPE por sessão/atleta | ❌ | ✅ | Implementado | QA UX-P3-01: mostrar em Sub-10 é excessivo |
| Presenças | ✅ (c/ minutos, atraso) | ⚠️ | Implementado (básico) | EMJOGO regista minutos/atraso/saída antecipada; Mister estados + motivo |
| Fechar/reabrir treino (bloqueio) | ✅ | ❌ | Ausente | Controlo de coordenador; Mister não tem |
| Convocatória | ✅ | ✅ | Implementado | — |
| Convocatória c/ confirmação de leitura dos pais | ✅ (email/SMS/App) | ❌ | Ausente | **Gap relevante** — pais não têm conta no Mister |
| Necessidade transporte/refeição na convocatória | ✅ | ❌ | Ausente | Detalhe de formação |
| Ficha de jogo (titulares/sistema/eventos) | ✅ | ✅ | Implementado | Mister: registo ao vivo ou pós-jogo |
| Minutos de jogo automáticos (a partir de eventos) | ✅ | ⚠️ | Parcial | Mister tem tempos por bloco; não deriva minutos de eventos |
| Estatísticas configuráveis | ✅ (requer planeamento) | ✅ | Implementado | Mister: núcleo fixo + `MetricaConfig` (futsal e futebol) |
| Cartões / disciplina / suspensões | ✅ | ❌ | Ausente | QA BUG-P1-03/04: cartões não editáveis na grelha; sem suspensões |
| Avaliação individual estruturada (téc/tát/mental/física) | ✅ | ⚠️ | Parcial | Mister tem caderneta de habilidades (formação); não a avaliação por atributos EMJOGO |
| Caderneta de desenvolvimento | ⚠️ | ✅ | Implementado | **Vantagem Mister:** caderneta gamificada é o "coração emocional" |
| Info/scouting do adversário | ✅ (DB histórica) | ⚠️ | Parcial | Mister: observação no próprio jogo; QA BL-01: sem DB reutilizável |
| Scouting de recrutamento (perfis, estados, planeamento) | ✅ | ❌ | Ausente | EMJOGO tem pipeline de contratação completo |
| Competições / classificação | ✅ (drag-drop) | ✅ (automática) | Implementado | Mister: classificação automática + wizard de quadro |
| Modelo de jogo / bolas paradas | ⚠️ | ✅ | Implementado | **Vantagem Mister:** documento vivo + quadro tático |
| Relatório de fim de época partilhável | ⚠️ | ✅ | Implementado | **Vantagem Mister:** PDF + link web com marca do clube |
| Analytics 3 níveis (atleta/equipa/clube) | ⚠️ | ✅ | Implementado (⚠️) | QA BUG-P1-06/07: taxa >100%, sessões erradas no denominador |
| Inscrições federativas (Modelo 1/2/9 FPF) | ✅ | ❌ | No âmbito, não feito | Depende de levantamento FPF — **gap PT importante** |

### Sócios / Financeiro / Website / PWA de pais
| Feature | EMJOGO | Mister | Estado Mister | Nota |
|---|---|---|---|---|
| Gestão de sócios / quotas | ✅ | 🔵 | Anti-âmbito | Spec §1.6: "sem quotas/mensalidades" |
| Cartão de sócio (QR/barras) | ✅ | 🔵 | Anti-âmbito | — |
| Receitas/despesas/fornecedores/contas | ✅ | 🔵 | Anti-âmbito | — |
| **Faturação certificada (Moloni/AT)** | ✅ | ❌ | Anti-âmbito | **Fosso crítico PT** (análise abaixo) |
| **Pagamentos MB/MB WAY (IfThenPay)** | ✅ | ❌ | Anti-âmbito | **Fosso crítico PT** (análise abaixo) |
| Website automático do clube | ✅ | 🔵 | Anti-âmbito | — |
| PWA de comunicação com pais | ✅ | ❌ | FUTURO | Mister: só gerador WhatsApp; portal de pais é FUTURO |
| Comunicação com pais | ✅ (push/email/SMS) | ⚠️ | Implementado (WhatsApp) | **Abordagens diferentes** — ver Oportunidades |
| Formulários de inscrição online | ✅ | ❌ | Ausente | — |

### Modelo Comercial
| Dimensão | EMJOGO | Mister |
|---|---|---|
| Produto individual de treinador | ❌ (não existe) | ✅ €4,99/mês · €49/ano |
| Preço clube (desportivo) | ~€300–600/ano | €149–340/ano |
| Faturação/website/sócios | módulos extra (€100–390/ano cada) | não vende |
| Custo total de um clube "completo" | ~€500–1.000+/ano | €149–340/ano (só desportivo) |
| Trial | 7 dias grátis | ❌ sem trial (compra direta) |
| Pagamento | subscrição automática | ⚠️ transferência bancária manual + ativação admin |
| Fidelização | sem | sem |

---

## Análise por Balde

### Balde 1 — Paridade Obrigatória (sem isto não vende contra o EMJOGO)

Não é a lista de módulos do EMJOGO. É o mínimo para o Mister não ser descartado no primeiro slide, **dentro do terreno onde escolheu competir (treino/clube desportivo)**:

1. **Fechar o cluster de segurança P0** (cross-tenant `marcarPresencas`, XSS em URL, `/r/[token]` 500, seed com password pública). Nenhum clube com um responsável minimamente informado compra um produto onde um treinador escreve dados de outro clube. Inegociável.
2. **Recuperação de password** (QA BUG-P0-05). Um produto sem "esqueci-me da senha" não é comprável.
3. **Perfis DT/presidente utilizáveis** (QA GAP-P2-01, BUG-P1-05/08/09). O Mister **vende multi-perfil na spec** mas o presidente vê o menu do treinador e a opção "Comunicações" rebenta. Isto é pior do que não ter a feature — é uma promessa quebrada à frente do decisor.
4. **Ciclo de pagamento fechado** (IBAN real, preço mensal visível, histórico de faturação — QA GAP-P2-05). Hoje não se consegue transacionar de forma credível.
5. **Cartões → disciplina → suspensões** (QA BUG-P1-03/04). Qualquer treinador de competição (futsal sénior/juniores) espera isto; o EMJOGO tem-no.
6. **Convocatória com confirmação de leitura dos pais.** O EMJOGO faz disto argumento de venda. O Mister empurra para WhatsApp — funciona no solo, mas o clube estruturado quer o rasto de confirmação.
7. **Integridade dos analytics** (taxa ≤100%, sessões CAPTACAO/EVENTO fora do denominador — QA BUG-P1-06/07). Números errados destroem o único pilar diferenciador que o Mister tem de sobra.

### Balde 2 — Cunha do Mister (onde somos melhores ou diferentes)

1. **Modelo "2 em 1" (individual → clube).** O EMJOGO **não tem produto de treinador individual.** O Mister entra pelo treinador a €4,99 e sobe ao clube. Isto é *land-and-expand* bottom-up; o EMJOGO é venda top-down à direção. É a maior assimetria estratégica a favor do Mister.
2. **Editor de campo animado (A→B) para futsal e futebol.** O EMJOGO tem editor gráfico **estático**. Animação de movimento é um "wow" de demonstração real.
3. **ACWR / carga de treino + RPE.** O EMJOGO não faz gestão de carga. É linguagem de treinador moderno e diferencia numa demonstração.
4. **Portabilidade do treinador.** A biblioteca pessoal viaja com o treinador entre clubes. É retenção pura e um argumento que o EMJOGO (dono dos dados no clube) não pode igualar.
5. **Caderneta de desenvolvimento gamificada.** Coração emocional para o treinador de formação e argumento de venda aos pais.
6. **Relatório de fim de época partilhável (PDF + link web com marca do clube).** Barato de produzir, alto valor percebido, viral.
7. **UX/design e beira-campo.** O QA confirma ergonomia mobile (alvos ≥44px, bottom-nav a uma mão, empty states desenhados). O EMJOGO tem ADN de back-office administrativo.
8. **Preço simples e agressivo no desportivo.** €149–340/ano vs. ~€300–600/ano só na base desportiva do EMJOGO.

### Balde 3 — Ignorar por Agora (fora do foco, e está bem assim)

Tudo isto o EMJOGO tem e o Mister **não deve construir agora**:
- Gestão de sócios, quotas, cartão de sócio.
- Contabilidade (receitas/despesas/fornecedores/contas).
- Website automático do clube.
- Departamentos médico/escolar/psicológico, ficha antropométrica, semáforo de estado.
- Scouting de recrutamento (pipeline de contratação).
- Material emprestado, formulários de inscrição de sócio.

**Nota:** ignorar ≠ nunca. São o *upsell* futuro **depois** de dominar o treino.

---

## Os Dois Fossos Críticos do Mercado PT

### 1. Faturação certificada (Moloni / AT)
**O Mister resolve?** Não, e é anti-âmbito declarado (spec §1.6, §6: `FATURACAO_GERIR` marcada FUTURO).

**Análise honesta:** este fosso **só existe se o Mister quiser ser o sistema de gestão financeira do clube.** Não quer. Para um treinador ou uma escola de formação que não emite faturação pela plataforma, o fosso é irrelevante. **Mas** para deslocar o EMJOGO num clube que já o usa como ERP, o tesoureiro vai perguntar "e a faturação?" — e o Mister não tem resposta.

**Alternativa viável:** não construir faturação. Posicionar-se como **camada desportiva coexistente** ("o Mister trata do treino, o vosso sistema atual trata das quotas") e, no médio prazo, uma **integração leve** (exportação/API para Moloni ou InvoiceXpress) em vez de faturação própria certificada — que é um pântano regulatório (comunicação à AT, séries certificadas, SAF-T) que consumiria a equipa inteira.

### 2. Pagamentos MB / MB WAY automáticos (IfThenPay)
**O Mister resolve?** Não. E pior: o **próprio pagamento da subscrição do Mister** está hoje em **transferência bancária manual com ativação pelo admin** (Paddle deferido; IBAN ainda em placeholder).

**Análise honesta:** há dois problemas distintos. (a) O Mister não cobra quotas dos pais em nome do clube — anti-âmbito, e tudo bem. (b) O Mister nem sequer cobra a **sua própria subscrição** de forma automática — isto **não** é anti-âmbito, é dívida técnica, e é um travão comercial real.

**Alternativa viável:** para (a), coexistir e, no futuro, integrar IfThenPay/MB WAY se e quando entrar em quotas (roadmap §18). Para (b), **acelerar o Paddle** (Merchant of Record, resolve IVA/faturação da própria subscrição sem o Mister se tornar sujeito passivo complexo) — a arquitetura já está preparada; falta a implementação.

**Veredicto sobre os fossos:** o Mister **não deve atravessar estes fossos** — deve escolher um campo de batalha onde eles não são a linha de frente (o treinador).

---

## Oportunidades Reais do Mister

1. **O treinador individual — um mercado que o EMJOGO deixou vazio.** O EMJOGO vende ao clube. Não há produto para o treinador de formação que quer organizar o *seu* trabalho. €4,99/mês é uma compra por impulso pessoal, sem aprovação de direção. É o motor de aquisição bottom-up e o funil natural para o clube.
2. **Bottom-up land-and-expand.** Cada treinador individual é um cavalo de Troia dentro de um clube. Quando 3 treinadores do mesmo clube usam o Mister, a conversa de clube faz-se sozinha.
3. **Beira-campo e velocidade.** Um "modo jornada" com poucos toques, offline (quando a fila PWA existir), a funcionar num pavilhão com rede fraca. O EMJOGO, orientado a back-office, é mais pesado neste momento de uso.
4. **Gestão de carga (ACWR/RPE) como diferenciador de credibilidade técnica.** Nenhum concorrente PT generalista o faz.
5. **Caderneta + relatório partilhável como motor de recomendação dos pais.** O pai que recebe um relatório de época bonito com a marca do clube é um promotor. É marketing embutido no produto.
6. **Inscrições federativas FPF (Modelo 2) — se executadas, é um fosso PT a favor do Mister** contra qualquer concorrente internacional (SportEasy, Spond, TeamSnap) e paridade com o EMJOGO.
7. **Multi-desporto focado (futsal + futebol "a sério").** O EMJOGO cobre 7 desportos com profundidade generalista. O Mister cobre 2 com profundidade específica (dimensões corretas, regras específicas). Num clube de futsal+futebol, "feito para o vosso desporto" bate "faz de tudo".
8. **Fechar o Paddle = escala.** Transformar o pagamento manual em checkout automático desbloqueia self-service e crescimento sem trabalho de operações.

---

## Segmento Ideal do Mister Hoje (ICP)

**ICP primário — o treinador de formação individual (futsal ou futebol).** O EMJOGO **não tem produto** para ele. O Mister serve-o hoje, e bem. Preço de impulso, valor imediato no editor de campo e na caderneta. É o único segmento onde o Mister ganha **sem precisar de fechar os P0 de multi-perfil** — só precisa de fechar os P0 de segurança e a recuperação de password.

**ICP secundário — a escola de futsal/academia e o pequeno clube (≤4 escalões) liderado pelo treino.** Organizações onde o driver de compra é o treinador/coordenador técnico, não o tesoureiro; onde as quotas e a faturação já são resolvidas fora. Aqui o Mister vende o que o EMJOGO faz pior (UX, editor animado, carga, caderneta, relatório) e ignora o que o EMJOGO faz melhor (financeiro).

**Quem NÃO é o ICP hoje:** o clube grande e estruturado com secretaria, tesoureiro e necessidade de faturação certificada e cobrança automática de quotas. Aí o EMJOGO ganha e o Mister não deve forçar a venda.

---

## Roadmap Recomendado de Paridade (por impacto comercial)

1. **Cluster de segurança P0 + recuperação de password.** Sem isto não há venda a ninguém que faça uma pergunta técnica. Barato, localizado, inegociável.
2. **Fechar o ciclo de pagamento — acelerar o Paddle** (ou, no mínimo, IBAN real + preço + histórico de faturação). Sem transacionar de forma credível e automática, o crescimento não escala.
3. **Perfis DT/presidente utilizáveis** (menu, dashboard, permissões, "Comunicações" sem erro). Fecha a distância entre a promessa da spec e o produto.
4. **Cartões → disciplina → suspensões + convocatória com confirmação de leitura.** Duas features que o EMJOGO usa como checkboxes de comparação.
5. **Integridade e comparação multi-época dos analytics** (taxa ≤100%, denominador correto, histórico entre épocas). Protege o pilar diferenciador.
6. **Inscrições federativas FPF (Modelo 2, futsal e futebol).** Fosso PT a favor do Mister e paridade com o EMJOGO neste ponto. Começar já o levantamento FPF.
7. **Portal/consulta atleta-pai (mesmo que só link de leitura da caderneta/progresso).** Materializa o argumento de venda aos pais.
8. **Offline beira-campo (fila de escrita PWA).** Cumpre o momento da verdade do treinador.

---

## Os 3 Maiores Riscos Competitivos

1. **O produto não está pronto para o que a sua própria spec promete.** 50% dos use cases em FAIL, 5 bugs P0 de segurança, perfis de clube que rebentam à frente do decisor, e o pagamento da própria subscrição em modo manual. Vender "plataforma de clube" neste estado queima credibilidade de forma irrecuperável no mercado pequeno e connected que é o desporto amador PT.
2. **Ser puxado para o campo de batalha do EMJOGO (financeiro/administrativo) e perder.** Faturação certificada e MB WAY são fossos onde o EMJOGO tem anos de vantagem. Cada euro gasto a persegui-los é um euro não gasto a alargar a distância no treino, que é onde o Mister pode mesmo ganhar.
3. **Ameaça de flanco não pelo EMJOGO, mas pelo grátis.** No segmento do treinador individual, o inimigo real a médio prazo não é o EMJOGO — é a inércia do **WhatsApp + Excel** e a pressão de players freemium. O Mister sem trial e com pagamento manual tem fricção de entrada alta contra "grátis".

## As 3 Maiores Oportunidades

1. **Possuir o treinador individual — mercado que o EMJOGO deixou vazio — e usá-lo como funil bottom-up para o clube.** É a assimetria estratégica mais forte e o EMJOGO não a pode copiar sem reinventar o seu modelo de venda top-down.
2. **Ganhar a demonstração no terreno técnico:** editor de campo animado, ACWR/RPE, caderneta e relatório partilhável com marca do clube. São "wows" reais que o EMJOGO (editor estático, sem carga, back-office) não tem.
3. **Inscrições federativas FPF + foco futsal/futebol "a sério" como fosso local defensável** — simultaneamente paridade com o EMJOGO neste ponto e barreira intransponível a curto prazo para os internacionais (SportEasy/Spond/TeamSnap).
