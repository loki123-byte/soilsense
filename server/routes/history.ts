import type { RequestHandler } from "express";

// In-memory store (ephemeral) as a placeholder for future DB
const store = new Map<string, any[]>();

export const getHistory: RequestHandler = (req, res) => {
  const uid = String(req.query.uid || "guest");
  res.json({ sessions: store.get(uid) || [] });
};

export const putHistory: RequestHandler = (req, res) => {
  const uid = String(req.query.uid || "guest");
  const sessions = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
  store.set(uid, sessions);
  res.json({ ok: true, count: sessions.length });
};
