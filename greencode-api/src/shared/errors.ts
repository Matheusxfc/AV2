/** Erros de aplicacao -> traduzidos para HTTP pelo error handler (plugins/erros.ts). */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Violacao de regra de negocio (CNPJ invalido, data futura, transicao invalida...). */
export class RegraNegocioError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, 'REGRA_DE_NEGOCIO', message, details);
  }
}
export class NaoAutenticadoError extends AppError {
  constructor(message = 'Nao autenticado.') {
    super(401, 'NAO_AUTENTICADO', message);
  }
}
export class ProibidoError extends AppError {
  constructor(message = 'Papel sem permissao para esta operacao.') {
    super(403, 'PROIBIDO', message);
  }
}
export class NaoEncontradoError extends AppError {
  constructor(entidade: string, id: string) {
    super(404, 'NAO_ENCONTRADO', `${entidade} '${id}' nao encontrado(a).`);
  }
}
export class ConflitoError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'CONFLITO', message, details);
  }
}
/** Bloqueio otimista: o registro foi alterado por outra requisicao. */
export class VersaoConflitoError extends AppError {
  constructor(entidade: string, id: string) {
    super(
      409,
      'CONFLITO_DE_VERSAO',
      `${entidade} '${id}' foi alterado(a) por outra requisicao. Recarregue e tente novamente.`,
    );
  }
}
