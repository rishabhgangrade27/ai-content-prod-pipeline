-- CreateEnum
CREATE TYPE "JobFormat" AS ENUM ('VERTICAL', 'LANDSCAPE', 'BOTH');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PLANNING', 'GENERATING', 'RENDERING', 'QA', 'REVIEW', 'APPROVED', 'REJECTED', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "SceneStatus" AS ENUM ('PENDING', 'SCRIPTED', 'ASSETS_READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'MUSIC', 'FINAL');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AttemptVerdict" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "script" TEXT,
    "format" "JobFormat" NOT NULL DEFAULT 'VERTICAL',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "deliveryTarget" TEXT,
    "webhookUrl" TEXT,
    "latestError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "scriptText" TEXT,
    "visualPrompt" TEXT,
    "status" "SceneStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sceneId" TEXT,
    "type" "AssetType" NOT NULL,
    "provider" TEXT,
    "url" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "gateName" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "verdict" "AttemptVerdict",
    "feedback" TEXT,
    "costUsd" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_events" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "units" DECIMAL(12,4) NOT NULL,
    "usdEstimate" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scenes_jobId_order_key" ON "scenes"("jobId", "order");

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
