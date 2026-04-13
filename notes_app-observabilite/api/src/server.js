import { createApp } from "./app.js";
import { createPoolFromEnv, waitForDb } from "./db.js";
import { logger } from "./logger.js";

const pool = createPoolFromEnv();
await waitForDb(pool);

const app = createApp({ pool });

// =======================
// Start server
// =======================

const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info(`API is running on port ${port}`);
});
