"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PARTES_TREINO, LABEL_PARTE_TREINO } from "@/lib/schemas/exercicio";
import {
  CATEGORIAS_PRINCIPAIS,
  LABEL_CATEGORIA_PRINCIPAL,
} from "@/lib/schemas/subcategoria";
import type { CategoriaExercicioPrincipal } from "@prisma/client";

const TODOS = "__todos__";

/** Subcategoria customizável do clube, para o filtro da biblioteca. */
type SubcategoriaFiltro = {
  id: string;
  nome: string;
  categoria: CategoriaExercicioPrincipal;
};

/**
 * Filtros da biblioteca de exercícios (parte do treino + categoria principal +
 * subcategoria). Escrevem na URL — a página é um Server Component e refaz a query
 * no servidor (`listarExercicios`). A subcategoria é restrita à categoria
 * selecionada; mudar a categoria repõe a subcategoria para evitar combinações
 * sem resultados.
 */
export function FiltrosBiblioteca({
  parteTreino,
  categoria,
  subcategoria,
  subcategorias,
}: {
  parteTreino?: string;
  categoria?: string;
  subcategoria?: string;
  subcategorias: SubcategoriaFiltro[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Subcategorias oferecidas: restritas à categoria selecionada (quando há uma);
  // sem categoria, mostram-se todas (cada subcategoria é única por clube).
  const subcategoriasDisponiveis = (
    categoria ? subcategorias.filter((s) => s.categoria === categoria) : subcategorias
  )
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));

  // A subcategoria só é válida se existir na lista disponível (pode ter deixado de
  // o ser após uma mudança de categoria com um parâmetro de URL preservado).
  const subcategoriaValida =
    subcategoria && subcategoriasDisponiveis.some((s) => s.id === subcategoria)
      ? subcategoria
      : TODOS;

  function definir(chave: "parte" | "categoria" | "subcategoria", valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor === TODOS) params.delete(chave);
    else params.set(chave, valor);
    // Mudar a categoria pode invalidar a subcategoria escolhida (passa a pertencer
    // a outra categoria) — repõe-se para não gerar um filtro combinado sem resultados.
    if (chave === "categoria") params.delete("subcategoria");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="filtro-parte">Parte do treino</Label>
        <Select
          value={parteTreino ?? TODOS}
          onValueChange={(v) => definir("parte", v)}
          disabled={pending}
        >
          <SelectTrigger id="filtro-parte" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as partes</SelectItem>
            {PARTES_TREINO.map((p) => (
              <SelectItem key={p} value={p}>
                {LABEL_PARTE_TREINO[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filtro-categoria">Categoria</Label>
        <Select
          value={categoria ?? TODOS}
          onValueChange={(v) => definir("categoria", v)}
          disabled={pending}
        >
          <SelectTrigger id="filtro-categoria" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as categorias</SelectItem>
            {CATEGORIAS_PRINCIPAIS.map((c) => (
              <SelectItem key={c} value={c}>
                {LABEL_CATEGORIA_PRINCIPAL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filtro-subcategoria">Subcategoria</Label>
        <Select
          value={subcategoriaValida}
          onValueChange={(v) => definir("subcategoria", v)}
          disabled={pending || subcategoriasDisponiveis.length === 0}
        >
          <SelectTrigger id="filtro-subcategoria" className="w-56">
            <SelectValue placeholder="Todas as subcategorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as subcategorias</SelectItem>
            {subcategoriasDisponiveis.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
