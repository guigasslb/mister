"use client";

import { useState, useTransition } from "react";
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

  // Base = quadro gravado (se existir) ou a formação derivada dos titulares.
  const base = quadroInicial?.diagrama ?? diagramaFormacao;
  const [gravado, setGravado] = useState<DiagramaCampo>(base);
  const [diagrama, setDiagrama] = useState<DiagramaCampo>(base);

  const temElementos = gravado.elementos.length > 0;

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
    setDiagrama(gravado);
    setEditar(false);
  }

  // Leitura (sem permissão de gerir o quadro tático — §8.10 MODELO_JOGO_GERIR).
  if (!podeGerir) {
    return temElementos ? (
      <div className="mx-auto max-w-xl">
        <CampoDesenho diagrama={gravado} formato={formato ?? undefined} />
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
          <CampoDesenho diagrama={gravado} formato={formato ?? undefined} />
        </div>
      ) : (
        <p className="text-corpo-sec text-cinza-500">
          Sem quadro tático. Parte da formação dos titulares e ajusta as posições,
          adiciona adversários e desenha jogadas.
        </p>
      )}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setEditar(true)}>
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
