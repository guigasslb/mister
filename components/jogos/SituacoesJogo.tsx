"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Copy, Pencil, Trash2 } from "lucide-react";
import type { FormatoJogo } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditorCampo } from "@/components/campo/EditorCampo";
import { DiagramaReproduzivel } from "@/components/campo/DiagramaReproduzivel";
import { ImportarSituacaoDialog } from "@/components/jogos/ImportarSituacaoDialog";
import { rotuloCampoMaiuscula } from "@/components/modelo-jogo/SituacaoJogoForm";
import {
  atualizarQuadroSituacao,
  duplicarQuadroSituacao,
  guardarQuadroComoNovaSituacao,
} from "@/lib/actions/situacoesJogo";
import { apagarQuadroTatico } from "@/lib/actions/modeloJogo";
import { DIAGRAMA_VAZIO_V2, type DiagramaCampo } from "@/lib/schemas/exercicio";

const SEM_CATEGORIA = "__sem_categoria__";
const MSG_NOME_REPETIDO = "Já existe um quadro com este nome neste jogo.";

/** Quadro de situação do jogo (diagrama inválido → null, cartão sem diagrama). */
export type QuadroSituacaoJogo = {
  id: string;
  nome: string;
  notas: string | null;
  diagrama: DiagramaCampo | null;
  situacaoOrigemId: string | null;
};

/** Dados das situações no jogo calculados no Server Component (§24.7). */
export type DadosSituacoesJogo = {
  quadros: QuadroSituacaoJogo[];
  // RN-SJ-12: `exigirCapacidade("MODELO_JOGO_GERIR", jogo.escalaoId).ok`.
  podeGerir: boolean;
  escalaoId: string;
  escalaoNome: string;
  // Só preenchidos com `podeGerir`.
  escaloesAcessiveis: { id: string; nome: string }[];
  categoriasEscalaoJogo: { id: string; nome: string }[];
};

/** RN-SJ-13: comparação após `trim`, sem distinção de maiúsculas. */
function nomeNormalizado(nome: string): string {
  return nome.trim().toLowerCase();
}

function CartaoSituacao({
  quadro,
  formato,
  outrosNomes,
  dados,
}: {
  quadro: QuadroSituacaoJogo;
  formato: FormatoJogo | null;
  // Nomes (normalizados) dos outros quadros de situação do jogo.
  outrosNomes: string[];
  dados: DadosSituacoesJogo;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editar, setEditar] = useState(false);
  const [nome, setNome] = useState(quadro.nome);
  const [notas, setNotas] = useState(quadro.notas ?? "");
  const [diagrama, setDiagrama] = useState<DiagramaCampo>(
    quadro.diagrama ?? DIAGRAMA_VAZIO_V2,
  );
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);

  const [novaAberta, setNovaAberta] = useState(false);
  const [nomeNova, setNomeNova] = useState("");
  const [categoriaNova, setCategoriaNova] = useState(SEM_CATEGORIA);
  const [erroNova, setErroNova] = useState<string | null>(null);

  const [duplicarAberto, setDuplicarAberto] = useState(false);
  const [nomeVariante, setNomeVariante] = useState("");
  const [erroVariante, setErroVariante] = useState<string | null>(null);

  // Formato diferente (§24.7): desenha sempre o campo da situação.
  const campo = quadro.diagrama?.campo;
  const campoDiferente = campo !== undefined && formato !== null && campo !== formato;

  function abrirEditor() {
    // Estado ao abrir — «Cancelar» repõe-no.
    setNome(quadro.nome);
    setNotas(quadro.notas ?? "");
    setDiagrama(quadro.diagrama ?? DIAGRAMA_VAZIO_V2);
    setErroEdicao(null);
    setEditar(true);
  }

  function guardarNesteJogo() {
    setErroEdicao(null);
    if (outrosNomes.includes(nomeNormalizado(nome))) {
      setErroEdicao(MSG_NOME_REPETIDO);
      return;
    }
    startTransition(async () => {
      const res = await atualizarQuadroSituacao(quadro.id, {
        nome,
        notas: notas.trim() || undefined,
        diagrama,
      });
      if (res.sucesso) {
        toast.success("Guardado neste jogo");
        setEditar(false);
        router.refresh();
      } else setErroEdicao(res.camposInvalidos?.nome ?? res.erro);
    });
  }

  function abrirGuardarComoNova() {
    setNomeNova(nome);
    setCategoriaNova(SEM_CATEGORIA);
    setErroNova(null);
    setNovaAberta(true);
  }

  function guardarComoNova(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErroNova(null);
    if (outrosNomes.includes(nomeNormalizado(nomeNova))) {
      setErroNova(MSG_NOME_REPETIDO);
      return;
    }
    startTransition(async () => {
      const res = await guardarQuadroComoNovaSituacao(quadro.id, {
        nome: nomeNova,
        notas: notas.trim() || undefined,
        diagrama,
        categoriaId: categoriaNova === SEM_CATEGORIA ? null : categoriaNova,
      });
      if (res.sucesso) {
        toast.success(`Nova situação guardada na biblioteca de ${dados.escalaoNome}`);
        setNovaAberta(false);
        setEditar(false);
        router.refresh();
      } else setErroNova(res.camposInvalidos?.nome ?? res.erro);
    });
  }

  function abrirDuplicar() {
    setNomeVariante(`${quadro.nome} (variante)`);
    setErroVariante(null);
    setDuplicarAberto(true);
  }

  function duplicar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErroVariante(null);
    const normalizado = nomeNormalizado(nomeVariante);
    if (normalizado === nomeNormalizado(quadro.nome) || outrosNomes.includes(normalizado)) {
      setErroVariante(MSG_NOME_REPETIDO);
      return;
    }
    startTransition(async () => {
      const res = await duplicarQuadroSituacao(quadro.id, { nome: nomeVariante });
      if (res.sucesso) {
        toast.success("Variante criada neste jogo");
        setDuplicarAberto(false);
        router.refresh();
      } else setErroVariante(res.camposInvalidos?.nome ?? res.erro);
    });
  }

  function remover() {
    startTransition(async () => {
      const res = await apagarQuadroTatico(quadro.id);
      if (res.sucesso) {
        toast.success("Situação removida deste jogo");
        router.refresh();
      } else toast.error(res.erro);
    });
  }

  const badgeBiblioteca = quadro.situacaoOrigemId && (
    <Link
      href={`/modelo-jogo/situacoes/${quadro.situacaoOrigemId}`}
      className="inline-flex min-h-11 items-center"
    >
      <Badge variant="outline" className="gap-1 hover:bg-cinza-50">
        <BookOpen className="h-3 w-3" />
        Da biblioteca
      </Badge>
    </Link>
  );

  if (editar) {
    return (
      <li className="space-y-4 rounded-lg border border-cinza-200 bg-white p-4 shadow-card">
        <div className="grid max-w-lg grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`situacao-nome-${quadro.id}`}>Nome *</Label>
            <Input
              id={`situacao-nome-${quadro.id}`}
              value={nome}
              maxLength={100}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`situacao-notas-${quadro.id}`}>Notas</Label>
            <Textarea
              id={`situacao-notas-${quadro.id}`}
              value={notas}
              rows={3}
              maxLength={2000}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
        </div>
        <EditorCampo
          valor={diagrama}
          onChange={setDiagrama}
          formato={formato ?? undefined}
          permitirAdversario
        />
        {erroEdicao && <p className="text-corpo-sec text-vermelho-600">{erroEdicao}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={guardarNesteJogo} disabled={pending}>
            {pending ? "A guardar…" : "Só neste jogo"}
          </Button>
          <Button variant="outline" onClick={abrirGuardarComoNova} disabled={pending}>
            Guardar como nova situação
          </Button>
          <Button variant="ghost" onClick={() => setEditar(false)} disabled={pending}>
            Cancelar
          </Button>
        </div>

        <Dialog open={novaAberta} onOpenChange={setNovaAberta}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Guardar como nova situação</DialogTitle>
            </DialogHeader>
            <form onSubmit={guardarComoNova} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={`nova-nome-${quadro.id}`}>Nome *</Label>
                <Input
                  id={`nova-nome-${quadro.id}`}
                  value={nomeNova}
                  required
                  maxLength={100}
                  onChange={(e) => setNomeNova(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`nova-categoria-${quadro.id}`}>Categoria</Label>
                <Select value={categoriaNova} onValueChange={setCategoriaNova}>
                  <SelectTrigger id={`nova-categoria-${quadro.id}`} className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_CATEGORIA}>Sem categoria</SelectItem>
                    {dados.categoriasEscalaoJogo.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {erroNova && <p className="text-corpo-sec text-vermelho-600">{erroNova}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNovaAberta(false)}
                  disabled={pending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "A guardar…" : "Guardar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </li>
    );
  }

  return (
    <li className="space-y-3 rounded-lg border border-cinza-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-corpo font-semibold text-cinza-900">{quadro.nome}</p>
        {badgeBiblioteca}
      </div>

      {quadro.diagrama && (
        <div className="max-w-2xl">
          <DiagramaReproduzivel
            diagrama={quadro.diagrama}
            formato={quadro.diagrama.campo ?? formato ?? undefined}
          />
        </div>
      )}
      {campoDiferente && campo && (
        <p className="text-legenda text-cinza-500">
          Campo da situação: {rotuloCampoMaiuscula(campo)} (diferente do formato do jogo).
        </p>
      )}
      {quadro.notas && (
        <p className="text-corpo-sec text-cinza-700 whitespace-pre-wrap">{quadro.notas}</p>
      )}

      {dados.podeGerir && !quadro.diagrama && (
        <p className="text-legenda text-ambar-600">
          Diagrama inválido — não é possível editar.
        </p>
      )}
      {dados.podeGerir && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={abrirEditor}
            disabled={pending || !quadro.diagrama}
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          <Button variant="outline" size="sm" onClick={abrirDuplicar} disabled={pending}>
            <Copy className="h-4 w-4" />
            Duplicar
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-vermelho-600 hover:text-vermelho-600 hover:bg-vermelho-600/10"
                disabled={pending}
              >
                <Trash2 className="h-4 w-4" />
                Remover do jogo
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover «{quadro.nome}» deste jogo?</AlertDialogTitle>
                <AlertDialogDescription>
                  A situação na biblioteca não é afetada.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={remover}
                  className="bg-vermelho-600 hover:bg-vermelho-600/90 text-white"
                >
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      <Dialog open={duplicarAberto} onOpenChange={setDuplicarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar «{quadro.nome}»</DialogTitle>
          </DialogHeader>
          <form onSubmit={duplicar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`variante-nome-${quadro.id}`}>Nome *</Label>
              <Input
                id={`variante-nome-${quadro.id}`}
                value={nomeVariante}
                required
                maxLength={100}
                onChange={(e) => setNomeVariante(e.target.value)}
              />
            </div>
            {erroVariante && (
              <p className="text-corpo-sec text-vermelho-600">{erroVariante}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDuplicarAberto(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "A duplicar…" : "Duplicar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/**
 * Secção «Situações de jogo» do sub-separador *Plano de jogo* (bíblia §24.7):
 * cópias da biblioteca em quadros do jogo, abaixo do quadro «Plano de jogo»
 * (que não muda). Leitura para quem lê o jogo; gestão só com `podeGerir`.
 */
export function SituacoesJogo({
  jogoId,
  formato,
  dados,
}: {
  jogoId: string;
  formato: FormatoJogo | null;
  dados: DadosSituacoesJogo;
}) {
  const { quadros, podeGerir } = dados;
  const importadas = quadros
    .map((q) => q.situacaoOrigemId)
    .filter((id): id is string => id !== null);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-subtitulo text-cinza-900">Situações de jogo</h2>
        {podeGerir && (
          <ImportarSituacaoDialog
            jogoId={jogoId}
            escalaoJogoId={dados.escalaoId}
            escaloes={dados.escaloesAcessiveis}
            importadas={importadas}
          />
        )}
      </div>

      {quadros.length === 0 ? (
        <div className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
          <p>Sem situações neste jogo.</p>
          {podeGerir && <p>Importa situações da biblioteca do Modelo de jogo.</p>}
        </div>
      ) : (
        <ul className="space-y-3">
          {quadros.map((q) => (
            <CartaoSituacao
              key={q.id}
              quadro={q}
              formato={formato}
              outrosNomes={quadros
                .filter((o) => o.id !== q.id)
                .map((o) => nomeNormalizado(o.nome))}
              dados={dados}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
