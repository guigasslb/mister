import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Regressão 2026-10-17 (§19): o seletor nativo de data/hora do agendamento de
// jogos das Competições fechava ao mudar de mês/dia/hora. Causa: a linha com os
// inputs era um componente (PascalCase) declarado dentro de QuadroAgendamento —
// identidade nova a cada render → cada onChange remontava o <input>. Sem DOM
// nos testes (environment: node), guardamos a invariante estrutural: nenhum
// componente aninhado no corpo de QuadroAgendamento pode conter os inputs.
const fonte = readFileSync(
  fileURLToPath(new URL("../components/competicoes/QuadroAgendamento.tsx", import.meta.url)),
  "utf8",
);

describe("QuadroAgendamento — seletor de data/hora não remonta", () => {
  it("os inputs de data/hora não vivem num componente declarado dentro do corpo", () => {
    const corpo = fonte.slice(fonte.indexOf("export function QuadroAgendamento("));
    // Componentes aninhados: `function Xxx(` indentados dentro do corpo.
    const aninhados = [...corpo.matchAll(/^ {2}function ([A-Z]\w*)\(/gm)];
    for (const m of aninhados) {
      const inicio = m.index!;
      const fim = corpo.indexOf("\n  }\n", inicio);
      const bloco = corpo.slice(inicio, fim);
      expect(bloco, `componente aninhado ${m[1]}`).not.toMatch(/type="(date|time)"/);
    }
    expect(corpo).toMatch(/type="date"/);
    expect(corpo).toMatch(/type="time"/);
  });

  // Mesma causa raiz (2026-10-17): golos inline (perda de foco a cada tecla) e
  // DropdownMenu de estado (fechava/perdia foco). Nenhum componente aninhado.
  it("não declara componentes (PascalCase) dentro do corpo de QuadroAgendamento", () => {
    const corpo = fonte.slice(fonte.indexOf("export function QuadroAgendamento("));
    expect(corpo).not.toMatch(/^\s+function [A-Z]\w*\(/m);
    expect(corpo).not.toMatch(/^\s+const [A-Z]\w*\s*=\s*(\(|function|memo|React\.memo)/m);
    expect(corpo).toMatch(/function renderLinhaDecidido\(r: ResultadoQuadro\)/);
    expect(corpo).toMatch(/function renderMenuEstado\(r: ResultadoQuadro\)/);
    expect(corpo).toMatch(/type="number"/);
  });
});
