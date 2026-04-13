import pino from "pino";
import fs from "fs";
import path from "path";

const logLevel = process.env.LOG_LEVEL || "info";
const logsDir = "./logs";

// Créer le dossier logs s'il n'existe pas
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export const logger = pino(
  {
    level: logLevel,
  },
  pino.transport({
    targets: [
      {
        target: "pino-pretty",
        options: { colorize: true },
      },
      {
        target: "pino/file",
        options: { destination: path.join(logsDir, "app.log") },
      },
    ],
  }),
);
