import { createApp } from "../backend/app.js";

const app = createApp();

export default function handler(req, res) {
  if (req.url && req.url !== "/" && !req.url.startsWith("/api")) {
    req.url = `/api${req.url.startsWith("/") ? "" : "/"}${req.url}`;
  }
  return app(req, res);
}
