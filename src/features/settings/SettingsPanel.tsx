import { useState } from "react";
import { Bug, Cloud, Database, SlidersHorizontal, Trash2 } from "lucide-react";
import { hasTauriRuntime } from "../../platform/runtime";
import { probeWebDav, saveSyncCredentials, type SyncCredentials } from "../../platform/syncCredentials";
import { useNotebookStore } from "../../store/useNotebookStore";
import { hasDebugSamples, isDebugSampleNode } from "../../domain/debugSamples";

const DEFAULT_ENDPOINT = "https://dav.jianguoyun.com/dav/";

export function SettingsPanel() {
  const [credentials, setCredentials] = useState<SyncCredentials>({
    endpoint: DEFAULT_ENDPOINT,
    username: "",
    password: "",
  });
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);
  const [maintaining, setMaintaining] = useState(false);
  const [maintenanceStatus, setMaintenanceStatus] = useState("");
  const [sampleStatus, setSampleStatus] = useState("");
  const [generatingSamples, setGeneratingSamples] = useState(false);
  const nodes = useNotebookStore((state) => state.nodes);
  const generateDebugSamples = useNotebookStore((state) => state.generateDebugSamples);
  const deletedNodeCount = useNotebookStore((state) => Object.values(state.nodes).filter((node) => Boolean(node.deletedAt)).length);
  const emptyTrash = useNotebookStore((state) => state.emptyTrash);
  const maintainStorage = useNotebookStore((state) => state.maintainStorage);
  const debugSampleCount = Object.values(nodes).filter((node) => isDebugSampleNode(node.id)).length;

  const updateCredential = (key: keyof SyncCredentials, value: string) => {
    setCredentials((current) => ({ ...current, [key]: value }));
  };
  const save = async () => {
    setStatus("正在保存...");
    if (!hasTauriRuntime()) {
      setStatus("浏览器预览已保存（桌面版将使用系统密钥环）");
      return;
    }
    try {
      await saveSyncCredentials(credentials);
      setStatus("配置已安全保存");
    } catch {
      setStatus("保存失败，请检查系统密钥环");
    }
  };
  const testConnection = async () => {
    setTesting(true);
    setStatus("正在测试 WebDAV...");
    try {
      setStatus(await probeWebDav(credentials));
    } catch (error) {
      setStatus(String(error));
    } finally {
      setTesting(false);
    }
  };
  const purgeTrash = async () => {
    if (!deletedNodeCount) return;
    if (!window.confirm(`将永久删除回收站中的 ${deletedNodeCount} 个节点及其关联数据。此操作无法撤销，是否继续？`)) return;
    setMaintaining(true);
    setMaintenanceStatus("正在清空回收站并整理数据库...");
    try {
      const result = await emptyTrash();
      setMaintenanceStatus(`已永久删除 ${result.purgedNodes} 个节点和 ${result.purgedAttachments} 个附件。`);
    } catch (error) {
      setMaintenanceStatus(`清理失败：${String(error)}`);
    } finally {
      setMaintaining(false);
    }
  };
  const compactDatabase = async () => {
    setMaintaining(true);
    setMaintenanceStatus("正在整理本地数据库...");
    try {
      const compacted = await maintainStorage();
      setMaintenanceStatus(hasTauriRuntime() ? `数据库整理完成，压缩 ${compacted} 条冗余文本日志。` : "浏览器预览无需整理 SQLite 数据库。");
    } catch (error) {
      setMaintenanceStatus(`整理失败：${String(error)}`);
    } finally {
      setMaintaining(false);
    }
  };
  const generateSamples = () => {
    if (hasDebugSamples({ nodes })) {
      setSampleStatus("测试样例已存在");
      return;
    }
    setGeneratingSamples(true);
    setSampleStatus("正在生成测试样例...");
    try {
      const created = generateDebugSamples();
      setSampleStatus(created ? `已生成 ${created} 个测试节点` : "测试样例已存在");
    } finally {
      setGeneratingSamples(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="content-header"><div><p className="eyebrow">工作区配置</p><h1>设置</h1></div></div>
      <section className="settings-section">
        <div className="section-title"><Cloud size={19} /><div><h2>坚果云同步</h2><p>凭据仅用于本机连接 WebDAV，数据库文件不会直接同步。</p></div></div>
        <label>WebDAV 地址<input value={credentials.endpoint} onChange={(event) => updateCredential("endpoint", event.target.value)} /></label>
        <label>坚果云账号<input value={credentials.username} onChange={(event) => updateCredential("username", event.target.value)} placeholder="邮箱地址" /></label>
        <label>应用密码<input type="password" value={credentials.password} onChange={(event) => updateCredential("password", event.target.value)} placeholder="WebDAV 应用密码" /></label>
        <div className="settings-actions">
          <button className="primary-button" type="button" onClick={() => void save()}>保存同步配置</button>
          <button className="subtle-button" type="button" onClick={() => void testConnection()} disabled={testing}>{testing ? "测试中..." : "测试连接"}</button>
        </div>
        {status && <p className="settings-status">{status}</p>}
      </section>
      <section className="settings-section">
        <div className="section-title"><Bug size={19} /><div><h2>调试样例</h2><p>生成一组可重复使用的节点、层级和 Markdown 测试数据。</p></div></div>
        <div className="setting-row"><span>样例节点</span><span className="setting-value">{debugSampleCount} 个</span></div>
        <div className="settings-actions">
          <button className="subtle-button" type="button" onClick={generateSamples} disabled={generatingSamples || debugSampleCount > 0}>
            <Bug size={15} />{generatingSamples ? "生成中..." : debugSampleCount > 0 ? "已生成测试样例" : "生成测试样例"}
          </button>
        </div>
        {sampleStatus && <p className="settings-status">{sampleStatus}</p>}
      </section>
      <section className="settings-section">
        <div className="section-title"><SlidersHorizontal size={19} /><div><h2>编辑偏好</h2><p>日期节点使用设备的固定工作区时区。Markdown 即时渲染保持单编辑区。</p></div></div>
        <div className="setting-row"><span>附件下载</span><span className="setting-value">按需下载，可固定离线</span></div>
        <div className="setting-row"><span>本地历史</span><span className="setting-value">长期保留</span></div>
      </section>
      <section className="settings-section">
        <div className="section-title"><Database size={19} /><div><h2>本地存储维护</h2><p>无需打开回收站即可永久清理软删除数据，并压缩冗余文本编辑日志。</p></div></div>
        <div className="setting-row"><span>回收站节点</span><span className="setting-value">{deletedNodeCount} 个</span></div>
        <div className="settings-actions">
          <button className="subtle-button" type="button" onClick={() => void compactDatabase()} disabled={maintaining}><Database size={15} />整理数据库</button>
          <button className="danger-button" type="button" onClick={() => void purgeTrash()} disabled={maintaining || deletedNodeCount === 0}><Trash2 size={15} />清空回收站</button>
        </div>
        {maintenanceStatus && <p className="settings-status">{maintenanceStatus}</p>}
      </section>
    </div>
  );
}
