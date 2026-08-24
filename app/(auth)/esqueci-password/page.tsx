import Link from "next/link";
import type { Metadata } from "next";
import { EsqueciPasswordForm } from "@/components/auth/EsqueciPasswordForm";
import { Logo } from "@/components/layout/Logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Recuperar password" };

export default function EsqueciPasswordPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <Logo size={26} className="mb-1" />
        <CardDescription>Recupera o acesso à tua conta</CardDescription>
      </CardHeader>
      <CardContent>
        <EsqueciPasswordForm />
        <p className="mt-4 text-center text-legenda text-cinza-500">
          Lembraste-te?{" "}
          <Link href="/login" className="font-medium text-laranja-600 underline">
            Voltar ao início de sessão
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
