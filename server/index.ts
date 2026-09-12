import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleGeminiChat } from "./routes/gemini-chat";
import { handleWeather } from "./routes/weather";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);
  app.post("/api/ai/chat", handleGeminiChat);
  app.get("/api/weather", handleWeather);
  app.get("/api/ai/status", (_req, res) => {
    res.json({
      gemini: Boolean(process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY),
      pplx: Boolean(process.env.PPLX_API_KEY),
    });
  });

  return app;
}
