# Mister — Instruções do projeto

Plataforma de gestão desportiva multi-modalidade (futsal + futebol) focada em treinadores e clubes (marca: **Mister**; guia visual em `docs/BRAND.md`). A **bíblia** do produto é `docs/Mister_Spec_v7.md` — **fonte única de verdade** do produto final. (`docs/Mister_Spec_v6.md` é o histórico pré-expansão multi-desporto 2026-08-19, arquivado. `docs/Mister_Spec_v5.md` é o histórico pré-brainstorming 2026-08-05, arquivado. `docs/Mister_Spec_v4_MVP_historico.md` é o histórico do MVP, arquivado — não usar como referência ativa.)

## Documentação (regra inquebrável)

- **Uma única bíblia:** `docs/Mister_Spec_v7.md`. Sem ficheiros de informação funcional espalhados.
- **Nenhuma alteração de código sem atualizar a bíblia no mesmo passo.** A documentação nunca fica atrás do código.
- Toda a modificação à bíblia regista-se no **changelog dentro do próprio documento** (secção 19), com **data e descrição** da alteração.
- Objetivo: se o código se perder, a bíblia permite **recriar tudo do zero a 100%**.

## Regras de leitura da bíblia

- Segue a bíblia **à letra**. Nomes de campos, tipos, assinaturas e terminologia são especificação, não sugestão.
- **DEVE** = obrigatório · **DEVERIA** = recomendado · **FUTURO** = não implementar agora.
- Implementa pela ordem das fases (secção 16). Cada fase fica funcional e testada antes de avançar.
- Não introduzas desvios sem instrução explícita. Em dúvida, pergunta antes de decidir.

> **Nota de estado:** o MVP (secções abaixo) está concluído e aprovado. A partir daqui construímos o **produto final** definido no `Spec_v5`.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · Prisma + PostgreSQL (Supabase) · Auth.js v5 · Zod · Tailwind + shadcn/ui.

## Convenções fixas

- **Server Actions**, não REST (exceto o handler do Auth.js). Todas começam com `"use server"`.
- Toda a validação com **Zod** em `lib/schemas/` — fonte única, partilhada cliente/servidor.
- Todas as actions: validam input → verificam `auth()` → obtêm época via `obterEpocaAtiva()` → devolvem `Resultado<T>` (`lib/utils.ts`) → `revalidatePath()`.
- Todas as queries filtram pelo **clube** do utilizador autenticado e, quando aplicável, pela **época ativa**.
- Interface 100% em **português de Portugal**, com a terminologia do glossário (secção 2).
- Sistema de design da secção 12 + `docs/BRAND.md`. **Marca Mister** (laranja `#F0531E` + preto quente + Bricolage Grotesque) é **fixa**; a **cor do clube** é dinâmica e alimenta todos os acentos (via `--cor-primaria` e `--primary`). Alvos de toque ≥44px. Sem dark mode no MVP.

## Estado dos passos (MVP — concluído)

- [x] **1. Fundações** — config, schema Prisma (16 entidades, 8 enums), Auth.js + middleware, `obterEpocaAtiva()`, seed, login funcional.
- [x] **2. Layout + Época** — BarraTopo, Navegacao (sidebar+bottom-nav), SeletorEpoca, EstadosUI, stubs de rotas.
- [x] **3. Definições base** — CRUD de escalões, épocas, utilizadores, métricas. _(Habilidades removidas em 2026-09-12.)_
- [x] **4. Plantel** — CRUD de atletas, lista c/ tabs por escalão, perfil (sem estatísticas).
- [x] **5. Exercícios** — CRUD da biblioteca (sem editor de campo).
- [x] **6. Editor de campo (SVG)** — CampoFutsal, MiniaturaCampo, EditorCampo interativo.
- [x] **7. Treinos** — CRUD de sessões, gestão de exercícios (reordenar), lista c/ tabs.
- [x] **8. Presenças** — marcação por sessão (upsert em lote).
- [x] **9. Jogos + convocatória** — CRUD de jogos, abas convocatória/estatísticas/relatório.
- [x] **10. Estatísticas** — grelha por atleta convocado (campos de GR condicionais), upsert.
- [x] **11. Agregações** — `obterEstatisticasAtleta` no perfil (golos, jogos, taxa presença).
- [~] **12. Caderneta** — **REMOVIDA em 2026-09-12** (features Habilidades e Caderneta eliminadas do produto; ver spec §19). Já não existe.
- [x] **13. Dashboard** — próximo treino/jogo, ações rápidas, resumo da época.
- [x] **14. Estados e polish** — not-found, redirects para /dashboard, estados vazios.

### Conformidade adicional com a spec
- [x] Métricas configuráveis capturadas por jogo (ValorMetrica, input adapta ao tipo).
- [x] Confirmação ao remover convocado com estatísticas (secção 9 — casos-limite).
- [x] Pesquisa por nome no plantel e exercícios.
- [x] Toggle lista/calendário mensal nos treinos.
- [x] Aviso de número duplicado no plantel (secção 8 — plantel).
- [x] Testes Vitest: schemas Zod, DiagramaCampo, agregações, e correções da auditoria — **51 testes**.

## Melhorias pós-MVP (Grupos A–E, 2026-08)

- [x] **A — Modelo do atleta:** posições múltiplas (`posicoes`), escalão secundário, `fotoUrl` (por URL), `dataIngresso`, encarregado de educação.
- [x] **B — Periodização smart + sessão↔periodização:** `sugerirPlaneamento` (pré-preenchimento), `TipoSessao` (NORMAL/ABERTO/CAPTACAO/EVENTO); só NORMAL liga a planeamento.
- [x] **C — Equipa técnica:** "Membros" → "Equipa técnica".
- [x] **D — Exercícios:** `CategoriaExercicioPrincipal` (enum) + `SubcategoriaExercicio` (customizável por clube); `ExercicioForm` redesenhado; CRUD de subcategorias em Definições.
- [x] **E — Estatística/visualização:** gráficos SVG próprios (`components/graficos/`) — evolução por jogo, presença mensal, rankings; `lib/actions/analise.ts`.

## Auditoria de produção (fases 0–6, 2026-08-02)

Estado: **build de produção verde, `npm audit --omit=dev` = 0 vulnerabilidades, 51 testes.**
- [x] **0 — Build** desbloqueada.
- [x] **1 — Segurança:** Next 15.5.x (CVEs), next-auth beta.32; middleware `authorized`; sessão 7d; allowlist YouTube no `videoUrl`; rate-limit de login; headers de segurança (`next.config.js`); seed falha em prod sem passwords; bcrypt cost 12.
- [x] **3 — Dados:** `dataIngresso` na taxa de presença; ranking por `atletaId`; FK guards (apagar escalão); validação de convocatória e reordenação; `erroDeValidacao`; `convidarMembro` em transação.
- [x] **4 — Ops:** `global-error.tsx`; 10 índices Prisma; `docs/DEPLOY.md`; `.env.example`.
- [x] **5 — Visual/a11y:** tokens de cor em falta; `ambar-600` (AA); área de toque + focus nos botões de reordenar.
- [x] **6 — Testes:** `tests/actions-producao.test.ts` (7).
- **Pendente (ops do utilizador):** rodar password BD Supabase + `AUTH_SECRET`; ligar monitorização de erros (Sentry). Ver `docs/DEPLOY.md` §6.
- **RGPD:** consentimento tratado pelo clube na inscrição, fora da app (decisão 2026-08-02).

## Comandos

`npm run dev` · `npm run typecheck` · `npm run lint` · `npm run test` · `npm run db:migrate` · `npm run db:seed` · `npm run db:studio`

Definição de pronto de cada funcionalidade: secção 16.
