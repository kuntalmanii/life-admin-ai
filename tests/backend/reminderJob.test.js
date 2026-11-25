// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readDB } from "../../backend/db.js";
import { runReminderCheck } from "../../backend/reminderJob.js";

describe("runReminderCheck", () => {
  let tmpDir;
  let dbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scap-reminder-test-"));
    dbPath = path.join(tmpDir, "db.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sends reminders only within 30-min window and enforces 2-hour cooldown", async () => {
    const now = new Date("2026-11-25T12:00:00.000Z");

    const seed = [
      {
        mintAddress: "due-soon",
        service: "Submit report",
        email: "alice@example.com",
        status: "PENDING",
        renewalDate: "2026-11-25T12:20:00.000Z", // 20 mins left -> SEND
        lastNotified: null,
      },
      {
        mintAddress: "too-far",
        service: "Far task",
        email: "bob@example.com",
        status: "PENDING",
        renewalDate: "2026-11-25T12:45:00.000Z", // 45 mins left -> SKIP
        lastNotified: null,
      },
      {
        mintAddress: "expired",
        service: "Past task",
        email: "carol@example.com",
        status: "PENDING",
        renewalDate: "2026-11-25T11:50:00.000Z", // -10 mins -> SKIP
        lastNotified: null,
      },
      {
        mintAddress: "in-cooldown",
        service: "Recently notified",
        email: "dave@example.com",
        status: "PENDING",
        renewalDate: "2026-11-25T12:15:00.000Z", // 15 mins left, notified 60m ago -> SKIP
        lastNotified: "2026-11-25T11:00:00.000Z",
      },
      {
        mintAddress: "cooldown-elapsed",
        service: "Cooldown over",
        email: "eve@example.com",
        status: "PENDING",
        renewalDate: "2026-11-25T12:10:00.000Z", // 10 mins left, notified 2h10m ago -> SEND
        lastNotified: "2026-11-25T09:50:00.000Z",
      },
      {
        mintAddress: "already-submitted",
        service: "Done proof",
        email: "frank@example.com",
        status: "PROOF_SUBMITTED",
        renewalDate: "2026-11-25T12:10:00.000Z", // not PENDING -> SKIP
        lastNotified: null,
      },
    ];

    fs.writeFileSync(dbPath, JSON.stringify(seed, null, 2));

    const sendEmailFn = vi.fn(async () => ({ messageId: "ok" }));
    await runReminderCheck(dbPath, { sendEmailFn, now });

    expect(sendEmailFn).toHaveBeenCalledTimes(2);
    const recipients = sendEmailFn.mock.calls.map((c) => c[0].to);
    expect(recipients).toEqual(["alice@example.com", "eve@example.com"]);

    // Second check 5 minutes later respects cooldown for alice & eve
    sendEmailFn.mockClear();
    await runReminderCheck(dbPath, {
      sendEmailFn,
      now: new Date("2026-11-25T12:05:00.000Z"),
    });
    expect(sendEmailFn).not.toHaveBeenCalled();

    const persisted = readDB(dbPath);
    expect(persisted.find((x) => x.mintAddress === "due-soon").lastNotified).toBe(
      now.toISOString()
    );
  });

  it("isolates SMTP failures so remaining due reminders still send and persist", async () => {
    const now = new Date("2026-11-25T12:00:00.000Z");
    const seed = [
      {
        mintAddress: "fails-smtp",
        service: "Task Fail",
        email: "fail@example.com",
        status: "PENDING",
        renewalDate: "2026-11-25T12:10:00.000Z",
        lastNotified: null,
      },
      {
        mintAddress: "succeeds-smtp",
        service: "Task Succeed",
        email: "ok@example.com",
        status: "PENDING",
        renewalDate: "2026-11-25T12:15:00.000Z",
        lastNotified: null,
      },
    ];
    fs.writeFileSync(dbPath, JSON.stringify(seed, null, 2));

    const sendEmailFn = vi.fn(async ({ to }) => {
      if (to === "fail@example.com") throw new Error("SMTP timeout");
      return { messageId: "ok" };
    });

    await runReminderCheck(dbPath, { sendEmailFn, now });

    const persisted = readDB(dbPath);
    expect(
      persisted.find((x) => x.mintAddress === "fails-smtp").lastNotified
    ).toBeNull();
    expect(
      persisted.find((x) => x.mintAddress === "succeeds-smtp").lastNotified
    ).toBe(now.toISOString());
  });
});
