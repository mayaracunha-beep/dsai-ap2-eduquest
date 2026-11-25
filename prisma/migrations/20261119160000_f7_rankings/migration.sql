-- D11 (SPEC/2026-11-19-rankings.md §3): privacidade em rankings e índices de consulta

-- CreateEnum
CREATE TYPE "ParticipacaoRanking" AS ENUM ('anonimo', 'apelido', 'oculto');

-- CreateTable
CREATE TABLE "config_ranking" (
    "usuario_id" UUID NOT NULL,
    "participacao" "ParticipacaoRanking" NOT NULL DEFAULT 'anonimo',
    "apelido" VARCHAR(30),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_ranking_pkey" PRIMARY KEY ("usuario_id"),
    -- R-RK6: apelido obrigatório e não vazio quando a participação é por apelido
    CONSTRAINT "config_ranking_apelido_obrigatorio" CHECK (
        "participacao" <> 'apelido' OR ("apelido" IS NOT NULL AND length(btrim("apelido")) > 0)
    )
);

-- CreateIndex
CREATE INDEX "evento_xp_concedido_em_idx" ON "evento_xp"("concedido_em");

-- CreateIndex
CREATE INDEX "evento_xp_curso_id_concedido_em_idx" ON "evento_xp"("curso_id", "concedido_em");

-- AddForeignKey
ALTER TABLE "config_ranking" ADD CONSTRAINT "config_ranking_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
