export interface LayoutDebugVisibility {
  treeList: boolean;
  nodeBlocks: boolean;
  subtreeBlocks: boolean;
  collapse: boolean;
  bullet: boolean;
  content: boolean;
  attachment: boolean;
  hierarchy: boolean;
  dropHitZones: boolean;
}

export const DEFAULT_LAYOUT_DEBUG_VISIBILITY: LayoutDebugVisibility = {
  treeList: false,
  nodeBlocks: false,
  subtreeBlocks: false,
  collapse: false,
  bullet: false,
  content: false,
  attachment: false,
  hierarchy: false,
  dropHitZones: false,
};

const CONTROLS: ReadonlyArray<{ key: keyof LayoutDebugVisibility; label: string }> = [
  { key: "treeList", label: "节点列表" },
  { key: "nodeBlocks", label: "节点块" },
  { key: "subtreeBlocks", label: "节点树块" },
  { key: "collapse", label: "箭头区域" },
  { key: "bullet", label: "圆点区域" },
  { key: "content", label: "内容区域" },
  { key: "attachment", label: "附件区域" },
  { key: "hierarchy", label: "层级线" },
  { key: "dropHitZones", label: "插入热区" },
];

export function LayoutDebugPanel({ value, onChange }: {
  value: LayoutDebugVisibility;
  onChange: (next: LayoutDebugVisibility) => void;
}) {
  return (
    <div className="layout-debug-panel" role="group" aria-label="布局调试框显示">
      <span className="layout-debug-panel-title">调试框</span>
      {CONTROLS.map((control) => (
        <label key={control.key}>
          <input
            type="checkbox"
            checked={value[control.key]}
            onChange={(event) => onChange({ ...value, [control.key]: event.currentTarget.checked })}
          />
          <span>{control.label}</span>
        </label>
      ))}
    </div>
  );
}
