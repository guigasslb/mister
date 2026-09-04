"use client";

import { useRef, useState } from "react";

// Série 1 = cor do clube (herda de --cor-primaria); série 2 = âmbar (contraste).
const C_S1 = "var(--cor-primaria, #F0531E)";
const C_S1_DARK = "color-mix(in srgb, var(--cor-primaria, #F0531E) 80%, #000)";
const C_S2 = "#E0900A";       // ambar-500 — série 2 (assistências)
const C_SURFACE = "#ffffff";  // card surface for dot rings
const C_GRID = "#E4E1DB";     // cinza-200 quente hairline
const C_AXIS = "#E4E1DB";
const C_TEXTO_MUTED = "#98938D";

const ML = 32;   // margin left (y-axis labels)
const MR = 12;   // margin right
const MT = 16;   // margin top
const MB = 40;   // margin bottom (x-axis labels)
const W = 400;
const H = 210;
const PW = W - ML - MR;  // plot width
const PH = H - MT - MB;  // plot height

export interface PontoLinha {
  label: string;  // x-axis label (e.g. "vs Porto" or "Jan")
  valor1: number;
  valor2?: number;
}

interface GraficoLinhasProps {
  pontos: PontoLinha[];
  serie1: string;
  serie2?: string;
  titulo?: string;
  unidade?: string;
  /** Valor de referência (ex.: média da época) desenhado como linha horizontal dashed. */
  mediaReferencia?: number;
}

function formatarLabel(s: string): string {
  return s.length > 8 ? s.slice(0, 7) + "…" : s;
}

export function GraficoLinhas({
  pontos,
  serie1,
  serie2,
  titulo,
  unidade = "",
  mediaReferencia,
}: GraficoLinhasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovIdx, setHovIdx] = useState<number | null>(null);

  if (pontos.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-cinza-200 p-4 text-center text-corpo-sec text-cinza-400">
        Sem dados para visualizar.
      </p>
    );
  }

  const temS2 = serie2 !== undefined && pontos.some((p) => p.valor2 !== undefined);
  const allV1 = pontos.map((p) => p.valor1);
  const allV2 = temS2 ? pontos.map((p) => p.valor2 ?? 0) : [];
  const maxVal = Math.max(...allV1, ...allV2, 1);

  // Compute nice y-axis ticks: 0, max/2 (rounded), max (rounded up)
  const yMax = Math.ceil(maxVal / 1) * 1;
  const yMid = Math.round(yMax / 2);
  const yTicks = yMax <= 2 ? [0, 1, 2].filter((t) => t <= yMax) : [0, yMid, yMax];

  function xOf(i: number): number {
    if (pontos.length === 1) return ML + PW / 2;
    return ML + (i / (pontos.length - 1)) * PW;
  }
  function yOf(v: number): number {
    return MT + PH - (v / yMax) * PH;
  }

  // Build SVG path string for a series
  function buildPath(values: number[]): string {
    return values
      .map((v, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`)
      .join(" ");
  }

  // Build area path (line + back along baseline)
  function buildArea(values: number[]): string {
    const linePath = buildPath(values);
    const lastX = xOf(values.length - 1).toFixed(1);
    const firstX = xOf(0).toFixed(1);
    const baseY = yOf(0).toFixed(1);
    return `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }

  // Hover: find nearest x when mouse moves over the SVG
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = W / rect.width;
    const mouseX = (e.clientX - rect.left) * scale;
    // Find nearest point
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < pontos.length; i++) {
      const d = Math.abs(xOf(i) - mouseX);
      if (d < minDist) { minDist = d; nearest = i; }
    }
    setHovIdx(nearest);
  }

  const hasLegend = temS2;

  return (
    <div className="w-full select-none">
      {titulo && (
        <p className="mb-1 text-legenda font-medium uppercase tracking-wide text-cinza-400">
          {titulo}
        </p>
      )}

      {/* Legend for ≥2 series */}
      {hasLegend && (
        <div className="mb-2 flex gap-4">
          <span className="flex items-center gap-1.5 text-legenda text-cinza-600">
            <span className="inline-block h-2 w-6 rounded-sm" style={{ background: C_S1 }} />
            {serie1}
          </span>
          <span className="flex items-center gap-1.5 text-legenda text-cinza-600">
            <span className="inline-block h-2 w-6 rounded-sm" style={{ background: C_S2 }} />
            {serie2}
          </span>
        </div>
      )}

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={titulo ?? "Gráfico de linhas"}
          style={{ display: "block" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHovIdx(null)}
        >
          {/* Horizontal hairline grid + y-axis labels */}
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={ML} y1={yOf(t)}
                x2={ML + PW} y2={yOf(t)}
                stroke={C_GRID}
                strokeWidth={1}
              />
              <text
                x={ML - 6}
                y={yOf(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill={C_TEXTO_MUTED}
                fontFamily="system-ui, sans-serif"

              >
                {t}
              </text>
            </g>
          ))}

          {/* Baseline axis */}
          <line
            x1={ML} y1={yOf(0)}
            x2={ML + PW} y2={yOf(0)}
            stroke={C_AXIS}
            strokeWidth={1}
          />

          {/* Linha de referência (média) — dashed, opcional */}
          {mediaReferencia != null && mediaReferencia > 0 && mediaReferencia <= yMax && (
            <>
              <line
                x1={ML} y1={yOf(mediaReferencia)}
                x2={ML + PW} y2={yOf(mediaReferencia)}
                stroke={C_TEXTO_MUTED}
                strokeWidth={1}
                strokeDasharray="4 3"
                pointerEvents="none"
              />
              <text
                x={ML + PW}
                y={yOf(mediaReferencia) - 3}
                textAnchor="end"
                fontSize={9}
                fill={C_TEXTO_MUTED}
                fontFamily="system-ui, sans-serif"
                pointerEvents="none"
              >
                média {mediaReferencia.toFixed(1)}
              </text>
            </>
          )}

          {/* Area fills (~10% opacity) */}
          {temS2 && (
            <path
              d={buildArea(pontos.map((p) => p.valor2 ?? 0))}
              fill={C_S2}
              fillOpacity={0.08}
            />
          )}
          <path
            d={buildArea(pontos.map((p) => p.valor1))}
            fill={C_S1}
            fillOpacity={0.08}
          />

          {/* Lines — 2px, round join/cap */}
          {temS2 && (
            <path
              d={buildPath(pontos.map((p) => p.valor2 ?? 0))}
              fill="none"
              stroke={C_S2}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          <path
            d={buildPath(pontos.map((p) => p.valor1))}
            fill="none"
            stroke={C_S1}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Dots with surface ring — ≥8px diameter (r=5) */}
          {pontos.map((p, i) => {
            const x = xOf(i);
            const isHov = hovIdx === i;
            return (
              <g key={i}>
                {temS2 && (
                  <>
                    {/* 2px surface ring */}
                    <circle cx={x} cy={yOf(p.valor2 ?? 0)} r={7} fill={C_SURFACE} />
                    <circle cx={x} cy={yOf(p.valor2 ?? 0)} r={5} fill={isHov ? "#b87200" : C_S2} />
                  </>
                )}
                {/* 2px surface ring */}
                <circle cx={x} cy={yOf(p.valor1)} r={7} fill={C_SURFACE} />
                <circle cx={x} cy={yOf(p.valor1)} r={5} fill={isHov ? C_S1_DARK : C_S1} />
              </g>
            );
          })}

          {/* Crosshair on hover */}
          {hovIdx !== null && (
            <line
              x1={xOf(hovIdx)} y1={MT}
              x2={xOf(hovIdx)} y2={yOf(0)}
              stroke={C_GRID}
              strokeWidth={1}
              strokeDasharray="none"
              pointerEvents="none"
            />
          )}

          {/* X-axis labels */}
          {pontos.map((p, i) => {
            // Show all labels if ≤7 points; else every other
            const showLabel = pontos.length <= 7 || i % Math.ceil(pontos.length / 7) === 0 || i === pontos.length - 1;
            if (!showLabel) return null;
            return (
              <text
                key={i}
                x={xOf(i)}
                y={H - MB + 14}
                textAnchor="middle"
                fontSize={10}
                fill={hovIdx === i ? C_S1 : C_TEXTO_MUTED}
                fontFamily="system-ui, sans-serif"
              >
                {formatarLabel(p.label)}
              </text>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hovIdx !== null && (() => {
          const p = pontos[hovIdx];
          const svgEl = svgRef.current;
          if (!svgEl) return null;
          const rect = svgEl.getBoundingClientRect();
          const scale = rect.width / W;
          const tooltipX = xOf(hovIdx) * scale;
          const onRight = tooltipX < rect.width / 2;
          return (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-max rounded-md border border-cinza-200 bg-white px-3 py-2 shadow-card text-legenda"
              style={{
                left: onRight ? tooltipX + 10 : undefined,
                right: onRight ? undefined : rect.width - tooltipX + 10,
                top: MT * scale + 4,
              }}
            >
              <p className="font-medium text-cinza-900">{p.label}</p>
              <p className="text-cinza-600">
                <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: C_S1 }} />
                {serie1}: <span className="font-semibold text-cinza-900">{p.valor1}{unidade}</span>
              </p>
              {temS2 && p.valor2 !== undefined && (
                <p className="text-cinza-600">
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: C_S2 }} />
                  {serie2}: <span className="font-semibold text-cinza-900">{p.valor2}{unidade}</span>
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Accessible table view */}
      <table className="sr-only">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th>Jogo</th>
            <th>{serie1}</th>
            {temS2 && <th>{serie2}</th>}
          </tr>
        </thead>
        <tbody>
          {pontos.map((p, i) => (
            <tr key={i}>
              <td>{p.label}</td>
              <td>{p.valor1}</td>
              {temS2 && <td>{p.valor2 ?? 0}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
