import { describe, it, expect } from "vitest";
import type { CalendarioPublico, JogoCalendarioPublico } from "@/lib/calendario-publico";
import {
  dataHoraCurta,
  descricaoCalendarioPublico,
  linhasImagemCalendario,
  MAX_DESCRICAO,
  resolverUrlBase,
  separarLocal,
  tituloCalendarioPublico,
} from "@/lib/calendario-publico-partilha";
import {
  CACHE_IMAGEM,
  corAcento,
  renderizarImagemCalendario,
} from "@/lib/calendario-publico-imagem";

const MAPS =
  "https://www.google.com/maps?gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIGCAEQRRhA0gEIMzIzNmowajSoAgCwAgE&um=1&ie=UTF-8&fb=1&";

function jogo(extra: Partial<JogoCalendarioPublico> = {}): JogoCalendarioPublico {
  return {
    data: "2026-10-24T09:00:00.000Z", // 10:00 em Lisboa (WEST)
    adversario: "Juventude Sport Clube",
    casaFora: "FORA",
    local: null,
    competicao: "LIGA INTERDISTRITAL - BENJAMINS FUTSAL",
    equipa: "Brancos", // já normalizado por nomeSubequipaPublico
    resultado: null,
    ...extra,
  };
}

function cal(extra: Partial<CalendarioPublico> = {}): CalendarioPublico {
  return {
    clube: { nome: "Lusitano GC", corPrimaria: "#0A7F3F", logoUrl: null },
    escalao: { nome: "Benjamins" },
    epoca: { nome: "2026/27" },
    proximos: [],
    realizados: [],
    ...extra,
  };
}

describe("separarLocal", () => {
  it("só URL de mapa → sem texto, com link", () => {
    expect(separarLocal(MAPS)).toEqual({ texto: null, mapaUrl: new URL(MAPS).href });
  });

  it("texto + URL → texto sem o URL e link ao lado", () => {
    expect(separarLocal(`Pavilhão X ${MAPS}`)).toEqual({
      texto: "Pavilhão X",
      mapaUrl: new URL(MAPS).href,
    });
    expect(separarLocal(`Pavilhão X - ${MAPS} (porta 2)`).texto).toBe("Pavilhão X - (porta 2)");
  });

  it("só texto mantém-se", () => {
    expect(separarLocal("Pavilhão Municipal de Évora")).toEqual({
      texto: "Pavilhão Municipal de Évora",
      mapaUrl: null,
    });
  });

  it("esquemas não http(s) (javascript:, data:) ficam como texto, nunca como link", () => {
    expect(separarLocal("javascript:alert(1)")).toEqual({
      texto: "javascript:alert(1)",
      mapaUrl: null,
    });
    expect(separarLocal("data:text/html,<b>x</b>").mapaUrl).toBeNull();
  });

  it("vazio/nulo → nada", () => {
    expect(separarLocal(null)).toEqual({ texto: null, mapaUrl: null });
    expect(separarLocal("   ")).toEqual({ texto: null, mapaUrl: null });
  });
});

describe("título e descrição da pré-visualização", () => {
  it("título com clube e escalão", () => {
    expect(tituloCalendarioPublico(cal())).toBe("Calendário de jogos — Lusitano GC · Benjamins");
  });

  it("descrição com o próximo jogo, sem URLs, e contagem da época", () => {
    const d = descricaoCalendarioPublico(
      cal({ proximos: [jogo({ local: MAPS })], realizados: [jogo()] }),
    );
    expect(d).not.toMatch(/https?:|google/);
    expect(d).toContain("Próximo jogo: Juventude Sport Clube vs Lusitano GC");
    expect(d).toContain("10:00");
    expect(d).toContain("2 jogos na época 2026/27");
  });

  it("descrição inclui o texto do local quando o local mistura texto e URL", () => {
    const d = descricaoCalendarioPublico(cal({ proximos: [jogo({ local: `Pavilhão X ${MAPS}` })] }));
    expect(d).toContain("· Pavilhão X.");
    expect(d).not.toContain("http");
    expect(d).toContain("1 jogo na época");
  });

  it("sem próximos / sem jogos", () => {
    expect(descricaoCalendarioPublico(cal({ realizados: [jogo(), jogo()] }))).toBe(
      "2 jogos na época 2026/27. Sem jogos por disputar.",
    );
    expect(descricaoCalendarioPublico(cal())).toBe("Sem jogos agendados nesta época.");
  });

  it("descrição truncada ao limite", () => {
    const d = descricaoCalendarioPublico(
      cal({ proximos: [jogo({ adversario: "X".repeat(400) })] }),
    );
    expect(d.length).toBeLessThanOrEqual(MAX_DESCRICAO);
    expect(d.endsWith("…")).toBe(true);
  });

  it("hora omitida em jogos às 00:00 (sem hora)", () => {
    expect(dataHoraCurta("2026-10-24T23:00:00.000Z")).not.toContain("·");
  });

  it("linhas da imagem: no máximo 3, sem URLs", () => {
    const linhas = linhasImagemCalendario(
      cal({ proximos: [1, 2, 3, 4].map(() => jogo({ local: MAPS })) }),
    );
    expect(linhas).toHaveLength(3);
    expect(JSON.stringify(linhas)).not.toMatch(/https?:/);
    expect(linhas[0].detalhe).toBe("Brancos · LIGA INTERDISTRITAL - BENJAMINS FUTSAL");
  });
});

describe("resolverUrlBase", () => {
  it("usa a URL pública configurada e força https", () => {
    expect(resolverUrlBase({ envUrl: "http://app.mister.pt/x" })?.href).toBe("https://app.mister.pt/");
  });
  it("sem env, usa o host do pedido", () => {
    expect(resolverUrlBase({ host: "mister.vercel.app", proto: "https" })?.href).toBe(
      "https://mister.vercel.app/",
    );
  });
  it("localhost mantém http; nada configurado → null", () => {
    expect(resolverUrlBase({ host: "localhost:3000", proto: "http" })?.href).toBe(
      "http://localhost:3000/",
    );
    expect(resolverUrlBase({})).toBeNull();
    expect(resolverUrlBase({ envUrl: "::nope" })).toBeNull();
  });
});

describe("imagem Open Graph", () => {
  it("cor inválida cai no laranja da marca", () => {
    expect(corAcento("red")).toBe("#F0531E");
    expect(corAcento("#0A7F3F")).toBe("#0A7F3F");
  });

  it("renderiza um PNG 1200×630 leve (< 300 KB), com cache curto", async () => {
    const res = renderizarImagemCalendario(
      cal({
        proximos: [
          jogo({ local: MAPS }),
          jogo({ casaFora: "CASA", adversario: "Sporting Clube de Évora", equipa: null }),
          jogo({ adversario: "CD Montemor", competicao: null, local: "Pavilhão Municipal" }),
        ],
      }),
    );
    expect(res.headers.get("cache-control")).toBe(CACHE_IMAGEM);
    const buf = Buffer.from(await res.arrayBuffer());
    // Assinatura PNG + dimensões no IHDR.
    expect(buf.subarray(1, 4).toString()).toBe("PNG");
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
    expect(buf.length).toBeLessThan(300 * 1024);
    console.info(`[og] tamanho da imagem: ${(buf.length / 1024).toFixed(1)} KB`);
  }, 30000);
});
