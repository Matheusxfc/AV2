import { Db } from '../infra/prisma';
import { paraJson } from '../shared/util';

export class ParametroRepository {
  constructor(private readonly db: Db) {}
  com(tx: Db): ParametroRepository {
    return new ParametroRepository(tx);
  }

  listar() {
    return this.db.parametro.findMany({ orderBy: { chave: 'asc' } });
  }
  obter(chave: string) {
    return this.db.parametro.findUnique({ where: { chave } });
  }
  salvar(chave: string, valor: unknown) {
    const json = paraJson(valor);
    return this.db.parametro.upsert({ where: { chave }, create: { chave, valor: json }, update: { valor: json } });
  }
}
