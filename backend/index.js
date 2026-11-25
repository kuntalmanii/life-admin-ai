import { createApp } from "./app.js";
import { DB_FILE, PORT } from "./config.js";
import { runReminderCheck } from "./reminderJob.js";

console.log(
  `[ENV] Loaded config for user: ${process.env.EMAIL_USER || "Not Set"}`
);

const app = createApp();

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);

  if (process.env.NODE_ENV !== "production") {
    console.log("⏱ Starting local background reminder loop...");
    setInterval(() => {
      runReminderCheck(DB_FILE).catch((err) =>
        console.error("Reminder Loop Error:", err)
      );
    }, 60 * 1000);
  }
});
