# 打字练习 Webview 输入架构重做设计

日期：2026-07-28
状态：已完成产品设计评审，待实施计划

## 1. 背景与问题结论

当前练习把 `moyuplus-practice:` 虚拟文档当作输入设备，通过
`TextDocumentChangeEvent`、文档差异、保存、回滚和延时窗口推断用户真正提交的内容。
这条链路无法可靠区分输入法预编辑、候选切换和最终上屏：

- VS Code 公共文本文档事件不公开输入法 composition 的开始、更新和结束边界。
- “逐字判定”会把 `zhu` 等预编辑拼音当成练习输入。
- “稳定上屏判定”只能根据内容和时间推测提交，候选停留或切换会产生误判。
- 虚拟文档的 Provider 更新、dirty buffer、`save()` 和异步事件队列之间存在额外的一致性与回滚风险。
- 现有自动测试模拟的是最终文档变化，不是真实输入法组合过程，因而曾产生错误信心。

本次不再修补文档差异算法，而是更换输入架构。练习改为独立
`WebviewPanel`，使用真实 DOM 输入控件接收标准 composition 事件。
输入法提交边界来自 `compositionend`，不再来自时间、候选文字或文档稳定性推断。

参考：

- [W3C UI Events：Composition Events](https://www.w3.org/TR/uievents/#events-compositionevents)
- [MDN：InputEvent.isComposing](https://developer.mozilla.org/en-US/docs/Web/API/InputEvent/isComposing)
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code Webview UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/webviews)

## 2. 设计目标

- 输入法预编辑文本原位、中性显示，不参与正确性、错误率、速度或进度计算。
- `compositionend` 后只对最终提交内容判定一次。
- 非组合的英文、数字和符号直接输入后立即判定。
- “必须修正”模式下，首个错误保留为红色并阻塞，退格纠正后才可继续。
- 标签页内继续提供沉浸式练习体验，但不再创建、保存或恢复练习文本文档。
- 扩展进程是已提交输入、目标位置、错误、进度和完成状态的唯一权威来源。
- 快速输入、消息重试、页面重建和 Extension Host 重载不会重复或丢失已提交事务。
- 自动测试覆盖事件、协议和领域规则；Windows 真实输入法人工验收是发布硬门槛。

## 3. 非目标

- 不保留原生 Text Editor 作为输入法兼容后备。
- 不继续维护候选过滤、稳定窗口、延时防抖或文档内容启发式算法。
- 不允许任意光标移动、选区修改或编辑已经确认的练习历史。
- 不在 Webview 中复制一套正确性判定领域逻辑。
- 不把输入法预编辑文本持久化为会话事实。
- 不借本次重做改变素材、书架、历史、熟练度或结果统计的产品范围。

## 4. 产品决策

### 4.1 练习承载面

- “素材 / 设置 / 结果 / 历史”继续位于现有 Typing View 侧栏。
- “保存并开始练习”创建或定位独立的练习 `WebviewPanel` 编辑器标签页。
- 每个活动会话最多绑定一个练习标签页；重复打开只 reveal 原标签页。
- 关闭标签页等价于暂停并保存权威检查点，不出现文档保存提示。
- 完成后在同一标签页展示完成状态，并通知侧栏刷新结果。

### 4.2 输入语义不再可配置

旧的 `EvaluationMode = 'character' | 'committedBatch'` 混合了两个不同概念：
练习判定粒度和输入法提交识别。新架构将二者拆开：

- composition 是浏览器输入事实，由 DOM 事件确定，不是用户设置。
- 所有已提交文本均按 Unicode 字素依次判定。
- 输入法词组、语音输入或粘贴可以一次提交多个字素，但领域层仍按顺序处理。

因此删除设置页中的“输入方式 / 稳定上屏判定”选项，并从新 Plan schema 中删除
`evaluation.mode`。保留“错误处理”等真正影响练习规则的设置。
旧 Snapshot、偏好和结果中的 mode 字段只用于向后读取或迁移，不能驱动新输入链路。

### 4.3 受控编辑

- 输入位置始终是当前目标处。
- 历史文字不可点击定位、选择或直接修改。
- 方向键、Home、End、Enter 和 Tab 不提交练习文字，也不移动练习光标。
- 退格只纠正当前阻塞错误；无错误时不撤销正确历史。
- 粘贴作为显式批量提交事务处理。

## 5. 系统边界与职责

### 5.1 `PracticeWebviewPanel`

负责：

- 创建、定位、恢复和销毁练习标签页。
- 配置 Webview 脚本、CSP、本地资源和消息通道。
- 将 Webview 消息交给应用层命令端口。
- 将权威快照、事务确认、错误和完成状态发回页面。

不负责：

- 判断字符正确性。
- 推断输入法状态。
- 保存虚拟文档。
- 直接写领域 Store。

### 5.2 Webview 输入客户端

负责：

- 持有焦点和真实 DOM 输入控件。
- 持有当前 composition 的临时状态。
- 将直接输入、最终组合文本、粘贴和纠错转换为有序事务。
- 暂存未确认事务，并显示中性待确认状态。
- 根据权威快照渲染正确、错误、目标和剩余文字。

Webview 不得自行决定正确、错误、进度或完成。

### 5.3 扩展进程应用层

负责：

- 校验协议、会话、panel instance、序号和修订号。
- 对同一个 session 串行处理事务。
- 幂等返回重复 `transactionId` 的原确认结果。
- 调用 Session Runtime 判定或纠错。
- 持久化权威会话与结果。
- 生成供 Webview 渲染的权威快照。

### 5.4 领域层与存储层

领域层只接收明确的“已提交输入”和“纠错”命令，不接收文档快照或文本 diff。
存储层只保存已确认会话检查点、Snapshot、结果和必要的事务幂等信息。
候选列表、拼音预编辑和 Webview DOM 永远不进入领域存储。

## 6. 输入状态模型

composition、传输和权威会话状态彼此正交，不能建模为互斥枚举：

```ts
interface PracticeInputClientState {
  composition:
    | { kind: 'idle' }
    | {
        kind: 'composing';
        compositionId: string;
        draftText: string;
        discardOnEnd: boolean;
      };
  transport: {
    pending: PendingPracticeTransaction[];
    nextSequence: number;
    resyncing: boolean;
  };
  authority:
    | { kind: 'loading' }
    | { kind: 'ready'; revision: number }
    | { kind: 'blocked'; revision: number; blockedAttemptId: string }
    | { kind: 'paused' | 'completed' | 'error'; revision: number };
}
```

页面可在前一个事务等待确认时继续接收快速输入并追加 FIFO；这些内容只显示为中性
待确认。传输层每个 session 同一时刻只允许一个 in-flight 事务。后续事务留在 Webview
本地 FIFO，直到队首 ack 或完成重同步后才赋予当前 `baseRevision` 并发送。

`authority.kind === 'loading'` 或 `transport.resyncing === true` 时输入控件禁用并显示
恢复提示；取得权威 Snapshot 前不捕获、不缓存用户输入。

若队首事务产生阻塞错误，尚未发送的后续 submit 从 FIFO 移除并标记为未消费，不进入
Host 或练习历史，页面清除对应待确认显示。用户看到权威错误后发送的纠错事务才成为
新的队首。该规则避免对未知未来 revision 做乐观预测。

若阻塞 ack 到达时浏览器正在进行一个更晚开始的 composition，客户端不得强行操纵
输入法候选窗；它把该 composition 标记为 `discardOnEnd`。本次组合结束或取消时只清空
控件，不形成事务，并播报先前的阻塞错误。

### 6.1 组合输入

1. `compositionstart`
   - 创建唯一 `compositionId`。
   - 进入 `composing`。
   - 不调用领域层。
2. `compositionupdate`
   - 更新 `draftText`。
   - 原位显示中性预编辑文本。
3. 组合期间的 `beforeinput`、`input` 和 `keydown`
   - 仅允许浏览器和输入法更新真实输入控件。
   - `isComposing === true` 时绝不形成练习提交。
4. `compositionend`
   - 从真实输入控件读取已经更新的最终值。
   - 空值表示取消，不形成事务。
   - `discardOnEnd` 为 true 时丢弃最终值，不形成事务。
   - 非空值形成唯一 `practice/submit` 事务，`inputKind` 为 `composition`。
   - 清空控件和临时 composition 状态。

`compositionend` 后可能相邻出现一个非 composing 的 `input` 事件。客户端以
`compositionId + 控件变化序号` 记录已消费的最终 DOM 变化，只抑制这一已消费变化，
不得用时间窗口抑制后续真实输入。

页面隐藏、销毁或 Extension Host 重载时，未结束的 composition 取消，不提交也不恢复。

### 6.2 直接输入

- 不根据 `keydown.key` 构造文本。
- 在 `input` 事件且 `isComposing === false` 时，从真实输入控件取得浏览器已经生成的文本。
- 文本非空时立即形成 `practice/submit`，`inputKind` 为 `direct`，随后清空控件。
- 死键、键盘布局和辅助输入只要没有进入 composition，也以浏览器生成的最终文本为准。

### 6.3 粘贴

- `paste` handler 读取 `text/plain`，阻止浏览器把它作为可编辑历史插入。
- 非空内容形成单个 `practice/submit`，`inputKind` 为 `paste`。
- 领域层按字素依次消费；首个阻塞错误后的剩余字素返回为 `unconsumedText`。

### 6.4 纠错和控制键

- composition 期间的 Backspace 交给输入法和浏览器，不发送纠错。
- `blocked` 时的 `beforeinput(inputType = 'deleteContentBackward')` 形成
  `practice/correct`，并阻止浏览器默认编辑。
- correction 已经 in-flight 时重复 Backspace 只保持阻止默认编辑，不再追加第二个纠错事务；
  收到 ack 后再根据新的权威状态决定后续 Backspace。
- 非阻塞状态的 Backspace 为 no-op，不撤销正确历史。
- Enter、方向键、Home 和 End 在输入控件内被受控层消费，不形成文字事务或移动练习 caret。
- Ctrl/Cmd 快捷键不得绕过受控输入规则。

快捷键最低行为矩阵：

| 输入 | 行为 |
| --- | --- |
| Ctrl/Cmd+V、Shift+Insert | 走受控 paste 事务 |
| Ctrl/Cmd+A、X、Z、Y | 在练习输入控件内阻止，不选择、剪切或撤销历史 |
| Ctrl/Cmd+C | 无历史选区时 no-op；不得把隐藏内部状态写入剪贴板 |
| Tab、Shift+Tab、F6 | 允许可访问性焦点导航，但不改变练习输入位置 |
| Esc | composition 期间交给输入法取消；其他状态不形成领域事务 |
| VS Code 全局快捷键 | 未与上述受控输入冲突时不得主动拦截 |

## 7. 领域命令

```ts
interface SubmitCommittedInputCommand {
  sessionId: string;
  transactionId: string;
  baseRevision: number;
  kind: 'direct' | 'composition' | 'paste';
  text: string;
}

interface CorrectBlockedInputCommand {
  sessionId: string;
  transactionId: string;
  baseRevision: number;
}
```

处理不变量：

- 使用 `Intl.Segmenter(..., { granularity: 'grapheme' })` 或等价共享实现分割 Unicode 字素。
- 每个提交按字素顺序判定。
- `errorPolicy === 'block'` 时，首个错误写入尝试历史并进入 blocked；
  同一事务的后续字素不消费，作为 `unconsumedText` 返回。
- `errorPolicy === 'allowSkip'` 时沿用现有跳错语义，错误计入历史并推进目标。
- 纠错命令只移除当前阻塞错误并记录一次 backspace correction；
  不撤销此前正确字素。
- 会话 `revision` 在每次成功应用提交或纠错后单调递增。
- 预编辑、空提交、重复事务、过期事务和未消费文字不计入速度、错误率或进度。
- 会话完成后拒绝任何迟到事务，不产生第二份结果。

现有 `InputAttemptOrigin` 改为描述真实来源的
`'direct' | 'composition' | 'paste'`。`character`、`committedBatch`、`enter`
和 `tab` 仅作为旧数据兼容值读取。

## 8. Webview 消息协议

协议必须版本化，并使用严格运行时校验。

### 8.1 Client → Host

```ts
interface PracticeSubmitMessage {
  protocolVersion: number;
  type: 'practice/submit';
  sessionId: string;
  panelInstanceId: string;
  sequence: number;
  transactionId: string;
  baseRevision: number;
  inputKind: 'direct' | 'composition' | 'paste';
  text: string;
}

interface PracticeCorrectMessage {
  protocolVersion: number;
  type: 'practice/correct';
  sessionId: string;
  panelInstanceId: string;
  sequence: number;
  transactionId: string;
  baseRevision: number;
}
```

另有不改变领域状态的 `practice/ready`、`practice/requestSnapshot` 和
`practice/pause` 生命周期消息。

### 8.2 Host → Client

```ts
interface PracticeTransactionAck {
  protocolVersion: number;
  type: 'practice/ack';
  sessionId: string;
  panelInstanceId: string;
  sequence: number;
  transactionId: string;
  outcome: 'applied' | 'blocked' | 'stale' | 'completed';
  transactionRevision?: number;
  currentRevision: number;
  consumedText: string;
  unconsumedText: string;
  snapshot: PracticePanelSnapshot;
}
```

`PracticePanelSnapshot` 至少包含：

- session id、revision 和 status。
- 当前 target index、目标总量和可显示目标窗口。
- 已确认正确窗口、当前阻塞错误及其 attempt id。
- 当前目标、进度、用时所需的权威时间字段。
- 完成时的结果摘要。

### 8.3 单 in-flight FIFO

- 捕获输入时先创建稳定的 `transactionId` 和本地 payload，追加到 pending FIFO。
- 只有 FIFO 队首可以成为 in-flight。
- 发送队首时才读取最新权威 `currentRevision` 作为 `baseRevision`，并为当前
  `panelInstanceId` 分配下一个 `sequence`。
- 收到匹配 panel、sequence 和 transaction id 的 ack 后移除队首，以 ack Snapshot
  更新权威状态，再发送下一项。
- ack 为 blocked 时清除所有尚未发送的 submit；ack 为 completed 时清除全部 pending。
- ack 为 stale 或发生 sequence gap 时不发送下一项，先进入 resync。
- 超时只触发相同 transaction id 的状态查询或重同步，不将“等待时间”解释为输入提交。

### 8.4 排序、幂等与重同步

- Webview 为每个 panel instance 生成从 1 开始单调递增的 `sequence`。
- Host 为每个 session 使用串行队列，不使用全局锁。
- `transactionId` 在 session 内唯一；Host 保存可跨 Extension Host 重载的幂等索引。
- 每个已应用事务的 durable receipt 至少保存 transaction id、输入摘要、应用前后 revision、
  consumed/unconsumed text 和领域 outcome，并与 Session checkpoint 一同提交。
  Extension Host 重载后仍能识别“已应用但 ack 未送达”的重放。receipt 可在 Session
  完成且不再可恢复后随归档策略压缩。
- receipt 保存领域处理结果，不保存可直接重放的旧消息 envelope 或旧 Snapshot。
- 重复事务不再次调用领域层。Host 使用重复请求当前的 `panelInstanceId` 和 `sequence`
  重新封装 ack，返回 receipt 中的 `transactionRevision`，同时附带当前权威
  `currentRevision` 和当前 Snapshot。新页面因此不会接收旧页面 envelope 或回退状态。
- 序号缺失、`baseRevision` 过期、未知 panel instance 或回包乱序时，
  页面停止发送新队首，请求权威 Snapshot。
- 重同步后：
  - 已出现在权威确认记录中的事务直接移出 FIFO。
  - 尚未确认的队首保留原 transaction id，使用新 panel sequence 和最新
    base revision 重发。
  - 无法衔接的事务显示为未提交并要求用户重新输入，不猜测合并。
- 每条异步消息处理链必须在注册边界捕获并报告错误，不能产生未处理 Promise rejection。

## 9. 练习界面

正文在视觉上连续呈现为：

```text
已确认正确 | 当前阻塞错误 | 真实输入控件 | 当前目标与剩余文字
```

### 9.1 真实输入控件

- 使用真实、可见的 `<input type="text">`，不使用屏幕外隐藏输入框或 `contenteditable`。
- 控件位于当前目标的真实视觉位置，使输入法候选窗锚定在当前字符附近。
- 控件根据预编辑或待输入内容动态调整宽度；空闲时仍显示可见 caret。
- 输入控件是唯一键盘、输入法和粘贴入口。

### 9.2 视觉状态

- 已确认正确：绿色。
- 当前阻塞错误：红色加下波浪线。
- composition draft：中性前景色，不使用红绿状态。
- pending ack：与 composition 区分的中性待确认样式。
- 当前目标：明确高亮。
- 剩余内容：弱化色。
- 错误状态同时显示“按退格修正”文本，不能只靠颜色传达。

### 9.3 焦点与可访问性

- 正常情况下焦点保持在输入控件。
- 焦点异常离开时显示“点击继续输入”，用户动作后再聚焦；不得用焦点轮询抢占其他 UI。
- 使用低频 `aria-live` 播报错误、进度里程碑和完成。
- composition update 不逐键播报。
- 主题、字号、行高、焦点轮廓和高对比度使用 VS Code Webview CSS 变量。
- 输入控件保留可访问名称、拼写检查关闭和适当的自动完成属性。

### 9.4 长文本

- Snapshot 只下发并渲染当前目标附近的显示窗口及必要上下文。
- 不为整篇超长材料创建逐字 DOM 节点。
- Host 按 target index 提供稳定窗口边界；这里的“窗口”仅指渲染分页，
  与输入稳定性推断无关。
- 目标推进后自动调整显示窗口，不允许输入延迟随全文长度线性增长。

## 10. 生命周期与恢复

### 10.1 开始

1. 应用层准备 Snapshot。
2. 创建领域 Session、初始 revision 和 workspace checkpoint。
3. 获取 session lease。
4. 创建或 reveal `PracticeWebviewPanel`。
5. 收到 `practice/ready` 后下发权威 Snapshot。

若面板创建失败，释放 lease；已创建的 Session 保持可恢复或按现有启动事务规则清理，
不得留下“活动但不可进入”的孤儿会话。

### 10.2 关闭与暂停

- 面板关闭时取消未结束 composition。
- 已确认 Session 已在每个 ack 前持久化；关闭时再执行一次幂等 flush。
- Host 已接收的 submit/correct 与 pause/dispose 进入同一 session 串行队列；
  pause 不得越过先到达的事务。panel binding 在该队列完成后失效。
- 尚未确认的事务保存在 Webview `setState()` 中，正常页面重建后可重发。
- 关闭整个 panel 后本地 Webview state 会销毁；未被 Host 接收的事务不视为已提交。
- 会话进入 paused 并保留恢复入口，不触发文档 save、dirty 或确认框。

### 10.3 页面隐藏与重建

优先使用无状态重建和 `getState()/setState()`，不启用高内存的
`retainContextWhenHidden`。页面恢复流程为：

1. 生成新的 `panelInstanceId`。
2. 请求 Host 权威 Snapshot。
3. 对照本地 pending transaction ids。
4. 去除已经确认的事务，按协议重放其余事务。
5. 用户主动点击后恢复输入焦点。

未完成 composition 不持久化。

### 10.4 完成

1. 领域层把 Session 标记 completed。
2. 原子持久化最终 Session 和唯一 Result，或使用现有 pending result 重试合约达到等价效果。
3. 释放 lease。
4. 返回 `outcome: completed` 的 ack 与结果摘要。
5. Webview 进入完成页并拒绝新输入。

## 11. 失败处理

- 协议校验失败：忽略消息、记录诊断并向当前 panel 返回可操作错误。
- 事务应用失败：不前移权威 revision；保留最后 checkpoint，允许按相同 id 重试。
- 领域计算必须基于候选 Session 状态，只有 Session、durable receipt 以及完成时的 Result
  持久化成功后才能替换内存权威状态并发送 applied ack。Store 失败不得留下一个已变更但
  未持久化的可重试 Session，否则相同 transaction id 会被二次消费。
- Snapshot 重同步失败：显示错误页，提供“重试”和“返回素材”，不伪造本地进度。
- Store 写入失败：不向 Webview 确认 applied；统一错误边界处理 rejection。
- Webview 崩溃：权威 Session 不受影响，重新打开后从 Snapshot 恢复。
- 协议版本不兼容：保留权威 Session，要求重新加载窗口，不回退到文本文档方案。
- 无法恢复时不得自动结束或生成失败结果，除非用户明确选择结束练习。

开发诊断可以记录事件类型、sequence、revision、transaction id 和耗时；
默认不得记录自由粘贴正文或输入法预编辑明文。

## 12. 旧架构退役与迁移

从练习输入路径删除：

- `PracticeFileSystemProvider`
- `VSCodeWorkspacePracticeEditorHost`
- `WorkspacePracticeEditorAdapter`
- `PracticeDocumentLifecycleAdapter`
- `PracticeLanguageConfigurationBridge`
- `DocumentChangeAdapter` 中的 composition/stable 推断
- `moyuplus-practice:` URI、语言贡献和配置覆盖
- 针对该 scheme 的保存、回滚、装饰器、按键路由和恢复注册
- candidate filter、稳定窗口、延时 flush 和 `confirmCommittedInput`

同时：

- 删除设置页“输入方式”字段和 `evaluation.mode` 的新写入。
- 更新快捷键 when clause，使练习控制命令面向活动 Practice Webview context。
- Reader 装饰器不再需要对 `moyuplus-practice` scheme 特判。
- 旧结果与 Snapshot 保持只读兼容；新结果使用新 origin。
- 旧活动 Session 恢复时只使用权威 Session/Snapshot checkpoint，
  忽略旧虚拟文档 buffer。旧 Plan 的 evaluation mode 不参与新判定。

采用一次性切换，不同时运行两套输入架构。

## 13. 测试策略

实现严格按 TDD 顺序推进：先写失败测试并观察目标失败，再写最小实现。

### 13.1 领域单元测试

- Unicode 字素，包括 emoji、组合附加符和代理对。
- direct、composition、paste 来源得到相同判定。
- 批量提交在首个 block 错误处停止并返回正确 `unconsumedText`。
- allowSkip、纠错、重复事务、过期 revision 和完成后迟到事务。
- 结果只统计已确认且已消费的字素。

### 13.2 Webview 输入状态机测试

- `compositionstart → updates → compositionend` 只产生一次提交。
- 组合期间的拼音字母从不进入领域消息。
- 覆盖 Chromium 中相邻 composition/input 事件序列及尾随 input 去重。
- 组合取消、空结果、候选多次切换、失焦、页面隐藏和恢复。
- direct、paste、blocked Backspace、控制键和快速连续输入。
- 初始 Snapshot 到达前不接收提交；correction in-flight 时重复 Backspace 不重复纠错。
- 代码中不存在用于判断提交的 timer、debounce 或稳定窗口。

### 13.3 协议集成测试

- Host 延迟、重复、乱序、丢失、gap、stale revision 和重同步。
- 快速输入始终只有一个 in-flight；下一事务只使用前一 ack 后的 revision。
- 页面重建、Extension Host 重载和 pending FIFO 重放。
- 前一事务阻塞时，后续未发送事务全部被丢弃且不进入 Host。
- 重复事务在新 panel instance 下使用新 envelope 和当前 Snapshot 返回，不回退页面状态。
- 完成与迟到消息竞争只生成一份 Result。
- 所有事件注册边界无未处理 Promise。

### 13.4 VS Code Extension Host 自动化

- 从自由粘贴和设置页创建真实 Practice WebviewPanel。
- 同一 session 重复打开只 reveal 一个 panel。
- 暂停、关闭、恢复、完成和错误页流程。
- 不注册或打开 `moyuplus-practice:` 文档。
- 工作区无练习文件写入，无 dirty 标记、save 调用或保存提示。

此层验证 VS Code 集成，但不能宣称模拟事件等价于真实 Windows 输入法。

### 13.5 Windows 真实输入法人工验收

发布前必须执行并记录：

1. 自由粘贴 `abc主题检查：错误修正`。
2. 选择“必须修正”并开始练习。
3. 关闭中文输入法输入 `abc`，三个字符依次正确。
4. 开启微软拼音输入 `zhu`，多次切换候选并任意停留：
   - 拼音始终中性。
   - 进度不变。
   - 不报错、不退出。
5. 确认“主”：
   - 只提交一次。
   - “主”立即正确。
   - 下一目标变为“题”。
6. 使用单字和词组候选完成“主题”。
7. Esc 取消候选，不产生练习输入。
8. 故意输入 `X`：
   - 只有 `X` 红色。
   - 进度阻塞。
   - 退格后可继续。
9. 验证快速英文、粘贴、切换标签、关闭恢复和完成。
10. 全程控制台无未处理 Promise、save 错误或自动退出。

若产品声明支持其他 Windows 输入法，至少再选一种第三方输入法执行同一核心矩阵。

## 14. 性能预算

- composition update 只更新本地临时状态，在正常渲染帧内完成。
- 本地提交到权威 ack 的 p95 不高于 50 ms。
- 同一 session 的队列处理不得复制完整输入历史；单次输入路径不能是 O(历史长度)。
- 长材料采用窗口化 Snapshot 和 DOM，输入延迟不得随全文长度线性增长。
- 性能测试同时覆盖直接快速输入和多字词组 composition。

性能预算失败不得通过在 Webview 复制领域判定来规避。

## 15. 发布门槛

以下条件全部满足后才能标记新输入架构可用：

- TypeScript、构建和全量单元测试通过。
- Webview 状态机、协议集成和 Extension Host 测试通过。
- 旧输入架构及其 package contributions 已删除。
- `docs/typing-practice-settings.md` 和
  `docs/typing-practice-verification.md` 已按新架构更新。
- Windows 微软拼音真实人工验收有日期、环境、步骤和结果记录。
- 原始问题 `abc + zhu → 主` 不再出现拼音报红、目标不推进、自动退出或保存错误。
- 控制台无未处理 Promise。

自动测试通过不能替代真实输入法人工验收。
