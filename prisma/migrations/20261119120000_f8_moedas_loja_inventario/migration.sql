-- D12 (SPEC/2026-11-19-moedas-loja-inventario.md §5): moedas, loja e inventário

-- CreateEnum
CREATE TYPE "OrigemMoeda" AS ENUM ('xp', 'compra');

-- CreateEnum
CREATE TYPE "CategoriaItem" AS ENUM ('moldura', 'titulo');

-- CreateTable
CREATE TABLE "saldo_moeda" (
    "usuario_id" UUID NOT NULL,
    "saldo" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saldo_moeda_pkey" PRIMARY KEY ("usuario_id"),
    -- R-M2: saldo nunca negativo, garantido também pelo banco
    CONSTRAINT "saldo_moeda_saldo_nao_negativo" CHECK ("saldo" >= 0)
);

-- CreateTable
CREATE TABLE "evento_moeda" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "origem" "OrigemMoeda" NOT NULL,
    "referencia_id" UUID,
    "chave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_moeda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_loja" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" "CategoriaItem" NOT NULL,
    "preco" INTEGER NOT NULL,
    "estoque" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_loja_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "item_loja_preco_nao_negativo" CHECK ("preco" >= 0),
    CONSTRAINT "item_loja_estoque_nao_negativo" CHECK ("estoque" IS NULL OR "estoque" >= 0)
);

-- CreateTable
CREATE TABLE "item_inventario" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "equipado" BOOLEAN NOT NULL DEFAULT false,
    "adquirido_em" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evento_moeda_usuario_id_chave_key" ON "evento_moeda"("usuario_id", "chave");

-- CreateIndex
CREATE INDEX "evento_moeda_usuario_id_criado_em_idx" ON "evento_moeda"("usuario_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "item_loja_codigo_key" ON "item_loja"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "item_loja_ordem_key" ON "item_loja"("ordem");

-- CreateIndex
CREATE UNIQUE INDEX "item_inventario_usuario_id_item_id_key" ON "item_inventario"("usuario_id", "item_id");

-- CreateIndex
CREATE INDEX "item_inventario_item_id_idx" ON "item_inventario"("item_id");

-- AddForeignKey
ALTER TABLE "saldo_moeda" ADD CONSTRAINT "saldo_moeda_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_moeda" ADD CONSTRAINT "evento_moeda_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_inventario" ADD CONSTRAINT "item_inventario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_inventario" ADD CONSTRAINT "item_inventario_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Catálogo inicial (SPEC §4.1): 4 molduras e 4 títulos, estoque ilimitado
INSERT INTO "item_loja" ("id", "codigo", "nome", "descricao", "categoria", "preco", "estoque", "ativo", "ordem", "atualizado_em") VALUES
  (gen_random_uuid(), 'moldura-bronze', 'Moldura Bronze', 'Moldura simples em bronze para o avatar.', 'moldura', 20, NULL, true, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'moldura-prata', 'Moldura Prata', 'Moldura em prata polida.', 'moldura', 40, NULL, true, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'moldura-ouro', 'Moldura Ouro', 'Moldura dourada para quem não para de evoluir.', 'moldura', 80, NULL, true, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'moldura-galaxia', 'Moldura Galáxia', 'Moldura com estrelas, a mais rara da loja.', 'moldura', 120, NULL, true, 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'titulo-explorador', 'Título Explorador', 'Para quem está começando a jornada.', 'titulo', 15, NULL, true, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'titulo-estudioso', 'Título Estudioso', 'Para quem estuda com constância.', 'titulo', 30, NULL, true, 6, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'titulo-mestre', 'Título Mestre dos Quizzes', 'Para quem domina os exercícios.', 'titulo', 60, NULL, true, 7, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'titulo-lenda', 'Título Lenda do EduQuest', 'O título mais disputado da plataforma.', 'titulo', 150, NULL, true, 8, CURRENT_TIMESTAMP);
