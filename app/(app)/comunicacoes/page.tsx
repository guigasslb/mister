import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquarePlus, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoErro, EstadoVazio } from "@/components/layout/EstadosUI";
import { InstalarModelosButton } from "@/components/comunicacoes/InstalarModelosButton";
import { listarModelosComunicacao } from "@/lib/actions/comunicacao";
import { obterMembroAtual } from "@/lib/permissoes";
import { primeirasLinhas } from "@/lib/comunicacao-cliente";
import {
  LABEL_TIPO_COMUNICACAO,
  TIPOS_COMUNICACAO,
} from "@/lib/schemas/comunicacao";

export const metadata: Metadata = { title: "Comunicações" };

export default async function ComunicacoesPage() {
  // Perfis sem a capacidade de gerir comunicações (ex.: Presidente/visualização,
  // que só tem RELATORIOS_VER) não têm acesso a esta área. Em vez de rebentar com
  // um erro ("Algo correu mal"), mostramos um estado tratado e amigável.
  const membro = await obterMembroAtual();
  if (!membro?.capacidades.includes("COMUNICACOES_GERIR")) {
    return (
      <EstadoVazio
        titulo="Sem acesso"
        descricao="Não tens permissões para aceder às comunicações. Fala com o administrador do clube se precisares deste acesso."
      />
    );
  }

  const res = await listarModelosComunicacao();
  if (!res.sucesso) return <EstadoErro mensagem={res.erro} />;

  const modelos = res.dados;
  const temModelosDoClube = modelos.some((m) => m.clubeId !== null);

  // Um cartão por tipo: variante do clube com fallback para o modelo global.
  const cartoes = TIPOS_COMUNICACAO.map((tipo) => {
    const doClube = modelos.find((m) => m.tipo === tipo && m.clubeId !== null);
    const global = modelos.find((m) => m.tipo === tipo && m.clubeId === null);
    return { tipo, modelo: doClube ?? global, doClube: doClube !== undefined };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Comunicações</h1>
          <p className="mt-1 max-w-2xl text-corpo-sec text-cinza-600">
            A app não é um canal de comunicação: gera o texto formatado a partir destes
            templates para partilhares no grupo de WhatsApp do escalão.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!temModelosDoClube && <InstalarModelosButton />}
          <Button asChild>
            <Link href="/comunicacoes/gerar">
              <MessageSquarePlus className="h-4 w-4" />
              Gerar mensagem
            </Link>
          </Button>
        </div>
      </div>

      {modelos.length === 0 ? (
        <p className="rounded-md border border-dashed border-cinza-300 p-6 text-center text-corpo-sec text-cinza-500">
          Ainda não há templates de comunicação. Instala os templates base para começar.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {cartoes.map(({ tipo, modelo, doClube }) => (
            <div
              key={tipo}
              className="flex flex-col gap-3 rounded-md border border-cinza-200 bg-white p-4 shadow-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-corpo font-semibold text-cinza-900">
                    {LABEL_TIPO_COMUNICACAO[tipo]}
                  </p>
                  {modelo && (
                    <p className="text-legenda text-cinza-500">{modelo.nome}</p>
                  )}
                </div>
                <span
                  className={
                    doClube
                      ? "rounded-full bg-primary/10 px-2.5 py-0.5 text-legenda font-medium text-primary"
                      : "rounded-full bg-cinza-50 px-2.5 py-0.5 text-legenda font-medium text-cinza-600"
                  }
                >
                  {doClube ? "Do clube" : "Global"}
                </span>
              </div>

              {modelo ? (
                <pre className="flex-1 whitespace-pre-wrap break-words rounded-md bg-cinza-50 p-3 font-sans text-corpo-sec text-cinza-700">
                  {primeirasLinhas(modelo.template)}
                </pre>
              ) : (
                <p className="flex-1 text-corpo-sec text-cinza-500">
                  Sem template para este tipo.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/comunicacoes/gerar?tipo=${tipo}`}>
                    <Sparkles className="h-4 w-4" />
                    Gerar
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/comunicacoes/${tipo.toLowerCase()}/editar`}>
                    <Pencil className="h-4 w-4" />
                    {doClube ? "Editar" : "Personalizar"}
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
