# Ambiente de Teste — Configuração

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Estado**: Publicado

## Visão Geral

Este guia descreve como preparar o ambiente local para correr a bíblia de use cases de teste do Mister: base de dados PostgreSQL local, migrações, seeds e servidor de desenvolvimento por persona.

## Pré-requisitos

- PostgreSQL 16 instalado (cluster `main`, a escutar em `localhost:5432`)
- Node.js + `npm`
- Repositório em `/futsal-manager`

## 1. Base de Dados Local

### Parâmetros

| Parâmetro | Valor |
|---|---|
| Host | `localhost` |
| Porta | `5432` |
| Base de dados | `mister_local` |
| Utilizador | `mister_local` |
| Password | `mister_local_pass` |

### Ficheiro de ambiente

Criar `/futsal-manager/.env.local` com:

```env
DATABASE_URL="postgresql://mister_local:mister_local_pass@localhost:5432/mister_local?schema=public"
DIRECT_URL="postgresql://mister_local:mister_local_pass@localhost:5432/mister_local?schema=public"
```

> **Nota**: `DATABASE_URL` e `DIRECT_URL` apontam para a mesma instância local (sem pgBouncer). Em produção (Supabase) diferem.

## 2. Migrações

Aplicar o schema à base de dados local. As variáveis podem ser passadas inline para garantir que apontam para a BD local:

```bash
cd /futsal-manager
DATABASE_URL="postgresql://mister_local:mister_local_pass@localhost:5432/mister_local?schema=public" \
DIRECT_URL="postgresql://mister_local:mister_local_pass@localhost:5432/mister_local?schema=public" \
npx prisma migrate deploy
```

## 3. Seeds

### Seed base (contas e estrutura mínima)

```bash
npx tsx prisma/seed-teste.ts
```

Cria os clubes, escalões, épocas e as **5 contas de teste** (ver [`contas.md`](contas.md)).

### Seed rico (dados históricos para analíticos)

```bash
npx tsx prisma/seed-rico.ts
```

Adiciona atletas, sessões, jogos, presenças, estatísticas, periodização e competições — necessário para testar analíticos, ACWR, rankings e relatórios.

### Verificação das contagens

Confirmar que os dados foram carregados:

```sql
-- Ligar: psql "postgresql://mister_local:mister_local_pass@localhost:5432/mister_local"
SELECT c.nome AS clube, COUNT(DISTINCT a.id) AS atletas
FROM "Clube" c
LEFT JOIN "Escalao" e ON e."clubeId" = c.id
LEFT JOIN "Atleta" a ON a."escalaoId" = e.id
GROUP BY c.nome
ORDER BY c.nome;
```

Contagens esperadas do `seed-rico` por clube:

| Clube | Atletas | Sessões | Jogos | Extra |
|---|---|---|---|---|
| Atlético dos Miúdos | 12 | 20 | 8 | — |
| FC Independente | 16 | 25 | 18 | periodização |
| SC Estrela | 2 × 16 | 20 + 18 | 15 + 12 | competição |

## 4. Servidor de Desenvolvimento

### Portas por persona

Cada persona corre numa porta isolada para evitar colisão de sessões/cookies:

| Persona | Porta |
|---|---|
| P1 — solo miúdos | 3020 |
| P2 — solo seniores | 3021 |
| P3 — clube seniores | 3022 |
| P4 — diretor técnico | 3023 |
| P5 — presidente | 3024 |

### Arrancar

```bash
# 1. Limpar processos anteriores na porta
lsof -ti:3020 | xargs kill -9 2>/dev/null; true

# 2. Arrancar
npm run dev -- --port 3020

# 3. Aguardar 20-25 segundos antes de testar
```

### Corrupção de build

Se o `.next` ficar corrompido (erros estranhos de compilação/hidratação):

```bash
rm -rf .next && npm run dev -- --port 3020
```

## 5. Login via curl (Auth.js v5 — credentials)

Para testes de **leitura** com sessão autenticada:

```bash
COOKIE="/tmp/cookies_PERSONA.txt"
BASE="http://localhost:PORT"

# 1. Obter CSRF token
CSRF=$(curl -s -c $COOKIE "$BASE/api/auth/csrf" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

# 2. Autenticar
curl -s -b $COOKIE -c $COOKIE -L -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=${CSRF}&email=EMAIL&password=PASS&redirect=false&callbackUrl=%2Fdashboard"

# 3. Confirmar sessão
curl -s -b $COOKIE "$BASE/api/auth/session"
```

Substituir `PORT`, `EMAIL`, `PASS` e `PERSONA` pelos valores da persona (ver [`contas.md`](contas.md)).

## 6. Limitação: Server Actions

As **Server Actions não são chamáveis via curl simples** — usam um protocolo RSC binário com IDs de action gerados no build.

Consequências para os testes:

- **Testes de leitura** (GET de páginas, endpoints de auth): via `curl` com sessão autenticada.
- **Testes de escrita** (criar atleta, marcar presenças, etc.): requerem **análise do código** dos componentes (`app/`) e das actions (`lib/actions/`), complementada por validação manual na UI.

Por isso, muitos use cases de escrita têm o estado determinado por **inspeção de código** e não por chamada HTTP direta.

## Referências

- [Contas de teste](contas.md)
- [README da bíblia de QA](../README.md)
- [Guia de deploy](../../DEPLOY.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial |
