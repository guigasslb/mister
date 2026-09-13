import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Breadcrumb consistente das sub-páginas de Definições (§8.4).
 *
 * Renderiza a ligação de regresso «‹ Definições» ao painel principal. O título
 * de cada sub-página é fornecido pelo próprio conteúdo (componente de lista ou
 * cabeçalho inline da página), pelo que não é duplicado aqui.
 */
export function CabecalhoDefinicoes() {
  return (
    <Link
      href="/definicoes"
      className="flex w-fit items-center gap-1 text-corpo-sec text-cinza-600 hover:text-cinza-900 transition-colors"
    >
      <ChevronLeft className="h-4 w-4" />
      Definições
    </Link>
  );
}
