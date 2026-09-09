import type { Metadata } from "next";
import { Calendar, Info } from "lucide-react";
import { obterIntegracaoCalendario } from "@/lib/actions/integracao";
import { googleCalendarConfigurado } from "@/lib/google-calendar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EstadoErro } from "@/components/layout/EstadosUI";
import { LigarCalendarioButton } from "@/components/integracoes/LigarCalendarioButton";
import { DesligarCalendarioButton } from "@/components/integracoes/DesligarCalendarioButton";
import { NotificacaoCalendario } from "@/components/integracoes/NotificacaoCalendario";
import { formatarDataHoraLisboa } from "@/lib/utils-datas";

export const metadata: Metadata = { title: "Definições · Integrações" };

type PageProps = {
  searchParams: Promise<{ sucesso?: string; erro?: string }>;
};

function formatarData(data: Date): string {
  return formatarDataHoraLisboa(data, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function IntegracaoPage({ searchParams }: PageProps) {
  const { sucesso, erro } = await searchParams;

  const resultado = await obterIntegracaoCalendario();
  if (!resultado.sucesso) return <EstadoErro mensagem={resultado.erro} />;

  const configurado = googleCalendarConfigurado();
  const integracao = resultado.dados;
  const ligado = Boolean(integracao?.ativa);

  return (
    <div className="space-y-6">
      <NotificacaoCalendario sucesso={sucesso} erro={erro} />

      <h1>Integrações</h1>

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-primary/5">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Google Calendar</CardTitle>
                {ligado && (
                  <Badge className="bg-verde-600 text-white hover:bg-verde-600">
                    Ligado
                  </Badge>
                )}
              </div>
              <CardDescription>
                Sincroniza treinos e jogos com o teu Google Calendar
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!configurado ? (
            <div className="flex items-start gap-3 rounded-md border border-ambar-600/30 bg-ambar-600/10 p-4">
              <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-ambar-600" />
              <p className="text-corpo-sec text-cinza-700">
                Esta integração requer configuração do servidor. Contacta o
                administrador.
              </p>
            </div>
          ) : ligado ? (
            <>
              {integracao && (
                <p className="text-corpo-sec text-cinza-600">
                  Ligado desde {formatarData(integracao.criadoEm)}.
                </p>
              )}
              <DesligarCalendarioButton />
            </>
          ) : (
            <LigarCalendarioButton />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
