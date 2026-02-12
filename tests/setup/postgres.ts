import path from "node:path";
import { execSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach } from "vitest";
import { GenericContainer, Wait } from "testcontainers";

import { setDefaultTestEnv } from "./env-defaults";

setDefaultTestEnv();

let prisma: PrismaClient | null = null;
let startedContainer: Awaited<ReturnType<GenericContainer["start"]>> | null = null;

const runMigrations = (databaseUrl: string) => {
  const schemaPath = path.resolve(process.cwd(), "apps/web/src/db/prisma/schema.prisma");
  execSync(`npx prisma migrate deploy --schema ${schemaPath}`, {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
    },
  });
};

const truncateTables = async () => {
  if (!prisma) {
    return;
  }

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;

  if (!tables.length) {
    return;
  }

  const tableList = tables
    .map(({ tablename }) => `"public"."${tablename}"`)
    .join(", ");

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
};

const container = new GenericContainer("postgres:16-alpine")
  .withEnvironment({
    POSTGRES_USER: "postgres",
    POSTGRES_PASSWORD: "postgres",
    POSTGRES_DB: "rowbook_test",
  })
  .withExposedPorts(5432)
  .withWaitStrategy(Wait.forLogMessage("database system is ready to accept connections"));

startedContainer = await container.start();
const databaseUrl = `postgresql://postgres:postgres@${startedContainer.getHost()}:${startedContainer.getMappedPort(5432)}/rowbook_test?schema=public`;

process.env.DATABASE_URL = databaseUrl;
process.env.DIRECT_URL = databaseUrl;

const prismaGlobal = globalThis as unknown as { prisma?: PrismaClient };
if (prismaGlobal.prisma) {
  await prismaGlobal.prisma.$disconnect();
  delete prismaGlobal.prisma;
}

runMigrations(databaseUrl);

prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl },
  },
});
await prisma.$connect();

afterEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  if (prisma) {
    await prisma.$disconnect();
  }

  if (startedContainer) {
    await startedContainer.stop();
  }
});
