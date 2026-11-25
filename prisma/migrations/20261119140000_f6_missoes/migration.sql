-- D9 (SPEC/2026-11-19-missoes.md §4): missões e seus cumprimentos

-- AlterEnum
ALTER TYPE "OrigemMoeda" ADD VALUE 'missao';

-- CreateEnum
CREATE TYPE "TipoMissao" AS ENUM ('aulas_concluidas', 'questoes_acertadas', 'avaliacoes_entregues', 'xp_ganho');

-- CreateTable
CREATE TABLE "missao" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoMissao" NOT NULL,
    "meta" INTEGER NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "recompensa_moedas" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "curso_id" UUID,
    "criador_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "missao_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "missao_meta_positiva" CHECK ("meta" > 0),
    CONSTRAINT "missao_recompensa_nao_negativa" CHECK ("recompensa_moedas" >= 0),
    CONSTRAINT "missao_janela_valida" CHECK ("fim" > "inicio")
);

-- CreateTable
CREATE TABLE "cumprimento_missao" (
    "id" UUID NOT NULL,
    "missao_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "moedas" INTEGER NOT NULL,
    "cumprida_em" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cumprimento_missao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "missao_ativa_inicio_fim_idx" ON "missao"("ativa", "inicio", "fim");

-- CreateIndex
CREATE INDEX "missao_curso_id_idx" ON "missao"("curso_id");

-- CreateIndex
CREATE INDEX "missao_criador_id_idx" ON "missao"("criador_id");

-- CreateIndex
CREATE INDEX "cumprimento_missao_usuario_id_idx" ON "cumprimento_missao"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "cumprimento_missao_missao_id_usuario_id_key" ON "cumprimento_missao"("missao_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "missao" ADD CONSTRAINT "missao_curso_id_fkey" FOREIGN KEY ("curso_id") REFERENCES "curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missao" ADD CONSTRAINT "missao_criador_id_fkey" FOREIGN KEY ("criador_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cumprimento_missao" ADD CONSTRAINT "cumprimento_missao_missao_id_fkey" FOREIGN KEY ("missao_id") REFERENCES "missao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cumprimento_missao" ADD CONSTRAINT "cumprimento_missao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
