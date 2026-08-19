import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";

vi.mock("@/features/resource-library/ResourcePickerDialog", () => ({
  ResourcePickerDialog: (props: {
    open: boolean;
    onCancel: () => void;
    onConfirm: (assets: unknown[]) => void;
  }) => props.open ? (
    <div role="dialog">
      <button onClick={props.onCancel}>cancel picker</button>
      <button onClick={() => props.onConfirm([{
        id: "chosen",
        url: "https://example.com/chosen.png",
        title: "chosen",
        mediaType: "image",
      }])}>confirm picker</button>
    </div>
  ) : null,
}));

import { ResourceLibraryProvider, useResourcePicker } from "@/features/resource-library/ResourceLibraryProvider";

afterEach(() => cleanup());

function Harness() {
  const { openResourcePicker } = useResourcePicker();
  const [result, setResult] = useState("idle");
  return (
    <>
      <button onClick={async () => {
        const selected = await openResourcePicker({ selectionMode: "multiple", maxCount: 3, role: "product" });
        setResult(selected ? selected.map((asset) => asset.id).join(",") : "cancelled");
      }}>open picker</button>
      <output>{result}</output>
    </>
  );
}

describe("ResourceLibraryProvider", () => {
  it("resolves null on cancel without applying a draft", async () => {
    const view = render(<ResourceLibraryProvider><Harness /></ResourceLibraryProvider>);
    fireEvent.click(view.getByText("open picker"));
    fireEvent.click(await view.findByText("cancel picker"));
    await waitFor(() => expect(view.getByText("cancelled")).toBeTruthy());
  });

  it("resolves the confirmed ResourceAsset array", async () => {
    const view = render(<ResourceLibraryProvider><Harness /></ResourceLibraryProvider>);
    fireEvent.click(view.getByText("open picker"));
    fireEvent.click(await view.findByText("confirm picker"));
    await waitFor(() => expect(view.getByText("chosen")).toBeTruthy());
  });

  it("requires the root provider", () => {
    expect(() => render(<Harness />)).toThrow(/ResourceLibraryProvider/);
  });
});
