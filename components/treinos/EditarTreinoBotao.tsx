"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
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

/**
 * Botão "Editar" do detalhe do treino.
 *
 * Para treinos futuros/de hoje navega diretamente para a edição. Para treinos
 * já realizados (`concluido`), pede confirmação antes — editar um treino
 * concluído altera o registo histórico, por isso não deve ser acidental.
 */
export function EditarTreinoBotao({
  href,
  concluido,
}: {
  href: string;
  /** Treino já realizado (data no passado): pede confirmação antes de editar. */
  concluido: boolean;
}) {
  const router = useRouter();

  if (!concluido) {
    return (
      <Button asChild variant="outline">
        <Link href={href}>
          <Pencil className="h-4 w-4" />
          Editar
        </Link>
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Editar treino já realizado?</AlertDialogTitle>
          <AlertDialogDescription>
            Este treino já foi realizado. Tens a certeza que queres editá-lo?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => router.push(href)}>
            Editar mesmo assim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
