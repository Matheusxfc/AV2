import { JournalRepository, FiltroJournal } from '../repositories/JournalRepository';
import { Pagina, resposta } from '../shared/util';

export class JournalService {
  constructor(private readonly journal: JournalRepository) {}

  async listar(filtro: FiltroJournal, p: Pagina) {
    const { dados, total } = await this.journal.listar(filtro, p.skip, p.take);
    return resposta(dados, total, p);
  }
}
