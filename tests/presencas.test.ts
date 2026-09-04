import { describe, it, expect } from "vitest";

import { presencasAlteradas, type RegistoPresenca } from "@/lib/presencas";

const vazio = (): RegistoPresenca => ({ estado: null, motivo: null, justificacao: null });

describe("lib/presencas — presencasAlteradas", () => {
  it("mapas idênticos → sem alterações", () => {
    const inicial: Record<string, RegistoPresenca> = { a: vazio(), b: vazio() };
    const atual: Record<string, RegistoPresenca> = { a: vazio(), b: vazio() };
    expect(presencasAlteradas(inicial, atual)).toBe(false);
  });

  it("deteta mudança de estado", () => {
    const inicial: Record<string, RegistoPresenca> = { a: vazio() };
    const atual: Record<string, RegistoPresenca> = {
      a: { estado: "PRESENTE", motivo: null, justificacao: null },
    };
    expect(presencasAlteradas(inicial, atual)).toBe(true);
  });

  it("deteta mudança de motivo", () => {
    const base: RegistoPresenca = { estado: "FALTA", motivo: null, justificacao: null };
    const inicial: Record<string, RegistoPresenca> = { a: { ...base } };
    const atual: Record<string, RegistoPresenca> = { a: { ...base, motivo: "DOENCA" } };
    expect(presencasAlteradas(inicial, atual)).toBe(true);
  });

  it("justificação null, vazia ou só com espaços são equivalentes", () => {
    const base: RegistoPresenca = { estado: "FALTA_JUSTIFICADA", motivo: "OUTRO", justificacao: null };
    const inicial: Record<string, RegistoPresenca> = { a: { ...base, justificacao: null } };
    const atual: Record<string, RegistoPresenca> = { a: { ...base, justificacao: "   " } };
    expect(presencasAlteradas(inicial, atual)).toBe(false);
  });

  it("deteta mudança real de justificação (ignora espaços nas pontas)", () => {
    const base: RegistoPresenca = { estado: "FALTA_JUSTIFICADA", motivo: "OUTRO", justificacao: "consulta" };
    const inicial: Record<string, RegistoPresenca> = { a: { ...base } };
    const iguais: Record<string, RegistoPresenca> = { a: { ...base, justificacao: "  consulta  " } };
    const diferentes: Record<string, RegistoPresenca> = { a: { ...base, justificacao: "viagem" } };
    expect(presencasAlteradas(inicial, iguais)).toBe(false);
    expect(presencasAlteradas(inicial, diferentes)).toBe(true);
  });

  it("deteta atleta presente só num dos mapas", () => {
    const inicial: Record<string, RegistoPresenca> = { a: vazio() };
    const atual: Record<string, RegistoPresenca> = { a: vazio(), b: vazio() };
    expect(presencasAlteradas(inicial, atual)).toBe(true);
  });

  it("marcar todos presentes a partir de vazio conta como alteração", () => {
    const inicial: Record<string, RegistoPresenca> = { a: vazio(), b: vazio() };
    const atual: Record<string, RegistoPresenca> = {
      a: { estado: "PRESENTE", motivo: null, justificacao: null },
      b: { estado: "PRESENTE", motivo: null, justificacao: null },
    };
    expect(presencasAlteradas(inicial, atual)).toBe(true);
  });
});
