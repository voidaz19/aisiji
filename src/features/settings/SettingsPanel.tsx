import { useState } from "react";
import { Cloud, SlidersHorizontal } from "lucide-react";
import { hasTauriRuntime } from "../../platform/runtime";
import { probeWebDav, saveSyncCredentials, type SyncCredentials } from "../../platform/syncCredentials";

const DEFAULT_ENDPOINT = "https://dav.jianguoyun.com/dav/";

export function SettingsPanel() {
  const [credentials, setCredentials] = useState<SyncCredentials>({
    endpoint: DEFAULT_ENDPOINT,
    username: "",
    password: "",
  });
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);

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
        <div className="section-title"><SlidersHorizontal size={19} /><div><h2>编辑偏好</h2><p>日期节点使用设备的固定工作区时区。Markdown 即时渲染保持单编辑区。</p></div></div>
        <div className="setting-row"><span>附件下载</span><span className="setting-value">按需下载，可固定离线</span></div>
        <div className="setting-row"><span>本地历史</span><span className="setting-value">长期保留</span></div>
      </section>
    </div>
  );
}
