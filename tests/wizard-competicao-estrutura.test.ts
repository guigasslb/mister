import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Mesma invariante de tests/quadro-agendamento-seletor-data.test.ts (§23.7): no
// passo «Calendário» do wizard os Selects e os inputs nativos de data/hora vivem
// em funções de render — um componente declarado dentro do corpo teria identidade
// nova a cada render e remontava-os (seletor fechava, foco perdia-se).
const ler = (f: string) =>
  readFileSync(fileURLToPath(new URL(`../components/competicoes/${f}`, import.meta.url)), "utf8");

describe("WizardCompeticao — sem componentes aninhados", () => {
  const fonte = ler("WizardCompeticao.tsx");
  const corpo = fonte.slice(fonte.indexOf("export function WizardCompeticao("));

  it("não declara componentes (PascalCase) dentro do corpo", () => {
    expect(corpo).not.toMatch(/^\s+function [A-Z]\w*\(/m);
    expect(corpo).not.toMatch(/^\s+const [A-Z]\w*\s*=\s*(\(|function|memo|React\.memo)/m);
  });

  it("o confronto editável é uma função de render com Selects e data/hora", () => {
    const inicio = corpo.indexOf("function renderConfronto(");
    expect(inicio).toBeGreaterThan(-1);
    const bloco = corpo.slice(inicio, corpo.indexOf("\n  }\n", inicio));
    expect(bloco).toMatch(/type="date"/);
    expect(bloco).toMatch(/type="time"/);
    expect(bloco).toMatch(/<Select\b/);
    expect(bloco).toMatch(/aria-label="Trocar casa e visitante"/);
  });
});

describe("QuadroAgendamento — diálogos são componentes de módulo", () => {
  it("usa EditarConfrontoDialog/ApagarConfrontoDialog importados, não declarados no corpo", () => {
    const fonte = ler("QuadroAgendamento.tsx");
    expect(fonte).toMatch(/from "@\/components\/competicoes\/EditarConfrontoDialog"/);
    expect(fonte).toMatch(/from "@\/components\/competicoes\/ApagarConfrontoDialog"/);
    expect(fonte).not.toMatch(/apagarResultadoExterno/);
  });
});
