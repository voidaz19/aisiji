import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useNotebookStore } from "../store/useNotebookStore";
import { AppShell } from "./AppShell";

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
});

afterEach(() => cleanup());

describe("AppShell notebook lifecycle", () => {
  it("keeps notebook editors mounted while visiting the home page", async () => {
    const { container, getAllByRole } = render(<AppShell />);
    await waitFor(
      () => expect(container.querySelector(".tree-list")).not.toBeNull(),
      { timeout: 3_000 },
    );

    fireEvent.click(getAllByRole("button", { name: "今天" })[0]);
    await waitFor(() => expect(container.querySelector("[data-node-id] .inline-editor")).not.toBeNull());
    const editor = container.querySelector<HTMLElement>("[data-node-id] .inline-editor")!;
    const nodeId = editor.closest<HTMLElement>("[data-node-id]")!.dataset.nodeId;

    fireEvent.click(getAllByRole("button", { name: "主页" })[0]);

    expect(editor.isConnected).toBe(true);
    const hiddenHost = editor.closest<HTMLElement>(".notebook-host[hidden]");
    expect(hiddenHost).not.toBeNull();
    expect(getComputedStyle(hiddenHost!).display).toBe("none");

    fireEvent.click(getAllByRole("button", { name: "今天" })[0]);
    await waitFor(() => expect(container.querySelector(`[data-node-id="${nodeId}"] .inline-editor`)).toBe(editor));

    const enterButton = getAllByRole("button", { name: "进入节点，按住拖拽" })[0];
    const enteredNodeId = enterButton.closest<HTMLElement>("[data-node-id]")!.dataset.nodeId;
    fireEvent.click(enterButton);
    const enteredHeading = container.querySelector<HTMLElement>(
      `.root-node-heading[data-selection-key="${enteredNodeId}"]`,
    );
    expect(enteredHeading).not.toBeNull();
    expect(enteredHeading?.querySelector(".cm-editor")).not.toBeNull();
  });

  it("moves backward and forward through page navigation changes", async () => {
    const { container, getAllByRole, getByRole } = render(<AppShell />);

    fireEvent.click(getAllByRole("button", { name: "所有笔记" })[0]);
    await waitFor(() => expect(container.querySelector(".breadcrumb-current")?.textContent).toBe("所有笔记"));

    fireEvent.click(getAllByRole("button", { name: "设置" })[0]);
    await waitFor(() => expect(container.querySelector(".breadcrumb-current")?.textContent).toBe("设置"));

    fireEvent.click(getByRole("button", { name: "后退" }));
    await waitFor(() => expect(container.querySelector(".breadcrumb-current")?.textContent).toBe("所有笔记"));
    expect((getByRole("button", { name: "前进" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(container.querySelector(".breadcrumb-current")?.textContent).toBe("设置"));
  });
});
