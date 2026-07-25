import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { hasTauriRuntime } from "../../platform/runtime";

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const nativeTauri = hasTauriRuntime();

  useEffect(() => {
    if (!nativeTauri) return;
    const windowHandle = getCurrentWindow();
    let cleanup: (() => void) | undefined;
    void windowHandle.isMaximized().then(setMaximized);
    void windowHandle.listen<void>("tauri://resize", () => {
      void windowHandle.isMaximized().then(setMaximized);
    }).then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [nativeTauri]);

  if (!nativeTauri) return null;
  const windowHandle = getCurrentWindow();
  return (
    <div className="window-controls" aria-label="窗口控制">
      <button type="button" className="wc-btn" onClick={() => void windowHandle.minimize()} aria-label="最小化">
        <Minus size={12} strokeWidth={1.7} />
      </button>
      <button type="button" className="wc-btn" onClick={() => void windowHandle.toggleMaximize()} aria-label={maximized ? "还原" : "最大化"}>
        {maximized ? <Copy size={12} strokeWidth={1.7} /> : <Square size={12} strokeWidth={1.7} />}
      </button>
      <button type="button" className="wc-btn wc-close" onClick={() => void windowHandle.close()} aria-label="关闭">
        <X size={12} strokeWidth={1.7} />
      </button>
    </div>
  );
}
