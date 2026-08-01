import { expect, test, type Page } from "@playwright/test";
import { browserBudgets, scaledMaximum } from "./budgets";
import { createCombinedStressWorkspace, createExpandableWorkspace, createLongMarkdownWorkspace, createWideWorkspace } from "./fixtures";
import { metric, summarize, writePerformanceResult, type RecordedMetric } from "./metrics";

const STORAGE_KEY = "aisiji-notebook-state-v1";
const metrics: Record<string, RecordedMetric> = {};

interface PerformanceHarness {
  longTasks: number[];
  frameProbe: Promise<number[]> | null;
  persistence: {
    stringifyDurations: number[];
    storageWriteDurations: number[];
  };
  clearLongTasks: () => void;
  clearPersistenceMetrics: () => void;
  startFrameProbe: (duration: number) => void;
}

declare global {
  interface Window {
    __aisijiPerformanceHarness: PerformanceHarness;
  }
}

test.describe.configure({ mode: "serial" });
test.afterAll(() => writePerformanceResult("browser.json", "browser", metrics));

test("starts and opens a virtualized 10k-node outline", async ({ page }) => {
  await loadWorkspace(page, createWideWorkspace(10_000));
  await expect(page.locator(".app-shell")).toBeVisible();
  await settle(page);
  const startupReady = await page.evaluate(() => performance.now());
  recordAndCheck("startupReady", startupReady, browserBudgets.startupReady);

  const action = await measureAction(page, async () => {
    await page.getByRole("button", { name: "所有笔记", exact: true }).first().click();
    await expect(page.getByRole("tree", { name: "节点树" })).toBeVisible();
    await expect(page.locator('[data-tree-block-key="perf-node-000000"]')).toBeVisible();
  });
  recordAndCheck("outlineOpen", action.elapsed, browserBudgets.outlineOpen);
  recordAndCheck("outlineLongTasks", action.longTaskDuration, browserBudgets.outlineLongTasks);
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
  recordAndCheck("expand1k", action.elapsed, browserBudgets.expand1k);
  recordAndCheck("expandSlowFrameRatio", action.slowFrameRatio, browserBudgets.expandSlowFrameRatio);
  recordAndCheck("expandedDomRows", renderedRows, browserBudgets.expandedDomRows);
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
  for (let index = 0; index < 15; index += 1) {
    const startedAt = await page.evaluate(() => performance.now());
    await page.keyboard.type("x");
    await settle(page);
    samples.push(await page.evaluate((start) => performance.now() - start, startedAt));
  }
  const summary = summarize(samples);
  recordAndCheck("markdownInputP95", summary.p95, browserBudgets.markdownInputP95);
  recordAndCheck("markdownInputLongTasks", await longTaskDuration(page), browserBudgets.markdownInputLongTasks);
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
  for (let index = 0; index < 100; index += 1) {
    await clearPersistenceMetrics(page);
    const startedAt = await page.evaluate(() => performance.now());
    await page.keyboard.type("x");
    await settle(page);
    const elapsed = await page.evaluate((start) => performance.now() - start, startedAt);
    const persistence = await persistenceMetrics(page);
    const stringifyDuration = sum(persistence.stringifyDurations);
    const storageWriteDuration = sum(persistence.storageWriteDurations);
    inputSamples.push(elapsed);
    stringifySamples.push(stringifyDuration);
    storageWriteSamples.push(storageWriteDuration);
    persistenceSamples.push(stringifyDuration + storageWriteDuration);
    persistenceShares.push(elapsed > 0 ? (stringifyDuration + storageWriteDuration) / elapsed : 0);
    workspaceStringifies += persistence.stringifyDurations.length;
    workspaceWrites += persistence.storageWriteDurations.length;
  }

  recordAndCheck("combinedMarkdownInputP95", summarize(inputSamples).p95, browserBudgets.combinedMarkdownInputP95);
  recordAndCheck("combinedWorkspaceSerializeP95", summarize(stringifySamples).p95, browserBudgets.combinedWorkspaceSerializeP95);
  recordAndCheck("combinedStorageWriteP95", summarize(storageWriteSamples).p95, browserBudgets.combinedStorageWriteP95);
  recordAndCheck("combinedPersistenceP95", summarize(persistenceSamples).p95, browserBudgets.combinedPersistenceP95);
  const longTasks = await longTaskDurations(page);
  recordAndCheck(
    "combinedInputLongTaskP95",
    longTasks.length > 0 ? summarize(longTasks).p95 : 0,
    browserBudgets.combinedInputLongTaskP95,
  );
  recordDiagnostic("combinedInputLongTaskTotal", sum(longTasks), "ms");
  recordDiagnostic("combinedPersistenceShareP95", summarize(persistenceShares).p95, "ratio");
  recordDiagnostic("combinedWorkspaceStringifies", workspaceStringifies, "count");
  recordDiagnostic("combinedWorkspaceWrites", workspaceWrites, "count");
  recordAndCheck("combinedInputLongTaskCount", longTasks.length, browserBudgets.combinedInputLongTaskCount);
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
  recordAndCheck("nodeSwitchP95", summary.p95, browserBudgets.nodeSwitchP95);
  recordAndCheck("nodeSwitchHeapGrowth", heapGrowth, browserBudgets.nodeSwitchHeapGrowth);
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
  recordAndCheck("dragComplete", action.elapsed, browserBudgets.dragComplete);
  recordAndCheck("dragSlowFrameRatio", action.slowFrameRatio, browserBudgets.dragSlowFrameRatio);
});

async function loadWorkspace(page: Page, workspace: ReturnType<typeof createWideWorkspace>) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
    const longTasks: number[] = [];
    const persistence = {
      stringifyDurations: [] as number[],
      storageWriteDurations: [] as number[],
    };
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      }).observe({ type: "longtask", buffered: true });
    }
    const harness: PerformanceHarness = {
      longTasks,
      frameProbe: null,
      persistence,
      clearLongTasks() {
        longTasks.length = 0;
      },
      clearPersistenceMetrics() {
        persistence.stringifyDurations.length = 0;
        persistence.storageWriteDurations.length = 0;
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

async function openOutline(page: Page) {
  await page.getByRole("button", { name: "所有笔记", exact: true }).first().click();
  await expect(page.getByRole("tree", { name: "节点树" })).toBeVisible();
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

async function longTaskDuration(page: Page): Promise<number> {
  return sum(await longTaskDurations(page));
}

async function longTaskDurations(page: Page): Promise<number[]> {
  return page.evaluate(() => [...window.__aisijiPerformanceHarness.longTasks]);
}

async function usedHeap(page: Page): Promise<number> {
  return page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
}

function recordAndCheck(
  name: string,
  value: number,
  budget: (typeof browserBudgets)[keyof typeof browserBudgets],
) {
  metrics[name] = metric(value, budget);
  expect(value, `${name} exceeded its performance budget`).toBeLessThanOrEqual(scaledMaximum(budget));
}

function recordDiagnostic(name: string, value: number, unit: RecordedMetric["unit"]) {
  metrics[name] = { value, unit };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
