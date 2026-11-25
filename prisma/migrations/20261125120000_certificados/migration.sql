CREATE TABLE "requisito_certificado" (
  "curso_id" UUID PRIMARY KEY,
  "percentual" INTEGER NOT NULL CHECK ("percentual" BETWEEN 1 AND 100),
  "avaliacao_id" UUID,
  "nota_minima" DECIMAL(4,2),
  CHECK (("avaliacao_id" IS NULL AND "nota_minima" IS NULL) OR
         ("avaliacao_id" IS NOT NULL AND "nota_minima" IS NOT NULL AND "nota_minima" BETWEEN 0 AND 10))
);

CREATE TABLE "certificado" (
  "codigo" UUID PRIMARY KEY,
  "curso_id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "estudante" TEXT NOT NULL,
  "curso" TEXT NOT NULL,
  "emitido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("curso_id", "usuario_id")
);
