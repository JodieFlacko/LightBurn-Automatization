import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, like, sql } from "drizzle-orm";
import { runMigrations } from "./migrate.js";
import { db } from "./db.js";
import { orders, templateRules } from "./schema.js";
import { syncOrders } from "./sync.js";
import { generateLightBurnProject } from "./lightburn.js";

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
    hasCustomField: z.coerce.boolean().optional(),
    status: z.string().optional()
  });

  const { limit, offset, search, hasCustomField, status } = querySchema.parse(
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

  if (status) {
    if (status === 'pending') {
      // Pending means status is null, empty, or explicitly 'pending'
      conditions.push(
        sql`(${orders.status} is null or ${orders.status} = '' or ${orders.status} = 'pending')`
      );
    } else {
      conditions.push(eq(orders.status, status));
    }
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

const paramsSchema = z.object({
  orderId: z.string().min(1)
});

const handleLightburn = async (request: { params: unknown }, reply: any) => {
  const { orderId } = paramsSchema.parse(request.params);
  console.log("\n=== LightBurn Request ===");
  console.log("Requested Order ID:", orderId);
  
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.orderId, orderId))
    .limit(1);

  const order = rows[0];
  if (!order) {
    console.log("Order not found in database");
    reply.code(404);
    return { error: "Order not found" };
  }

  console.log("Order found:", {
    id: order.id,
    orderId: order.orderId,
    sku: order.sku,
    buyerName: order.buyerName,
    status: order.status
  });

  // Resolve the template path
  const templatePath = path.join(
    process.cwd(),
    "templates",
    "LightBurn-Osso-Template.lbrn2"
  );

  // Check if the template exists
  try {
    await fs.access(templatePath);
  } catch (error) {
    reply.code(500);
    return {
      error: "Template file not found",
      templatePath,
    };
  }

  // Generate the LightBurn project
  try {
    const result = await generateLightBurnProject(order, templatePath);
    
    // Update the order status to 'printed'
    await db
      .update(orders)
      .set({ status: 'printed' })
      .where(eq(orders.orderId, orderId));
    
    return {
      success: true,
      orderId: result.orderId,
      wslPath: result.wslPath,
      windowsPath: result.windowsPath,
      message: "LightBurn project generated and launched successfully",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to generate project";
    
    // Check for specific error types
    if (errorMessage.includes("NO_TEMPLATE_MATCH")) {
      console.error("Template configuration missing for SKU:", order.sku);
      reply.code(400);
      return {
        error: `Configuration Required: No template found for SKU '${order.sku || "(none)"}'. Please add a rule in Settings.`,
      };
    }
    
    if (errorMessage.includes("TEMPLATE_FILE_NOT_FOUND")) {
      console.error("Template file not found on disk");
      reply.code(500);
      return {
        error: errorMessage.replace("TEMPLATE_FILE_NOT_FOUND: ", ""),
      };
    }
    
    // Generic error
    console.error("LightBurn generation error:", errorMessage);
    reply.code(500);
    return {
      error: errorMessage,
    };
  }
};

app.post("/orders/:orderId/lightburn", async (request, reply) => {
  return handleLightburn(request, reply);
});

app.post("/orders/:orderId/ezcad", async (request, reply) => {
  const result = await handleLightburn(request, reply);
  return { ...result, warning: "Deprecated; use /lightburn" };
});

// Template Rules Management Endpoints

app.get("/settings/rules", async () => {
  const rules = await db
    .select()
    .from(templateRules)
    .orderBy(templateRules.priority, templateRules.id)
    .all();
  return { rules };
});

app.post("/settings/rules", async (request, reply) => {
  const bodySchema = z.object({
    skuPattern: z.string().min(1),
    templateFilename: z.string().min(1),
    priority: z.number().int().default(0)
  });

  try {
    const { skuPattern, templateFilename, priority } = bodySchema.parse(request.body);
    
    const result = await db
      .insert(templateRules)
      .values({
        skuPattern,
        templateFilename,
        priority
      })
      .returning();
    
    return { success: true, rule: result[0] };
  } catch (error) {
    reply.code(400);
    return {
      error: error instanceof Error ? error.message : "Invalid request body"
    };
  }
});

const deleteRuleParamsSchema = z.object({
  id: z.coerce.number().int().min(1)
});

app.delete("/settings/rules/:id", async (request, reply) => {
  try {
    const { id } = deleteRuleParamsSchema.parse(request.params);
    
    await db
      .delete(templateRules)
      .where(eq(templateRules.id, id));
    
    return { success: true };
  } catch (error) {
    reply.code(400);
    return {
      error: error instanceof Error ? error.message : "Invalid request"
    };
  }
});

const port = Number(process.env.PORT || 3001);

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
