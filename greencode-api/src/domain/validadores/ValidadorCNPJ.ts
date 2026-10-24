import { Validador } from './Validador';

/** CNPJ com digitos verificadores (Modulo 11, Receita Federal). */
export class ValidadorCNPJ extends Validador<string> {
  validar(cnpj: string): boolean {
    const limpo = (cnpj || '').replace(/[^\d]/g, '');

    if (limpo.length !== 14) {
      this.definirErro('CNPJ deve conter 14 digitos numericos.');
      return false;
    }
    if (/^(\d)\1{13}$/.test(limpo)) {
      this.definirErro('CNPJ invalido (todos os digitos identicos).');
      return false;
    }

    const d1 = ValidadorCNPJ.calcularDigito(limpo.substring(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = ValidadorCNPJ.calcularDigito(limpo.substring(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

    if (`${d1}${d2}` !== limpo.substring(12, 14)) {
      this.definirErro('CNPJ invalido: digitos verificadores nao conferem.');
      return false;
    }
    return true;
  }

  static calcularDigito(base: string, pesos: number[]): number {
    const soma = base.split('').reduce((acc, d, i) => acc + parseInt(d, 10) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  /** Monta um CNPJ valido a partir dos 12 primeiros digitos (usado no seed). */
  static completar(base12: string): string {
    const d1 = ValidadorCNPJ.calcularDigito(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = ValidadorCNPJ.calcularDigito(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return `${base12}${d1}${d2}`;
  }

  static normalizar(cnpj: string): string {
    return cnpj.replace(/[^\d]/g, '');
  }

  static formatar(cnpj: string): string {
    return ValidadorCNPJ.normalizar(cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
}
