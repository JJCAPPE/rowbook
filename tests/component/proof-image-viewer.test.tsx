import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ProofImageViewer } from "@/components/ui/proof-image-viewer.tsx";
import { renderWithUi } from "./test-utils";

describe("ProofImageViewer", () => {
  it("opens modal and navigates carousel with keyboard", async () => {
    const user = userEvent.setup();

    renderWithUi(
      <ProofImageViewer
        images={[
          { id: "1", src: "https://example.com/one.png", alt: "Proof one" },
          { id: "2", src: "https://example.com/two.png", alt: "Proof two" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View proofs (2)" }));
    expect(screen.getByText("Proof image 1 of 2")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Proof image 2 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText(/Proof image \d of 2/)).not.toBeInTheDocument();
  });
});
