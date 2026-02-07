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
    status: z.enum(["pending", "processing", "printed", "error"]).optional()
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
    // With the new enum-based status, filter by exact match
    conditions.push(eq(orders.status, status));
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
  
  // Fetch the order from database
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
      status: order.status,
      attemptCount: order.attemptCount
    },
    "Order found, validating status"
  );

  // ==================== PHASE 1: PRE-FLIGHT VALIDATION ====================
  
  // Check if order is already being processed
  if (order.status === 'processing') {
    logger.warn(
      { orderId, status: order.status },
      "Order is already being processed by another operator"
    );
    reply.code(409); // Conflict
    return {
      error: "Order is already being processed by another operator. Please wait or refresh to see the latest status.",
      status: order.status,
      attemptCount: order.attemptCount
    };
  }

  // Check if order was already printed (allow retry with warning)
  if (order.status === 'printed') {
    logger.warn(
      { orderId, status: order.status, processedAt: order.processedAt },
      "Order was already printed, allowing retry"
    );
    // Continue processing but we'll return a warning in the response
  }

  // Migrate old configuration errors to new format
  if (order.status === 'error' && order.errorMessage) {
    const configErrorPattern = /no template|configuration required|template.*not found/i;
    const isOldConfigError = configErrorPattern.test(order.errorMessage) && 
                            !order.errorMessage.startsWith('CONFIG_ERROR:');
    
    if (isOldConfigError) {
      logger.info(
        { orderId, oldErrorMessage: order.errorMessage },
        "Migrating old config error to new format"
      );
      
      // Update to new format
      db.update(orders)
        .set({
          errorMessage: `CONFIG_ERROR: ${order.errorMessage}`,
          attemptCount: 999,
          updatedAt: sql`CURRENT_TIMESTAMP`
        })
        .where(eq(orders.orderId, orderId))
        .run();
      
      logger.info({ orderId }, "Migrated old config error to new format");
      
      // Update local order object to reflect migration
      order.errorMessage = `CONFIG_ERROR: ${order.errorMessage}`;
      order.attemptCount = 999;
    }
  }

  // ==================== PHASE 2: SET PROCESSING STATE ====================
  
  logger.info(
    { orderId, previousStatus: order.status, currentAttemptCount: order.attemptCount },
    "Setting order status to 'processing'"
  );

  // Update to 'processing' - DO NOT increment attemptCount here (only in catch block for transient errors)
  const updateResult = await db
    .update(orders)
    .set({
      status: 'processing',
      errorMessage: null, // Clear previous error message
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(eq(orders.orderId, orderId))
    .run();

  if (updateResult.changes === 0) {
    logger.error({ orderId }, "Failed to update order status to 'processing'");
    reply.code(500);
    return { error: "Failed to lock order for processing" };
  }

  logger.info(
    { orderId, status: 'processing', attemptCount: order.attemptCount },
    "Order locked for processing"
  );

  // Resolve the templates directory
  const templatesDir = path.join(process.cwd(), "templates");
  const defaultTemplatePath = path.join(templatesDir, "targhetta-osso-fronte.lbrn2");

  // ==================== PHASE 3: PROCESS WITH VERIFICATION ====================
  
  try {
    logger.info({ orderId, templatePath: defaultTemplatePath }, "Starting LightBurn project generation");
    
    const result = await generateLightBurnProject(order, defaultTemplatePath);
    
    logger.info(
      { 
        orderId: result.orderId, 
        wslPath: result.wslPath,
        windowsPath: result.windowsPath 
      },
      "LightBurn project generated successfully"
    );
    
    // Update the order status to 'printed' with timestamp
    const finalUpdateResult = db
      .update(orders)
      .set({ 
        status: 'printed',
        processedAt: sql`CURRENT_TIMESTAMP`,
        errorMessage: null,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(orders.orderId, orderId))
      .run();

    if (finalUpdateResult.changes === 0) {
      logger.error({ orderId }, "Failed to update order status to 'printed' after successful generation");
    } else {
      logger.info(
        { orderId, status: 'printed', attemptCount: order.attemptCount },
        "Order status updated to 'printed'"
      );
    }
    
    // Step 4: Final state verification logging (success path)
    logger.info(
      { 
        orderId, 
        status: 'printed', 
        attemptCount: order.attemptCount,
        errorType: 'none'
      },
      "Final order state after processing (success)"
    );
    
    return {
      success: true,
      orderId: result.orderId,
      wslPath: result.wslPath,
      windowsPath: result.windowsPath,
      message: "LightBurn project generated and launched successfully",
      warning: order.status === 'printed' ? "This order was already marked as printed. Reprocessed successfully." : undefined
    };
    
  } catch (error) {
    // ==================== PHASE 4: ERROR HANDLING WITH SMART RETRY ====================
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error({ 
      orderId, 
      errorMessage, 
      errorStack: error instanceof Error ? error.stack : undefined 
    }, "generateLightBurnProject failed");
    
    // Classify error type FIRST
    const configErrorPattern = /no template|configuration required|template.*not found/i;
    const isConfigError = configErrorPattern.test(errorMessage);
    
    logger.info({ orderId, isConfigError, errorMessage }, "Error classification result");
    
    // Build update object based on error type
    let updateData;
    
    if (isConfigError) {
      // Configuration error - no retry, requires manual fix
      updateData = {
        status: 'error' as const,
        errorMessage: errorMessage.startsWith('CONFIG_ERROR:') 
          ? errorMessage 
          : 'CONFIG_ERROR: ' + errorMessage,
        attemptCount: 999,
        updatedAt: sql`CURRENT_TIMESTAMP`
      };
      
      logger.warn({ orderId, sku: order.sku }, "Configuration error - requires manual intervention");
    } else {
      // Transient error - use retry logic
      const newAttemptCount = (order.attemptCount || 0) + 1;
      const shouldRetry = newAttemptCount < 3;
      
      updateData = {
        status: shouldRetry ? ('pending' as const) : ('error' as const),
        errorMessage: errorMessage,
        attemptCount: newAttemptCount,
        updatedAt: sql`CURRENT_TIMESTAMP`
      };
      
      logger.info({ orderId, newAttemptCount, shouldRetry }, "Transient error - retry logic applied");
    }
    
    // Execute the database update and WAIT for it
    await db.update(orders)
      .set(updateData)
      .where(eq(orders.orderId, orderId))
      .run();
    
    logger.info({ orderId, finalStatus: updateData.status, attemptCount: updateData.attemptCount }, "Order state updated in database");
    
    // Part 3: Verification logging - query database to confirm update
    const verifyOrder = await db.select()
      .from(orders)
      .where(eq(orders.orderId, orderId))
      .limit(1);
    
    logger.info({ 
      orderId, 
      dbStatus: verifyOrder[0]?.status, 
      dbAttemptCount: verifyOrder[0]?.attemptCount,
      dbErrorMessage: verifyOrder[0]?.errorMessage 
    }, "Database state verification");
    
    // Return appropriate error response
    if (isConfigError) {
      reply.code(400);
    } else {
      reply.code(500);
    }
    
    return { 
      error: errorMessage,
      errorType: isConfigError ? 'configuration' : 'transient',
      status: updateData.status,
      attemptCount: updateData.attemptCount
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

// Retry failed order endpoint
app.post("/orders/:orderId/retry", async (request, reply) => {
  const { orderId } = paramsSchema.parse(request.params);
  logger.info({ orderId }, "Order retry requested");

  // Find the order
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.orderId, orderId))
    .limit(1);

  const order = rows[0];
  if (!order) {
    logger.warn({ orderId }, "Order not found for retry");
    reply.code(404);
    return { error: "Order not found" };
  }

  logger.info(
    { orderId, currentStatus: order.status, attemptCount: order.attemptCount },
    "Order found, validating retry eligibility"
  );

  // Validate that order is not currently processing
  if (order.status === 'processing') {
    logger.warn(
      { orderId, status: order.status },
      "Cannot retry order that is currently processing"
    );
    reply.code(400);
    return {
      error: "Cannot retry order that is currently being processed. Please wait for the current process to complete.",
      status: order.status
    };
  }

  // Validate that order is in error or printed state (allow retry for printed orders too)
  if (order.status !== 'error' && order.status !== 'printed') {
    logger.warn(
      { orderId, status: order.status },
      "Order is not in error or printed state"
    );
    reply.code(400);
    return {
      error: `Order cannot be retried from '${order.status}' status. Only 'error' or 'printed' orders can be retried.`,
      status: order.status
    };
  }

  const previousStatus = order.status;
  const previousAttemptCount = order.attemptCount;

  logger.info(
    { orderId, previousStatus, previousAttemptCount },
    "Resetting order state for retry"
  );

  // Reset the order state
  const updateResult = db
    .update(orders)
    .set({
      status: 'pending',
      errorMessage: null,
      attemptCount: 0,
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(eq(orders.orderId, orderId))
    .run();

  if (updateResult.changes === 0) {
    logger.error({ orderId }, "Failed to reset order state for retry");
    reply.code(500);
    return { error: "Failed to reset order for retry" };
  }

  // Fetch the updated order
  const updatedRows = await db
    .select()
    .from(orders)
    .where(eq(orders.orderId, orderId))
    .limit(1);

  const updatedOrder = updatedRows[0];

  logger.info(
    { orderId, previousStatus, newStatus: updatedOrder.status },
    "Order successfully reset for retry"
  );

  return {
    success: true,
    message: "Order reset successfully and ready for retry",
    order: updatedOrder,
    previousStatus,
    previousAttemptCount
  };
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
