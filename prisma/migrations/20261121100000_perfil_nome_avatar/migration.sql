-- SPEC/2026-11-21-nome-avatar-moldura.md §3: nome e avatar opcionais no usuário

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN "nome" VARCHAR(60),
ADD COLUMN "avatar" VARCHAR(30);

-- R-AV2: nome, quando informado, não pode ser vazio
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_nome_nao_vazio" CHECK ("nome" IS NULL OR length(btrim("nome")) > 0);
