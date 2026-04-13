import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./logger.js";
import { metricsMiddleware, getMetrics } from "./metrics.js";

// =======================
// Helpers
// =======================

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function isStringOrUndefined(v) {
  return v === undefined || typeof v === "string";
}

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id. Expected a positive integer." });
    return null;
  }
  return id;
}

export function createApp({ pool }) {
  const app = express();
  
  // Middleware setup
  app.use(express.json());
  app.use(
    pinoHttp(
      {
        logger,
        customSuccessMessage: (req, res) => {
          if (res.statusCode >= 400) {
            return `${req.method} ${req.url} - ${res.statusCode}`;
          }
          return `${req.method} ${req.url} - ${res.statusCode}`;
        },
        customErrorMessage: (req, res, error) => {
          return `${req.method} ${req.url} - ${res.statusCode} - ${error.message}`;
        },
        customLogLevel: (req, res) => {
          if (res.statusCode >= 500) return "error";
          if (res.statusCode >= 400) return "warn";
          return "info";
        },
      },
      logger,
    ),
  );
  app.use(metricsMiddleware());

  // =======================
  // Healthcheck
  // =======================

  app.get("/health", async (req, res) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({
        status: "OK",
        database: "connected",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error("Health check failed: database connection error", {
        error: err.message,
      });
      res.status(503).json({
        status: "ERROR",
        database: "disconnected",
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get("/metrics", async (_, res) => {
    res.set("Content-Type", "text/plain; version=0.0.4");
    res.end(await getMetrics());
  });

  // =======================
  // CRUD NOTES
  // =======================

  // GET /notes
  app.get("/notes", async (_, res) => {
    logger.info("Fetching all notes");

    const result = await pool.query(
      "SELECT * FROM notes ORDER BY created_at DESC",
    );
    res.json(result.rows);
  });

  // POST /notes
  app.post("/notes", async (req, res) => {
    const { title, content } = req.body;

    logger.info("Creating note", { title });

    if (!isNonEmptyString(title)) {
      logger.warn("Note creation failed: title is required", { title });
      return res.status(400).json({
        error: "title is required",
      });
    }

    const result = await pool.query(
      "INSERT INTO notes (title, content) VALUES ($1, $2) RETURNING *",
      [title, content],
    );

    logger.info("Note created", { id: result.rows[0].id });

    res.status(201).json(result.rows[0]);
  });

  // PUT /notes/:id
  app.put("/notes/:id", async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;

    const { title, content } = req.body;

    logger.info("Updating note", { id });

    if (!isNonEmptyString(title)) {
      logger.warn("Note update failed: title is required", { id, title });
      return res.status(400).json({
        error: "title is required and must be a non-empty string",
      });
    }

    if (!isStringOrUndefined(content)) {
      logger.warn("Note update failed: content must be a string", { id, content });
      return res.status(400).json({
        error: "content must be a string if provided",
      });
    }

    const result = await pool.query(
      `
    UPDATE notes
    SET title = $1,
        content = $2
    WHERE id = $3
    RETURNING *
    `,
      [title.trim(), content ?? "", id],
    );

    if (result.rows.length === 0) {
      logger.warn("Note not found for update", { id });
      return res.status(404).json({ error: "note not found" });
    }

    logger.info("Note updated", { id });

    res.json(result.rows[0]);
  });

  // GET /notes/:id
  app.get("/notes/:id", async (req, res) => {
    const { id } = req.params;

    logger.info("Fetching note", { id });

    const result = await pool.query("SELECT * FROM notes WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      logger.warn("Note not found", { id });
      return res.status(404).json({ error: "note not found" });
    }

    res.json(result.rows[0]);
  });

  // DELETE /notes/:id
  app.delete("/notes/:id", async (req, res) => {
    const { id } = req.params;

    logger.info("Deleting note", { id });

    const result = await pool.query(
      "DELETE FROM notes WHERE id = $1 RETURNING *",
      [id],
    );

    if (result.rows.length === 0) {
      logger.warn("Note not found for deletion", { id });
      return res.status(404).json({ error: "note not found" });
    }

    logger.info("Note deleted", { id });

    res.status(204).send();
  });

  // =======================
  // Not found handler
  // =======================

  app.use((req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });

  return app;
}
