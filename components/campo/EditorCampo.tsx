"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  MousePointer2,
  User,
  Users,
  Circle,
  Triangle,
  Goal,
  MoveRight,
  Minus,
  Type,
  Eraser,
  Undo2,
  Trash2,
  Check,
  Film,
  Plus,
  RotateCw,
} from "lucide-react";
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
import { FormatoJogo } from "@prisma/client";
import {
  CAMPO_W,
  CAMPO_H,
  LinhasCampo,
  ElementoSVG,
  SetaMarker,
  rotuloCampo,
  CONE_CORES,
  CONE_COR_DEFAULT,
  ARCO_CORES,
  ARCO_COR_DEFAULT,
} from "./desenho";
import { useEscalaCampo } from "./useEscalaCampo";
import { usePointerDrag } from "./usePointerDrag";
import { TimelinePassos } from "./TimelinePassos";
import {
  construirKeyframes,
  elementoEmPonto,
  pontosSemRepetidos,
  DURACAO_PADRAO,
  type Pos,
} from "./animacao";
import type {
  DiagramaCampo,
  ElementoCampo,
  CorJogador,
  CorCone,
  CorArco,
  PassoAnimacao,
  TamanhoEscadinha,
} from "@/lib/schemas/exercicio";

type Ferramenta =
  | "selecionar"
  | "jogador"
  | "adversario"
  | "bola"
  | "cone"
  | "baliza"
  | "seta"
  | "linha"
  | "texto"
  | "escadinha"
  | "barras"
  | "arco"
  | "apagar";

type EstiloSeta = "movimento" | "passe" | "conducao";

const CORES_JOGADOR: { valor: CorJogador; hex: string; nome: string }[] = [
  { valor: "azul", hex: "#1A2FD4", nome: "Azul" },
  { valor: "vermelho", hex: "#DC2626", nome: "Vermelho" },
  { valor: "amarelo", hex: "#F5C518", nome: "Amarelo" },
  { valor: "verde", hex: "#16A34A", nome: "Verde" },
];

// Ângulos de rotação predefinidos (graus) para escadinha/barras.
const ANGULOS: number[] = [0, 45, 90, 135];

const TAMANHOS_ESCADINHA: { valor: TamanhoEscadinha; label: string }[] = [
  { valor: "pequena", label: "Pequena" },
  { valor: "media", label: "Média" },
  { valor: "grande", label: "Grande" },
];

// Miniaturas SVG inline para as ferramentas sem ícone lucide adequado.
function IconeEscadinha({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="4" y1="13" x2="20" y2="13" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function IconeBarras({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="7" y1="8" x2="7" y2="19" />
      <line x1="17" y1="8" x2="17" y2="19" />
    </svg>
  );
}

function IconeArco({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <ellipse cx="12" cy="12" rx="9" ry="5" />
    </svg>
  );
}

const FERRAMENTAS: {
  id: Ferramenta;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "selecionar", label: "Selecionar", Icon: MousePointer2 },
  { id: "jogador", label: "Jogador", Icon: User },
  { id: "bola", label: "Bola", Icon: Circle },
  { id: "cone", label: "Cone", Icon: Triangle },
  { id: "baliza", label: "Baliza", Icon: Goal },
  { id: "seta", label: "Seta", Icon: MoveRight },
  { id: "linha", label: "Linha", Icon: Minus },
  { id: "texto", label: "Texto", Icon: Type },
  { id: "escadinha", label: "Escadinha", Icon: IconeEscadinha },
  { id: "barras", label: "Barras", Icon: IconeBarras },
  { id: "arco", label: "Arco", Icon: IconeArco },
  { id: "apagar", label: "Apagar", Icon: Eraser },
];

// Ferramenta opcional (só quando `permitirAdversario`): coloca tokens genéricos
// da equipa adversária (§11.3). Inserida logo a seguir a "Jogador".
const FERRAMENTA_ADVERSARIO: {
  id: Ferramenta;
  label: string;
  Icon: ComponentType<{ className?: string }>;
} = { id: "adversario", label: "Adversário", Icon: Users };

const PASSO_TECLADO = 5;
const PASSO_TECLADO_FINO = 1;

function novoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function fixar(v: number, max: number): number {
  return Math.max(0, Math.min(max, v));
}

export function EditorCampo({
  valor,
  onChange,
  formato,
  permitirAdversario = false,
}: {
  valor: DiagramaCampo;
  onChange: (d: DiagramaCampo) => void;
  // 🔁 v7 (§11.5): fundo de campo. Se ausente, herda de `valor.campo` (retrocompat
  // FUTSAL_5). Fornecido pelo contexto (exercício/modelo de jogo) ao criar novos
  // diagramas de futebol; preservado em todas as gravações.
  formato?: FormatoJogo;
  // §8.10/§11.3: quando `true`, expõe a ferramenta "Adversário" (tokens genéricos
  // da equipa contrária). Opt-in — usado no quadro tático do jogo; os restantes
  // contextos (exercícios/modelo de jogo) mantêm a barra de ferramentas anterior.
  permitirAdversario?: boolean;
}) {
  // Formato efectivo do diagrama: o já gravado tem prioridade; senão o do contexto.
  const campoActual = valor.campo ?? formato;
  const fmt = campoActual ?? FormatoJogo.FUTSAL_5;
  const svgRef = useRef<SVGSVGElement>(null);
  const escala = useEscalaCampo(svgRef);
  const drag = usePointerDrag(svgRef, escala);

  const [ferramenta, setFerramenta] = useState<Ferramenta>("selecionar");
  const [corJogador, setCorJogador] = useState<CorJogador>("azul");
  const [corCone, setCorCone] = useState<CorCone>(CONE_COR_DEFAULT as CorCone);
  const [corArco, setCorArco] = useState<CorArco>(ARCO_COR_DEFAULT as CorArco);
  const [estiloSeta, setEstiloSeta] = useState<EstiloSeta>("movimento");
  const [orientacaoBaliza, setOrientacaoBaliza] = useState<
    "horizontal" | "vertical"
  >("vertical");
  // Ângulo do próximo elemento (escadinha/barras) e tamanho da próxima escadinha.
  const [anguloNovo, setAnguloNovo] = useState<number>(0);
  const [tamanhoEscadinha, setTamanhoEscadinha] =
    useState<TamanhoEscadinha>("media");
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [focadoId, setFocadoId] = useState<string | null>(null);
  const [historico, setHistorico] = useState<DiagramaCampo[]>([]);
  const [caminhoAtual, setCaminhoAtual] = useState<{ x: number; y: number }[]>([]);
  const [arrastando, setArrastando] = useState<string | null>(null);
  // Estado de arrasto de uma seta/linha (trajecto): pontos originais + origem do
  // ponteiro, para transladar todo o trajecto pelo delta desde o início do drag.
  const arrastarPathRef = useRef<{
    pontos: { x: number; y: number }[];
    origem: { x: number; y: number };
  } | null>(null);
  const [textoInline, setTextoInline] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [modoAnimacao, setModoAnimacao] = useState(false);
  // -1 = base ("Início"); 0..N-1 = índice do passo em edição.
  const [keyframeActivo, setKeyframeActivo] = useState(-1);
  const [anuncio, setAnuncio] = useState("");

  const elementos = valor.elementos;
  const passos = valor.passos ?? [];
  const temPontos = elementos.some((el) => "x" in el && "y" in el);

  // Keyframes acumulados; posições visíveis = keyframe activo.
  const keyframes = construirKeyframes(valor);
  const idxKf = Math.min(Math.max(keyframeActivo + 1, 0), keyframes.length - 1);
  const posActivas = keyframes[idxKf] ?? keyframes[0];

  // Elementos com as posições do keyframe activo aplicadas (para render/hit-test).
  const elementosRender: ElementoCampo[] = elementos.map((el) => {
    if ("x" in el && "y" in el) {
      const p = posActivas.get(el.id);
      return p ? { ...el, x: p.x, y: p.y } : el;
    }
    return el;
  });

  // Setas-fantasma (derivadas, não persistidas): movimento do passo activo.
  const setasFantasma =
    modoAnimacao && keyframeActivo >= 0 && keyframes[keyframeActivo]
      ? (() => {
          const prev = keyframes[keyframeActivo];
          const curr = keyframes[keyframeActivo + 1];
          const arr: { id: string; from: Pos; to: Pos }[] = [];
          if (curr) {
            for (const [id, p] of curr) {
              const p0 = prev.get(id);
              if (p0 && (p0.x !== p.x || p0.y !== p.y)) {
                arr.push({ id, from: p0, to: p });
              }
            }
          }
          return arr;
        })()
      : [];

  function anunciar(msg: string) {
    setAnuncio(msg);
  }

  function snapshotAtual(): DiagramaCampo {
    return { versao: 2, elementos, passos, campo: campoActual };
  }

  function registarHistorico() {
    const snap = snapshotAtual();
    setHistorico((h) => [...h.slice(-30), snap]);
  }

  // B4: o editor grava SEMPRE versao 2 e preserva o `campo` (§11.5).
  function aplicarElementos(novos: ElementoCampo[]) {
    onChange({ versao: 2, elementos: novos, passos, campo: campoActual });
  }
  function aplicarPassos(novos: PassoAnimacao[]) {
    onChange({ versao: 2, elementos, passos: novos, campo: campoActual });
  }

  // Move um elemento no keyframe activo (base ou delta do passo).
  function moverElemento(id: string, x: number, y: number) {
    if (keyframeActivo < 0) {
      aplicarElementos(
        elementos.map((el) =>
          el.id === id && "x" in el ? { ...el, x, y } : el,
        ),
      );
    } else {
      const novos = passos.map((p, i) => {
        if (i !== keyframeActivo) return p;
        const outras = p.posicoes.filter((pp) => pp.elementoId !== id);
        return { ...p, posicoes: [...outras, { elementoId: id, x, y }] };
      });
      aplicarPassos(novos);
    }
  }

  // Translada todos os pontos de uma seta/linha por (dx,dy), limitando o delta
  // para que nenhum ponto saia do campo. `pontosBase` são os pontos de partida
  // (capturados no início do drag ou os atuais no caso do teclado).
  function transladarPath(
    id: string,
    pontosBase: { x: number; y: number }[],
    dx: number,
    dy: number,
  ) {
    const xs = pontosBase.map((p) => p.x);
    const ys = pontosBase.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cdx = Math.max(-minX, Math.min(CAMPO_W - maxX, dx));
    const cdy = Math.max(-minY, Math.min(CAMPO_H - maxY, dy));
    aplicarElementos(
      elementos.map((el) =>
        el.id === id && "pontos" in el
          ? { ...el, pontos: pontosBase.map((p) => ({ x: p.x + cdx, y: p.y + cdy })) }
          : el,
      ),
    );
  }

  function moverPath(
    id: string,
    info: { pontos: { x: number; y: number }[]; origem: { x: number; y: number } },
    coords: { x: number; y: number },
  ) {
    transladarPath(id, info.pontos, coords.x - info.origem.x, coords.y - info.origem.y);
  }

  function proximoNumero(cor: CorJogador): number {
    const numeros = elementos
      .filter((el) => el.tipo === "jogador" && el.cor === cor)
      .map((el) => (el.tipo === "jogador" ? el.numero ?? 0 : 0));
    return numeros.length ? Math.max(...numeros) + 1 : 1;
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (textoInline) return;
    const coords = drag.paraCoordenadas(e);
    if (!coords) return;
    const { x, y } = coords;

    switch (ferramenta) {
      case "selecionar": {
        // Modo animação: só elementos-ponto são selecionáveis (as setas não
        // participam nos passos — §11). Fora da animação mantém tudo selecionável.
        const alvo = elementoEmPonto(elementosRender, x, y, drag.raioHit, {
          apenasPontos: modoAnimacao,
        });
        if (alvo) {
          setSelecionadoId(alvo.id);
          setFocadoId(alvo.id);
          if ("x" in alvo) {
            // B2: captura o snapshot ANTES de mover (para o undo).
            drag.snapshotRef.current = snapshotAtual();
            // B1: mantém o ponteiro capturado mesmo se sair do <svg>.
            drag.iniciarCaptura(e);
            setArrastando(alvo.id);
          } else if ("pontos" in alvo && keyframeActivo < 0) {
            // Setas/linhas: arrastáveis apenas na base (não participam em passos
            // de animação). Guarda os pontos originais + origem do ponteiro.
            drag.snapshotRef.current = snapshotAtual();
            arrastarPathRef.current = { pontos: alvo.pontos, origem: { x, y } };
            drag.iniciarCaptura(e);
            setArrastando(alvo.id);
          }
        } else {
          setSelecionadoId(null);
        }
        break;
      }
      case "apagar": {
        const alvo = elementoEmPonto(elementosRender, x, y, drag.raioHit);
        if (alvo) {
          registarHistorico();
          aplicarElementos(elementos.filter((el) => el.id !== alvo.id));
          setSelecionadoId(null);
          anunciar("Elemento apagado");
        }
        break;
      }
      case "jogador": {
        registarHistorico();
        aplicarElementos([
          ...elementos,
          {
            id: novoId(),
            tipo: "jogador",
            x,
            y,
            cor: corJogador,
            numero: proximoNumero(corJogador),
          },
        ]);
        break;
      }
      case "adversario": {
        // §11.3: token genérico do adversário — sem número (rótulo "A" no render),
        // marcado com `equipa: "adversario"`. `cor` mantém-se num valor válido do
        // schema (o render ignora-a para adversários).
        registarHistorico();
        aplicarElementos([
          ...elementos,
          {
            id: novoId(),
            tipo: "jogador",
            x,
            y,
            cor: "vermelho",
            equipa: "adversario",
          },
        ]);
        break;
      }
      case "bola": {
        registarHistorico();
        aplicarElementos([...elementos, { id: novoId(), tipo: "bola", x, y }]);
        break;
      }
      case "cone": {
        registarHistorico();
        aplicarElementos([
          ...elementos,
          { id: novoId(), tipo: "cone", x, y, cor: corCone },
        ]);
        break;
      }
      case "baliza": {
        registarHistorico();
        aplicarElementos([
          ...elementos,
          { id: novoId(), tipo: "baliza", x, y, orientacao: orientacaoBaliza },
        ]);
        break;
      }
      case "escadinha": {
        registarHistorico();
        aplicarElementos([
          ...elementos,
          {
            id: novoId(),
            tipo: "escadinha",
            x,
            y,
            angulo: anguloNovo,
            tamanho: tamanhoEscadinha,
          },
        ]);
        break;
      }
      case "barras": {
        registarHistorico();
        aplicarElementos([
          ...elementos,
          { id: novoId(), tipo: "barras", x, y, angulo: anguloNovo },
        ]);
        break;
      }
      case "arco": {
        registarHistorico();
        aplicarElementos([
          ...elementos,
          { id: novoId(), tipo: "arco", x, y, cor: corArco },
        ]);
        break;
      }
      case "seta":
      case "linha": {
        setCaminhoAtual((c) => [...c, { x, y }]);
        break;
      }
      case "texto": {
        setTextoInline({ x, y });
        break;
      }
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (ferramenta !== "selecionar" || !arrastando) return;
    const coords = drag.paraCoordenadas(e);
    if (!coords) return;
    const info = arrastarPathRef.current;
    if (info) {
      moverPath(arrastando, info, coords);
    } else {
      moverElemento(arrastando, coords.x, coords.y);
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (arrastando) {
      // B2: grava o snapshot pré-drag no histórico (uma entrada por drag).
      const snap = drag.snapshotRef.current;
      if (snap) {
        setHistorico((h) => [...h.slice(-30), snap]);
        drag.snapshotRef.current = null;
      }
      drag.terminarCaptura(e);
      setArrastando(null);
      arrastarPathRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      anular();
      return;
    }
    if (e.key === "Escape") {
      setSelecionadoId(null);
      setCaminhoAtual([]);
      return;
    }
    if (!selecionadoId) return;

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      apagarSelecionado();
      return;
    }

    const passoMov = e.shiftKey ? PASSO_TECLADO_FINO : PASSO_TECLADO;
    let dx = 0;
    let dy = 0;
    switch (e.key) {
      case "ArrowUp":
        dy = -passoMov;
        break;
      case "ArrowDown":
        dy = passoMov;
        break;
      case "ArrowLeft":
        dx = -passoMov;
        break;
      case "ArrowRight":
        dx = passoMov;
        break;
      default:
        return;
    }
    e.preventDefault();
    const alvo = elementosRender.find((el) => el.id === selecionadoId);
    if (!alvo) return;
    // Cada movimento por teclado regista um snapshot no histórico.
    if ("x" in alvo) {
      const nx = fixar(alvo.x + dx, CAMPO_W);
      const ny = fixar(alvo.y + dy, CAMPO_H);
      registarHistorico();
      moverElemento(selecionadoId, nx, ny);
      anunciar(`Elemento movido para ${Math.round(nx)}, ${Math.round(ny)}`);
    } else if ("pontos" in alvo && keyframeActivo < 0) {
      // Setas/linhas: transladar todo o trajecto (só na base — não em passos).
      registarHistorico();
      transladarPath(selecionadoId, alvo.pontos, dx, dy);
      anunciar("Trajecto movido");
    }
  }

  function concluirCaminho() {
    // Remove pontos coincidentes consecutivos (ex.: os cliques do duplo-clique de
    // conclusão caem no mesmo sítio) — assim o último segmento nunca fica
    // degenerado e a ponta da seta orienta-se na direção correta (bug das setas
    // para a esquerda que apareciam invertidas).
    const pontos = pontosSemRepetidos(caminhoAtual);
    if (pontos.length < 2) {
      setCaminhoAtual([]);
      return;
    }
    registarHistorico();
    if (ferramenta === "seta") {
      aplicarElementos([
        ...elementos,
        {
          id: novoId(),
          tipo: "seta",
          estilo: estiloSeta,
          cor: "#1A1D29",
          pontos,
        },
      ]);
    } else {
      aplicarElementos([
        ...elementos,
        { id: novoId(), tipo: "linha", cor: "#1A1D29", pontos },
      ]);
    }
    setCaminhoAtual([]);
  }

  function confirmarTexto(conteudo: string) {
    if (textoInline && conteudo.trim()) {
      registarHistorico();
      aplicarElementos([
        ...elementos,
        {
          id: novoId(),
          tipo: "texto",
          x: textoInline.x,
          y: textoInline.y,
          conteudo: conteudo.trim().slice(0, 120),
        },
      ]);
    }
    setTextoInline(null);
  }

  function anular() {
    if (!historico.length) return;
    const anterior = historico[historico.length - 1];
    onChange(anterior);
    setSelecionadoId(null);
    setHistorico((h) => h.slice(0, -1));
    anunciar("Ação anulada");
  }

  function limparTudo() {
    registarHistorico();
    onChange({ versao: 2, elementos: [], passos: [], campo: campoActual });
    setSelecionadoId(null);
    setCaminhoAtual([]);
    setKeyframeActivo(-1);
    anunciar("Diagrama limpo");
  }

  function apagarSelecionado() {
    if (!selecionadoId) return;
    registarHistorico();
    aplicarElementos(elementos.filter((el) => el.id !== selecionadoId));
    setSelecionadoId(null);
    anunciar("Elemento apagado");
  }

  // Muda a cor de um cone já colocado (via selecção). Atualiza também a cor
  // ativa da ferramenta para o próximo cone a colocar.
  function mudarCorCone(id: string, cor: CorCone) {
    registarHistorico();
    aplicarElementos(
      elementos.map((el) =>
        el.id === id && el.tipo === "cone" ? { ...el, cor } : el,
      ),
    );
    setCorCone(cor);
    anunciar(`Cor do cone alterada para ${cor}`);
  }

  // Muda a cor de um arco já colocado (via selecção). Atualiza também a cor
  // ativa da ferramenta para o próximo arco a colocar.
  function mudarCorArco(id: string, cor: CorArco) {
    registarHistorico();
    aplicarElementos(
      elementos.map((el) =>
        el.id === id && el.tipo === "arco" ? { ...el, cor } : el,
      ),
    );
    setCorArco(cor);
    anunciar(`Cor do arco alterada para ${cor}`);
  }

  // Roda uma escadinha/barras já colocada (via selecção). Atualiza também o
  // ângulo ativo da ferramenta para o próximo elemento a colocar.
  function mudarAnguloElemento(id: string, angulo: number) {
    registarHistorico();
    aplicarElementos(
      elementos.map((el) =>
        el.id === id && (el.tipo === "escadinha" || el.tipo === "barras")
          ? { ...el, angulo }
          : el,
      ),
    );
    setAnguloNovo(angulo);
    anunciar(`Elemento rodado para ${angulo}°`);
  }

  // Muda o tamanho de uma escadinha já colocada (via selecção).
  function mudarTamanhoEscadinha(id: string, tamanho: TamanhoEscadinha) {
    registarHistorico();
    aplicarElementos(
      elementos.map((el) =>
        el.id === id && el.tipo === "escadinha" ? { ...el, tamanho } : el,
      ),
    );
    setTamanhoEscadinha(tamanho);
    anunciar(`Tamanho da escadinha alterado para ${tamanho}`);
  }

  function alternarModoAnimacao() {
    setModoAnimacao((v) => {
      const proximo = !v;
      setKeyframeActivo(-1);
      setSelecionadoId(null);
      setCaminhoAtual([]);
      if (proximo) setFerramenta("selecionar");
      return proximo;
    });
  }

  function irParaKeyframe(idx: number) {
    setKeyframeActivo(idx);
    setSelecionadoId(null);
    setCaminhoAtual([]);
    if (idx >= 0) setFerramenta("selecionar");
  }

  function adicionarPasso() {
    registarHistorico();
    const novo: PassoAnimacao = {
      id: novoId(),
      ordem: passos.length,
      posicoes: [],
      duracaoMs: DURACAO_PADRAO,
    };
    aplicarPassos([...passos, novo]);
    irParaKeyframe(passos.length);
    anunciar(
      `Passo ${passos.length + 1} adicionado. Arrasta os elementos para o próximo momento.`,
    );
  }

  // Sai do modo animação se todos os passos forem removidos externamente.
  useEffect(() => {
    if (keyframeActivo > passos.length - 1) {
      setKeyframeActivo(Math.min(keyframeActivo, passos.length - 1));
    }
  }, [passos.length, keyframeActivo]);

  const desenhandoCaminho = ferramenta === "seta" || ferramenta === "linha";
  const aEditarPasso = keyframeActivo >= 0;
  const ferramentasVisiveis = !aEditarPasso;

  // Barra de ferramentas: base + "Adversário" (opt-in) logo após "Jogador".
  const ferramentas = permitirAdversario
    ? [
        FERRAMENTAS[0],
        FERRAMENTAS[1],
        FERRAMENTA_ADVERSARIO,
        ...FERRAMENTAS.slice(2),
      ]
    : FERRAMENTAS;

  const elementoSelecionado = selecionadoId
    ? elementosRender.find((el) => el.id === selecionadoId)
    : null;
  const coneSelecionado =
    elementoSelecionado?.tipo === "cone" ? elementoSelecionado : null;
  const escadinhaSelecionada =
    elementoSelecionado?.tipo === "escadinha" ? elementoSelecionado : null;
  const barrasSelecionada =
    elementoSelecionado?.tipo === "barras" ? elementoSelecionado : null;
  const arcoSelecionado =
    elementoSelecionado?.tipo === "arco" ? elementoSelecionado : null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Barra de ferramentas */}
      <div className="flex flex-shrink-0 flex-wrap gap-1.5 lg:w-40 lg:flex-col">
        {ferramentasVisiveis ? (
          ferramentas.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setFerramenta(id);
                setCaminhoAtual([]);
                setSelecionadoId(null);
              }}
              className={`flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-corpo-sec transition-colors ${
                ferramenta === id
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-cinza-200 text-cinza-700 hover:bg-cinza-50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))
        ) : (
          <p className="rounded-md border border-cinza-200 bg-cinza-50 p-3 text-legenda text-cinza-600">
            A editar o passo {keyframeActivo + 1}. Arrasta os elementos para
            definir este momento.
          </p>
        )}

        <div className="mt-2 flex gap-1.5 lg:flex-col">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={anular}
            disabled={!historico.length}
          >
            <Undo2 className="h-4 w-4" />
            Anular
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-vermelho-600"
                disabled={!elementos.length}
              >
                <Trash2 className="h-4 w-4" />
                Limpar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar todo o diagrama?</AlertDialogTitle>
                <AlertDialogDescription>
                  Todos os elementos e passos serão removidos. Podes anular esta
                  ação.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={limparTudo}
                  className="bg-vermelho-600 hover:bg-vermelho-600/90 text-white"
                >
                  Limpar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Campo + controlos contextuais */}
      {/* min-w-0: sem isto, o flex item assume min-width:auto e cresce para
          acomodar a largura intrínseca da timeline de passos (chips flex-shrink-0),
          impedindo o overflow-x-auto de scrollar e ampliando o SVG w-full a cada
          passo adicionado (efeito de "auto-zoom" progressivo). */}
      <div className="min-w-0 flex-1 space-y-3">
        {/* Região de anúncios para leitores de ecrã */}
        <div aria-live="polite" className="sr-only">
          {anuncio}
        </div>

        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CAMPO_W} ${CAMPO_H}`}
            className="w-full h-auto touch-none rounded-md border border-cinza-300"
            tabIndex={0}
            role="application"
            aria-label={`Editor de ${rotuloCampo(fmt)}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onKeyDown={handleKeyDown}
            onDoubleClick={desenhandoCaminho ? concluirCaminho : undefined}
          >
            <defs>
              <SetaMarker id="seta-fantasma" cor="#F5C518" />
            </defs>

            <LinhasCampo formato={fmt} />
            {elementosRender.map((el) => (
              <ElementoSVG
                key={el.id}
                elemento={el}
                selecionado={el.id === selecionadoId}
                focado={el.id === focadoId}
                raioHit={drag.raioHit}
                // Modo animação: setas/linhas não selecionáveis (§11) — desativa a
                // faixa de hit/foco do trajecto para não roubar o clique à bola.
                pathSelecionavel={!modoAnimacao}
                onFocarHit={(id) => {
                  setFocadoId(id);
                  setSelecionadoId(id);
                }}
              />
            ))}

            {/* Setas-fantasma de trajecto (derivadas do delta do passo activo) */}
            {setasFantasma.map((s) => (
              <line
                key={`fantasma-${s.id}`}
                x1={s.from.x}
                y1={s.from.y}
                x2={s.to.x}
                y2={s.to.y}
                stroke="#F5C518"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                markerEnd="url(#seta-fantasma)"
                opacity={0.85}
              />
            ))}

            {/* Caminho em construção */}
            {caminhoAtual.length > 0 && (
              <>
                <path
                  d={caminhoAtual
                    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                    .join(" ")}
                  fill="none"
                  stroke="#F5C518"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
                {caminhoAtual.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={3} fill="#F5C518" />
                ))}
              </>
            )}
          </svg>

          {/* Input de texto inline */}
          {textoInline && (
            <input
              autoFocus
              className="absolute rounded border border-primary bg-white px-2 py-1 text-corpo-sec shadow"
              style={{
                left: `${(textoInline.x / CAMPO_W) * 100}%`,
                top: `${(textoInline.y / CAMPO_H) * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
              placeholder="Texto…"
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  confirmarTexto((e.target as HTMLInputElement).value);
                if (e.key === "Escape") setTextoInline(null);
              }}
              onBlur={(e) => confirmarTexto(e.target.value)}
            />
          )}
        </div>

        <p className="text-legenda text-cinza-400">
          Dica: seleciona um elemento e usa as setas do teclado para o mover
          (Shift = ajuste fino). Delete apaga; Ctrl+Z anula.
        </p>

        {/* Controlos contextuais das ferramentas */}
        {ferramentasVisiveis && (
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-cinza-50 p-3 text-corpo-sec">
            {ferramenta === "adversario" && (
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-5 w-5 rounded-full border-2 border-white"
                  style={{ backgroundColor: "#334155" }}
                  aria-hidden="true"
                />
                <span className="text-cinza-600">
                  Toca no campo para adicionar adversários (token «A»).
                </span>
              </div>
            )}

            {ferramenta === "jogador" && (
              <div className="flex items-center gap-2">
                <span className="text-cinza-600">Cor:</span>
                {CORES_JOGADOR.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    aria-label={c.nome}
                    onClick={() => setCorJogador(c.valor)}
                    className={`h-6 w-6 rounded-full border-2 ${
                      corJogador === c.valor
                        ? "border-cinza-900"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            )}

            {ferramenta === "cone" && (
              <div className="flex items-center gap-2">
                <span className="text-cinza-600">Cor do cone:</span>
                {CONE_CORES.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    aria-label={c.nome}
                    aria-pressed={corCone === c.valor}
                    title={c.nome}
                    onClick={() => setCorCone(c.valor as CorCone)}
                    className={`h-11 w-11 rounded-full border-2 ${
                      corCone === c.valor
                        ? "border-cinza-900"
                        : "border-cinza-300"
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            )}

            {ferramenta === "arco" && (
              <div className="flex items-center gap-2">
                <span className="text-cinza-600">Cor do arco:</span>
                {ARCO_CORES.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    aria-label={c.nome}
                    aria-pressed={corArco === c.valor}
                    title={c.nome}
                    onClick={() => setCorArco(c.valor as CorArco)}
                    className={`h-11 w-11 rounded-full border-2 ${
                      corArco === c.valor
                        ? "border-cinza-900"
                        : "border-cinza-300"
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            )}

            {ferramenta === "seta" && (
              <div className="flex items-center gap-2">
                <span className="text-cinza-600">Estilo:</span>
                {(
                  [
                    { v: "movimento", l: "Movimento (—)" },
                    { v: "passe", l: "Passe (- -)" },
                    { v: "conducao", l: "Condução (~)" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setEstiloSeta(o.v)}
                    className={`rounded border px-2 py-1 ${
                      estiloSeta === o.v
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-cinza-200"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            )}

            {ferramenta === "baliza" && (
              <div className="flex items-center gap-2">
                <span className="text-cinza-600">Orientação:</span>
                {(
                  [
                    { v: "vertical", l: "Vertical" },
                    { v: "horizontal", l: "Horizontal" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setOrientacaoBaliza(o.v)}
                    className={`rounded border px-2 py-1 ${
                      orientacaoBaliza === o.v
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-cinza-200"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            )}

            {ferramenta === "escadinha" && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-cinza-600">Tamanho:</span>
                  {TAMANHOS_ESCADINHA.map((t) => (
                    <button
                      key={t.valor}
                      type="button"
                      aria-pressed={tamanhoEscadinha === t.valor}
                      onClick={() => setTamanhoEscadinha(t.valor)}
                      className={`min-h-11 rounded border px-3 py-1 ${
                        tamanhoEscadinha === t.valor
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-cinza-200"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-cinza-600">Rotação:</span>
                  {ANGULOS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={anguloNovo === a}
                      aria-label={`Rodar ${a} graus`}
                      onClick={() => setAnguloNovo(a)}
                      className={`min-h-11 min-w-11 rounded border px-2 py-1 ${
                        anguloNovo === a
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-cinza-200"
                      }`}
                    >
                      {a}°
                    </button>
                  ))}
                </div>
              </>
            )}

            {ferramenta === "barras" && (
              <div className="flex items-center gap-2">
                <span className="text-cinza-600">Rotação:</span>
                {ANGULOS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={anguloNovo === a}
                    aria-label={`Rodar ${a} graus`}
                    onClick={() => setAnguloNovo(a)}
                    className={`min-h-11 min-w-11 rounded border px-2 py-1 ${
                      anguloNovo === a
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-cinza-200"
                    }`}
                  >
                    {a}°
                  </button>
                ))}
              </div>
            )}

            {desenhandoCaminho && (
              <div className="flex items-center gap-2">
                <span className="text-cinza-600">
                  {caminhoAtual.length === 0
                    ? "Toca no campo para adicionar pontos"
                    : `${caminhoAtual.length} ponto(s) — duplo-clique ou concluir`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={concluirCaminho}
                  disabled={caminhoAtual.length < 2}
                >
                  <Check className="h-4 w-4" />
                  Concluir
                </Button>
                {caminhoAtual.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setCaminhoAtual([])}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            )}

            {ferramenta === "selecionar" && coneSelecionado && (
              <div className="flex items-center gap-2">
                <span className="text-cinza-600">Cor do cone:</span>
                {CONE_CORES.map((c) => {
                  const ativa =
                    (coneSelecionado.cor ?? CONE_COR_DEFAULT) === c.valor;
                  return (
                    <button
                      key={c.valor}
                      type="button"
                      aria-label={c.nome}
                      aria-pressed={ativa}
                      title={c.nome}
                      onClick={() =>
                        mudarCorCone(coneSelecionado.id, c.valor as CorCone)
                      }
                      className={`h-11 w-11 rounded-full border-2 ${
                        ativa ? "border-cinza-900" : "border-cinza-300"
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  );
                })}
              </div>
            )}

            {ferramenta === "selecionar" && arcoSelecionado && (
              <div className="flex items-center gap-2">
                <span className="text-cinza-600">Cor do arco:</span>
                {ARCO_CORES.map((c) => {
                  const ativa =
                    (arcoSelecionado.cor ?? ARCO_COR_DEFAULT) === c.valor;
                  return (
                    <button
                      key={c.valor}
                      type="button"
                      aria-label={c.nome}
                      aria-pressed={ativa}
                      title={c.nome}
                      onClick={() =>
                        mudarCorArco(arcoSelecionado.id, c.valor as CorArco)
                      }
                      className={`h-11 w-11 rounded-full border-2 ${
                        ativa ? "border-cinza-900" : "border-cinza-300"
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  );
                })}
              </div>
            )}

            {ferramenta === "selecionar" && escadinhaSelecionada && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-cinza-600">Tamanho:</span>
                  {TAMANHOS_ESCADINHA.map((t) => {
                    const ativa = escadinhaSelecionada.tamanho === t.valor;
                    return (
                      <button
                        key={t.valor}
                        type="button"
                        aria-pressed={ativa}
                        onClick={() =>
                          mudarTamanhoEscadinha(escadinhaSelecionada.id, t.valor)
                        }
                        className={`min-h-11 rounded border px-3 py-1 ${
                          ativa
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-cinza-200"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <RotateCw className="h-4 w-4 text-cinza-600" />
                  <span className="text-cinza-600">Rotação:</span>
                  {ANGULOS.map((a) => {
                    const ativa = escadinhaSelecionada.angulo === a;
                    return (
                      <button
                        key={a}
                        type="button"
                        aria-pressed={ativa}
                        aria-label={`Rodar ${a} graus`}
                        onClick={() =>
                          mudarAnguloElemento(escadinhaSelecionada.id, a)
                        }
                        className={`min-h-11 min-w-11 rounded border px-2 py-1 ${
                          ativa
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-cinza-200"
                        }`}
                      >
                        {a}°
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {ferramenta === "selecionar" && barrasSelecionada && (
              <div className="flex items-center gap-2">
                <RotateCw className="h-4 w-4 text-cinza-600" />
                <span className="text-cinza-600">Rotação:</span>
                {ANGULOS.map((a) => {
                  const ativa = barrasSelecionada.angulo === a;
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={ativa}
                      aria-label={`Rodar ${a} graus`}
                      onClick={() =>
                        mudarAnguloElemento(barrasSelecionada.id, a)
                      }
                      className={`min-h-11 min-w-11 rounded border px-2 py-1 ${
                        ativa
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-cinza-200"
                      }`}
                    >
                      {a}°
                    </button>
                  );
                })}
              </div>
            )}

            {ferramenta === "selecionar" && selecionadoId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-vermelho-600"
                onClick={apagarSelecionado}
              >
                <Trash2 className="h-4 w-4" />
                Apagar selecionado
              </Button>
            )}

            {ferramenta === "selecionar" && !selecionadoId && (
              <span className="text-cinza-500">
                Toca num elemento para o selecionar e arrastar.
              </span>
            )}
          </div>
        )}

        {/* Animação (secção 11) */}
        <div className="space-y-3 rounded-md border border-cinza-200 p-3 text-corpo-sec">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={modoAnimacao ? "default" : "outline"}
              onClick={alternarModoAnimacao}
              aria-pressed={modoAnimacao}
              disabled={!temPontos && !modoAnimacao}
            >
              <Film className="h-4 w-4" />
              {modoAnimacao ? "Modo animação ativo" : "Animar (A→B)"}
            </Button>
            {modoAnimacao && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={adicionarPasso}
                disabled={!temPontos}
              >
                <Plus className="h-4 w-4" />
                Adicionar passo
              </Button>
            )}
            <span className="text-cinza-500">{passos.length} passo(s)</span>
          </div>

          {modoAnimacao && (
            <>
              <TimelinePassos
                passos={passos}
                keyframeActivo={keyframeActivo}
                onChange={(novos) => {
                  registarHistorico();
                  aplicarPassos(novos);
                }}
                onKeyframeChange={irParaKeyframe}
              />
              <p className="text-legenda text-cinza-400">
                Seleciona <strong>Início</strong> (posição base) ou um passo e
                arrasta os elementos. Cada passo guarda apenas o que muda; as
                setas-fantasma mostram o movimento a partir do passo anterior.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
