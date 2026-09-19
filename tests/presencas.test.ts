import { describe, it, expect } from "vitest";

import { presencasAlteradas, type RegistoPresenca } from "@/lib/presencas";

const vazio = (): RegistoPresenca => ({ estado: null, tipoAusencia: null, notaAusencia: null });

describe("lib/presencas — presencasAlteradas", () => {
  it("mapas idênticos → sem alterações", () => {
    const inicial: Record<string, RegistoPresenca> = { a: vazio(), b: vazio() };
    const atual: Record<string, RegistoPresenca> = { a: vazio(), b: vazio() };
    expect(presencasAlteradas(inicial, atual)).toBe(false);
  });

  it("deteta mudança de estado", () => {
    const inicial: Record<string, RegistoPresenca> = { a: vazio() };
    const atual: Record<string, RegistoPresenca> = {
      a: { estado: "PRESENTE", tipoAusencia: null, notaAusencia: null },
    };
    expect(presencasAlteradas(inicial, atual)).toBe(true);
  });

  it("deteta mudança de tipo de ausência", () => {
    const base: RegistoPresenca = {
      estado: "LESIONADO",
      tipoAusencia: null,
      notaAusencia: null,
    };
    const inicial: Record<string, RegistoPresenca> = { a: { ...base } };
    const atual: Record<string, RegistoPresenca> = { a: { ...base, tipoAusencia: "LESAO" } };
    expect(presencasAlteradas(inicial, atual)).toBe(true);
  });

  it("nota de ausência null, vazia ou só com espaços são equivalentes", () => {
    const base: RegistoPresenca = {
      estado: "FALTA",
      tipoAusencia: "OUTRO",
      notaAusencia: null,
    };
    const inicial: Record<string, RegistoPresenca> = { a: { ...base, notaAusencia: null } };
    const atual: Record<string, RegistoPresenca> = { a: { ...base, notaAusencia: "   " } };
    expect(presencasAlteradas(inicial, atual)).toBe(false);
  });

  it("deteta mudança real da nota de ausência (ignora espaços nas pontas)", () => {
    const base: RegistoPresenca = {
      estado: "FALTA_JUSTIFICADA",
      tipoAusencia: "OUTRO",
      notaAusencia: "consulta",
    };
    const inicial: Record<string, RegistoPresenca> = { a: { ...base } };
    const iguais: Record<string, RegistoPresenca> = { a: { ...base, notaAusencia: "  consulta  " } };
    const diferentes: Record<string, RegistoPresenca> = { a: { ...base, notaAusencia: "viagem" } };
    expect(presencasAlteradas(inicial, iguais)).toBe(false);
    expect(presencasAlteradas(inicial, diferentes)).toBe(true);
  });

  it("campos de ausência ausentes (undefined) equivalem a null", () => {
    // Registos/fixtures antigos não trazem tipoAusencia/notaAusencia.
    const antigo: RegistoPresenca = { estado: "FALTA" };
    const novo: RegistoPresenca = { ...antigo, tipoAusencia: null, notaAusencia: null };
    expect(presencasAlteradas({ a: antigo }, { a: novo })).toBe(false);
  });

  it("deteta atleta presente só num dos mapas", () => {
    const inicial: Record<string, RegistoPresenca> = { a: vazio() };
    const atual: Record<string, RegistoPresenca> = { a: vazio(), b: vazio() };
    expect(presencasAlteradas(inicial, atual)).toBe(true);
  });

  it("marcar todos presentes a partir de vazio conta como alteração", () => {
    const inicial: Record<string, RegistoPresenca> = { a: vazio(), b: vazio() };
    const atual: Record<string, RegistoPresenca> = {
      a: { estado: "PRESENTE", tipoAusencia: null, notaAusencia: null },
      b: { estado: "PRESENTE", tipoAusencia: null, notaAusencia: null },
    };
    expect(presencasAlteradas(inicial, atual)).toBe(true);
  });

  it("Repor: limpar presenças guardadas conta como alteração (habilita Guardar)", () => {
    // Estado carregado do servidor: dois atletas com presença guardada.
    const inicial: Record<string, RegistoPresenca> = {
      a: { estado: "PRESENTE", tipoAusencia: null, notaAusencia: null },
      b: { estado: "FALTA", tipoAusencia: "DOENCA", notaAusencia: null },
    };
    // Após "Repor": tudo por marcar (estado null) — difere do servidor, pelo que
    // "Guardar presenças" fica ativo para persistir a remoção.
    const aposRepor: Record<string, RegistoPresenca> = { a: vazio(), b: vazio() };
    expect(presencasAlteradas(inicial, aposRepor)).toBe(true);
  });
});
