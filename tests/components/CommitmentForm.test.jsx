import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CommitmentForm from "../../src/components/CommitmentForm";

describe("CommitmentForm", () => {
  it("prevents submission, focuses invalid field, and announces accessible errors", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    render(<CommitmentForm onCommit={onCommit} loading={false} />);

    const goalInput = screen.getByLabelText(/i promise to/i);
    const deadlineInput = screen.getByLabelText(/deadline/i);

    await user.click(screen.getByRole("button", { name: /lock funds & commit/i }));
    expect(onCommit).not.toHaveBeenCalled();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/commitment goal/i);
    expect(goalInput).toHaveAttribute("aria-invalid", "true");
    expect(deadlineInput).toHaveAttribute("aria-invalid", "true");
    expect(goalInput).toHaveFocus();

    // Fill only goal -> focuses deadline next on submit
    await user.type(goalInput, "Ship tests");
    await user.click(screen.getByRole("button", { name: /lock funds & commit/i }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(deadlineInput).toHaveFocus();
  });

  it("updates stake via preset chips with aria-pressed, calculates TVL USD, and submits via labeled controls", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    render(<CommitmentForm onCommit={onCommit} loading={false} />);

    const oneSolBtn = screen.getByRole("button", { name: "1.0 SOL" });
    await user.click(oneSolBtn);
    expect(oneSolBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/~\$150\.00/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/i promise to/i), "  Complete audit  ");
    await user.type(screen.getByLabelText(/deadline/i), "2026-12-01T09:30");
    await user.type(
      screen.getByLabelText(/reminder email/i),
      "  user@example.com  "
    );

    await user.click(screen.getByRole("button", { name: /lock funds & commit/i }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({
      goal: "Complete audit",
      deadline: "2026-12-01T09:30",
      stake: "1.0",
      email: "user@example.com",
    });
  });
});
