import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleGeminiChat } from "./routes/gemini-chat";
import { handleWeather } from "./routes/weather";
import { handleNews } from "./routes/news";
import { getHistory, putHistory } from "./routes/history";
import { handleProxy } from "./routes/proxy";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = require("./config").config.PING_MESSAGE || "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);
  app.post("/api/ai/chat", handleGeminiChat);
  app.get("/api/weather", handleWeather);
  app.get("/api/news", handleNews);
  app.all("/api/proxy", handleProxy);
  // History API (ephemeral) for future DB integration
  app.get("/api/history", getHistory);
  app.post("/api/history", putHistory);
  app.get("/api/ai/status", (_req, res) => {
    const cfg = require("./config").config;
    res.json({
      gemini: Boolean(cfg.GOOGLE_GEMINI_API_KEY),
      perplexity: Boolean(cfg.PERPLEXITY_API_KEY),
    });
  });

  return app;
}
