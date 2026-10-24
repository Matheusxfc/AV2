import { Validador } from './Validador';

/**
 * Data de entrada do lote: nao pode ser futura nem anterior a mais de 90 dias.
 * Comparacao em UTC (dia a dia), para o resultado nao depender do fuso horario do servidor.
 * (Na pratica, ha uma tolerancia de algumas horas conforme o fuso do cliente.)
 */
export class ValidadorDataEntrada extends Validador<Date> {
  static readonly LIMITE_DIAS_PASSADO = 90;

  validar(data: Date, agora: Date = new Date()): boolean {
    if (!(data instanceof Date) || isNaN(data.getTime())) {
      this.definirErro('Data de entrada invalida.');
      return false;
    }

    const diaUTC = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const diffDias = (diaUTC(agora) - diaUTC(data)) / 86_400_000;

    if (diffDias < 0) {
      this.definirErro('Data de entrada nao pode ser futura.');
      return false;
    }
    if (diffDias > ValidadorDataEntrada.LIMITE_DIAS_PASSADO) {
      this.definirErro(`Data de entrada nao pode ser anterior a mais de ${ValidadorDataEntrada.LIMITE_DIAS_PASSADO} dias.`);
      return false;
    }
    return true;
  }
}
