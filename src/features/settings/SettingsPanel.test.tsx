import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useNotebookStore } from "../../store/useNotebookStore";
import { SettingsPanel } from "./SettingsPanel";

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
});

afterEach(() => cleanup());

describe("SettingsPanel debug samples", () => {
  it("generates the mixed sample workspace only when none exists", () => {
    render(<SettingsPanel />);

    const button = screen.getByRole("button", { name: /生成测试样例/ });
    expect((button as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(button);

    const state = useNotebookStore.getState();
    const sampleNodes = Object.values(state.nodes).filter((node) => node.id.startsWith("debug-sample-"));
    expect(sampleNodes.length).toBeGreaterThan(50);
    expect(screen.getByText(`已生成 ${sampleNodes.length} 个测试节点`)).not.toBeNull();
    expect((screen.getByRole("button", { name: "已生成测试样例" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the generator available alongside ordinary user notes", () => {
    const store = useNotebookStore.getState();
    store.createChild(store.activeRootId, "用户笔记");
    render(<SettingsPanel />);

    expect((screen.getByRole("button", { name: /生成测试样例/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
