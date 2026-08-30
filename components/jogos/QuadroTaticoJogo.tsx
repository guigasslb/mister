"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorCampo } from "@/components/campo/EditorCampo";
import { CampoDesenho } from "@/components/campo/CampoDesenho";
import { criarQuadroTatico, atualizarQuadroTatico } from "@/lib/actions/modeloJogo";
import { NOME_QUADRO_PLANO_JOGO } from "@/lib/schemas/modeloJogo";
import { DIAGRAMA_VAZIO_V2, type DiagramaCampo } from "@/lib/schemas/exercicio";
import type { FormatoJogo } from "@prisma/client";

/**
 * Quadro tático interativo do separador "Plano de jogo" (§8.10 / §11.3).
 *
 * Reutiliza o {@link EditorCampo} para transformar a formação prevista num quadro
 * tático editável: arrastar os tokens dos titulares, desenhar setas (jogadas) e
 * adicionar tokens genéricos do adversário. O estado é persistido como JSON no
 * `QuadroTatico.diagrama` (um único quadro-plano por jogo, identificado por
 * `NOME_QUADRO_PLANO_JOGO`), via as Server Actions de quadros táticos.
 *
 * Seed / reposição: enquanto não houver quadro gravado, o campo arranca da
 * `diagramaFormacao` derivada dos titulares posicionados; depois de gravado, é
 * independente (o botão "Repor formação" volta a semeá-lo com a formação atual).
 */
export function QuadroTaticoJogo({
  jogoId,
  formato,
  quadroInicial,
  diagramaFormacao,
  podeGerir,
}: {
  jogoId: string;
  formato: FormatoJogo | null;
  quadroInicial: { id: string; diagrama: DiagramaCampo | null } | null;
  diagramaFormacao: DiagramaCampo;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editar, setEditar] = useState(false);
  const [quadroId, setQuadroId] = useState<string | null>(quadroInicial?.id ?? null);

  // Diagrama GRAVADO do quadro (independente da formação). `null` enquanto não
  // houver quadro gravado — nesse caso o campo segue a formação VIVA dos
  // titulares (§8.10). Depois de gravado, mostra o quadro guardado.
  const [gravado, setGravado] = useState<DiagramaCampo | null>(
    quadroInicial?.diagrama ?? null,
  );

  // Base visível = quadro gravado (se existir) OU a formação viva. `diagramaFormacao`
  // é um prop recomputado a cada render, por isso ao marcar/posicionar titulares o
  // campo atualiza-se de imediato (correção da regressão em que os titulares não
  // apareciam por defeito no quadro).
  const baseVisivel = gravado ?? diagramaFormacao;

  // Buffer de edição do EditorCampo — (re)inicializado ao abrir o editor.
  const [diagrama, setDiagrama] = useState<DiagramaCampo>(baseVisivel);

  // Snapshot do estado visível capturado no momento em que o editor abre, para
  // que "Cancelar" reponha exatamente esse estado (e não a formação viva atual).
  const snapshotAoAbrirRef = useRef<DiagramaCampo | null>(null);

  // Enquanto o editor está aberto e o utilizador ainda NÃO editou (o buffer
  // continua igual ao snapshot capturado ao abrir), o editor acompanha a
  // formação viva: se `baseVisivel` mudar (ex.: marcar titulares com o editor
  // já aberto), sincroniza o buffer para não ficar congelado no snapshot vazio.
  // Assim que o utilizador começa a editar, deixa de sincronizar (mantém o
  // controlo). `diagrama` e `snapshotAoAbrirRef.current` ficam fora das deps de
  // propósito, para o effect reagir apenas a `baseVisivel`/`editar` e não criar
  // um loop de atualização.
  useEffect(() => {
    if (!editar) return;
    const bufferInalterado =
      JSON.stringify(diagrama) === JSON.stringify(snapshotAoAbrirRef.current);
    if (bufferInalterado) {
      setDiagrama(baseVisivel);
      snapshotAoAbrirRef.current = baseVisivel;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseVisivel, editar]);

  const temElementos = baseVisivel.elementos.length > 0;

  // Abre o editor partindo sempre do estado visível ATUAL (quadro gravado ou
  // formação viva), para não editar a partir de um snapshot obsoleto.
  function abrirEditor() {
    snapshotAoAbrirRef.current = baseVisivel;
    setDiagrama(baseVisivel);
    setEditar(true);
  }

  function guardar() {
    startTransition(async () => {
      const res = quadroId
        ? await atualizarQuadroTatico(quadroId, {
            nome: NOME_QUADRO_PLANO_JOGO,
            tipo: "GERAL",
            diagrama,
          })
        : await criarQuadroTatico({
            jogoId,
            nome: NOME_QUADRO_PLANO_JOGO,
            tipo: "GERAL",
            diagrama,
          });
      if (res.sucesso) {
        if (!quadroId) setQuadroId(res.dados.id);
        setGravado(diagrama);
        setEditar(false);
        toast.success("Quadro tático guardado");
        router.refresh();
      } else {
        toast.error(res.erro);
      }
    });
  }

  function reporFormacao() {
    setDiagrama(diagramaFormacao);
    toast.info("Formação reposta a partir dos titulares");
  }

  function cancelar() {
    setDiagrama(snapshotAoAbrirRef.current ?? baseVisivel);
    setEditar(false);
  }

  // Leitura (sem permissão de gerir o quadro tático — §8.10 MODELO_JOGO_GERIR).
  if (!podeGerir) {
    return temElementos ? (
      <div className="mx-auto max-w-xl">
        <CampoDesenho diagrama={baseVisivel} formato={formato ?? undefined} />
      </div>
    ) : (
      <p className="text-corpo-sec text-cinza-500">
        Marca os titulares e atribui-lhes posição para veres a formação.
      </p>
    );
  }

  if (editar) {
    return (
      <div className="space-y-4">
        <EditorCampo
          valor={diagrama}
          onChange={setDiagrama}
          formato={formato ?? undefined}
          permitirAdversario
        />
        <div className="flex flex-wrap gap-3">
          <Button onClick={guardar} disabled={pending}>
            <Check className="h-4 w-4" />
            {pending ? "A guardar…" : "Guardar quadro"}
          </Button>
          <Button variant="outline" onClick={reporFormacao} disabled={pending}>
            <RotateCcw className="h-4 w-4" />
            Repor formação
          </Button>
          <Button variant="ghost" onClick={cancelar} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {temElementos ? (
        <div className="mx-auto max-w-xl">
          <CampoDesenho diagrama={baseVisivel} formato={formato ?? undefined} />
        </div>
      ) : (
        <p className="text-corpo-sec text-cinza-500">
          Sem quadro tático. Parte da formação dos titulares e ajusta as posições,
          adiciona adversários e desenha jogadas.
        </p>
      )}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={abrirEditor}>
          {temElementos ? (
            <>
              <Pencil className="h-4 w-4" />
              Editar quadro tático
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Criar quadro tático
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
