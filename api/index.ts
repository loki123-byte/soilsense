import { createServer } from "../server";

// Export the Express app directly — Vercel will call this as a standard Node handler
// createServer returns an Express application which is a function (req, res) compatible with Vercel.
const app = createServer();

export default app;
