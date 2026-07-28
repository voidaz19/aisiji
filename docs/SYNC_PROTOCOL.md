# WebDAV 同步协议

应用不直接同步 SQLite 文件。每台设备把本地操作写入不可变 JSON 块，并将块上传到工作区目录：

```text
workspace/
  ops/<device-id>/<first-sequence>-<last-sequence>.json
  blobs/<sha256>/<attachment-id>
  snapshots/<generation>.json
```

操作块包含 `opId`、`deviceId`、`sequence`、`hlc`、`baseRevision`、`kind`、`entityId` 和 `payload`。客户端按 `opId` 幂等应用，并在本地维护已应用游标。

会改变内容节点的操作在 `payload.pageId` 中记录操作发生时的活动页面根。`pageId` 只用于恢复“最近编辑页面”等页面级上下文，不替代 `entityId`，也不改变节点的真实父子关系。旧操作允许缺少 `pageId`，客户端不得从被编辑节点父链伪造当时页面。

Markdown 编辑冲突在客户端执行三方合并；结构移动按 HLC 和设备 ID 解决并进行环检测；删除使用墓碑，恢复通过新的显式操作完成。WebDAV 只负责远程文件保存，不承担合并逻辑。
