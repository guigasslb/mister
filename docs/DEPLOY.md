# Guia de deploy — Mister

Complemento operacional da bíblia (`Mister_Spec_v7.md`, secção 15). Passos para colocar a app em produção.

## 0. Deploy rápido no Vercel (recomendado)

1. Criar conta em **vercel.com** com "Continue with GitHub".
2. **Add New → Project** → importar o repo `guigasslb/futsal-manager` (branch `main`).
3. Vercel deteta Next.js automaticamente (build `npm run build`, que corre `prisma generate && next build`).
4. **Environment Variables** — adicionar (secção 1): `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`.
5. **Deploy**. No fim, a app fica em `https://<projeto>.vercel.app`.
6. Migrações: a BD Supabase já tem o schema aplicado (`prisma migrate deploy` já corrido em dev). Numa BD nova, correr `npx prisma migrate deploy` com o `DATABASE_URL` de produção antes do primeiro acesso.

> Prisma: o `generator` inclui `binaryTargets = ["native", "rhel-openssl-3.0.x"]` para o runtime serverless do Vercel. Cada `git push` para `main` faz redeploy automático.

## 1. Variáveis de ambiente (obrigatórias)

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Ligação da app — pooler Supabase (Transaction, porta **6543**, `?pgbouncer=true`) |
| `DIRECT_URL` | Ligação direta (porta **5432**) — usada pelas migrações Prisma |
| `AUTH_SECRET` | Segredo do Auth.js — gerar com `npx auth secret` |
| `SEED_PASS_GONCALO`, `SEED_PASS_ADJUNTO` | **Obrigatórias em produção** se o seed for corrido (o seed aborta sem elas) |
| `AUTH_TRUST_HOST` | `true` se atrás de proxy e o host não for auto-detetado (não é preciso no Vercel) |

> **Segurança:** nunca commitar `.env`. Injetar via secrets do host. Rodar `AUTH_SECRET` e a password da BD sempre que houver suspeita de exposição.

### 1.1 Onde obter os valores no Supabase

No dashboard do Supabase: **Project Settings → Database → Connection string**. O Supabase mostra duas variantes que correspondem diretamente às duas variáveis:

- **Transaction pooler** (`...pooler.supabase.com:6543`) → `DATABASE_URL`. Acrescentar `?pgbouncer=true` no fim.
- **Direct connection / Session** (`...:5432`) → `DIRECT_URL`.

Formato esperado (o `<ref>`, `<region>` e `<password>` são específicos do projeto):

```bash
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

### 1.2 Pooler (6543) vs ligação direta (5432) — quando usar cada uma

O Supabase expõe a BD por dois caminhos, e o Prisma usa cada um para fins diferentes. **Ambas as variáveis são obrigatórias** neste projeto (o `schema.prisma` declara `url = env("DATABASE_URL")` e `directUrl = env("DIRECT_URL")`).

| | Pooler — `DATABASE_URL` (6543) | Direta — `DIRECT_URL` (5432) |
|---|---|---|
| **Tecnologia** | PgBouncer em modo *transaction pooling* | Ligação TCP direta ao Postgres |
| **Para quê** | Queries runtime da app (Prisma Client) | Migrações e introspeção (`migrate`, `db push`, `db pull`) |
| **Porquê** | Serverless (Vercel) abre muitas ligações curtas; o pooler recicla-as e evita esgotar o limite de conexões do Postgres | As migrações precisam de sessões estáveis e de comandos DDL/*prepared statements* que o pooling em modo transaction não suporta |
| **Sufixo obrigatório** | `?pgbouncer=true` (desliga *prepared statements* do Prisma, incompatíveis com PgBouncer) | nenhum |

Regra prática: **a app fala pelo 6543; as migrações falam pelo 5432.** O Prisma faz este encaminhamento automaticamente — ao correr qualquer comando `prisma migrate ...` ou `prisma db push`, usa o `directUrl` (5432) sem configuração extra; em runtime o Prisma Client usa o `url` (6543). Por isso os scripts npm **não** precisam de passar `DIRECT_URL` explicitamente.

> Se `DIRECT_URL` faltar quando o pooler está em uso, as migrações podem falhar com erros de *prepared statement* / *pooler* — daí ambas serem obrigatórias.

## 2. Migrações da base de dados

O Prisma usa sempre o `DIRECT_URL` (5432) para qualquer operação de migração — não é preciso alterar variáveis nem scripts entre ambientes; muda apenas o **comando**.

### 2.1 Produção (Supabase)

Usar **sempre** `migrate deploy` (nunca `migrate dev` — este é interativo e pode fazer reset/perder dados):

```bash
npx prisma migrate deploy
# ou, via script:
npm run db:deploy
```

Aplica todas as migrações pendentes de `prisma/migrations/` de forma não-destrutiva e idempotente. Correr no pipeline de deploy, antes de arrancar a app. No Vercel isto já acontece: o `npm run build` corre `prisma migrate deploy && prisma generate && next build`.

### 2.2 Desenvolvimento

Criar/aplicar uma nova migração a partir de alterações ao `schema.prisma` (gera o ficheiro SQL em `prisma/migrations/` e aplica-o à BD de dev):

```bash
npx prisma migrate dev --name descricao_da_alteracao
# ou, via script (sem --name, o Prisma pergunta):
npm run db:migrate
```

Prototipagem rápida **sem** criar ficheiro de migração (sincroniza o schema diretamente com a BD; útil em BD descartável, **não** recomendado quando já há migrações versionadas a manter em sincronia):

```bash
npx prisma db push
```

> Fazer sempre `migrate dev` (com ficheiro versionado) para alterações que vão para produção — `db push` não deixa histórico e não pode ser reproduzido por `migrate deploy`. Após qualquer alteração ao schema, correr `npm run typecheck` (o Prisma Client é regenerado por `migrate dev`/`db push`; se necessário forçar, `npm run db:generate`).

## 3. Build

```bash
npm ci
npm run build   # corre `prisma generate` + `next build`
npm run start
```

A build corre ESLint e typecheck — falha se houver erros. Verificar localmente antes de fazer push.

## 4. Seed (só a 1.ª vez / ambiente novo)

```bash
SEED_PASS_GONCALO=... SEED_PASS_ADJUNTO=... npm run db:seed
```

Idempotente (não faz nada se o clube já existir). **Falha em produção sem as passwords** — por design, para nunca criar contas com credencial pública.

## 5. Cabeçalhos de segurança

Configurados em `next.config.js` (`headers()`): CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Rever a CSP se se adicionarem origens externas (ex.: novo CDN de imagens).

## 6. Pendente / a configurar antes de tráfego real

- **Monitorização de erros** — integrar Sentry (ou equivalente). Ponto de ligação já preparado em `app/global-error.tsx` (`console.error` a substituir pela captura). Sem isto, erros de produção não deixam rasto.
- **Backups da BD** — confirmar backups automáticos + teste de restauro no plano Supabase.
- **RGPD (menores) — consentimento tratado pelo clube (decisão 2026-08-02).** O consentimento parental (dados + imagem) é **recolhido pelo clube no ato de inscrição**, fora da aplicação (formulário/papel). A app assume que esse consentimento existe para os atletas registados. *Melhorias futuras (não bloqueadoras):* registo do consentimento na app (modelo `Consentimento` já existe no schema, por ligar) e hard-delete de dados pessoais (direito ao esquecimento) — atualmente `apagarAtleta` é soft-delete.
- **Rate-limiting de login** — atual é em memória (single-instance). Para multi-instância, migrar para store partilhado.

## 7. Dependências

`npm audit` fica limpo de críticas/high no runtime de produção. As restantes (vitest/vite/esbuild) são **dev-only** (nunca vão para produção); limpar exigiria `vitest@4` (breaking) — reavaliar quando for oportuno.
