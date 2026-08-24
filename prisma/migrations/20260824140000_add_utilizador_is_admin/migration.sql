-- AlterTable
-- Admin de plataforma persistido na BD (substitui a allowlist ADMIN_EMAILS).
-- Aditivo: default false, sem impacto em dados existentes (ninguém é admin por omissão).
ALTER TABLE "Utilizador" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
