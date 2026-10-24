-- Constraints adicionais (CHECK) que o Prisma ainda nao consegue declarar no schema.prisma.
-- Idempotente: pode ser executado varias vezes (npm run db:constraints).
-- Objetivo: garantir NO BANCO que estados inconsistentes nao sejam persistidos,
-- mesmo que alguem grave dados por fora da API.

ALTER TABLE "organizacoes" DROP CONSTRAINT IF EXISTS "chk_organizacoes_cnpj_formato";
ALTER TABLE "organizacoes" ADD CONSTRAINT "chk_organizacoes_cnpj_formato" CHECK ("cnpj" ~ '^[0-9]{14}$');

ALTER TABLE "organizacoes" DROP CONSTRAINT IF EXISTS "chk_organizacoes_versao";
ALTER TABLE "organizacoes" ADD CONSTRAINT "chk_organizacoes_versao" CHECK ("versao" >= 1);

ALTER TABLE "usuarios" DROP CONSTRAINT IF EXISTS "chk_usuarios_versao";
ALTER TABLE "usuarios" ADD CONSTRAINT "chk_usuarios_versao" CHECK ("versao" >= 1);

ALTER TABLE "contratos" DROP CONSTRAINT IF EXISTS "chk_contratos_valor";
ALTER TABLE "contratos" ADD CONSTRAINT "chk_contratos_valor" CHECK ("valorMensal" >= 0);

ALTER TABLE "contratos" DROP CONSTRAINT IF EXISTS "chk_contratos_datas";
ALTER TABLE "contratos" ADD CONSTRAINT "chk_contratos_datas" CHECK ("dataVencimento" > "dataAssinatura");

ALTER TABLE "contratos" DROP CONSTRAINT IF EXISTS "chk_contratos_versao";
ALTER TABLE "contratos" ADD CONSTRAINT "chk_contratos_versao" CHECK ("versao" >= 1);

ALTER TABLE "lotes" DROP CONSTRAINT IF EXISTS "chk_lotes_versao";
ALTER TABLE "lotes" ADD CONSTRAINT "chk_lotes_versao" CHECK ("versao" >= 1);

ALTER TABLE "equipamentos" DROP CONSTRAINT IF EXISTS "chk_equipamentos_peso";
ALTER TABLE "equipamentos" ADD CONSTRAINT "chk_equipamentos_peso" CHECK ("pesoQuilogramas" > 0);

ALTER TABLE "equipamentos" DROP CONSTRAINT IF EXISTS "chk_equipamentos_ano";
ALTER TABLE "equipamentos" ADD CONSTRAINT "chk_equipamentos_ano" CHECK ("anoFabricacao" BETWEEN 1970 AND 2100);

ALTER TABLE "equipamentos" DROP CONSTRAINT IF EXISTS "chk_equipamentos_posicao";
ALTER TABLE "equipamentos" ADD CONSTRAINT "chk_equipamentos_posicao" CHECK ("posicaoNoLote" >= 1);

ALTER TABLE "equipamentos" DROP CONSTRAINT IF EXISTS "chk_equipamentos_versao";
ALTER TABLE "equipamentos" ADD CONSTRAINT "chk_equipamentos_versao" CHECK ("versao" >= 1);

-- Journal imutavel: bloqueia UPDATE e DELETE (somente INSERT e permitido).
CREATE OR REPLACE FUNCTION greencode_journal_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'journal_transacoes e imutavel: % nao permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_imutavel ON "journal_transacoes";
CREATE TRIGGER trg_journal_imutavel
  BEFORE UPDATE OR DELETE ON "journal_transacoes"
  FOR EACH ROW EXECUTE FUNCTION greencode_journal_imutavel();
