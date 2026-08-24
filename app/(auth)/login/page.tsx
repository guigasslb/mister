import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LoginForm } from "@/components/auth/LoginForm";
import { Logo } from "@/components/layout/Logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export default async function LoginPage() {
  const session = await auth();
  // Só redireciona se a sessão for válida (utilizador existe). Uma sessão obsoleta
  // fica no login (evita loop login↔dashboard após reseed/conta apagada).
  if (session?.user?.id) {
    const existe = await prisma.utilizador.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
    if (existe) redirect("/dashboard");
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <Logo size={26} className="mb-1" />
        <CardDescription>Inicia sessão para continuar</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
        <p className="mt-4 text-center text-legenda text-cinza-500">
          Ainda não tens conta?{" "}
          <Link href="/registar" className="font-medium text-laranja-600 underline">
            Criar conta
          </Link>
        </p>
        <p className="mt-2 text-center text-legenda text-cinza-500">
          <Link href="/esqueci-password" className="font-medium text-laranja-600 underline">
            Esqueceste a password?
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
