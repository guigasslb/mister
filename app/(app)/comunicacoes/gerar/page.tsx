import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EstadoErro } from "@/components/layout/EstadosUI";
import {
  GeradorComunicacao,
  type JogoOpcao,
  type ModeloCliente,
} from "@/components/comunicacoes/GeradorComunicacao";
import { listarModelosComunicacao } from "@/lib/actions/comunicacao";
import { listarJogos } from "@/lib/actions/jogos";
import { obterMembroAtual, obterUtilizadorAtual } from "@/lib/permissoes";
import { formatarDataCurta } from "@/lib/comunicacao-utils";
import { tituloConfronto } from "@/lib/jogo-confronto";
import {
  TIPOS_COMUNICACAO,
  type TipoComunicacaoValor,
} from "@/lib/schemas/comunicacao";

/** Valida o tipo vindo do query string (sem alargar o union). */
function tipoValido(valor: string | undefined): TipoComunicacaoValor | undefined {
  return TIPOS_COMUNICACAO.find((t) => t === valor?.toUpperCase());
}

export const metadata: Metadata = { title: "Gerar comunicação" };

export default async function GerarComunicacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; jogo?: string }>;
}) {
  const { tipo: tipoParam, jogo: jogoParam } = await searchParams;

  const membro = await obterMembroAtual();
  if (!membro?.capacidades.includes("COMUNICACOES_GERIR")) {
    return <EstadoErro mensagem="Não tens permissão para gerar comunicações." />;
  }

  const [resModelos, resJogos, utilizador] = await Promise.all([
    listarModelosComunicacao(),
    listarJogos(),
    obterUtilizadorAtual(),
  ]);
  if (!resModelos.sucesso) return <EstadoErro mensagem={resModelos.erro} />;

  const modelos: ModeloCliente[] = resModelos.dados.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    nome: m.nome,
    template: m.template,
    doClube: m.clubeId !== null,
  }));

  const jogos: JogoOpcao[] = (resJogos.sucesso ? resJogos.dados : []).map((j) => ({
    id: j.id,
    rotulo: `${formatarDataCurta(j.data)} · ${tituloConfronto(membro?.clube.nome, j.adversario, j.casaFora)} (${j.escalao.nome})`,
  }));

  return (
    <div className="space-y-6">
      <Link
        href="/comunicacoes"
        className="flex w-fit items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Comunicações
      </Link>

      <div>
        <h1>Gerar mensagem</h1>
        <p className="mt-1 text-corpo-sec text-cinza-600">
          A app não envia mensagens — gera o texto para copiares ou partilhares no
          WhatsApp.
        </p>
      </div>

      <GeradorComunicacao
        modelos={modelos}
        jogos={jogos}
        valoresBase={{
          nomeEquipa: membro.clube.nome,
          nomeTreinador: utilizador?.nome ?? "",
        }}
        tipoInicial={tipoValido(tipoParam) ?? "CONVOCATORIA"}
        jogoInicial={jogoParam ?? ""}
      />
    </div>
  );
}
