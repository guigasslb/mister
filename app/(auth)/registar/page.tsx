import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { RegistarForm } from "@/components/auth/RegistarForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function RegistarPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-titulo-pagina">Criar conta</CardTitle>
        <CardDescription>Regista-te para começares a usar o Mister</CardDescription>
      </CardHeader>
      <CardContent>
        <RegistarForm />
        <p className="mt-4 text-center text-legenda text-cinza-500">
          Já tens conta?{" "}
          <Link href="/login" className="font-medium text-laranja-600 underline">
            Inicia sessão
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
