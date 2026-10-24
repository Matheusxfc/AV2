import { EstadoFisico, StatusLote, StatusRastreamento, TipoEquipamento } from './enums';

/**
 * Regras de negocio PURAS (sem banco, sem HTTP). Migradas da Atividade 1 e aprimoradas.
 */

// ---- Estado fisico ---------------------------------------------------------

export const ORDEM_ESTADO: EstadoFisico[] = [
  EstadoFisico.NOVO,
  EstadoFisico.BOM_ESTADO,
  EstadoFisico.USADO_LEVE,
  EstadoFisico.USADO_MODERADO,
  EstadoFisico.DANIFICADO_LEVE,
  EstadoFisico.DANIFICADO_GRAVE,
  EstadoFisico.INSERVIVEL,
];

/** Positivo = piorou N categorias; negativo = melhorou. */
export function quedaDeEstado(atual: EstadoFisico, novo: EstadoFisico): number {
  return ORDEM_ESTADO.indexOf(novo) - ORDEM_ESTADO.indexOf(atual);
}

/** Regra: queda de 2 ou mais categorias exige justificativa textual. */
export function exigeJustificativa(atual: EstadoFisico, novo: EstadoFisico): boolean {
  return quedaDeEstado(atual, novo) >= 2;
}

// ---- Status de rastreamento (maquina de estados do equipamento) ------------

/**
 * Transicoes permitidas. Aprimora a Atividade 1 (que so protegia EM_DESMONTE):
 * agora TODO o ciclo de vida e uma maquina de estados explicita.
 * Regra central do enunciado: EM_DESMONTE so e alcancavel a partir de AGUARDANDO_DESMONTE
 * (isto e, depois de triagem completa).
 */
export const TRANSICOES_STATUS: Record<StatusRastreamento, StatusRastreamento[]> = {
  AGUARDANDO_TRIAGEM: ['EM_TRIAGEM'],
  EM_TRIAGEM: ['AGUARDANDO_DESMONTE', 'DESCARTE_SEGURO'],
  AGUARDANDO_DESMONTE: ['EM_DESMONTE'],
  EM_DESMONTE: ['PECAS_REAPROVEITADAS', 'MATERIAL_RECICLAVEL', 'DESCARTE_SEGURO'],
  PECAS_REAPROVEITADAS: ['BAIXA_DEFINITIVA'],
  MATERIAL_RECICLAVEL: ['BAIXA_DEFINITIVA'],
  DESCARTE_SEGURO: ['BAIXA_DEFINITIVA'],
  BAIXA_DEFINITIVA: [],
};

export function transicaoStatusPermitida(de: StatusRastreamento, para: StatusRastreamento): boolean {
  return TRANSICOES_STATUS[de].includes(para);
}

/** Retorna null se a transicao e valida; caso contrario, a mensagem de erro. */
export function validarTransicaoStatus(de: StatusRastreamento, para: StatusRastreamento): string | null {
  if (de === para) return `O equipamento ja esta no status ${de}.`;
  if (para === StatusRastreamento.EM_DESMONTE && de !== StatusRastreamento.AGUARDANDO_DESMONTE) {
    return `Equipamento so pode ir para EM_DESMONTE apos triagem completa (status atual: ${de}).`;
  }
  if (!transicaoStatusPermitida(de, para)) {
    const permitidas = TRANSICOES_STATUS[de];
    return `Transicao invalida ${de} -> ${para}. Permitidas a partir de ${de}: ${permitidas.length ? permitidas.join(', ') : '(nenhuma)'}.`;
  }
  return null;
}

/** A triagem de um lote esta concluida quando nenhum equipamento aguarda ou esta em triagem. */
export function triagemConcluida(statusEquipamentos: StatusRastreamento[]): boolean {
  return (
    statusEquipamentos.length > 0 &&
    statusEquipamentos.every(
      (s) => s !== StatusRastreamento.AGUARDANDO_TRIAGEM && s !== StatusRastreamento.EM_TRIAGEM,
    )
  );
}

// ---- Status do lote --------------------------------------------------------

/** Avancos MANUAIS de status do lote (RECEBIDO->EM_TRIAGEM e EM_TRIAGEM->TRIAGEM_CONCLUIDA sao automaticos). */
export const TRANSICOES_LOTE_MANUAIS: Partial<Record<StatusLote, StatusLote[]>> = {
  TRIAGEM_CONCLUIDA: ['ENCAMINHADO'],
  ENCAMINHADO: ['FINALIZADO'],
};

export function transicaoLoteManualPermitida(de: StatusLote, para: StatusLote): boolean {
  return (TRANSICOES_LOTE_MANUAIS[de] ?? []).includes(para);
}

// ---- Codigo de barras / depreciacao ----------------------------------------

const PREFIXO_TIPO: Record<TipoEquipamento, string> = {
  COMPUTADOR_MESA: 'CPU',
  NOTEBOOK: 'NTB',
  MONITOR: 'MON',
  IMPRESSORA: 'IMP',
  SERVIDOR: 'SRV',
  ROTEADOR: 'RTD',
  CABO_ESTRUTURADO: 'CAB',
  FONTE_ALIMENTACAO: 'FNT',
};

export function gerarCodigoBarras(tipo: TipoEquipamento, sequencia: number, ano = new Date().getFullYear()): string {
  return `${PREFIXO_TIPO[tipo] ?? 'EQP'}-${ano}-${String(sequencia).padStart(6, '0')}`;
}

/** Depreciacao linear: valor residual = valorOriginal * max(0, 1 - coef * idade). */
export function calcularDepreciacao(
  anoFabricacao: number,
  coeficienteAnual: number,
  valorOriginal: number,
  anoReferencia = new Date().getFullYear(),
): number {
  const idade = Math.max(0, anoReferencia - anoFabricacao);
  const fator = Math.max(0, 1 - coeficienteAnual * idade);
  return Number((valorOriginal * fator).toFixed(2));
}
