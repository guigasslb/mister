"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { criarAtleta, atualizarAtleta } from "@/lib/actions/atletas";
import { mostrarEncarregadoEducacao } from "@/lib/utils";
import {
  LABEL_POSICAO,
  posicoesPorModalidade,
  PES_DOMINANTES,
  LABEL_PE_DOMINANTE,
  TIPOS_DOC,
  LABEL_DOC_TIPO,
  ESTATUTOS_FPF,
  LABEL_ESTATUTO_FPF,
} from "@/lib/schemas/atleta";
import { LABEL_TIPO_PARTICIPACAO, TIPOS_PARTICIPACAO } from "@/lib/schemas/participacao";
import type {
  DocTipo,
  Escalao,
  EstatutoFPF,
  Modalidade,
  PeDominante,
  Posicao,
  TipoParticipacao,
} from "@prisma/client";

function formatDateForInput(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Sentinela para o valor «sem indicação» dos seletores opcionais: os enums são
// opcionais no schema (§ dados pessoais), mas o Select do shadcn/ui não aceita
// SelectItem com value="". Enviamos "" no submit — o schema (`enumOpcional`)
// converte "" → undefined → null persistido.
const SEM_VALOR = "__sem_valor__";

/**
 * Seletor de um enum opcional (pé dominante, tipo de documento, estatuto FPF).
 * Inclui sempre a opção «Sem indicação» para permitir limpar o campo.
 */
function SeletorOpcional<T extends string>({
  id,
  label,
  valor,
  aoAlterar,
  opcoes,
  labels,
  placeholder = "Sem indicação",
}: {
  id: string;
  label: string;
  valor: string;
  aoAlterar: (v: string) => void;
  opcoes: readonly T[];
  labels: Record<T, string>;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={valor} onValueChange={aoAlterar}>
        <SelectTrigger id={id} className="h-11">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_VALOR}>{placeholder}</SelectItem>
          {opcoes.map((o) => (
            <SelectItem key={o} value={o}>
              {labels[o]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// 🔁 v7 (§3.2): o escalão traz a modalidade da sua secção, para o seletor de
// posições filtrar as opções relevantes. `modalidade` pode ser null (escalão sem
// secção associada — backfill pendente); nesse caso mostram-se todas as posições.
type EscalaoBasico = Pick<Escalao, "id" | "nome"> & {
  modalidade: Modalidade | null;
};

/**
 * Dados pessoais do atleta em edição. Escalão e número pertencem à participação
 * (AtletaEscalao) e geram-se aqui apenas na criação (participação inicial).
 */
export type AtletaParaEdicao = {
  id: string;
  nome: string;
  dataNascimento: Date | null;
  dataIngresso: Date | null;
  posicoes: Posicao[];
  observacoes: string | null;
  fotoUrl: string | null;
  inscrito: boolean;
  praticaDuplaModalidade: boolean;
  // Contactos e dados pessoais adicionais (§ dados pessoais).
  email: string | null;
  telefone: string | null;
  peDominante: PeDominante | null;
  paisNascimento: string | null;
  nacionalidade: string | null;
  // Documento de identificação do atleta.
  docTipo: DocTipo | null;
  docNumero: string | null;
  docValidade: Date | null;
  // FPF (Federação Portuguesa de Futebol).
  estatutoFPF: EstatutoFPF | null;
  numeroLicencaFPF: string | null;
  // Encarregado de educação.
  encarregadoNome: string | null;
  encarregadoContacto: string | null;
  encarregadoEmail: string | null;
  encarregadoDocTipo: DocTipo | null;
  encarregadoDocNumero: string | null;
  encarregadoDocValidade: Date | null;
  // Participações ativas na época (para derivar o escalão em contexto na edição —
  // decide a abertura automática do bloco de encarregado de educação, UX-P3-08).
  participacoes?: { escalaoNome: string }[];
};

export function AtletaForm({
  escaloes,
  atleta,
}: {
  escaloes: EscalaoBasico[];
  atleta?: AtletaParaEdicao;
}) {
  const router = useRouter();
  const emEdicao = atleta != null;
  const [pending, startTransition] = useTransition();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [posicoes, setPosicoes] = useState<Set<Posicao>>(
    () => new Set(atleta?.posicoes ?? []),
  );
  const [escalaoId, setEscalaoId] = useState<string>("");
  const [tipoParticipacao, setTipoParticipacao] = useState<TipoParticipacao>("PRINCIPAL");
  // Estado de inscrição (secção 8): editável aqui. Gerido em estado local (o
  // Switch não é um input nativo) e enviado no objeto `pessoal`.
  const [inscrito, setInscrito] = useState(atleta?.inscrito ?? false);
  // §3.2: atleta que pratica futebol e futsal em simultâneo. Gerido em estado
  // local (o Switch não é input nativo) e enviado no objeto `pessoal`.
  const [praticaDuplaModalidade, setPraticaDuplaModalidade] = useState(
    atleta?.praticaDuplaModalidade ?? false,
  );

  // Enums opcionais: geridos em estado local porque o Select do shadcn/ui não é um
  // input nativo (não aparece no FormData). Inicializam do atleta ou «sem valor».
  const [peDominante, setPeDominante] = useState<string>(
    atleta?.peDominante ?? SEM_VALOR,
  );
  const [docTipo, setDocTipo] = useState<string>(atleta?.docTipo ?? SEM_VALOR);
  const [estatutoFPF, setEstatutoFPF] = useState<string>(
    atleta?.estatutoFPF ?? SEM_VALOR,
  );
  const [encarregadoDocTipo, setEncarregadoDocTipo] = useState<string>(
    atleta?.encarregadoDocTipo ?? SEM_VALOR,
  );

  // Modalidade em contexto para o seletor de posições (§3.2): na criação deriva do
  // escalão selecionado; na edição não há escalão em contexto → mostra todas.
  const escalaoSelecionado = escaloes.find((e) => e.id === escalaoId);
  const modalidadeContexto: Modalidade | null = emEdicao
    ? null
    : (escalaoSelecionado?.modalidade ?? null);

  // UX-P3-08: o encarregado de educação só é relevante para atletas menores. Abrimos
  // o bloco automaticamente — tanto na criação como na edição — quando o escalão em
  // contexto é de formação jovem (Sub-N, N ≤ 16, ou nome tradicional). Na criação o
  // contexto vem do escalão selecionado; na edição, do escalão da participação ativa
  // do atleta. Sem escalão em contexto fica colapsado por omissão. Os campos mantêm-se
  // sempre no DOM (o `<details>` não os remove), pelo que o submit não é afetado.
  const nomeEscalaoContexto =
    escalaoSelecionado?.nome ?? atleta?.participacoes?.[0]?.escalaoNome ?? null;
  const abrirEncarregado = nomeEscalaoContexto
    ? mostrarEncarregadoEducacao(nomeEscalaoContexto)
    : false;

  // Posições a mostrar: as da modalidade em contexto + quaisquer já selecionadas
  // fora dessa modalidade (um atleta multi-desporto guarda todas — §3.2; assim
  // nunca escondemos uma seleção ativa ao trocar de escalão).
  const posicoesMostradas = useMemo(() => {
    const base = posicoesPorModalidade(modalidadeContexto);
    const extra = [...posicoes].filter((p) => !base.includes(p));
    return [...base, ...extra];
  }, [modalidadeContexto, posicoes]);

  function alternarPosicao(p: Posicao) {
    setPosicoes((prev) => {
      const novo = new Set(prev);
      if (novo.has(p)) novo.delete(p);
      else novo.add(p);
      return novo;
    });
  }

  // "" quando a sentinela «sem valor» está selecionada; o schema converte "" → null.
  const valorEnum = (v: string) => (v === SEM_VALOR ? "" : v);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErros({});
    setErroGeral(null);

    const val = (k: string) => String(fd.get(k) ?? "").trim();
    const numeroRaw = val("numero");
    const dataRaw = val("dataNascimento");
    const ingressoRaw = val("dataIngresso");

    const pessoal = {
      nome: String(fd.get("nome")),
      posicoes: [...posicoes],
      dataNascimento: dataRaw !== "" ? dataRaw : undefined,
      dataIngresso: ingressoRaw !== "" ? ingressoRaw : undefined,
      observacoes: val("observacoes") || undefined,
      fotoUrl: val("fotoUrl"),
      inscrito,
      praticaDuplaModalidade,
      // Contactos e dados pessoais adicionais.
      email: val("email"),
      telefone: val("telefone") || undefined,
      peDominante: valorEnum(peDominante),
      paisNascimento: val("paisNascimento") || undefined,
      nacionalidade: val("nacionalidade") || undefined,
      // Documento de identificação do atleta.
      docTipo: valorEnum(docTipo),
      docNumero: val("docNumero") || undefined,
      docValidade: val("docValidade") || undefined,
      // FPF.
      estatutoFPF: valorEnum(estatutoFPF),
      numeroLicencaFPF: val("numeroLicencaFPF") || undefined,
      // Encarregado de educação.
      encarregadoNome: val("encarregadoNome") || undefined,
      encarregadoContacto: val("encarregadoContacto") || undefined,
      encarregadoEmail: val("encarregadoEmail"),
      encarregadoDocTipo: valorEnum(encarregadoDocTipo),
      encarregadoDocNumero: val("encarregadoDocNumero") || undefined,
      encarregadoDocValidade: val("encarregadoDocValidade") || undefined,
    };

    // O escalão da participação inicial é obrigatório na criação (secção 8.5).
    if (!emEdicao && escalaoId === "") {
      setErros({ "participacaoInicial.escalaoId": "Escolhe o escalão do atleta" });
      return;
    }

    startTransition(async () => {
      const res = atleta
        ? await atualizarAtleta(atleta.id, pessoal)
        : await criarAtleta({
            ...pessoal,
            participacaoInicial: {
              escalaoId,
              numero: numeroRaw !== "" ? Number(numeroRaw) : undefined,
              tipo: tipoParticipacao,
            },
          });

      if (res.sucesso) {
        toast.success(atleta ? "Atleta atualizado" : "Atleta criado");
        router.push(atleta ? `/plantel/${atleta.id}` : "/plantel");
        router.refresh();
      } else {
        setErroGeral(res.erro);
        if (res.camposInvalidos) setErros(res.camposInvalidos);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-6">
      {erroGeral && !Object.keys(erros).length && (
        <p className="text-corpo-sec text-vermelho-600">{erroGeral}</p>
      )}

      {/* Dados pessoais (sempre visível — campos core) */}
      <div className="space-y-4">
        <p className="text-corpo font-semibold text-cinza-900">Dados pessoais</p>

        <div className="space-y-1.5">
          <Label htmlFor="nome">Nome *</Label>
          <Input id="nome" name="nome" defaultValue={atleta?.nome ?? ""} required minLength={2} maxLength={100} placeholder="Nome completo" />
          {erros.nome && <p className="text-legenda text-vermelho-600">{erros.nome}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="dataNascimento">Data de nascimento</Label>
            <Input id="dataNascimento" name="dataNascimento" type="date" defaultValue={formatDateForInput(atleta?.dataNascimento)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dataIngresso">Data de ingresso</Label>
            <Input id="dataIngresso" name="dataIngresso" type="date" defaultValue={formatDateForInput(atleta?.dataIngresso)} />
          </div>
        </div>
        <p className="text-legenda text-cinza-400">
          Se o atleta entrou a meio da época, a taxa de presença conta a partir da data de ingresso.
        </p>

        <div className="space-y-1.5">
          <Label>Posições</Label>
          <div className="flex flex-wrap gap-2">
            {posicoesMostradas.map((p) => {
              const ativo = posicoes.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => alternarPosicao(p)}
                  className={`inline-flex min-h-[44px] items-center rounded-full border px-4 py-1.5 text-corpo-sec transition-colors ${
                    ativo
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-cinza-200 text-cinza-600 hover:bg-cinza-50"
                  }`}
                >
                  {LABEL_POSICAO[p]}
                </button>
              );
            })}
          </div>
          <p className="text-legenda text-cinza-400">
            Podes escolher mais do que uma.
            {!emEdicao && modalidadeContexto === null
              ? " Escolhe o escalão para filtrar as posições por modalidade."
              : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SeletorOpcional
            id="peDominante"
            label="Pé dominante"
            valor={peDominante}
            aoAlterar={setPeDominante}
            opcoes={PES_DOMINANTES}
            labels={LABEL_PE_DOMINANTE}
          />
          <div className="space-y-1.5">
            <Label htmlFor="telefone">Telefone</Label>
            <Input id="telefone" name="telefone" type="tel" defaultValue={atleta?.telefone ?? ""} maxLength={40} placeholder="Telemóvel" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={atleta?.email ?? ""} maxLength={200} />
          {erros.email && <p className="text-legenda text-vermelho-600">{erros.email}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fotoUrl">Fotografia (URL)</Label>
          <Input id="fotoUrl" name="fotoUrl" defaultValue={atleta?.fotoUrl ?? ""} placeholder="https://…" />
          {erros.fotoUrl && <p className="text-legenda text-vermelho-600">{erros.fotoUrl}</p>}
        </div>

        {/* Inscrição (secção 8): estado editável do atleta no clube/federação. */}
        <div className="flex min-h-[44px] items-center justify-between gap-4 rounded-lg border border-cinza-200 px-4 py-2">
          <div>
            <Label htmlFor="inscrito" className="cursor-pointer select-none">
              Inscrito
            </Label>
            <p className="text-legenda text-cinza-400">
              {inscrito
                ? "O atleta está inscrito."
                : "O atleta ainda está por inscrever."}
            </p>
          </div>
          <Switch
            id="inscrito"
            checked={inscrito}
            onCheckedChange={setInscrito}
            aria-label={inscrito ? "Marcar como por inscrever" : "Marcar como inscrito"}
          />
        </div>

        {/* §3.2: prática simultânea de futebol e futsal (dupla modalidade). */}
        <div className="flex min-h-[44px] items-center justify-between gap-4 rounded-lg border border-cinza-200 px-4 py-2">
          <div>
            <Label htmlFor="praticaDuplaModalidade" className="cursor-pointer select-none">
              Pratica futebol e futsal
            </Label>
            <p className="text-legenda text-cinza-400">
              {praticaDuplaModalidade
                ? "O atleta joga nas duas modalidades — pode faltar a treinos por jogos de futebol."
                : "Ativa se o atleta jogar futebol e futsal em simultâneo."}
            </p>
          </div>
          <Switch
            id="praticaDuplaModalidade"
            checked={praticaDuplaModalidade}
            onCheckedChange={setPraticaDuplaModalidade}
            aria-label={
              praticaDuplaModalidade
                ? "Marcar como praticante de uma só modalidade"
                : "Marcar como praticante de futebol e futsal"
            }
          />
        </div>
      </div>

      {/* Participação inicial (só na criação) */}
      {!emEdicao && (
        <div className="space-y-4 border-t border-cinza-200 pt-5">
          <p className="text-corpo font-semibold text-cinza-900">Participação inicial</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="participacao-escalao">Escalão *</Label>
              <Select value={escalaoId} onValueChange={setEscalaoId}>
                <SelectTrigger id="participacao-escalao" className="h-11">
                  <SelectValue placeholder="Seleciona" />
                </SelectTrigger>
                <SelectContent>
                  {escaloes.map((e) => (<SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>))}
                </SelectContent>
              </Select>
              {erros["participacaoInicial.escalaoId"] && (
                <p className="text-legenda text-vermelho-600">
                  {erros["participacaoInicial.escalaoId"]}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="numero">Número</Label>
              <Input id="numero" name="numero" type="number" min={1} max={999} placeholder="ex: 7" />
              {erros["participacaoInicial.numero"] && (
                <p className="text-legenda text-vermelho-600">
                  {erros["participacaoInicial.numero"]}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="participacao-tipo">Tipo de participação</Label>
            <Select
              value={tipoParticipacao}
              onValueChange={(v) => setTipoParticipacao(v as TipoParticipacao)}
            >
              <SelectTrigger id="participacao-tipo" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_PARTICIPACAO.map((t) => (
                  <SelectItem key={t} value={t}>{LABEL_TIPO_PARTICIPACAO[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-legenda text-cinza-400">
            O escalão e o número de camisola pertencem à participação. Depois de criar o
            atleta podes associá-lo a mais escalões.
          </p>
        </div>
      )}

      {/* Identificação (colapsável; fechada por omissão) */}
      <details className="group space-y-4 border-t border-cinza-200 pt-5">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-corpo font-semibold text-cinza-900">
          <span>Identificação</span>
          <span className="text-legenda font-normal text-cinza-400 group-open:hidden">
            Mostrar
          </span>
        </summary>
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <SeletorOpcional
              id="docTipo"
              label="Documento"
              valor={docTipo}
              aoAlterar={setDocTipo}
              opcoes={TIPOS_DOC}
              labels={LABEL_DOC_TIPO}
            />
            <div className="space-y-1.5">
              <Label htmlFor="docNumero">Nº do documento</Label>
              <Input id="docNumero" name="docNumero" defaultValue={atleta?.docNumero ?? ""} maxLength={50} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="docValidade">Validade do documento</Label>
            <Input id="docValidade" name="docValidade" type="date" defaultValue={formatDateForInput(atleta?.docValidade)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="paisNascimento">País de nascimento</Label>
              <Input id="paisNascimento" name="paisNascimento" defaultValue={atleta?.paisNascimento ?? ""} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nacionalidade">Nacionalidade</Label>
              <Input id="nacionalidade" name="nacionalidade" defaultValue={atleta?.nacionalidade ?? ""} maxLength={100} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SeletorOpcional
              id="estatutoFPF"
              label="Estatuto FPF"
              valor={estatutoFPF}
              aoAlterar={setEstatutoFPF}
              opcoes={ESTATUTOS_FPF}
              labels={LABEL_ESTATUTO_FPF}
            />
            <div className="space-y-1.5">
              <Label htmlFor="numeroLicencaFPF">Nº de licença FPF</Label>
              <Input id="numeroLicencaFPF" name="numeroLicencaFPF" defaultValue={atleta?.numeroLicencaFPF ?? ""} maxLength={50} />
            </div>
          </div>
        </div>
      </details>

      {/* Encarregado de educação (UX-P3-08: colapsável; aberto só na formação jovem) */}
      <details open={abrirEncarregado} className="group space-y-4 border-t border-cinza-200 pt-5">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-corpo font-semibold text-cinza-900">
          <span>Encarregado de educação</span>
          <span className="text-legenda font-normal text-cinza-400 group-open:hidden">
            Mostrar
          </span>
        </summary>
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="encarregadoNome">Nome</Label>
              <Input id="encarregadoNome" name="encarregadoNome" defaultValue={atleta?.encarregadoNome ?? ""} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="encarregadoContacto">Contacto</Label>
              <Input id="encarregadoContacto" name="encarregadoContacto" defaultValue={atleta?.encarregadoContacto ?? ""} maxLength={40} placeholder="Telemóvel" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="encarregadoEmail">Email</Label>
            <Input id="encarregadoEmail" name="encarregadoEmail" type="email" defaultValue={atleta?.encarregadoEmail ?? ""} />
            {erros.encarregadoEmail && <p className="text-legenda text-vermelho-600">{erros.encarregadoEmail}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SeletorOpcional
              id="encarregadoDocTipo"
              label="Documento"
              valor={encarregadoDocTipo}
              aoAlterar={setEncarregadoDocTipo}
              opcoes={TIPOS_DOC}
              labels={LABEL_DOC_TIPO}
            />
            <div className="space-y-1.5">
              <Label htmlFor="encarregadoDocNumero">Nº do documento</Label>
              <Input id="encarregadoDocNumero" name="encarregadoDocNumero" defaultValue={atleta?.encarregadoDocNumero ?? ""} maxLength={50} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="encarregadoDocValidade">Validade do documento</Label>
            <Input id="encarregadoDocValidade" name="encarregadoDocValidade" type="date" defaultValue={formatDateForInput(atleta?.encarregadoDocValidade)} />
          </div>
        </div>
      </details>

      {/* Observações (colapsável) */}
      <details className="group space-y-4 border-t border-cinza-200 pt-5">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-corpo font-semibold text-cinza-900">
          <span>Observações</span>
          <span className="text-legenda font-normal text-cinza-400 group-open:hidden">
            Mostrar
          </span>
        </summary>
        <div className="pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Notas</Label>
            <Textarea id="observacoes" name="observacoes" defaultValue={atleta?.observacoes ?? ""} maxLength={1000} rows={3} placeholder="Notas sobre o atleta…" />
          </div>
        </div>
      </details>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "A guardar…" : emEdicao ? "Guardar alterações" : "Criar atleta"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
