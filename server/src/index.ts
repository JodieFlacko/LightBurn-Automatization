import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, like, sql } from "drizzle-orm";
import { runMigrations } from "./migrate.js";
import { db } from "./db.js";
import { orders, templateRules, assetRules } from "./schema.js";
import { syncOrders } from "./sync.js";
import { generateLightBurnProject } from "./lightburn.js";
import { logger, logError } from "./logger.js";

const app = Fastify({ 
  logger: {
    level: "info",
    stream: {
      write: (msg: string) => {
        try {
          const log = JSON.parse(msg);
          const level = log.level;
          const method = log.req?.method;
          const url = log.req?.url;
          const statusCode = log.res?.statusCode;
          const responseTime = log.responseTime;

          if (method && url) {
            logger.info(
              { method, url, statusCode, responseTime },
              `${method} ${url} ${statusCode || ""} ${responseTime ? `${responseTime}ms` : ""}`
            );
          } else if (log.msg) {
            logger[level >= 50 ? "error" : level >= 40 ? "warn" : "info"](log.msg);
          }
        } catch {
          // Fallback for non-JSON logs
          logger.info(msg.trim());
        }
      },
    },
  },
});

await app.register(cors, { origin: true });

// Serve static files from the public directory (React build output)
// Use process.cwd() to work in both dev and production builds
await app.register(fastifyStatic, {
  root: path.join(process.cwd(), "public"),
  prefix: "/",
});

runMigrations();

logger.info("Victoria Laser App server initializing...");

app.get("/health", async () => ({ ok: true }));

app.post("/sync", async (request, reply) => {
  try {
    logger.info("Sync request received");
    const result = await syncOrders();
    logger.info(
      { 
        added: result.added, 
        duplicates: result.duplicates, 
        deleted: result.deleted, 
        skipped: result.skipped, 
        totalParsed: result.totalParsed 
      },
      "Sync completed successfully"
    );
    return result;
  } catch (error) {
    logError(error, { operation: "sync" });
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

  // Detect color for each order
  const colorRules = await db
    .select()
    .from(assetRules)
    .where(eq(assetRules.assetType, 'color'))
    .all();

  const itemsWithColor = items.map(order => {
    let detectedColor = null;
    if (order.customField) {
      const normalizedField = order.customField.toLowerCase();
      for (const rule of colorRules) {
        if (normalizedField.includes(rule.triggerKeyword.toLowerCase())) {
          detectedColor = rule.value;
          break;
        }
      }
    }
    return { ...order, detectedColor };
  });

  return { items: itemsWithColor, limit, offset };
});

const paramsSchema = z.object({
  orderId: z.string().min(1)
});

const handleLightburn = async (request: { params: unknown }, reply: any) => {
  const { orderId } = paramsSchema.parse(request.params);
  logger.info({ orderId }, "LightBurn generation requested");
  
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.orderId, orderId))
    .limit(1);

  const order = rows[0];
  if (!order) {
    logger.warn({ orderId }, "Order not found in database");
    reply.code(404);
    return { error: "Order not found" };
  }

  logger.info(
    {
      id: order.id,
      orderId: order.orderId,
      sku: order.sku,
      buyerName: order.buyerName,
      status: order.status
    },
    "Order found, proceeding with LightBurn generation"
  );

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
    
    logger.info(
      { 
        orderId: result.orderId, 
        windowsPath: result.windowsPath 
      },
      "LightBurn project generated and launched successfully"
    );
    
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
      logError(error, { orderId, sku: order.sku, errorType: "NO_TEMPLATE_MATCH" });
      reply.code(400);
      return {
        error: `Configuration Required: No template found for SKU '${order.sku || "(none)"}'. Please add a rule in Settings.`,
      };
    }
    
    if (errorMessage.includes("TEMPLATE_FILE_NOT_FOUND")) {
      logError(error, { orderId, errorType: "TEMPLATE_FILE_NOT_FOUND" });
      reply.code(500);
      return {
        error: errorMessage.replace("TEMPLATE_FILE_NOT_FOUND: ", ""),
      };
    }
    
    // Generic error
    logError(error, { orderId, sku: order.sku, operation: "lightburn_generation" });
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

// Asset Rules Management Endpoints

app.get("/settings/asset-rules", async () => {
  const rules = await db
    .select()
    .from(assetRules)
    .orderBy(assetRules.id)
    .all();
  return { rules };
});

app.post("/settings/asset-rules", async (request, reply) => {
  const bodySchema = z.object({
    triggerKeyword: z.string().min(1),
    assetType: z.enum(['image', 'font', 'color']),
    value: z.string().min(1)
  });

  try {
    const { triggerKeyword, assetType, value } = bodySchema.parse(request.body);
    
    const result = await db
      .insert(assetRules)
      .values({
        triggerKeyword,
        assetType,
        value
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

const deleteAssetRuleParamsSchema = z.object({
  id: z.coerce.number().int().min(1)
});

app.delete("/settings/asset-rules/:id", async (request, reply) => {
  try {
    const { id } = deleteAssetRuleParamsSchema.parse(request.params);
    
    await db
      .delete(assetRules)
      .where(eq(assetRules.id, id));
    
    return { success: true };
  } catch (error) {
    reply.code(400);
    return {
      error: error instanceof Error ? error.message : "Invalid request"
    };
  }
});

// Catch-all route for SPA (must be last!)
// This ensures React Router can handle client-side routing
app.setNotFoundHandler(async (request, reply) => {
  // Only serve index.html for navigation requests (not API or assets)
  if (request.method === "GET" && !request.url.startsWith("/api")) {
    return reply.sendFile("index.html");
  }
  
  reply.code(404);
  return { error: "Not found" };
});

const port = Number(process.env.PORT || 3001);

app.listen({ port, host: "0.0.0.0" })
  .then(() => {
    logger.info({ port, host: "0.0.0.0" }, `Server listening on http://0.0.0.0:${port}`);
  })
  .catch((error) => {
    logError(error, { operation: "server_startup" });
    process.exit(1);
  });
