import type { Metadata } from "next";
import Link from "next/link";
import { Wallet, ArrowRight } from "lucide-react";
import { obterLicenca } from "@/lib/actions/licenciamento";
import { obterMembroAtual } from "@/lib/permissoes";
import {
  LABEL_CICLO,
  LABEL_ESTADO_LICENCA,
  LABEL_TIER,
  LABEL_TIPO_LICENCA,
  formatarEuros,
} from "@/lib/schemas/licenciamento";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";
import { formatarDataHoraLisboa } from "@/lib/utils-datas";
import type { EstadoLicenca } from "@prisma/client";

export const metadata: Metadata = { title: "Definições · Licença" };

/** Classe da badge por estado da licença (§F11). */
const ESTILO_ESTADO: Record<EstadoLicenca, string> = {
  ATIVA: "bg-verde-600 text-white",
  EXPIRADA: "bg-vermelho-600 text-white",
  CANCELADA: "bg-cinza-200 text-cinza-600",
  SUSPENSA: "bg-ambar-600 text-white",
  PENDENTE: "bg-ambar-600 text-white",
};

function Detalhe({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-corpo-sec text-cinza-600">{rotulo}</dt>
      <dd className="text-corpo font-semibold text-cinza-900">{valor}</dd>
    </div>
  );
}

function formatarData(data: Date): string {
  return formatarDataHoraLisboa(data, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function LicencaPage() {
  const resultado = await obterLicenca();
  if (!resultado.sucesso) return <EstadoErro mensagem={resultado.erro} />;

  const ctx = await obterMembroAtual();
  const eAdmin =
    ctx?.capacidades.includes("CLUBE_UTILIZADORES") &&
    ctx?.capacidades.includes("CLUBE_PERFIS");

  const licenca = resultado.dados;

  return (
    <div className="space-y-6">
      <div>
        <h1>Licença</h1>
        <p className="mt-1 text-corpo-sec text-cinza-600">
          Estado da subscrição e carteira de crédito do clube.
        </p>
      </div>

      {!licenca ? (
        <EstadoVazio
          titulo="Sem licença ativa"
          descricao={
            eAdmin
              ? "Este clube ainda não tem uma licença ativa. A ativação é feita pela equipa da plataforma após confirmação do pagamento."
              : "Este clube ainda não tem uma licença ativa. Contacte um administrador."
          }
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="space-y-1.5">
                <CardTitle>
                  {LABEL_TIPO_LICENCA[licenca.tipo]}
                  {licenca.tipo === "CLUBE" && licenca.tier
                    ? ` · ${LABEL_TIER[licenca.tier]}`
                    : ""}
                </CardTitle>
                <CardDescription>Detalhes da subscrição atual.</CardDescription>
              </div>
              <Badge className={ESTILO_ESTADO[licenca.estado]}>
                {LABEL_ESTADO_LICENCA[licenca.estado]}
              </Badge>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-cinza-200">
                <Detalhe rotulo="Ciclo" valor={LABEL_CICLO[licenca.ciclo]} />
                {licenca.precoCentimos != null && (
                  <Detalhe rotulo="Preço" valor={formatarEuros(licenca.precoCentimos)} />
                )}
                <Detalhe rotulo="Início" valor={formatarData(licenca.dataInicio)} />
                {licenca.dataRenovacao && (
                  <Detalhe rotulo="Renovação" valor={formatarData(licenca.dataRenovacao)} />
                )}
                {licenca.dataFim && (
                  <Detalhe rotulo="Fim" valor={formatarData(licenca.dataFim)} />
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Carteira
              </CardTitle>
              <CardDescription>
                Crédito disponível para compras futuras.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-titulo-seccao font-bold text-cinza-900">
                {formatarEuros(licenca.carteira?.saldoCentimos ?? 0)}
              </p>
              <Link
                href="/definicoes/licenca/movimentos"
                className="inline-flex min-h-[44px] items-center gap-1.5 text-corpo font-semibold text-primary hover:underline"
              >
                Ver histórico de movimentos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>

          <p className="text-corpo-sec text-cinza-600">
            Upgrade disponível em breve.
          </p>
        </div>
      )}
    </div>
  );
}
