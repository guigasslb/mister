import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import type { Modalidade } from "@prisma/client";
import {
  Plus,
  Home,
  Plane,
  ClipboardList,
  Trophy,
  Eye,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { listarJogos } from "@/lib/actions/jogos";
import { listarEscaloes } from "@/lib/actions/escaloes";
import { filtrarEscaloesLegiveis, obterMembroAtual } from "@/lib/permissoes";
import { obterSeccoes } from "@/lib/actions/seccoes";
import { mapaModalidadePorEscalao } from "@/lib/modalidade-escalao";
import { BadgeModalidade } from "@/components/plantel/BadgeModalidade";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";

function formatarData(data: Date): string {
  return new Date(data).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

/**
 * Hora do jogo em "HH:MM". Devolve null para jogos sem hora definida
 * (meia-noite, 00:00), típico de registos antigos — nesse caso não se mostra.
 */
function formatarHora(data: Date): string | null {
  const d = new Date(data);
  if (d.getHours() === 0 && d.getMinutes() === 0) return null;
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export const metadata: Metadata = { title: "Jogos" };

const CLS_TAB_BASE =
  "px-4 py-2.5 text-corpo font-medium border-b-2 transition-colors";
const CLS_TAB_ATIVO = "border-primary text-primary";
const CLS_TAB_INATIVO = "border-transparent text-cinza-600 hover:text-cinza-900";

const ROTULO_MODALIDADE: Record<Modalidade, string> = {
  FUTSAL: "Futsal",
  FUTEBOL: "Futebol",
};

/** Constrói uma query string a partir de pares definidos (ignora undefined). */
function href(params: {
  escalaoId?: string;
  modalidade?: Modalidade;
  estado?: "aberto" | "fechado";
}): string {
  const qs = new URLSearchParams();
  if (params.modalidade) qs.set("modalidade", params.modalidade);
  if (params.escalaoId) qs.set("escalaoId", params.escalaoId);
  if (params.estado) qs.set("estado", params.estado);
  const s = qs.toString();
  return s ? `/jogos?${s}` : "/jogos";
}

export default async function JogosPage({
  searchParams,
}: {
  searchParams: Promise<{ escalaoId?: string; modalidade?: string; estado?: string }>;
}) {
  const {
    escalaoId: escalaoIdRaw,
    modalidade: modalidadeRaw,
    estado: estadoRaw,
  } = await searchParams;

  // Query params não confiáveis: valida antes de usar.
  const escParse = z.string().cuid().safeParse(escalaoIdRaw);
  const escalaoId = escParse.success ? escParse.data : undefined;
  const modParse = z.enum(["FUTSAL", "FUTEBOL"]).safeParse(modalidadeRaw);
  const modalidade = modParse.success ? modParse.data : undefined;
  // Filtro por estado de fecho (§ estado aberto/fechado).
  const estado: "aberto" | "fechado" | undefined =
    estadoRaw === "aberto" || estadoRaw === "fechado" ? estadoRaw : undefined;

  const [resEscaloes, resSeccoes, resJogos, membro] = await Promise.all([
    listarEscaloes(),
    obterSeccoes(),
    listarJogos(escalaoId, modalidade, estado),
    obterMembroAtual(),
  ]);

  if (!resEscaloes.sucesso) return <EstadoErro mensagem={resEscaloes.erro} />;
  if (!resJogos.sucesso) return <EstadoErro mensagem={resJogos.erro} />;

  // Gating de capacidade (§6): só quem gere jogos vê as ações de criação.
  const podeGerirJogos = membro?.capacidades.includes("JOGOS_GERIR") ?? false;

  // Tabs de escalão/modalidade: só os escalões legíveis (§6.4/§6.5), alinhado com
  // o filtro server-side de `listarJogos` — um treinador nunca vê escalões alheios.
  const escaloes = await filtrarEscaloesLegiveis(resEscaloes.dados);
  const seccoes = resSeccoes.sucesso ? resSeccoes.dados : [];
  const jogos = resJogos.dados;

  // §3.2: modalidade por escalão + deteção de clube multi-secção (2+ secções).
  const modalidadePorEscalao = mapaModalidadePorEscalao(escaloes, seccoes);
  const seccoesPresentes = new Set(escaloes.map((e) => e.seccaoId ?? "__sem__"));
  const multiSeccao = seccoesPresentes.size >= 2;

  // Modalidades presentes no clube (para as tabs de filtro).
  const modalidadesPresentes: Modalidade[] = (["FUTSAL", "FUTEBOL"] as const).filter(
    (m) => [...modalidadePorEscalao.values()].includes(m),
  );

  // Escalões elegíveis para as tabs de escalão: filtrados pela modalidade ativa.
  const escaloesVisiveis = modalidade
    ? escaloes.filter((e) => modalidadePorEscalao.get(e.id) === modalidade)
    : escaloes;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Jogos</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href="/agenda?vista=lista&tipo=JOGO">
              <CalendarDays className="h-4 w-4" />
              Ver na Agenda
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/jogos/competicoes">
              <Trophy className="h-4 w-4" />
              Competições
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/jogos/scouting">
              <Eye className="h-4 w-4" />
              Scouting
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/modelo-jogo">
              <ClipboardList className="h-4 w-4" />
              Modelo de jogo
            </Link>
          </Button>
          {podeGerirJogos && (
            <Button asChild>
              <Link href="/jogos/novo">
                <Plus className="h-4 w-4" />
                Novo jogo
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filtro por modalidade (só quando o clube tem múltiplas secções) */}
      {multiSeccao && modalidadesPresentes.length >= 2 && (
        <div className="-mb-px flex flex-wrap border-b border-cinza-200">
          <Link
            href={href({ estado })}
            className={`${CLS_TAB_BASE} ${!modalidade ? CLS_TAB_ATIVO : CLS_TAB_INATIVO}`}
          >
            Todos
          </Link>
          {modalidadesPresentes.map((m) => (
            <Link
              key={m}
              href={href({ modalidade: m, estado })}
              className={`${CLS_TAB_BASE} ${modalidade === m ? CLS_TAB_ATIVO : CLS_TAB_INATIVO}`}
            >
              {ROTULO_MODALIDADE[m]}
            </Link>
          ))}
        </div>
      )}

      {escaloesVisiveis.length > 0 && (
        <div className="-mb-px flex flex-wrap border-b border-cinza-200">
          <Link
            href={href({ modalidade, estado })}
            className={`${CLS_TAB_BASE} ${!escalaoId ? CLS_TAB_ATIVO : CLS_TAB_INATIVO}`}
          >
            Todos
          </Link>
          {escaloesVisiveis.map((e) => (
            <Link
              key={e.id}
              href={href({ escalaoId: e.id, modalidade, estado })}
              className={`${CLS_TAB_BASE} ${escalaoId === e.id ? CLS_TAB_ATIVO : CLS_TAB_INATIVO}`}
            >
              {e.nome}
            </Link>
          ))}
        </div>
      )}

      {/* Filtro por estado de fecho (§ estado aberto/fechado) */}
      <div className="flex flex-wrap gap-1 rounded-md border border-cinza-200 p-1 w-fit">
        <Link
          href={href({ escalaoId, modalidade })}
          className={`rounded px-3 py-1.5 text-corpo-sec font-medium transition-colors ${
            !estado ? "bg-primary text-white" : "text-cinza-600 hover:bg-cinza-50"
          }`}
        >
          Todos
        </Link>
        <Link
          href={href({ escalaoId, modalidade, estado: "aberto" })}
          className={`rounded px-3 py-1.5 text-corpo-sec font-medium transition-colors ${
            estado === "aberto" ? "bg-primary text-white" : "text-cinza-600 hover:bg-cinza-50"
          }`}
        >
          Por fechar
        </Link>
        <Link
          href={href({ escalaoId, modalidade, estado: "fechado" })}
          className={`rounded px-3 py-1.5 text-corpo-sec font-medium transition-colors ${
            estado === "fechado" ? "bg-primary text-white" : "text-cinza-600 hover:bg-cinza-50"
          }`}
        >
          Fechados
        </Link>
      </div>

      {jogos.length === 0 ? (
        <EstadoVazio
          titulo="Sem jogos nesta época"
          descricao="Regista o primeiro jogo."
          acao={
            podeGerirJogos ? (
              <Button asChild>
                <Link href="/jogos/novo">
                  <Plus className="h-4 w-4" />
                  Registar jogo
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {jogos.map((j) => {
            const temResultado = j.golosMarcados != null && j.golosSofridos != null;
            // Jogo já realizado: data anterior ao momento atual. Só nesses faz
            // sentido o estado de fecho (por fechar / fechado).
            const passou = new Date(j.data).getTime() < Date.now();
            return (
              <li key={j.id}>
                <Link
                  href={`/jogos/${j.id}`}
                  className="flex items-center gap-4 rounded-lg border border-cinza-200 bg-white p-4 shadow-card transition-all hover:border-azul-300 hover:shadow-md"
                >
                  <div className="flex flex-col items-center">
                    {j.casaFora === "CASA" ? (
                      <Home className="h-5 w-5 text-cinza-400" />
                    ) : (
                      <Plane className="h-5 w-5 text-cinza-400" />
                    )}
                    <span className="text-legenda text-cinza-400 capitalize">
                      {formatarData(j.data)}
                    </span>
                    {formatarHora(j.data) && (
                      <span className="text-legenda font-medium text-cinza-500">
                        {formatarHora(j.data)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-corpo font-semibold text-cinza-900">
                        vs {j.adversario}
                      </p>
                      {/* Badge de modalidade só quando o clube é multi-secção */}
                      {multiSeccao && <BadgeModalidade modalidade={j.modalidade} compacto />}
                      {/* Estado de fecho (só em jogos já realizados) */}
                      {passou &&
                        (j.fechado ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-verde-600/30 bg-verde-600/10 px-2 py-0.5 text-legenda font-medium text-verde-600">
                            <CheckCircle2 className="h-3 w-3" />
                            Fechado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-ambar-500/30 bg-ambar-500/10 px-2 py-0.5 text-legenda font-medium text-ambar-600">
                            <CircleAlert className="h-3 w-3" />
                            Por fechar
                          </span>
                        ))}
                    </div>
                    <p className="text-legenda text-cinza-500">
                      {j.escalao.nome}
                      {j.competicao ? ` · ${j.competicao}` : ""}
                    </p>
                    {j.criador && (
                      <p className="mt-0.5 text-[10px] text-cinza-400">
                        Criado por {j.criador.nome}
                      </p>
                    )}
                  </div>
                  {temResultado && (
                    <div className="text-titulo-seccao font-bold text-cinza-900">
                      {j.golosMarcados}–{j.golosSofridos}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
