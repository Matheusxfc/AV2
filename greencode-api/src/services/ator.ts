import { PapelUsuario } from '../domain/enums';

/** Usuario autenticado que executa a operacao (extraido do JWT). */
export interface Ator {
  id: string;
  usuario: string;
  papel: PapelUsuario;
}
