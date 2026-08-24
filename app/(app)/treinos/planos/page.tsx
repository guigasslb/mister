import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Plus, CalendarRange, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listarPlanosSemanais, type PlanoSemanalLista } from "@/lib/actions/planoSemanal";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";
import { EditarPlanoDialog } from "@/components/treinos/EditarPlanoDialog";
import { ApagarPlanoDialog } from "@/components/treinos/ApagarPlanoDialog";

export const metadata: Metadata = { title: "Planos semanais" };

/** Nomes curtos dos dias na ordem ISO (1=segunda … 7=domingo). */
const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

/** "Ter 18:00–19:30 · Qui 18:00–19:30" a partir dos dias do plano. */
function resumoDias(dias: PlanoSemanalLista["dias"]): string {
  return dias
    .map((d) => `${DIAS_CURTOS[d.diaSemana - 1] ?? "?"} ${d.horaInicio}–${d.horaFim}`)
    .join(" · ");
}

export default async function PlanosSemanaisPage() {
  const res = await listarPlanosSemanais();
  if (!res.sucesso) return <EstadoErro mensagem={res.erro} />;

  const planos = res.dados;

  // Agrupar por escalão (mantém a ordem de chegada — mais recentes primeiro).
  const grupos = new Map<string, { nome: string; planos: PlanoSemanalLista[] }>();
  for (const p of planos) {
    let g = grupos.get(p.escalao.id);
    if (!g) {
      g = { nome: p.escalao.nome, planos: [] };
      grupos.set(p.escalao.id, g);
    }
    g.planos.push(p);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/treinos"
          className="flex items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Treinos
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Planos semanais</h1>
          <p className="mt-1 text-corpo-sec text-cinza-600">
            Distribui os treinos da semana por dias e objetivos.
          </p>
        </div>
        <Button asChild>
          <Link href="/treinos/novo?modo=plano">
            <Plus className="h-4 w-4" />
            Novo plano
          </Link>
        </Button>
      </div>

      {planos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum plano semanal criado"
          descricao="Cria o primeiro em Treinos > Novo treino, no separador «Plano semanal»."
          acao={
            <Button asChild>
              <Link href="/treinos/novo?modo=plano">
                <CalendarRange className="h-4 w-4" />
                Criar plano semanal
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {[...grupos.values()].map((grupo) => (
            <section key={grupo.nome} className="space-y-3">
              <h2 className="text-titulo-seccao text-cinza-900">{grupo.nome}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {grupo.planos.map((p) => (
                  <Card key={p.id}>
                    <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                      <CardTitle className="text-corpo">{p.nome ?? p.escalao.nome}</CardTitle>
                      <Badge variant={p.ativo ? "default" : "secondary"}>
                        {p.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-corpo-sec text-cinza-700">
                        {p.dias.length > 0 ? resumoDias(p.dias) : "Sem dias configurados"}
                      </p>
                      <p className="flex items-center gap-1.5 text-legenda text-cinza-500">
                        <CalendarClock className="h-4 w-4" />
                        {p._count.sessoes} sessão(ões) gerada(s)
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <EditarPlanoDialog
                          planoId={p.id}
                          nomeInicial={p.nome}
                          ativoInicial={p.ativo}
                          diasExistentes={p.dias.map((d) => ({
                            diaSemana: d.diaSemana,
                            horaInicio: d.horaInicio,
                            horaFim: d.horaFim,
                            local: d.local,
                            tipoSessao: d.tipoSessao,
                          }))}
                        />
                        <ApagarPlanoDialog planoId={p.id} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
