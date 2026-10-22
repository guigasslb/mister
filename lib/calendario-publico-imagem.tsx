import { ImageResponse } from "next/og";
import type { CalendarioPublico } from "@/lib/calendario-publico";
import { linhasImagemCalendario } from "@/lib/calendario-publico-partilha";

/**
 * Imagem Open Graph (1200×630 PNG) do calendário público (bíblia §8.11.1).
 * Mesma linguagem visual dos cards sociais (`app/api/social/card/route.tsx`):
 * fundo tinta, faixa e acentos na cor do clube, rodapé com a marca Mister.
 * Sem logótipo remoto (não se faz fetch de URLs externos ao gerar a imagem):
 * emblema = inicial do clube na cor do clube. Só usa o DTO público.
 */

export const TAMANHO_IMAGEM = { width: 1200, height: 630 } as const;

const TINTA = "#141210";
const TINTA_SUAVE = "#26221E";
const CLARO = "#F4F1EC";
const MUTED = "#A8A29A";
const LARANJA_MARCA = "#F0531E";

/** Cor do clube validada (hex) — senão o laranja da marca. */
export function corAcento(cor: string): string {
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(cor.trim()) ? cor.trim() : LARANJA_MARCA;
}

/** Texto (branco ou tinta) legível sobre a cor de acento (luminância). */
function textoSobre(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  return l > 0.4 ? TINTA : "#FFFFFF";
}

/** Cabeçalho do cache: curto, para que revogar o link tenha efeito rápido. */
export const CACHE_IMAGEM = "public, max-age=300, s-maxage=300";

export function renderizarImagemCalendario(cal: CalendarioPublico): ImageResponse {
  const accent = corAcento(cal.clube.corPrimaria);
  const linhas = linhasImagemCalendario(cal);
  const inicial = cal.clube.nome.trim().charAt(0).toUpperCase() || "M";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: TAMANHO_IMAGEM.width,
          height: TAMANHO_IMAGEM.height,
          padding: "56px 64px 44px",
          backgroundColor: TINTA,
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: TAMANHO_IMAGEM.width,
            height: 14,
            backgroundColor: accent,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 104,
              height: 104,
              borderRadius: 22,
              backgroundColor: accent,
              color: textoSobre(accent),
              fontSize: 56,
              fontWeight: 800,
            }}
          >
            {inicial}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, letterSpacing: 2, textTransform: "uppercase", color: accent }}>
              Calendário de jogos
            </div>
            <div style={{ display: "flex", fontSize: 48, fontWeight: 800, color: CLARO }}>
              {cal.clube.nome}
            </div>
            <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
              {cal.escalao.nome}
              {cal.epoca ? ` · Época ${cal.epoca.nome}` : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {linhas.length === 0 ? (
            <div style={{ display: "flex", fontSize: 34, color: MUTED }}>
              Sem jogos por disputar nesta época.
            </div>
          ) : (
            linhas.map((l, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  padding: "14px 22px",
                  borderRadius: 16,
                  backgroundColor: TINTA_SUAVE,
                  borderLeft: `6px solid ${accent}`,
                }}
              >
                <div style={{ display: "flex", width: 250, fontSize: 26, color: CLARO }}>{l.quando}</div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: CLARO }}>
                    {l.confronto}
                  </div>
                  {l.detalhe && (
                    <div style={{ display: "flex", fontSize: 22, color: MUTED }}>{l.detalhe}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: LARANJA_MARCA,
              color: "#FFFFFF",
              fontSize: 24,
              fontWeight: 800,
            }}
          >
            M
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: MUTED }}>Mister</div>
        </div>
      </div>
    ),
    {
      ...TAMANHO_IMAGEM,
      headers: { "Cache-Control": CACHE_IMAGEM },
    },
  );
}
