import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { listarAtletas } from "@/lib/actions/atletas";
import { listarMetricas } from "@/lib/actions/metricas";
import { obterMembroAtual } from "@/lib/permissoes";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";
import { SessaoExternaGRForm } from "@/components/treinos/SessaoExternaGRForm";

export const metadata: Metadata = { title: "Sessão externa de GR" };

/**
 * §8.24.6 — Registo de sessão externa de guarda-redes. Server Component:
 * verifica a permissão TREINOS_GERIR, reúne os escalões geríveis com GRs no
 * plantel e as métricas técnicas de GR, e entrega tudo ao formulário cliente.
 */
export default async function NovaSessaoExternaGRPage() {
  const [membro, resEscaloes, resMetricas] = await Promise.all([
    obterMembroAtual(),
    listarEscaloes(),
    listarMetricas(true, "TREINO"),
  ]);

  // Gate de UI (o servidor revalida por escalão em `criarSessaoExternaGR`).
  if (!membro || !membro.capacidades.includes("TREINOS_GERIR")) {
    return (
      <EstadoErro mensagem="Não tens permissão para registar sessões de treino." />
    );
  }
  if (!resEscaloes.sucesso) return <EstadoErro mensagem={resEscaloes.erro} />;

  // Escalões onde o membro pode gerir treinos (âmbito do perfil — §6.4/§6.9).
  const geriveis =
    membro.ambito === "TODO_CLUBE"
      ? resEscaloes.dados
      : resEscaloes.dados.filter((e) => membro.escaloesAtribuidos.includes(e.id));

  // Guarda-redes (posição GR) por escalão gerível.
  const entradas = await Promise.all(
    geriveis.map(async (e) => {
      const r = await listarAtletas(e.id);
      const grs = r.sucesso
        ? r.dados
            .filter((a) => a.posicoes.includes("GUARDA_REDES"))
            .map((a) => ({
              id: a.id,
              nome: a.nome,
              numero: a.participacaoContexto?.numero ?? null,
            }))
        : [];
      return [e.id, grs] as const;
    }),
  );
  const atletasPorEscalao = Object.fromEntries(entradas);
  const escaloesComGR = geriveis
    .filter((e) => (atletasPorEscalao[e.id]?.length ?? 0) > 0)
    .map((e) => ({ id: e.id, nome: e.nome }));

  const metricas = resMetricas.sucesso
    ? resMetricas.dados
        .filter((m) => m.aplicaSoGuardaRedes)
        .map((m) => ({ id: m.id, nome: m.nome, tipo: m.tipo }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/treinos"
          className="flex items-center gap-1 text-corpo-sec text-cinza-600 transition-colors hover:text-cinza-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Treinos
        </Link>
      </div>

      <div>
        <h1>Registar sessão externa de GR</h1>
        <p className="mt-1 text-corpo-sec text-cinza-600">
          Sessão de guarda-redes realizada fora da app (estágio, clínica, outro
          treinador). Fica no histórico de desenvolvimento do atleta e não conta
          para assiduidade nem carga semanal.
        </p>
      </div>

      {escaloesComGR.length === 0 ? (
        <EstadoVazio
          titulo="Sem escalões com guarda-redes"
          descricao="Adiciona guarda-redes ao plantel de um escalão para registares sessões externas de GR."
        />
      ) : (
        <SessaoExternaGRForm
          escaloes={escaloesComGR}
          atletasPorEscalao={atletasPorEscalao}
          metricas={metricas}
        />
      )}
    </div>
  );
}
