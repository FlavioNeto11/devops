-- CreateEnum
CREATE TYPE "FinanceScope" AS ENUM ('pj', 'pf');

-- CreateEnum
CREATE TYPE "FinanceKind" AS ENUM ('receita', 'despesa');

-- CreateEnum
CREATE TYPE "CorbamGoal" AS ENUM ('limpa_nome', 'score', 'rating');

-- CreateEnum
CREATE TYPE "CorbamCaseStatus" AS ENUM ('aberto', 'analisando', 'proposta', 'acordo', 'concluido', 'arquivado');

-- CreateTable
CREATE TABLE "finance_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "scope" "FinanceScope" NOT NULL DEFAULT 'pj',
    "kind" "FinanceKind" NOT NULL DEFAULT 'despesa',
    "category" TEXT NOT NULL DEFAULT 'outros',
    "amount" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "counterparty" TEXT,
    "ai_categorized" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corbam_cases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "person_name" TEXT NOT NULL,
    "cpf" TEXT,
    "goal" "CorbamGoal" NOT NULL DEFAULT 'limpa_nome',
    "status" "CorbamCaseStatus" NOT NULL DEFAULT 'aberto',
    "current_score" INTEGER,
    "target_score" INTEGER,
    "rating" TEXT,
    "assigned_to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corbam_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corbam_restrictions" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "bureau" TEXT NOT NULL DEFAULT 'serasa',
    "creditor" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corbam_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corbam_simulations" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "principal" DECIMAL(14,2) NOT NULL,
    "installments" INTEGER NOT NULL,
    "interest_rate" DOUBLE PRECISION NOT NULL,
    "installment_value" DECIMAL(14,2) NOT NULL,
    "total_value" DECIMAL(14,2) NOT NULL,
    "scenario_label" TEXT,
    "generated_by_ai" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corbam_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corbam_letters" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'contestacao',
    "body_text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corbam_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_transactions_organization_id_scope_date_idx" ON "finance_transactions"("organization_id", "scope", "date");

-- CreateIndex
CREATE INDEX "corbam_cases_organization_id_status_idx" ON "corbam_cases"("organization_id", "status");

-- CreateIndex
CREATE INDEX "corbam_restrictions_case_id_idx" ON "corbam_restrictions"("case_id");

-- CreateIndex
CREATE INDEX "corbam_simulations_case_id_idx" ON "corbam_simulations"("case_id");

-- CreateIndex
CREATE INDEX "corbam_letters_case_id_idx" ON "corbam_letters"("case_id");

-- AddForeignKey
ALTER TABLE "corbam_restrictions" ADD CONSTRAINT "corbam_restrictions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "corbam_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corbam_simulations" ADD CONSTRAINT "corbam_simulations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "corbam_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corbam_letters" ADD CONSTRAINT "corbam_letters_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "corbam_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

