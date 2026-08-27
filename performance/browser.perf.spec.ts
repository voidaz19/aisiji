import { expect, test, type Page } from "@playwright/test";
import { browserBudgets } from "./budgets";
import { createCombinedStressWorkspace, createExpandableWorkspace, createLongMarkdownWorkspace, createWideWorkspace } from "./fixtures";
import { metric, summarize, writePerformanceResult, type RecordedMetric } from "./metrics";
import type { AppPerformanceProbeName } from "../src/shared/performanceProbe";

const STORAGE_KEY = "aisiji-notebook-state-v1";
const metrics: Record<string, RecordedMetric> = {};

interface PerformanceHarness {
  longTasks: number[];
  frameProbe: Promise<number[]> | null;
  persistence: {
    stringifyDurations: number[];
    storageWriteDurations: number[];
  };
  appMarks: Array<{ name: AppPerformanceProbeName; timestamp: number; value?: number }>;
  clearLongTasks: () => void;
  clearPersistenceMetrics: () => void;
  clearAppMarks: () => void;
  startFrameProbe: (duration: number) => void;
}

declare global {
  interface Window {
    __aisijiPerformanceHarness: PerformanceHarness;
  }
}

test.afterAll(() => writePerformanceResult("browser.json", "browser", metrics));

test("starts and opens a virtualized 10k-node outline", async ({ page }) => {
  await loadWorkspace(page, createWideWorkspace(10_000));
  await expect(page.locator(".app-shell")).toBeVisible();
  await settle(page);
  const startupReady = await page.evaluate(() => performance.now());
  recordMetric("startupReady", startupReady, browserBudgets.startupReady);

  const action = await measureAction(page, async () => {
    await page.getByRole("button", { name: "所有笔记", exact: true }).first().click();
    await expect(page.getByRole("tree", { name: "节点树" })).toBeVisible();
    await expect(page.locator('[data-tree-block-key="perf-node-000000"]')).toBeVisible();
  });
  recordMetric("outlineOpen", action.elapsed, browserBudgets.outlineOpen);
  recordMetric("outlineLongTasks", action.longTaskDuration, browserBudgets.outlineLongTasks);
  expect(await page.locator('[data-tree-row="true"]').count()).toBeLessThan(100);
});

test("expands 1k children without mounting the whole tree", async ({ page }) => {
  await loadWorkspace(page, createExpandableWorkspace(1_000));
  await openOutline(page);
  const parent = page.locator('[data-tree-block-key="perf-parent"]');
  const action = await measureAction(page, async () => {
    await parent.hover();
    await parent.getByRole("button", { name: "展开节点" }).click();
    await expect(page.locator('[data-tree-block-key="perf-child-000000"]')).toBeVisible();
  });
  const renderedRows = await page.locator('[data-tree-row="true"]').count();
  recordMetric("expand1k", action.elapsed, browserBudgets.expand1k);
  recordMetric("expandSlowFrameRatio", action.slowFrameRatio, browserBudgets.expandSlowFrameRatio);
  recordMetric("expandedDomRows", renderedRows, browserBudgets.expandedDomRows);
});

test("keeps 100KB Markdown input latency within budget", async ({ page }) => {
  const workspace = createLongMarkdownWorkspace();
  expect(new TextEncoder().encode(workspace.nodes["perf-long-markdown"].markdown).byteLength).toBe(100_000);
  await loadWorkspace(page, workspace);
  await openOutline(page);
  await page.locator('[data-tree-block-key="perf-long-markdown"] .node-bullet').click();
  const editor = page.locator('.root-node-heading[data-node-id="perf-long-markdown"] .cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+End");
  await clearLongTasks(page);
  const samples: number[] = [];
  const previewBuildSamples: number[] = [];
  const previewScanSamples: number[] = [];
  for (let index = 0; index < 15; index += 1) {
    await clearAppMarks(page);
    const startedAt = await page.evaluate(() => performance.now());
    await page.keyboard.type("x");
    await settle(page);
    samples.push(await page.evaluate((start) => performance.now() - start, startedAt));
    const marks = await appMarks(page);
    previewBuildSamples.push(...pairedMarkDurations(
      marks,
      "markdown:preview-visible-build-start",
      "markdown:preview-visible-build-end",
    ));
    previewScanSamples.push(...markValues(marks, "markdown:preview-visible-build-start"));
  }
  const summary = summarize(samples);
  recordMetric("markdownInputP95", summary.p95, browserBudgets.markdownInputP95);
  recordMetric("markdownInputLongTasks", await longTaskDuration(page), browserBudgets.markdownInputLongTasks);
  recordMetric("markdownPreviewBuildP95", summarize(previewBuildSamples).p95, browserBudgets.markdownPreviewBuildP95);
  recordMetric(
    "markdownPreviewScannedCharactersP95",
    summarize(previewScanSamples).p95,
    browserBudgets.markdownPreviewScannedCharactersP95,
  );
});

test("keeps 1MB Markdown live preview work viewport-bounded", async ({ page }) => {
  test.setTimeout(60_000);
  const workspace = createLongMarkdownWorkspace(1_000_000);
  expect(new TextEncoder().encode(workspace.nodes["perf-long-markdown"].markdown).byteLength).toBe(1_000_000);
  await loadWorkspace(page, workspace);
  await openOutline(page, 30_000);
  await page.locator('[data-tree-block-key="perf-long-markdown"] .node-bullet').click();
  const editor = page.locator('.root-node-heading[data-node-id="perf-long-markdown"] .cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+End");

  const inputSamples: number[] = [];
  const previewBuildSamples: number[] = [];
  const previewScanSamples: number[] = [];
  await clearLongTasks(page);
  for (let index = 0; index < 10; index += 1) {
    await clearAppMarks(page);
    const startedAt = await page.evaluate(() => performance.now());
    await page.keyboard.type("x");
    await settle(page);
    inputSamples.push(await page.evaluate((start) => performance.now() - start, startedAt));
    const marks = await appMarks(page);
    previewBuildSamples.push(...pairedMarkDurations(
      marks,
      "markdown:preview-visible-build-start",
      "markdown:preview-visible-build-end",
    ));
    previewScanSamples.push(...markValues(marks, "markdown:preview-visible-build-start"));
  }

  recordDiagnostic("markdown1MbInputP95", summarize(inputSamples).p95, "ms");
  recordDiagnostic("markdown1MbInputLongTaskCount", (await longTaskDurations(page)).length, "count");
  recordMetric("markdown1MbPreviewBuildP95", summarize(previewBuildSamples).p95, browserBudgets.markdownPreviewBuildP95);
  recordMetric(
    "markdown1MbPreviewScannedCharactersP95",
    summarize(previewScanSamples).p95,
    browserBudgets.markdownPreviewScannedCharactersP95,
  );
});

test("profiles 100 edits in a 10k-node workspace with 100KB Markdown", async ({ page }) => {
  test.setTimeout(60_000);
  const workspace = createCombinedStressWorkspace();
  const markdown = workspace.nodes["perf-node-000000"].markdown;
  expect(Object.keys(workspace.nodes)).toHaveLength(10_001);
  expect(new TextEncoder().encode(markdown).byteLength).toBe(100_000);
  recordDiagnostic("combinedWorkspaceJsonBytes", Buffer.byteLength(JSON.stringify(workspace), "utf8"), "bytes");

  await loadWorkspace(page, workspace);
  await openOutline(page);
  await page.locator('[data-tree-block-key="perf-node-000000"] .node-bullet').click();
  const editor = page.locator('.root-node-heading[data-node-id="perf-node-000000"] .cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+End");
  await clearLongTasks(page);

  const inputSamples: number[] = [];
  const stringifySamples: number[] = [];
  const storageWriteSamples: number[] = [];
  const persistenceSamples: number[] = [];
  const persistenceShares: number[] = [];
  let workspaceStringifies = 0;
  let workspaceWrites = 0;
  const codeMirrorSamples: number[] = [];
  const storeSamples: number[] = [];
  const reactSamples: number[] = [];
  let appShellRenders = 0;
  let notebookRenders = 0;
  let topologyComputes = 0;
  let treeRowRenders = 0;
  for (let index = 0; index < 100; index += 1) {
    await clearPersistenceMetrics(page);
    await clearAppMarks(page);
    const startedAt = await page.evaluate(() => performance.now());
    await page.keyboard.type("x");
    await settle(page);
    const elapsed = await page.evaluate((start) => performance.now() - start, startedAt);
    const persistence = await persistenceMetrics(page);
    const marks = await appMarks(page);
    const codeMirrorCommit = firstMark(marks, "markdown:codemirror-commit");
    const storeCommit = firstMark(marks, "markdown:store-commit");
    const reactCommit = lastMark(marks, "notebook:commit");
    const stringifyDuration = sum(persistence.stringifyDurations);
    const storageWriteDuration = sum(persistence.storageWriteDurations);
    inputSamples.push(elapsed);
    stringifySamples.push(stringifyDuration);
    storageWriteSamples.push(storageWriteDuration);
    persistenceSamples.push(stringifyDuration + storageWriteDuration);
    persistenceShares.push(elapsed > 0 ? (stringifyDuration + storageWriteDuration) / elapsed : 0);
    workspaceStringifies += persistence.stringifyDurations.length;
    workspaceWrites += persistence.storageWriteDurations.length;
    if (codeMirrorCommit !== null) codeMirrorSamples.push(codeMirrorCommit - startedAt);
    if (codeMirrorCommit !== null && storeCommit !== null) storeSamples.push(storeCommit - codeMirrorCommit);
    if (storeCommit !== null && reactCommit !== null) reactSamples.push(Math.max(0, reactCommit - storeCommit));
    appShellRenders += countMarks(marks, "app-shell:render");
    notebookRenders += countMarks(marks, "notebook:render");
    topologyComputes += countMarks(marks, "notebook:topology-compute");
    treeRowRenders += countMarks(marks, "tree-row:render");
  }

  recordMetric("combinedMarkdownInputP95", summarize(inputSamples).p95, browserBudgets.combinedMarkdownInputP95);
  recordMetric("combinedWorkspaceSerializeP95", summarize(stringifySamples).p95, browserBudgets.combinedWorkspaceSerializeP95);
  recordMetric("combinedStorageWriteP95", summarize(storageWriteSamples).p95, browserBudgets.combinedStorageWriteP95);
  recordMetric("combinedPersistenceP95", summarize(persistenceSamples).p95, browserBudgets.combinedPersistenceP95);
  const longTasks = await longTaskDurations(page);
  recordMetric(
    "combinedInputLongTaskP95",
    longTasks.length > 0 ? summarize(longTasks).p95 : 0,
    browserBudgets.combinedInputLongTaskP95,
  );
  recordDiagnostic("combinedInputLongTaskTotal", sum(longTasks), "ms");
  recordDiagnostic("combinedPersistenceShareP95", summarize(persistenceShares).p95, "ratio");
  recordDiagnostic("combinedWorkspaceStringifies", workspaceStringifies, "count");
  recordDiagnostic("combinedWorkspaceWrites", workspaceWrites, "count");
  recordDiagnostic("combinedCodeMirrorCommitP95", summarize(codeMirrorSamples).p95, "ms");
  recordDiagnostic("combinedStoreCommitP95", summarize(storeSamples).p95, "ms");
  recordDiagnostic("combinedReactCommitP95", summarize(reactSamples).p95, "ms");
  recordDiagnostic("combinedCodeMirrorSamples", codeMirrorSamples.length, "count");
  recordDiagnostic("combinedStoreSamples", storeSamples.length, "count");
  recordDiagnostic("combinedReactSamples", reactSamples.length, "count");
  recordDiagnostic("combinedAppShellRenders", appShellRenders, "count");
  recordDiagnostic("combinedNotebookRenders", notebookRenders, "count");
  recordDiagnostic("combinedTopologyComputes", topologyComputes, "count");
  recordDiagnostic("combinedTreeRowRenders", treeRowRenders, "count");
  recordMetric("combinedInputLongTaskCount", longTasks.length, browserBudgets.combinedInputLongTaskCount);
});

test("switches nodes repeatedly without unbounded heap growth", async ({ page }) => {
  await loadWorkspace(page, createWideWorkspace(80));
  await openOutline(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const heapBefore = await usedHeap(page);
  const samples: number[] = [];
  for (let index = 0; index < 12; index += 1) {
    const row = page.locator('[data-tree-block-key="perf-node-000000"]');
    const startedAt = await page.evaluate(() => performance.now());
    await row.getByRole("button", { name: "进入节点，按住拖拽" }).click();
    await expect(page.locator('.root-node-heading[data-node-id="perf-node-000000"]')).toBeVisible();
    await settle(page);
    samples.push(await page.evaluate((start) => performance.now() - start, startedAt));
    await page.getByRole("button", { name: "后退" }).click();
    await expect(row).toBeVisible();
  }
  await cdp.send("HeapProfiler.collectGarbage");
  const heapGrowth = Math.max(0, (await usedHeap(page)) - heapBefore);
  const summary = summarize(samples);
  recordMetric("nodeSwitchP95", summary.p95, browserBudgets.nodeSwitchP95);
  recordMetric("nodeSwitchHeapGrowth", heapGrowth, browserBudgets.nodeSwitchHeapGrowth);
});

test("completes pointer drag within frame budget", async ({ page }) => {
  await loadWorkspace(page, createWideWorkspace(40));
  await openOutline(page);
  const source = page.locator('[data-tree-block-key="perf-node-000000"] .node-bullet');
  const target = page.locator('[data-tree-block-key="perf-node-000002"] .node-content');
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const action = await measureAction(page, async () => {
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 12, sourceBox!.y + sourceBox!.height / 2 + 12, { steps: 3 });
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".drag-preview")).toHaveCount(0);
  });
  recordMetric("dragComplete", action.elapsed, browserBudgets.dragComplete);
  recordMetric("dragSlowFrameRatio", action.slowFrameRatio, browserBudgets.dragSlowFrameRatio);
});

for (const nodeCount of [1_000, 10_000]) {
  test(`keeps ${nodeCount / 1_000}k-node drag virtualized`, async ({ page }) => {
    test.setTimeout(60_000);
    await loadWorkspace(page, createWideWorkspace(nodeCount));
    await openOutline(page);
    const source = page.locator('[data-tree-block-key="perf-node-000000"] .node-bullet');
    const sourceBox = await source.boundingBox();
    expect(sourceBox).not.toBeNull();
    const startedAt = Date.now();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    try {
      await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 12, sourceBox!.y + sourceBox!.height / 2 + 12, { steps: 3 });
      await expect(page.locator(".drag-preview")).toBeVisible({ timeout: 30_000 });
      const renderedRows = await page.locator('[data-tree-row="true"]').count();
      recordDiagnostic(`drag${nodeCount / 1_000}kStart`, Date.now() - startedAt, "ms");
      recordMetric(`drag${nodeCount / 1_000}kDomRows`, renderedRows, browserBudgets.dragVirtualizedDomRows);
    } finally {
      await page.mouse.up();
    }
  });
}

test("reports all recorded performance budgets", () => {
  const failures = Object.entries(metrics)
    .filter(([, result]) => result.passed === false)
    .map(([name, result]) => `${name}: ${result.value}${result.unit} > ${result.budget}${result.unit}`);
  expect(failures, "performance budgets exceeded").toEqual([]);
});

async function loadWorkspace(page: Page, workspace: ReturnType<typeof createWideWorkspace>) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
    const longTasks: number[] = [];
    const persistence = {
      stringifyDurations: [] as number[],
      storageWriteDurations: [] as number[],
    };
    const appMarks: Array<{ name: AppPerformanceProbeName; timestamp: number; value?: number }> = [];
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      }).observe({ type: "longtask", buffered: true });
    }
    const harness: PerformanceHarness = {
      longTasks,
      frameProbe: null,
      persistence,
      appMarks,
      clearLongTasks() {
        longTasks.length = 0;
      },
      clearPersistenceMetrics() {
        persistence.stringifyDurations.length = 0;
        persistence.storageWriteDurations.length = 0;
      },
      clearAppMarks() {
        appMarks.length = 0;
      },
      startFrameProbe(duration: number) {
        harness.frameProbe = new Promise<number[]>((resolve) => {
          const gaps: number[] = [];
          const startedAt = performance.now();
          let previous = startedAt;
          const frame = (now: number) => {
            gaps.push(now - previous);
            previous = now;
            if (now - startedAt < duration) requestAnimationFrame(frame);
            else resolve(gaps);
          };
          requestAnimationFrame(frame);
        });
      },
    };
    window.__aisijiPerformanceHarness = harness;
    window.__aisijiPerformanceProbe = {
      mark(name, timestamp, value) {
        appMarks.push({ name, timestamp, value });
      },
    };

    JSON.stringify = new Proxy(JSON.stringify, {
      apply(target, thisArgument, argumentsList) {
        const candidate = argumentsList[0];
        const measuresWorkspace = typeof candidate === "object"
          && candidate !== null
          && "nodes" in candidate
          && "collapsed" in candidate
          && "fields" in candidate;
        const startedAt = performance.now();
        try {
          return Reflect.apply(target, thisArgument, argumentsList);
        } finally {
          if (measuresWorkspace) persistence.stringifyDurations.push(performance.now() - startedAt);
        }
      },
    });
    Storage.prototype.setItem = new Proxy(Storage.prototype.setItem, {
      apply(target, thisArgument, argumentsList) {
        if (argumentsList[0] !== key) return Reflect.apply(target, thisArgument, argumentsList);
        const startedAt = performance.now();
        try {
          return Reflect.apply(target, thisArgument, argumentsList);
        } finally {
          persistence.storageWriteDurations.push(performance.now() - startedAt);
        }
      },
    });
  }, { key: STORAGE_KEY, value: workspace });
  await page.goto("/");
}

async function openOutline(page: Page, timeout = 5_000) {
  await page.getByRole("button", { name: "所有笔记", exact: true }).first().click();
  await expect(page.getByRole("tree", { name: "节点树" })).toBeVisible({ timeout });
  await settle(page);
}

async function measureAction(page: Page, action: () => Promise<void>) {
  await clearLongTasks(page);
  await page.evaluate(() => {
    window.__aisijiPerformanceHarness.startFrameProbe(450);
  });
  const startedAt = await page.evaluate(() => performance.now());
  await action();
  await settle(page);
  const elapsed = await page.evaluate((start) => performance.now() - start, startedAt);
  const gaps = await page.evaluate(async () => {
    const probe = window.__aisijiPerformanceHarness.frameProbe;
    return probe ? await probe : [];
  });
  const slowFrames = gaps.filter((gap) => gap > 34).length;
  return {
    elapsed,
    slowFrameRatio: gaps.length > 0 ? slowFrames / gaps.length : 0,
    longTaskDuration: await longTaskDuration(page),
  };
}

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function clearLongTasks(page: Page) {
  await page.evaluate(() => window.__aisijiPerformanceHarness.clearLongTasks());
}

async function clearPersistenceMetrics(page: Page) {
  await page.evaluate(() => window.__aisijiPerformanceHarness.clearPersistenceMetrics());
}

async function persistenceMetrics(page: Page) {
  return page.evaluate(() => ({
    stringifyDurations: [...window.__aisijiPerformanceHarness.persistence.stringifyDurations],
    storageWriteDurations: [...window.__aisijiPerformanceHarness.persistence.storageWriteDurations],
  }));
}

async function clearAppMarks(page: Page) {
  await page.evaluate(() => window.__aisijiPerformanceHarness.clearAppMarks());
}

async function appMarks(page: Page) {
  return page.evaluate(() => [...window.__aisijiPerformanceHarness.appMarks]);
}

async function longTaskDuration(page: Page): Promise<number> {
  return sum(await longTaskDurations(page));
}

async function longTaskDurations(page: Page): Promise<number[]> {
  return page.evaluate(() => [...window.__aisijiPerformanceHarness.longTasks]);
}

async function usedHeap(page: Page): Promise<number> {
  return page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
}

function recordMetric(
  name: string,
  value: number,
  budget: (typeof browserBudgets)[keyof typeof browserBudgets],
) {
  metrics[name] = metric(value, budget);
}

function recordDiagnostic(name: string, value: number, unit: RecordedMetric["unit"]) {
  metrics[name] = { value, unit };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function firstMark(marks: readonly { name: AppPerformanceProbeName; timestamp: number }[], name: AppPerformanceProbeName) {
  return marks.find((mark) => mark.name === name)?.timestamp ?? null;
}

function lastMark(marks: readonly { name: AppPerformanceProbeName; timestamp: number }[], name: AppPerformanceProbeName) {
  for (let index = marks.length - 1; index >= 0; index -= 1) {
    if (marks[index].name === name) return marks[index].timestamp;
  }
  return null;
}

function countMarks(marks: readonly { name: AppPerformanceProbeName }[], name: AppPerformanceProbeName) {
  return marks.filter((mark) => mark.name === name).length;
}

function markValues(
  marks: readonly { name: AppPerformanceProbeName; value?: number }[],
  name: AppPerformanceProbeName,
) {
  return marks.flatMap((mark) => mark.name === name && mark.value !== undefined ? [mark.value] : []);
}

function pairedMarkDurations(
  marks: readonly { name: AppPerformanceProbeName; timestamp: number }[],
  startName: AppPerformanceProbeName,
  endName: AppPerformanceProbeName,
) {
  const durations: number[] = [];
  let start: number | null = null;
  for (const mark of marks) {
    if (mark.name === startName) start = mark.timestamp;
    else if (mark.name === endName && start !== null) {
      durations.push(Math.max(0, mark.timestamp - start));
      start = null;
    }
  }
  return durations;
}
