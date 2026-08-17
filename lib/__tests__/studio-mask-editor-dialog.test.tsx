import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StudioMaskEditorDialog } from "@/components/studio/image-editor/StudioMaskEditorDialog";
import {
  commitImageEditorDocument,
  createImageEditorSession,
  type StudioImageEditorSession,
} from "@/components/studio/image-editor/types";

vi.mock("@/components/studio/image-editor/StudioImageEditor", () => ({
  StudioImageEditor: ({
    session,
    onSessionChange,
    toolbarActions,
  }: {
    session: StudioImageEditorSession;
    onSessionChange: (session: StudioImageEditorSession) => void;
    toolbarActions?: React.ReactNode;
  }) => (
    <div>
      {toolbarActions}
      <output data-testid="draft-count">{session.present.strokes.length}</output>
      <button
        type="button"
        onClick={() => onSessionChange(commitImageEditorDocument(session, {
          version: 1,
          strokes: [{ id: "draft", tool: "brush", size: 0.05, points: [0.2, 0.2, 0.4, 0.4] }],
        }))}
      >
        编辑草稿
      </button>
    </div>
  ),
}));

const messages = { Shared: { close: "关闭" } };

afterEach(() => cleanup());

function renderDialog(
  session: StudioImageEditorSession,
  callbacks: { onCancel: () => void; onConfirm: (draft: StudioImageEditorSession) => void },
  open = true,
) {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <StudioMaskEditorDialog
        open={open}
        sourceId="source-1"
        sourceUrl="https://example.com/source.png"
        sourceName="source.png"
        session={session}
        onCancel={callbacks.onCancel}
        onConfirm={callbacks.onConfirm}
      />
    </NextIntlClientProvider>,
  );
}

describe("StudioMaskEditorDialog draft isolation", () => {
  it("closes immediately when the draft has not changed", async () => {
    const onCancel = vi.fn();
    const view = renderDialog(createImageEditorSession(), { onCancel, onConfirm: vi.fn() });

    fireEvent.click(await view.findByRole("button", { name: "取消" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(view.queryByRole("button", { name: "确认退出" })).toBeNull();
  });

  it("discards the internal draft after cancel confirmation", async () => {
    const initialSession = createImageEditorSession();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const view = renderDialog(initialSession, { onCancel, onConfirm });

    fireEvent.click(await view.findByRole("button", { name: "编辑草稿" }));
    expect(view.getByTestId("draft-count").textContent).toBe("1");
    fireEvent.click(view.getByRole("button", { name: "取消" }));
    fireEvent.click(await view.findByRole("button", { name: "确认退出" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(initialSession.present.strokes).toHaveLength(0);

    view.rerender(
      <NextIntlClientProvider locale="zh" messages={messages}>
        <StudioMaskEditorDialog
          open={false}
          sourceId="source-1"
          sourceUrl="https://example.com/source.png"
          sourceName="source.png"
          session={initialSession}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </NextIntlClientProvider>,
    );
    view.rerender(
      <NextIntlClientProvider locale="zh" messages={messages}>
        <StudioMaskEditorDialog
          open
          sourceId="source-1"
          sourceUrl="https://example.com/source.png"
          sourceName="source.png"
          session={initialSession}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(view.getByTestId("draft-count").textContent).toBe("0"));
  });

  it("commits only the internal draft on confirm", async () => {
    const initialSession = createImageEditorSession();
    const onConfirm = vi.fn();
    const view = renderDialog(initialSession, { onCancel: vi.fn(), onConfirm });

    fireEvent.click(await view.findByRole("button", { name: "编辑草稿" }));
    fireEvent.click(view.getByRole("button", { name: "确定" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].present.strokes).toHaveLength(1);
    expect(initialSession.present.strokes).toHaveLength(0);
  });

  it("allows confirming an automatic base selection without manual strokes", async () => {
    const initialSession = createImageEditorSession();
    const onConfirm = vi.fn();
    const view = render(
      <NextIntlClientProvider locale="zh" messages={messages}>
        <StudioMaskEditorDialog
          open
          sourceId="source-1"
          sourceUrl="https://example.com/source.png"
          sourceName="source.png"
          session={initialSession}
          hasBaseSelection
          onCancel={vi.fn()}
          onConfirm={onConfirm}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(await view.findByRole("button", { name: "确定" }));

    expect(onConfirm).toHaveBeenCalledWith(initialSession);
  });
});
