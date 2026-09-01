import { performance } from "node:perf_hooks";
import { treeLayoutRows } from "../src/features/notebook/model/treeLayoutRows";
import { measuredTreeBlocks } from "../src/features/notebook/model/subtreeLayout";
import { visibleNodesForView } from "../src/features/notebook/model/notebookView";
import { createTreeDropSlots, type VisibleTreeNode } from "../src/domain/dropSlots";
import { domainBudgets, scaledMaximum } from "./budgets";
import { createWideWorkspace } from "./fixtures";
import { metric, summarize, writePerformanceResult, type RecordedMetric } from "./metrics";

const metrics: Record<string, RecordedMetric> = {};

describe("domain performance budgets", () => {
  afterAll(() => writePerformanceResult("domain.json", "domain", metrics));

  it("builds a 1k visible tree within budget", () => {
    const workspace = createWideWorkspace(1_000);
    const summary = measure(() => visibleNodesForView(workspace, "outline", "root", ""));
    metrics.visibleTree1kP95 = metric(summary.p95, domainBudgets.visibleTree1kP95);
    expect(summary.p95).toBeLessThanOrEqual(scaledMaximum(domainBudgets.visibleTree1kP95));
  });

  it("builds a 10k visible tree within budget", () => {
    const workspace = createWideWorkspace(10_000);
    const summary = measure(() => visibleNodesForView(workspace, "outline", "root", ""));
    metrics.visibleTree10kP95 = metric(summary.p95, domainBudgets.visibleTree10kP95);
    expect(summary.p95).toBeLessThanOrEqual(scaledMaximum(domainBudgets.visibleTree10kP95));
  });

  it("searches 10k nodes within budget", () => {
    const workspace = createWideWorkspace(10_000);
    const summary = measure(() => visibleNodesForView(workspace, "search", "root", "performance-needle"));
    metrics.search10kP95 = metric(summary.p95, domainBudgets.search10kP95);
    expect(summary.p95).toBeLessThanOrEqual(scaledMaximum(domainBudgets.search10kP95));
  });

  it("builds layout rows for 1k visible nodes within budget", () => {
    const workspace = createWideWorkspace(1_000);
    const visible = visibleNodesForView(workspace, "outline", "root", "");
    const summary = measure(() => treeLayoutRows(visible, workspace, {}, "root"));
    metrics.layoutRows1kP95 = metric(summary.p95, domainBudgets.layoutRows1kP95);
    expect(summary.p95).toBeLessThanOrEqual(scaledMaximum(domainBudgets.layoutRows1kP95));
  });

  it("builds 10k drop slots within budget", () => {
    const workspace = createWideWorkspace(10_000);
    const visible = visibleNodesForView(workspace, "outline", "root", "") as VisibleTreeNode[];
    const summary = measure(() => createTreeDropSlots(workspace, visible, "root", visible[0].id));
    metrics.dropSlots10kP95 = metric(summary.p95, domainBudgets.dropSlots10kP95);
    expect(summary.p95).toBeLessThanOrEqual(scaledMaximum(domainBudgets.dropSlots10kP95));
  });

  it("measures 10k nested subtree blocks within budget", () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => ({
      key: `nested-${index}`,
      depth: index,
      top: index * 31,
      bottom: index * 31 + 24,
    }));
    const summary = measure(() => measuredTreeBlocks(rows, 8));
    metrics.subtreeBlocks10kP95 = metric(summary.p95, domainBudgets.subtreeBlocks10kP95);
    expect(summary.p95).toBeLessThanOrEqual(scaledMaximum(domainBudgets.subtreeBlocks10kP95));
  });
});

function measure(operation: () => unknown, iterations = 20, warmups = 5) {
  for (let index = 0; index < warmups; index += 1) operation();
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    operation();
    samples.push(performance.now() - startedAt);
  }
  return summarize(samples);
}
