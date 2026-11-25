import { createApp } from "../backend/app.js";

const app = createApp();

/**
 * Vercel Serverless handler delegating `/api/*` requests directly to the Express app
 * without starting background timers.
 */
export default function handler(req, res) {
  return app(req, res);
}
