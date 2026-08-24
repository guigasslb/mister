import Link from "next/link";
import type { Metadata } from "next";
import { verificarTokenReset } from "@/lib/actions/password-reset";
import { ReporPasswordForm } from "@/components/auth/ReporPasswordForm";
import { Logo } from "@/components/layout/Logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Repor password" };

export default async function ReporPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Validação do token ao carregar a página. Sem token válido/não expirado,
  // mostramos o estado de erro e o caminho para pedir um novo link.
  const resultado = token ? await verificarTokenReset(token) : null;
  const tokenValido = !!resultado?.sucesso && !!token;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <Logo size={26} className="mb-1" />
        <CardDescription>Define uma nova password</CardDescription>
      </CardHeader>
      <CardContent>
        {tokenValido ? (
          <ReporPasswordForm token={token} />
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-corpo text-vermelho-600">
              Link inválido ou expirado
            </p>
            <p className="text-legenda text-cinza-500">
              Este link já não pode ser utilizado. Pede um novo para continuar.
            </p>
            <Link
              href="/esqueci-password"
              className="inline-block font-medium text-laranja-600 underline"
            >
              Pedir novo link de recuperação
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
