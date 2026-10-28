# Console Task 失败详情

适用界面为集群 Operation 的日志抽屉。Task 的 `status.result.reason/message` 在错误区域展示，独立于日志正文和日志读取错误。Failed、TimedOut、Canceled 均适用；没有详情时保留失败状态，不制造错误文字。内容作为 React 文本渲染，长行可换行。

节点匹配在有 UID 时使用 UID；同时核对 Operation UID 与 Step，继续按 retryGeneration、attempt、创建时间选择最新实际 Task。Task UID 变化时使用新的日志实例，旧请求在组件退出或日志重置后失效。历史成功 Task 仍可复用；此界面没有改变后端重试策略或任务历史。

日志展开由组件控制，网络响应不负责重新展开界面。当前读取顺序执行并使用后端 deliverySize 更新偏移；失败保留正文与偏移，重新加载只恢复日志读取，不清除 Task 的执行错误。运行进入终态时再读最后一段，避免只有轮询期间的半截正文。Task 查询也按请求版本隔离，迟到响应不能覆盖新 Operation、重试结果或已关闭抽屉后的共享 Store。

## 自动检查

使用项目现有依赖与 Node 22：

```sh
node tests/unit/test.js --watchAll=false --runInBand --no-cache
node node_modules/eslint/bin/eslint.js \
  src/pages/cluster/containers/Cluster/Detail/Operation/actions/PipelineLogDialog/RightLogContent.jsx \
  src/pages/cluster/containers/Cluster/Detail/Operation/actions/PipelineLogDialog/RightLogContent.test.jsx \
  src/pages/cluster/containers/Cluster/Detail/Operation/actions/PipelineLogDialog/index.jsx \
  src/pages/cluster/containers/Cluster/Detail/Operation/actions/PipelineLogDialog/index.test.jsx \
  src/utils/object.mapper.js src/utils/object.mapper.test.js \
  src/stores/log.js src/stores/log.test.js
NODE_ENV=production node --openssl-legacy-provider --max-old-space-size=4096 \
  node_modules/webpack-cli/bin/cli.js --config config/webpack.prod.js
git diff --check
```

组件回归直接断言可见错误文字、空正文、折叠、加载、读错、节点顺序、Task UID 切换及成功重试。mapper 回归覆盖跨 Operation/Step、同名旧节点和历史成功 Task；Store 与抽屉回归覆盖慢响应、关闭后响应、顺序字节偏移和终态尾部。现有 Operation 重试资格测试也需通过。

## 本轮浏览器回放边界

F04 原始缺陷来自 2026-10-25 全量测试：Registry 停机后 installRuntime 失败，CLI 展示 `connect: connection refused`，旧 UI 只有 custom 命令标题。回放保留该原始错误文字和 Operation 身份，Task 名称/UID 使用明确的回放标识；最小 Task 结构根据现场 CLI 和 Operation 记录重建，不冒充原始完整 API 对象。成功、日志读取失败和 reason-only 切换用于前端回归，不代表远端任务重新执行。

本轮回放使用实际 RootStore、mapper、LogStore、RightLogContent 与中英文文案构建，不替换这些实现。仅网络层由本地 HTTP fixture 服务提供数据。记录源码文件和构建文件的 SHA256、浏览器可见文本及截图，明确与生产构建检查、现场三机运行、CI 和发布的证据边界。
