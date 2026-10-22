"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MiniaturaCampo } from "@/components/campo/MiniaturaCampo";
import {
  importarSituacaoParaJogo,
  listarCategoriasSituacao,
  listarSituacoesJogo,
  type SituacaoJogoResumo,
} from "@/lib/actions/situacoesJogo";
import { diagramaSchema } from "@/lib/schemas/exercicio";

const TODAS_CATEGORIAS = "__todas__";
// Atraso da pesquisa por nome (evita um pedido por tecla).
const ATRASO_PESQUISA_MS = 300;

/**
 * Importar uma situação da biblioteca para o jogo (§24.7, RN-SJ-5): filtros de
 * escalão (default = escalão do jogo), categoria e pesquisa via
 * `listarSituacoesJogo`; as já importadas aparecem desativadas.
 */
export function ImportarSituacaoDialog({
  jogoId,
  escalaoJogoId,
  escaloes,
  importadas,
}: {
  jogoId: string;
  escalaoJogoId: string;
  // Escalões acessíveis às situações (RN-SJ-2).
  escaloes: { id: string; nome: string }[];
  // `situacaoOrigemId` dos quadros de situação já existentes neste jogo.
  importadas: string[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [escalaoId, setEscalaoId] = useState(escalaoJogoId);
  const [categoriaId, setCategoriaId] = useState(TODAS_CATEGORIAS);
  const [q, setQ] = useState("");
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [situacoes, setSituacoes] = useState<SituacaoJogoResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [aCarregar, startCarregar] = useTransition();
  const [aImportar, startImportar] = useTransition();
  const pedido = useRef(0);

  // Categorias do escalão selecionado.
  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    listarCategoriasSituacao(escalaoId).then((res) => {
      if (!ativo) return;
      setCategorias(res.sucesso ? res.dados.map((c) => ({ id: c.id, nome: c.nome })) : []);
    });
    return () => {
      ativo = false;
    };
  }, [aberto, escalaoId]);

  // Situações com os filtros atuais (pesquisa com atraso).
  useEffect(() => {
    if (!aberto) return;
    const atual = ++pedido.current;
    const temporizador = setTimeout(() => {
      startCarregar(async () => {
        const res = await listarSituacoesJogo({
          escalaoId,
          categoriaId: categoriaId === TODAS_CATEGORIAS ? undefined : categoriaId,
          q: q.trim() || undefined,
        });
        if (atual !== pedido.current) return;
        if (res.sucesso) {
          setSituacoes(res.dados);
          setErro(null);
        } else {
          setSituacoes([]);
          setErro(res.erro);
        }
        setCarregado(true);
      });
    }, q ? ATRASO_PESQUISA_MS : 0);
    return () => clearTimeout(temporizador);
  }, [aberto, escalaoId, categoriaId, q]);

  function alterarEscalao(id: string) {
    setEscalaoId(id);
    setCategoriaId(TODAS_CATEGORIAS);
  }

  function importar(situacaoId: string) {
    startImportar(async () => {
      const res = await importarSituacaoParaJogo({ jogoId, situacaoId });
      if (res.sucesso) {
        toast.success("Situação importada");
        setAberto(false);
        router.refresh();
      } else toast.error(res.erro);
    });
  }

  const semFiltros = categoriaId === TODAS_CATEGORIAS && !q.trim();

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4" />
          Importar situação
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar situação</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="importar-escalao">Escalão</Label>
            <Select value={escalaoId} onValueChange={alterarEscalao}>
              <SelectTrigger id="importar-escalao" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {escaloes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="importar-categoria">Categoria</Label>
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger id="importar-categoria" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS_CATEGORIAS}>Todas as categorias</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="importar-pesquisa">Pesquisa</Label>
            <Input
              id="importar-pesquisa"
              type="search"
              value={q}
              maxLength={100}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nome da situação"
            />
          </div>
        </div>

        {erro ? (
          <p className="text-corpo-sec text-vermelho-600">{erro}</p>
        ) : !carregado || (aCarregar && situacoes.length === 0) ? (
          <p className="text-corpo-sec text-cinza-500">A carregar…</p>
        ) : situacoes.length === 0 ? (
          <p className="rounded-md border border-dashed border-cinza-300 p-4 text-center text-corpo-sec text-cinza-500">
            {semFiltros
              ? "Não há situações na biblioteca. Cria-as em Modelo de jogo → Situações de jogo."
              : "Nenhuma situação corresponde aos filtros."}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {situacoes.map((s) => {
              const jaImportada = importadas.includes(s.id);
              const diag = diagramaSchema.safeParse(s.diagrama);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => importar(s.id)}
                    disabled={jaImportada || aImportar}
                    className="flex min-h-11 w-full items-center gap-3 rounded-md border border-cinza-200 bg-white p-2 text-left transition-colors hover:bg-cinza-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {diag.success && (
                      <MiniaturaCampo
                        diagrama={diag.data}
                        formato={diag.data.campo}
                        largura={96}
                        className="shrink-0 rounded"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-corpo-sec font-medium text-cinza-900">
                        {s.nome}
                      </span>
                      {jaImportada && (
                        <span className="block text-legenda text-cinza-500">Já neste jogo</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
