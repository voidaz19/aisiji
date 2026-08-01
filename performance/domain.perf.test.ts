import { performance } from "node:perf_hooks";
import { treeLayoutRows } from "../src/features/notebook/model/treeLayoutRows";
import { visibleNodesForView } from "../src/features/notebook/model/notebookView";
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
