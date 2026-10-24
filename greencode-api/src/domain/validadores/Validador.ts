/** Classe abstrata (UML): contrato de validacao. Polimorfismo: ValidadorCNPJ, ValidadorDataEntrada. */
export abstract class Validador<T = unknown> {
  private ultimaMensagemErro = '';

  abstract validar(objeto: T): boolean;

  obterMensagemErro(): string {
    return this.ultimaMensagemErro;
  }

  protected definirErro(mensagem: string): void {
    this.ultimaMensagemErro = mensagem;
  }
}
