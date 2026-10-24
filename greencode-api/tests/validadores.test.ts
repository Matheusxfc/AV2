import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidadorCNPJ } from '../src/domain/validadores/ValidadorCNPJ';
import { ValidadorDataEntrada } from '../src/domain/validadores/ValidadorDataEntrada';
import { Validador } from '../src/domain/validadores/Validador';

test('CNPJ: aceita valido (com e sem mascara)', () => {
  const v = new ValidadorCNPJ();
  assert.equal(v.validar('11222333000181'), true);
  assert.equal(v.validar('11.222.333/0001-81'), true);
});

test('CNPJ: rejeita digito verificador errado, repetidos e tamanho incorreto', () => {
  const v = new ValidadorCNPJ();
  assert.equal(v.validar('11222333000182'), false);
  assert.match(v.obterMensagemErro(), /verificadores/);
  assert.equal(v.validar('11111111111111'), false);
  assert.equal(v.validar('123'), false);
  assert.equal(v.validar(''), false);
});

test('CNPJ: completar() gera CNPJ valido e formatar() aplica mascara', () => {
  const cnpj = ValidadorCNPJ.completar('450000000001');
  assert.equal(new ValidadorCNPJ().validar(cnpj), true);
  assert.equal(ValidadorCNPJ.formatar('11222333000181'), '11.222.333/0001-81');
});

test('Data de entrada: hoje e ontem validos; futuro e >90 dias invalidos', () => {
  const v = new ValidadorDataEntrada();
  const agora = new Date('2026-10-21T15:00:00Z');
  assert.equal(v.validar(new Date('2026-10-21T01:00:00Z'), agora), true);
  assert.equal(v.validar(new Date('2026-10-20T00:00:00Z'), agora), true);
  assert.equal(v.validar(new Date('2026-10-22T00:00:00Z'), agora), false);
  assert.match(v.obterMensagemErro(), /futura/);
  assert.equal(v.validar(new Date('2026-07-23T00:00:00Z'), agora), true); // exatamente 90 dias
  assert.equal(v.validar(new Date('2026-07-22T00:00:00Z'), agora), false); // 91 dias
  assert.match(v.obterMensagemErro(), /90 dias/);
  assert.equal(v.validar(new Date('invalida'), agora), false);
});

test('Polimorfismo: validadores concretos sao Validador', () => {
  const lista: Validador<any>[] = [new ValidadorCNPJ(), new ValidadorDataEntrada()];
  assert.ok(lista.every((x) => typeof x.validar === 'function' && typeof x.obterMensagemErro === 'function'));
});
