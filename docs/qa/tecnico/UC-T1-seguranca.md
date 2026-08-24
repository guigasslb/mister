# UC-T1 — Segurança

> **Versão**: 1.0.0
> **Última Atualização**: 2026-08-20
> **Área**: Segurança (autenticação, autorização, IDOR, headers, validação de input)

## Visão Geral

Verificações de segurança transversais ao produto Mister: proteção de rotas, headers de segurança, IDOR em Server Actions, proxy de imagem aberto, validação de URLs e tratamento seguro de rotas públicas.

> **Nota (Regra de auth):** Nenhum destes testes deve resultar em alteração de código de autenticação sem autorização explícita do supervisor. Estes use cases **descrevem** o comportamento a validar; as correções de auth são tratadas à parte.

## Resumo de Estados

| ID | Nome | Prioridade | Estado |
|---|---|---|---|
| UC-T1-01 | Proteção de rotas sem autenticação | CRÍTICO | PASS ✅ |
| UC-T1-02 | Headers de segurança | ALTO | PASS ✅ |
| UC-T1-03 | IDOR em `obterLicencaPendente` | CRÍTICO | FAIL ❌ |
| UC-T1-04 | Open image proxy | ALTO | FAIL ❌ |
| UC-T1-05 | Validação de URL em fotoUrl/logoUrl | ALTO | FAIL ❌ |
| UC-T1-06 | Rota pública de relatório com token inválido | ALTO | FAIL ❌ |

---

### UC-T1-01: Proteção de rotas sem autenticação

**Perfil:** Técnico — segurança
**Área:** Autenticação / Middleware
**Prioridade:** CRÍTICO

**Pré-condições:**
- Servidor a correr; sem cookie de sessão.

**Passos:**
1. Para cada uma das 12 rotas principais, fazer pedido sem cookie de sessão.
2. Observar o código de resposta e o redirect.

**Resultado esperado:**
- Cada rota protegida devolve 307 para `/login`.

**Critério de PASS/FAIL:**
- PASS: as 12 rotas redirecionam (307) para `/login`.
- FAIL: qualquer rota acessível sem sessão.

**Estado atual:** PASS ✅
**Notas:** Todas as 12 rotas testadas redirecionam corretamente para `/login`.

---

### UC-T1-02: Headers de segurança

**Perfil:** Técnico — segurança
**Área:** Headers HTTP
**Prioridade:** ALTO

**Pré-condições:**
- Servidor a correr.

**Passos:**
1. `curl -I http://localhost:PORT/`.
2. Verificar: CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`, HSTS, `Referrer-Policy`, `Permissions-Policy`.

**Resultado esperado:**
- Todos os headers de segurança presentes e corretos.

**Critério de PASS/FAIL:**
- PASS: todos os headers presentes.
- FAIL: qualquer header em falta.

**Estado atual:** PASS ✅
**Notas:** Headers configurados em `next.config.js` (auditoria de produção fase 1). Todos presentes.

---

### UC-T1-03: IDOR em `obterLicencaPendente`

**Perfil:** Técnico — segurança
**Área:** Server Actions / Autorização
**Prioridade:** CRÍTICO

**Pré-condições:**
- Dois clubes distintos na BD.
- Ficheiro: `lib/actions/licenciamento.ts:94`.

**Passos:**
1. Analisar a Server Action `obterLicencaPendente(clubeId)`.
2. Confirmar se invoca `auth()` e valida que `clubeId` pertence ao utilizador.
3. Tentar passar o `clubeId` de outro clube.

**Resultado esperado:**
- A action valida a sessão e recusa `clubeId` que não pertence ao utilizador.

**Critério de PASS/FAIL:**
- PASS: `clubeId` derivado/validado por `auth()`; acesso cruzado recusado.
- FAIL: aceita `clubeId` arbitrário de outro clube.

**Estado atual:** FAIL ❌
**Notas:** IDOR confirmado — `obterLicencaPendente` não chama `auth()` e aceita `clubeId` como parâmetro externo (`lib/actions/licenciamento.ts:94`). Permite ler licença de outro clube.

---

### UC-T1-04: Open image proxy

**Perfil:** Técnico — segurança
**Área:** Next.js Image / SSRF
**Prioridade:** ALTO

**Pré-condições:**
- `next.config.js` com `remotePatterns`/`domains`.

**Passos:**
1. Pedir `/_next/image?url=https://qualquer-dominio.com/img.jpg` sem autenticação.
2. Verificar se o proxy serve imagens de qualquer domínio.

**Resultado esperado:**
- Só domínios explicitamente permitidos podem ser servidos.

**Critério de PASS/FAIL:**
- PASS: allowlist restritiva de domínios.
- FAIL: `hostname: "**"` permite qualquer domínio.

**Estado atual:** FAIL ❌
**Notas:** `hostname: "**"` em `next.config.js` transforma o otimizador de imagem num proxy aberto (risco de SSRF/abuso de banda).

---

### UC-T1-05: Validação de URL em fotoUrl/logoUrl

**Perfil:** Técnico — segurança
**Área:** Validação de input / Zod
**Prioridade:** ALTO

**Pré-condições:**
- Schemas Zod em `lib/schemas/`.

**Passos:**
1. Criar atleta com `fotoUrl: "javascript:alert(1)"`.
2. Verificar se o Zod rejeita.
3. Repetir para `logoUrl` do clube.

**Resultado esperado:**
- Apenas URLs http(s) de domínios permitidos são aceites; esquemas perigosos rejeitados.

**Critério de PASS/FAIL:**
- PASS: `javascript:` e outros esquemas perigosos rejeitados.
- FAIL: aceita qualquer URL.

**Estado atual:** FAIL ❌
**Notas:** Aceita qualquer URL, incluindo `javascript:` — risco de XSS/injeção se renderizado sem sanitização. Falta validação de esquema/allowlist no Zod.

---

### UC-T1-06: Rota pública de relatório com token inválido

**Perfil:** Técnico — segurança
**Área:** Rotas públicas / Tratamento de erros
**Prioridade:** ALTO

**Pré-condições:**
- Rota pública `/r/[token]`.

**Passos:**
1. `GET /r/TOKEN_INVALIDO_QUALQUER`.
2. Observar a resposta.

**Resultado esperado:**
- Ecrã amigável (404/"relatório não encontrado"), sem stack trace nem 500.

**Critério de PASS/FAIL:**
- PASS: mensagem amigável, sem 500.
- FAIL: 500 / erro não tratado.

**Estado atual:** FAIL ❌
**Notas:** Dava 500 (`PrismaClientInitializationError` não capturado) com token inválido. Relacionado com UC-P5-04. Confirmar correção após ciclo de fixes.

---

## Referências

- [Setup do ambiente](../ambiente/setup.md)
- [UC-P5 — Presidente](../personas/UC-P5-presidente.md)
- [Guia de deploy — DEPLOY.md](../../DEPLOY.md)

## Histórico de Versões

| Versão | Data | Autor | Alterações |
|---|---|---|---|
| 1.0.0 | 2026-08-20 | Equipa QA | Versão inicial |
