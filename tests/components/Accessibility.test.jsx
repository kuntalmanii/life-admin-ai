import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StatusToast from "../../src/components/StatusToast";
import ConfirmModal from "../../src/components/ConfirmModal";
import ReminderList from "../../src/components/ReminderList";
import Header from "../../src/components/Header";

vi.mock("@solana/wallet-adapter-react-ui", () => ({
  WalletMultiButton: () => <button type="button">Connect</button>,
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ publicKey: null, connected: false }),
}));

describe("Accessibility semantics", () => {
  it("renders accessible live regions on StatusToast", () => {
    const { rerender } = render(
      <StatusToast toast={{ type: "success", message: "Locked on-chain" }} />
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Locked on-chain");

    rerender(
      <StatusToast toast={{ type: "error", message: "Transaction rejected" }} />
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent("Transaction rejected");
  });

  it("supports dialog ARIA attributes and Escape dismissal on ConfirmModal", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        open={true}
        title="Approve Proof"
        message="Confirm refund?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Approve Proof");

    expect(
      screen.getByRole("button", { name: "Close confirmation dialog" })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders ReminderList filter controls with proper tablist/tab/tabpanel semantics", async () => {
    const user = userEvent.setup();
    const reminders = [
      {
        mint: "Mint111",
        service: "Run 5k",
        deadline: "2030-01-01T10:00",
        stake: 0.2,
        status: "PENDING",
      },
      {
        mint: "Mint222",
        service: "Ship MVP",
        deadline: "2025-01-01T10:00",
        stake: 0.5,
        status: "COMPLETED",
      },
    ];

    render(
      <ReminderList
        reminders={reminders}
        loading={false}
        onRefresh={vi.fn()}
        onNotify={vi.fn()}
      />
    );

    expect(
      screen.getByRole("tablist", { name: /filter commitments by status/i })
    ).toBeInTheDocument();

    const allTab = screen.getByRole("tab", { name: /all/i });
    const doneTab = screen.getByRole("tab", { name: /done/i });
    expect(allTab).toHaveAttribute("aria-selected", "true");
    expect(doneTab).toHaveAttribute("aria-selected", "false");

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveTextContent("Run 5k");
    expect(panel).toHaveTextContent("Ship MVP");

    await user.click(doneTab);
    expect(doneTab).toHaveAttribute("aria-selected", "true");
    await waitFor(() => {
      expect(screen.getByRole("tabpanel")).not.toHaveTextContent("Run 5k");
    });
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Ship MVP");
  });

  it("exposes navigation landmark and aria-labels on Header icon links", () => {
    render(<Header />);

    expect(
      screen.getByRole("navigation", { name: "Main navigation" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Life Admin AI on GitHub" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Life Admin AI on Twitter" })
    ).toBeInTheDocument();
  });
});
