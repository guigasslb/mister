"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, CalendarCheck, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SeletorDiasPlano,
  diasIniciais,
  diasParaPayload,
  type DiaConfig,
} from "@/components/treinos/SeletorDiasPlano";
import {
  preverPlanoSemanal,
  criarPlanoSemanal,
  type PrevisaoPlano,
} from "@/lib/actions/planoSemanal";
import { criarPlanoSemanalSchema } from "@/lib/schemas/planoSemanal";
import type { Escalao } from "@prisma/client";

type EscalaoBasico = Pick<Escalao, "id" | "nome">;

/** YYYY-MM-DD de hoje (local), para default da data de início. */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** "2025-09-17" → "17/09". */
function formatarDiaMes(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

export function PlanoSemanalForm({
  escaloes,
  escalaoIdInicial,
}: {
  escaloes: EscalaoBasico[];
  escalaoIdInicial?: string;
}) {
  const router = useRouter();
  const [pendentePrever, iniciarPrever] = useTransition();
  const [pendenteCriar, iniciarCriar] = useTransition();

  const [escalaoId, setEscalaoId] = useState<string>(escalaoIdInicial ?? "");
  const [nome, setNome] = useState<string>("");
  const [dataInicioGeracao, setDataInicioGeracao] = useState<string>(hojeISO());
  const [dias, setDias] = useState<DiaConfig[]>(diasIniciais);

  const [previsao, setPrevisao] = useState<PrevisaoPlano | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  /** Qualquer alteração ao plano invalida a pré-visualização anterior. */
  function invalidarPrevisao() {
    if (previsao) setPrevisao(null);
  }

  function montarDados() {
    return {
      escalaoId: escalaoId || undefined,
      nome: nome.trim() || undefined,
      dataInicioGeracao,
      dias: diasParaPayload(dias),
    };
  }

  /** Valida no cliente com o mesmo schema do servidor (fonte única). */
  function validar(): boolean {
    const parsed = criarPlanoSemanalSchema.safeParse(montarDados());
    if (parsed.success) {
      setErros({});
      return true;
    }
    const campos: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const chave = issue.path[0];
      if (typeof chave === "string" && !campos[chave]) campos[chave] = issue.message;
    }
    setErros(campos);
    return false;
  }

  function handlePrever() {
    setErroGeral(null);
    if (!validar()) return;
    iniciarPrever(async () => {
      const res = await preverPlanoSemanal(montarDados());
      if (res.sucesso) {
        setPrevisao(res.dados);
      } else {
        setPrevisao(null);
        setErroGeral(res.erro);
        if (res.camposInvalidos) setErros(res.camposInvalidos);
      }
    });
  }

  function handleCriar() {
    setErroGeral(null);
    if (!validar()) return;
    iniciarCriar(async () => {
      const res = await criarPlanoSemanal(montarDados());
      if (res.sucesso) {
        const { geradas, ignoradas } = res.dados;
        toast.success(
          `${geradas} treino(s) criado(s)` +
            (ignoradas > 0 ? ` · ${ignoradas} dia(s) já ocupado(s) ignorado(s)` : ""),
        );
        router.push("/treinos/planos");
        router.refresh();
      } else {
        setErroGeral(res.erro);
        if (res.camposInvalidos) setErros(res.camposInvalidos);
      }
    });
  }

  const ocupado = pendentePrever || pendenteCriar;

  return (
    <div className="max-w-lg space-y-5">
      {erroGeral && (
        <p role="alert" className="text-corpo-sec text-vermelho-600">
          {erroGeral}
        </p>
      )}

      {/* Escalão */}
      <div className="space-y-1.5">
        <Label>Escalão *</Label>
        <Select
          value={escalaoId}
          onValueChange={(v) => {
            setEscalaoId(v);
            invalidarPrevisao();
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleciona um escalão" />
          </SelectTrigger>
          <SelectContent>
            {escaloes.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {erros.escalaoId && <p className="text-legenda text-vermelho-600">{erros.escalaoId}</p>}
      </div>

      {/* Nome do plano */}
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome do horário</Label>
        <Input
          id="nome"
          value={nome}
          maxLength={100}
          placeholder="ex: Plantel A — 2025/26"
          onChange={(e) => setNome(e.target.value)}
        />
        <p className="text-legenda text-cinza-500">Opcional. Se vazio, usa o nome do escalão.</p>
        {erros.nome && <p className="text-legenda text-vermelho-600">{erros.nome}</p>}
      </div>

      {/* Data de início de geração */}
      <div className="space-y-1.5">
        <Label htmlFor="dataInicioGeracao">Início de geração *</Label>
        <Input
          id="dataInicioGeracao"
          type="date"
          value={dataInicioGeracao}
          onChange={(e) => {
            setDataInicioGeracao(e.target.value);
            invalidarPrevisao();
          }}
        />
        <p className="text-legenda text-cinza-500">
          Gera os treinos desta data até ao fim da época. Nunca gera no passado.
        </p>
        {erros.dataInicioGeracao && (
          <p className="text-legenda text-vermelho-600">{erros.dataInicioGeracao}</p>
        )}
      </div>

      {/* Dias da semana */}
      <SeletorDiasPlano
        valor={dias}
        onChange={(d) => {
          setDias(d);
          invalidarPrevisao();
        }}
        desativado={ocupado}
        erro={erros.dias}
      />

      {/* Pré-visualização */}
      <div className="space-y-3 rounded-md border border-cinza-200 bg-cinza-50/60 p-4">
        <Button
          type="button"
          variant="outline"
          onClick={handlePrever}
          disabled={ocupado}
          className="w-full sm:w-auto"
        >
          {pendentePrever ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          Pré-visualizar
        </Button>

        {previsao && (
          <div className="space-y-1.5 text-corpo-sec">
            <p className="text-cinza-900">
              Vais gerar{" "}
              <span className="font-semibold text-primary">{previsao.geradas} treino(s)</span> entre{" "}
              {formatarDiaMes(previsao.dataInicio)} e {formatarDiaMes(previsao.dataFim)}.
            </p>
            {previsao.ignoradas > 0 && (
              <p className="flex items-center gap-1.5 text-ambar-600">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {previsao.ignoradas} dia(s) já têm treino e serão ignorados.
              </p>
            )}
            {previsao.geradas === 0 && (
              <p className="text-cinza-500">
                Nenhum treino novo a gerar com esta configuração.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex flex-wrap gap-3 pt-1">
        <Button
          type="button"
          onClick={handleCriar}
          disabled={ocupado || !previsao || previsao.geradas === 0}
        >
          {pendenteCriar ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarCheck className="h-4 w-4" />
          )}
          Criar horário
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={ocupado}
          onClick={() => router.push("/treinos")}
        >
          Cancelar
        </Button>
      </div>
      {!previsao && (
        <p className="text-legenda text-cinza-500">
          Pré-visualiza o horário antes de o criar.
        </p>
      )}
    </div>
  );
}
