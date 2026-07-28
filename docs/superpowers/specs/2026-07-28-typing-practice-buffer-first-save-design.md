# 打字练习缓冲区优先保存修复设计

日期：2026-07-28

## 背景

逐字判定模式处理第一个字符后，`WorkspacePracticeEditorAdapter.render()` 先用 `PracticeFileSystemProvider.restoreSessionDocument()` 改写内存文件并发出文件变化事件，随后才调用当前 dirty 文档的 `TextDocument.save()`。这会让 VS Code 把 Provider 更新视为来自编辑器外部的变化；保存随后返回 `false`，生命周期适配器将其作为系统错误回滚。连续输入中的第二个字符因此持续显示错误，并产生未处理 Promise。

此外，VS Code 文档事件不会等待上一次异步 listener 完成。用户快速输入 `a → b` 时，`a` 的 render/save 可能尚未结束，`b` 已使用旧 Checkpoint 开始判定；`stagedText` 也可能被后一个事件覆盖或被前一个 render 清空。保存顺序和逐 session 串行化必须一起修复。

VS Code 公共 API 规定 `TextDocument.save()` 返回 `false` 表示保存失败。该失败不能被静默吞掉。

## 目标

- 连续逐字输入 `a → b → c` 时，每个正确字符只推进一次且不回滚。
- 每次输入处理结束后，练习编辑器没有未保存圆点。
- 关闭或完成练习时不出现保存确认提示。
- Checkpoint 与已保存编辑器文本保持一致。
- 真实保存失败仍向上报告并走现有回滚路径。
- 同一 session 的文档变化、save 和 close 按事件顺序串行处理，不能重复或遗漏输入。

## 非目标

- 不把练习编辑器改为 Webview 或 Custom Editor。
- 不改变 IME provisional 批次过滤、Session Engine 或成绩计算语义。
- 不用 `save() === false` 的特殊分支掩盖保存失败。
- 不重写命令路由或所有扩展自有文档编辑。

## 方案

### 1. 每个 session 串行处理文档生命周期

`PracticeDocumentLifecycleAdapter` 为每个 session 维护一条 Promise 队列和单调递增的 recovery generation。`handleDocumentChange()` 先根据 URI 解析 session，然后把完整的不可变事件快照连同当前 generation 入队；真正执行时重新读取最新 `context.checkpointText` 并重新分类。

- `a` 的 input/render/save 完成并前移 Checkpoint 后，队列才处理快照 `ab`；此时 diff 只产生 `b`。
- 前一个任务失败不能永久阻塞队列；后续任务从最后稳定 Checkpoint 继续。
- `handleDocumentSave()` 和 `handleDocumentClose()` 进入同一 session 队列，保证 flush/close 不越过尚未完成的输入。
- 队列保留并比较 document version；已被更高版本稳定 Checkpoint覆盖的事件忽略，不能回放陈旧输入。
- 每一条 rollback 路径都必须在恢复尝试完成后、下一个排队任务执行前递增该 session 的 recovery generation。这包括分类返回的结构性 rollback、`host.save()` 失败和 workspace Checkpoint 写入失败，不能只覆盖抛异常的 input 路径。
- 所有在 rollback 前或 rollback 期间入队、仍携带旧 generation 的文档变化快照均直接忽略，不得重新 stage 或 input。
- rollback 自身产生的文档事件继续由 extension-edit guard 忽略。恢复完成之后用户产生的新事件携带新 generation，可以从稳定 Checkpoint继续。
- save/close 操作不作为可回放输入快照；即使前一输入失败，它们仍在 rollback 后针对当前稳定状态执行。
- 队列 Promise 在内部连接 `reportError`，同时保留返回 Promise 给直接调用方；VS Code Event 未观察返回值时也不能形成 unhandled rejection。
- 若 rollback 无法达到稳定恢复后置条件，该 session 标记为 recovery-failed；后续输入任务拒绝执行，只允许报告错误和关闭，不能在不一致状态上继续推进。
- session close/dispose 后清理对应队列引用。

不同 session 之间不共享全局锁。

### 2. 区分 staged 用户缓冲区与扩展恢复

`WorkspacePracticeEditorAdapter.render()` 已通过 `stagedText` 知道本次状态是否来自真实文档变化。

当存在 `stagedText` 时：

1. 从 staged 文本和新 Session 构建候选 Checkpoint。
2. 先调用 `host.save(editor)`，让 VS Code 把当前编辑器缓冲区写入 FileSystemProvider 并清除 dirty 状态。
3. 保存 workspace Checkpoint。
4. 更新内存中的稳定 Checkpoint，清除 staged 状态并渲染 Decoration。
5. 不调用 `restoreSessionDocument()`，因为编辑器缓冲区和 Provider 已由同一次 save 对齐。

这消除了“先外部改写 Provider，再保存 dirty 缓冲区”的冲突。

### 3. 无 staged 文本的状态渲染

暂停、恢复等不改变练习文本的状态更新继续保存 workspace Checkpoint。只有当按 Checkpoint 重建的权威文档与 Provider 当前内容不一致时，才恢复 Provider 内容；相同内容不重复触发文件变化事件。

这条路径不应制造 dirty 缓冲区，也不应执行无意义的重复保存。

### 4. 完成与关闭

- `complete()` 复用 `render()` 完成唯一一次必要保存，不再紧接着调用第二次 `host.save()`。
- `close()` 若存在 staged 用户文本，遵循相同的“先保存缓冲区、再保存 Checkpoint”顺序；无 staged 文本时只确保持久化 Checkpoint，并避免重复 save。
- `didClose()` 仍只持久化最后稳定事实并 detach，不尝试保存已经关闭的文档。

### 5. 失败与一致性

- `host.save()` 返回失败时，不前移稳定 Checkpoint，不清除 staged 状态；错误继续抛给 Lifecycle，由现有 rollback 恢复上一个稳定 Checkpoint。
- workspace Checkpoint 写入失败时，已保存的内存文件可能暂时领先，但稳定 Checkpoint 仍不前移；rollback 使用旧 Checkpoint 恢复，保持可恢复性。
- rollback 新增一个 Host 级“恢复稳定文档”操作：在 extension-edit guard 内把旧 Checkpoint 文本完整替换进当前编辑器缓冲区，再通过 `TextDocument.save()` 的正常写入通道写回 Provider；禁止先从 Provider 外部改写 dirty 文档。操作成功必须同时验证编辑器文本等于稳定 Checkpoint、Provider 内容一致且 `document.isDirty === false`。
- 若缓冲区替换、恢复保存或后置条件验证失败，抛出明确的 terminal recovery error，并把 session 标记为 recovery-failed；不能假装 rollback 成功，也不能继续消费后续输入。该终止错误仍由统一错误报告路径显示。
- 任何失败都不得形成未观察的 Promise rejection；Registration/Lifecycle 的错误报告路径继续负责向用户显示错误。
- 任意 rollback（成功控制流或异常恢复）都必须先完成恢复尝试并递增 recovery generation，再允许队列执行下一个任务。
- rollback 恢复尝试结束时使所有恢复前和恢复期间入队的变化快照失效；不能用已不再存在于编辑器缓冲区的旧快照推进 Session。

## 测试

按 TDD 顺序增加：

1. Lifecycle 单测：延迟 `a` 的 save，在其完成前送入 `ab` 事件；断言 input 严格为 `a`、`b`，没有重复 `ab`，并验证 document version 单调前移。
2. Lifecycle 单测：`a` 保存失败时 `ab` 已排队；rollback 后旧 `ab` 快照被丢弃，恢复完成后新到达的 `b` 事件才被处理；异步错误已交给 `reportError`，没有 unhandled rejection。
3. Lifecycle 单测：结构性 rollback 和 Checkpoint 写入失败都在恢复后递增 generation，分别丢弃恢复期间排队的旧快照。
4. Lifecycle 单测：VS Code listener 不观察返回 Promise 时错误仍只报告一次且不产生 unhandled rejection；直接调用方仍收到 rejection，队列随后可继续处理稳定状态。
5. Adapter 单测：连续 staged `a`、`ab`、`abc`，每次都先 save 后保存对应 Checkpoint，且不调用 Provider restore。
6. Adapter 单测：首次 save 失败时稳定 Checkpoint 不前移；rollback 从编辑器缓冲区恢复旧文本、写回 Provider，并验证文档 clean。
7. Adapter 单测：rollback 的恢复保存再次失败时进入 recovery-failed，后续输入不再执行。
8. Adapter 单测：`complete()` 不执行第二次 save。
9. FileSystemProvider 单测：恢复内容与当前字节相同时不发出重复 Changed 事件。
10. VS Code Host 单测：`save() === false` 仍明确抛错；恢复稳定文档成功后文本、Provider 和 dirty 状态满足后置条件。
11. Extension Host 回归：真实 `moyuplus-practice:` 文档连续输入至少三个字符，无保存错误，最终文档和进度一致。

## 验收标准

- M2 步骤 3 输入 `abcX`：`abc` 均为正确状态，只有 `X` 报红。
- 控制台不再出现 `VS Code could not save the practice document` 或未处理 Promise。
- 输入期间标签无未保存圆点；结束或关闭练习无保存确认框。
- Backspace 修正 `X` 后可继续输入目标字符。
- TypeScript、全量单测、构建和 Extension Host 自动测试通过。
