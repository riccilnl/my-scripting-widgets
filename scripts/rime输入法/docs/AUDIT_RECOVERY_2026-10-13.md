# Scripting Rime 审计修复恢复记录

日期：2026-10-13

## 唯一基线

- 源码位置：戴尔 Cora 项目 scripts 下的 rime输入法/
- 来源：GitHub riccilnl/my-scripting-widgets main，提交 f9c0b12b5769782179e66d266d23f2a71fb8d125。
- 原始版本号：0.3.43，**保持不变**。
- 候选展开列表 ExpandedCandidatePanel.tsx 的 LazyVGrid 布局已在 iPhone 真机验收通过；本轮不修改这一冻结文件。
- 戴尔目录无 Git 元数据，项目通过 Cora 授权执行和文件读取操作；不得宣称已提交或发布。

## 本轮修复与模块契约

1. **InputController**：rimeText 逐 Unicode 码点调用 Rime，保留每一步的 snapshot 和没有消费的字面文本，避免多字符快捷输入丢失中途提交。
2. **keyboard/main**：逐步发布 rimeText；Shift/Caps 用同步 Ref 避免快速事件使用过期 React 状态；候选选择和空格拖动进入键盘动作队列；键盘卸载时释放编辑控制器并撤销输入队列。
3. **actionQueue + hostCommand + EditController**：普通同步点击保持即时执行；异步剪贴板操作串行等待且拒绝/异常可继续队列；关闭键盘后忽略延迟粘贴和剪切；复合 Unicode 文本删除使用 grapheme 计数。
4. **T9BridgeRuntime**：存在性和读取 API 的失败不等同于文件缺失；拒绝在读取异常下覆盖 Lua/custom 配置，存在性接口报错时停止创建目录。
5. **RimeEngine**：遍历翻页候选词后，恢复原页面及高亮位置。
6. **WanxiangInstall**：部署文件前校验可信 SHA256 摘要（如提供）；方案、字典和模型按受控相对路径执行备份/复制事务；应用内失败自动回滚；回滚失败保留备份目录供人工恢复。保留自定义文件，受保护路径不可覆盖。

## 验收命令（戴尔 scripts 项目根目录）

    node --test rime输入法/tests/runtime.test.cjs

- 17 项自动化测试 PASS：快捷文本输入、ASCII、异步排队、重入 FIFO、键盘卸载后回调、复合字符、候选分页、高亮恢复、万象成功更新/回滚/回滚失败保留备份、恶意路径拒绝、SHA256 不匹配、T9 读取失败。
- 全部 62 个 TS 文件由 Node.js 22 stripTypeScriptTypes({mode:"transform"}) 成功解析。
- 未执行完整 TypeScript 类型检查或 Scripting iOS 真机运行验收；TSX 仅做源码不变量检查，并未运行实际框架。
- 本轮未主动向 iPhone 写入或同步代码，也未提交 GitHub；iPhone 是否自动同步需另行读取确认。保持 script.json 版本号，等待真机验收。

## 已知限制 / 后续验收

- **万象事务仅覆盖进程内故障**，突然断电/进程强制终止后的事务恢复尚未开发，不得视为真正 crash-safe。巨大模型 SHA256 校验需在内存中读取 Data，真机内存峰值待验证。
- 若自动回滚仍失败，保留 .wanxiang-update-backup-* 供人工恢复，不可直接删除。
- Scripting CustomKeyboard.deleteBackward 对 Unicode grapheme 的实际单位和 markText 合成语义需真机确认。
- 多字符 RimeSnapshot 中的上下文对象是否由底层 Rime 复用需真机验证。
- **不要**重新引入旧版 LazyVStack/HStack 候选滑动布局。
- 下步：通过 Scripting 插件逐文件只读对比手机和戴尔，用户批准后再同步；验收键盘、候选词、剪贴板、T9、万象安装；完成后另行决定提交 GitHub。

## 2026-10-13 增量修复：顶部横向候选栏的点击命中结构

- 症状：单字候选需要精准点中文字；单字周围与候选间的空白容易点击失败。
- 结构问题：旧 CandidateBar 为 ScrollView(horizontal) → HStack(真实间距 8/10pt) → VStack(onTapGesture) → Text，真实间距形成无归属区域，点击手势与横向拖动叠加。
- 源码变更：仅 CandidateBar.tsx 采用 HStack spacing=0；每个候选为原生 Button(buttonStyle=plain)；透明背景和 contentShape=rect 覆盖整格；左右视觉留白放入格内。
- 触摸宽度下限：单字为 candidateSingleCharTouchWidth + candidateItemSpacing，多字为 candidateMinTouchWidth + candidateItemSpacing，长词仍自适应。
- 原功能不变：展示前 12 个、originalIndex 选词、高亮居中滚动、右侧展开、两侧工具栏及展开网格。
- 回归：19/19 Node 自动测试通过，62 个 TS 文件语法解析通过。展开网格 Git blob 仍为 0efb8f4b6b584df17dd4eaec3b11479ebba71c62；版本 0.3.43 未变。
- 本轮只改戴尔；没有主动同步手机或提交 GitHub。真机点击验收尚未执行，不能据本地测试宣称真实触摸问题已解决。

## GitHub 自动发布补记

- 经过戴尔端 19/19 测试，候选栏重构和审计恢复合并为 0.3.44 发布候选。
- 此前的 0.3.43 是 2026-10-13 修复期间的开发基线；当前发布候选的 manifest 为 0.3.44。
- Git 根目录 ~/Work/scripting，发布源 scripts/rime输入法；子目录 scripts/scripts/rime输入法 是独立旧副本，未纳入发布。
- GitHub Actions 仅处理 Rime 源码，先验证再构建根目录安装包。
- 手机尚未验收 0.3.44 的输入/剪贴板/T9/万象等修复，必须在导入后进行真机验证。
