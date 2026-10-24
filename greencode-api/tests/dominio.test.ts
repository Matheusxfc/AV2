import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularDepreciacao,
  exigeJustificativa,
  gerarCodigoBarras,
  quedaDeEstado,
  transicaoLoteManualPermitida,
  triagemConcluida,
  validarTransicaoStatus,
} from '../src/domain/regras';
import { EstadoFisico as E, StatusLote as L, StatusRastreamento as S, TipoEquipamento as T } from '../src/domain/enums';

test('queda de estado: mede categorias e exige justificativa a partir de 2', () => {
  assert.equal(quedaDeEstado(E.BOM_ESTADO, E.USADO_LEVE), 1);
  assert.equal(quedaDeEstado(E.BOM_ESTADO, E.DANIFICADO_GRAVE), 4);
  assert.equal(quedaDeEstado(E.USADO_LEVE, E.NOVO), -2);
  assert.equal(exigeJustificativa(E.BOM_ESTADO, E.USADO_LEVE), false); // 1 categoria
  assert.equal(exigeJustificativa(E.BOM_ESTADO, E.USADO_MODERADO), true); // 2 categorias
  assert.equal(exigeJustificativa(E.USADO_LEVE, E.NOVO), false); // melhorou
});

test('maquina de estados: fluxo feliz completo e valido', () => {
  const fluxo = [
    S.AGUARDANDO_TRIAGEM, S.EM_TRIAGEM, S.AGUARDANDO_DESMONTE, S.EM_DESMONTE,
    S.PECAS_REAPROVEITADAS, S.BAIXA_DEFINITIVA,
  ];
  for (let i = 0; i < fluxo.length - 1; i++) {
    assert.equal(validarTransicaoStatus(fluxo[i], fluxo[i + 1]), null, `${fluxo[i]} -> ${fluxo[i + 1]}`);
  }
});

test('regra do enunciado: EM_DESMONTE so apos triagem completa', () => {
  for (const origem of [S.AGUARDANDO_TRIAGEM, S.EM_TRIAGEM]) {
    const msg = validarTransicaoStatus(origem, S.EM_DESMONTE);
    assert.ok(msg && msg.includes('triagem completa'), `esperava bloqueio a partir de ${origem}`);
  }
  assert.equal(validarTransicaoStatus(S.AGUARDANDO_DESMONTE, S.EM_DESMONTE), null);
});

test('maquina de estados: bloqueia saltos, retrocessos e repeticao', () => {
  assert.ok(validarTransicaoStatus(S.AGUARDANDO_TRIAGEM, S.BAIXA_DEFINITIVA));
  assert.ok(validarTransicaoStatus(S.EM_DESMONTE, S.EM_TRIAGEM));
  assert.ok(validarTransicaoStatus(S.BAIXA_DEFINITIVA, S.EM_TRIAGEM));
  assert.ok(validarTransicaoStatus(S.EM_TRIAGEM, S.EM_TRIAGEM));
});

test('triagem do lote: so conclui quando ninguem aguarda/esta em triagem', () => {
  assert.equal(triagemConcluida([]), false);
  assert.equal(triagemConcluida([S.EM_TRIAGEM, S.AGUARDANDO_DESMONTE]), false);
  assert.equal(triagemConcluida([S.AGUARDANDO_TRIAGEM]), false);
  assert.equal(triagemConcluida([S.AGUARDANDO_DESMONTE, S.EM_DESMONTE, S.DESCARTE_SEGURO]), true);
});

test('lote: avancos manuais permitidos', () => {
  assert.equal(transicaoLoteManualPermitida(L.TRIAGEM_CONCLUIDA, L.ENCAMINHADO), true);
  assert.equal(transicaoLoteManualPermitida(L.ENCAMINHADO, L.FINALIZADO), true);
  assert.equal(transicaoLoteManualPermitida(L.RECEBIDO, L.FINALIZADO), false);
  assert.equal(transicaoLoteManualPermitida(L.FINALIZADO, L.RECEBIDO), false);
});

test('codigo de barras: prefixo por tipo, ano e sequencia com 6 digitos', () => {
  assert.equal(gerarCodigoBarras(T.NOTEBOOK, 42, 2026), 'NTB-2026-000042');
  assert.equal(gerarCodigoBarras(T.SERVIDOR, 1234567, 2026), 'SRV-2026-1234567');
});

test('depreciacao linear nunca fica negativa', () => {
  assert.equal(calcularDepreciacao(2024, 0.2, 1000, 2026), 600);
  assert.equal(calcularDepreciacao(2026, 0.2, 1000, 2026), 1000);
  assert.equal(calcularDepreciacao(2010, 0.2, 1000, 2026), 0);
});
