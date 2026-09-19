import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { listarModelosSessao } from "@/lib/actions/templatesSessao";
import { listarJogos } from "@/lib/actions/jogos";
import { obterClubeAtivo } from "@/lib/permissoes";
import { formatarDataCurta } from "@/lib/comunicacao-utils";
import { tituloConfronto } from "@/lib/jogo-confronto";
import {
  VitoriaRapida,
  type EscalaoOpcao,
  type ModeloOpcao,
  type JogoOpcao,
} from "@/components/onboarding/VitoriaRapida";

export const metadata: Metadata = { title: "Começar" };

/**
 * Percurso de vitória rápida (§8.1): entrega valor nos primeiros minutos —
 * plantel em massa → primeiro treino de template → primeira convocatória.
 */
export default async function VitoriaRapidaPage() {
  const [resEscaloes, resModelos, resJogos, clube] = await Promise.all([
    listarEscaloes(),
    listarModelosSessao(),
    listarJogos(),
    obterClubeAtivo(),
  ]);

  const escaloes: EscalaoOpcao[] = (resEscaloes.sucesso ? resEscaloes.dados : []).map((e) => ({
    id: e.id,
    nome: e.nome,
  }));

  const modelos: ModeloOpcao[] = (resModelos.sucesso ? resModelos.dados : []).map((m) => ({
    id: m.id,
    nome: m.nome,
  }));

  // Jogos futuros primeiro (o mais próximo no topo); se não houver, os restantes.
  const agora = Date.now();
  const todosJogos = resJogos.sucesso ? resJogos.dados : [];
  const futuros = todosJogos
    .filter((j) => new Date(j.data).getTime() >= agora)
    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  const base = futuros.length > 0 ? futuros : todosJogos;
  const jogos: JogoOpcao[] = base.map((j) => ({
    id: j.id,
    rotulo: `${formatarDataCurta(j.data)} · ${tituloConfronto(clube?.nome, j.adversario, j.casaFora)} (${j.escalao.nome})`,
  }));

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="flex w-fit items-center gap-1 text-corpo-sec text-cinza-600 transition-colors hover:text-cinza-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Painel
      </Link>

      <div>
        <h1>Vamos ganhar tempo</h1>
        <p className="mt-1 text-corpo-sec text-cinza-600">
          Três passos para pôr o clube a funcionar: monta o plantel, agenda o primeiro
          treino e gera a primeira convocatória.
        </p>
      </div>

      <VitoriaRapida escaloes={escaloes} modelos={modelos} jogos={jogos} />
    </div>
  );
}
