"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormatoJogo, type Modalidade } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditorCampo } from "@/components/campo/EditorCampo";
import { rotuloCampo } from "@/components/campo/desenho";
import {
  criarSituacaoJogo,
  atualizarSituacaoJogo,
  listarCategoriasSituacao,
} from "@/lib/actions/situacoesJogo";
import {
  situacaoJogoSchema,
  atualizarSituacaoJogoSchema,
} from "@/lib/schemas/situacaoJogo";
import {
  diagramaSchema,
  DIAGRAMA_VAZIO_V2,
  type DiagramaCampo,
} from "@/lib/schemas/exercicio";
import { erroDeValidacao } from "@/lib/utils";

const SEM_CATEGORIA = "__sem_categoria__";

/** Os 6 `FormatoJogo`, pela ordem do enum (RN-SJ-3). */
export const FORMATOS_CAMPO = Object.values(FormatoJogo);

/** Rótulo do campo (`rotuloCampo`) com maiúscula inicial — §24.6. */
export function rotuloCampoMaiuscula(formato: FormatoJogo): string {
  const r = rotuloCampo(formato);
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export type EscalaoSituacao = { id: string; nome: string; modalidade: Modalidade | null };
export type CategoriaOpcao = { id: string; nome: string };

/** Situação a editar (escalão só de leitura — imutável após criação). */
export type SituacaoParaEdicao = {
  id: string;
  nome: string;
  descricao: string | null;
  categoriaId: string | null;
  escalao: { id: string; nome: string };
  diagrama: unknown;
};

function lerDiagrama(raw: unknown): DiagramaCampo {
  const parsed = diagramaSchema.safeParse(raw);
  return parsed.success ? parsed.data : DIAGRAMA_VAZIO_V2;
}

/** RN-SJ-3: pré-seleciona FUTSAL_5 em escalões de futsal; futebol fica por escolher. */
function campoPorDefeito(escalao: EscalaoSituacao | undefined): FormatoJogo | undefined {
  return escalao?.modalidade === "FUTSAL" ? FormatoJogo.FUTSAL_5 : undefined;
}

export function SituacaoJogoForm({
  situacao,
  escaloes,
  escalaoInicialId,
  categoriasIniciais,
}: {
  situacao?: SituacaoParaEdicao;
  // Criação: escalões acessíveis (RN-SJ-2). Na edição não é usado.
  escaloes: EscalaoSituacao[];
  escalaoInicialId?: string | null;
  // Categorias do escalão inicial (criação) ou do escalão da situação (edição).
  categoriasIniciais: CategoriaOpcao[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [, startCategorias] = useTransition();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const [escalaoId, setEscalaoId] = useState<string>(
    situacao?.escalao.id ?? escalaoInicialId ?? "",
  );
  const [categorias, setCategorias] = useState<CategoriaOpcao[]>(categoriasIniciais);
  const [categoriaId, setCategoriaId] = useState<string>(
    situacao?.categoriaId ?? SEM_CATEGORIA,
  );
  const [diagrama, setDiagrama] = useState<DiagramaCampo>(() => {
    if (situacao) return lerDiagrama(situacao.diagrama);
    const campo = campoPorDefeito(escaloes.find((e) => e.id === escalaoInicialId));
    return campo ? { ...DIAGRAMA_VAZIO_V2, campo } : DIAGRAMA_VAZIO_V2;
  });
  // Ignora respostas de pedidos de categorias já ultrapassados.
  const pedidoCategorias = useRef(0);

  function alterarEscalao(id: string) {
    setEscalaoId(id);
    // Mudar de escalão na criação limpa a categoria (§24.6).
    setCategoriaId(SEM_CATEGORIA);
    setCategorias([]);
    if (diagrama.campo === undefined) {
      const campo = campoPorDefeito(escaloes.find((e) => e.id === id));
      if (campo) setDiagrama({ ...diagrama, campo });
    }
    const pedido = ++pedidoCategorias.current;
    startCategorias(async () => {
      const res = await listarCategoriasSituacao(id);
      if (pedido !== pedidoCategorias.current) return;
      if (res.sucesso) setCategorias(res.dados.map((c) => ({ id: c.id, nome: c.nome })));
      else toast.error(res.erro);
    });
  }

  function alterarCampo(campo: string) {
    // Muda só o fundo — os elementos ficam intactos (§24.6).
    setDiagrama({ ...diagrama, campo: campo as FormatoJogo });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErros({});
    setErroGeral(null);

    const comuns = {
      nome: String(fd.get("nome") ?? ""),
      categoriaId: categoriaId === SEM_CATEGORIA ? null : categoriaId,
      descricao: String(fd.get("descricao") ?? "").trim() || undefined,
      diagrama,
    };

    // Validação Zod no cliente com o mesmo schema do servidor (fonte única).
    const parsed = situacao
      ? atualizarSituacaoJogoSchema.safeParse(comuns)
      : situacaoJogoSchema.safeParse({ ...comuns, escalaoId });
    if (!parsed.success) {
      const resultado = erroDeValidacao(parsed.error);
      if (!resultado.sucesso) {
        setErroGeral(resultado.erro);
        setErros(resultado.camposInvalidos ?? {});
      }
      return;
    }

    startTransition(async () => {
      const res = situacao
        ? await atualizarSituacaoJogo(situacao.id, parsed.data)
        : await criarSituacaoJogo(parsed.data);
      if (res.sucesso) {
        toast.success(situacao ? "Situação guardada" : "Situação criada");
        router.push(`/modelo-jogo/situacoes/${res.dados.id}`);
        router.refresh();
      } else {
        setErroGeral(res.erro);
        if (res.camposInvalidos) setErros(res.camposInvalidos);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {erroGeral && !Object.keys(erros).length && (
        <p className="text-corpo-sec text-vermelho-600">{erroGeral}</p>
      )}

      <div className="grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="nome">Nome *</Label>
          <Input
            id="nome"
            name="nome"
            defaultValue={situacao?.nome ?? ""}
            required
            maxLength={100}
            placeholder="ex: Saída de jogo 1"
          />
          {erros.nome && <p className="text-legenda text-vermelho-600">{erros.nome}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="escalao">Escalão *</Label>
          {situacao ? (
            <Input id="escalao" value={situacao.escalao.nome} readOnly disabled />
          ) : (
            <Select value={escalaoId} onValueChange={alterarEscalao}>
              <SelectTrigger id="escalao" className="h-11">
                <SelectValue placeholder="Escolhe o escalão" />
              </SelectTrigger>
              <SelectContent>
                {escaloes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {erros.escalaoId && (
            <p className="text-legenda text-vermelho-600">{erros.escalaoId}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="categoria">Categoria</Label>
          <Select value={categoriaId} onValueChange={setCategoriaId} disabled={!escalaoId}>
            <SelectTrigger id="categoria" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_CATEGORIA}>Sem categoria</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {erros.categoriaId && (
            <p className="text-legenda text-vermelho-600">{erros.categoriaId}</p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="campo">Campo *</Label>
          <Select value={diagrama.campo ?? ""} onValueChange={alterarCampo}>
            <SelectTrigger id="campo" className="h-11">
              <SelectValue placeholder="Escolhe o campo" />
            </SelectTrigger>
            <SelectContent>
              {FORMATOS_CAMPO.map((f) => (
                <SelectItem key={f} value={f}>
                  {rotuloCampoMaiuscula(f)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {erros.diagrama && (
            <p className="text-legenda text-vermelho-600">{erros.diagrama}</p>
          )}
        </div>
      </div>

      <div className="max-w-lg space-y-1.5">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea
          id="descricao"
          name="descricao"
          rows={4}
          maxLength={2000}
          defaultValue={situacao?.descricao ?? ""}
        />
        {erros.descricao && (
          <p className="text-legenda text-vermelho-600">{erros.descricao}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Diagrama</Label>
        <EditorCampo
          valor={diagrama}
          onChange={setDiagrama}
          formato={diagrama.campo}
          permitirAdversario
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "A guardar…" : "Guardar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
