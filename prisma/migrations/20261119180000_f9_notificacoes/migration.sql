-- D13 (SPEC/2026-11-19-notificacoes.md §4): notificações in-app e preferências

-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('conquista_desbloqueada', 'missao_cumprida', 'item_comprado', 'nivel_alcancado');

-- CreateTable
CREATE TABLE "notificacao" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "referencia_id" UUID,
    "chave" TEXT NOT NULL,
    "lida_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferencia_notificacao" (
    "usuario_id" UUID NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "ativa" BOOLEAN NOT NULL,

    CONSTRAINT "preferencia_notificacao_pkey" PRIMARY KEY ("usuario_id", "tipo")
);

-- CreateIndex
CREATE UNIQUE INDEX "notificacao_usuario_id_chave_key" ON "notificacao"("usuario_id", "chave");

-- CreateIndex
CREATE INDEX "notificacao_usuario_id_lida_em_criado_em_idx" ON "notificacao"("usuario_id", "lida_em", "criado_em");

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferencia_notificacao" ADD CONSTRAINT "preferencia_notificacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
