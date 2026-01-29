import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, like, sql } from "drizzle-orm";
import { runMigrations } from "./migrate.js";
import { db } from "./db.js";
import { orders } from "./schema.js";
import { syncOrders } from "./sync.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

runMigrations();

app.get("/health", async () => ({ ok: true }));

app.post("/sync", async (request, reply) => {
  try {
    return await syncOrders();
  } catch (error) {
    request.log.error({ err: error }, "Sync failed");
    reply.code(500);
    return {
      error: error instanceof Error ? error.message : "Sync failed"
    };
  }
});

app.get("/orders", async (request) => {
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    search: z.string().optional(),
    hasCustomField: z.coerce.boolean().optional()
  });

  const { limit, offset, search, hasCustomField } = querySchema.parse(
    request.query ?? {}
  );

  const conditions = [];

  if (search) {
    conditions.push(like(orders.orderId, `%${search}%`));
  }

  if (hasCustomField === true) {
    conditions.push(
      sql`${orders.customField} is not null and ${orders.customField} != ''`
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const items = await db
    .select()
    .from(orders)
    .where(where)
    .limit(limit)
    .offset(offset)
    .orderBy(orders.id);

  return { items, limit, offset };
});

app.post("/orders/:orderId/ezcad", async (request, reply) => {
  const paramsSchema = z.object({
    orderId: z.string().min(1)
  });

  const { orderId } = paramsSchema.parse(request.params);
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.orderId, orderId))
    .limit(1);

  const order = rows[0];
  if (!order) {
    reply.code(404);
    return { error: "Order not found" };
  }

  const outputDir = path.resolve(process.cwd(), "output");
  const filePath = path.join(outputDir, "ezcad_data.txt");
  await fs.mkdir(outputDir, { recursive: true });

  const fileContent = `${order.orderId}, ${order.customField ?? ""}`;
  await fs.writeFile(filePath, fileContent, "utf-8");

  return { filePath };
});

const port = Number(process.env.PORT || 3001);

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
