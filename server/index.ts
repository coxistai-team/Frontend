import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config(); // Load .env variables

const app = express();

// Function to get allowed origins from environment variable
const getAllowedOrigins = (): string[] => {
  const originsFromEnv = process.env.ALLOWED_ORIGINS;
  if (!originsFromEnv) {
    // Default origins if not set
    return [
      "https://www.coxistai.com",
      "http://localhost:5000",
      "http://localhost:5173"
    ];
  }
  return originsFromEnv.split(",").map(origin => origin.trim()).filter(origin => origin);
};

const allowedOrigins = getAllowedOrigins();
console.log("Configured CORS origins:", allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`Origin ${origin} not allowed by CORS`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Add a route to check CORS configuration
app.get('/api/cors-check', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    configured_origins: allowedOrigins,
    request_origin: req.headers.origin
  });
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  const port = process.env.PORT ? parseInt(process.env.PORT) : 5000;
  const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost";

  server.listen({ port, host }, () => {
    console.log(`Server running at http://${host}:${port}`);
  });
})();