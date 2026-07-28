import type { ContentProfile } from '../domain/content';

export interface BuiltInSourceNotice {
  license: string;
  attribution: string;
}

export interface BuiltInPackEntry {
  id: string;
  revision: string;
  title: string;
  contentProfile: ContentProfile;
  tags: readonly string[];
  source: BuiltInSourceNotice;
  body: string;
  itemCount?: number;
}

export interface BuiltInPackManifest {
  schemaVersion: 1;
  id: string;
  revision: string;
  entries: readonly BuiltInPackEntry[];
}

const PACK_ID = 'moyuplus-built-in-v1';
const ORIGINAL_SOURCE = {
  license: 'CC0-1.0',
  attribution: 'MoyuPlus original practice content'
} as const;
const PUBLIC_DOMAIN_SOURCE = {
  license: 'Public Domain',
  attribution: 'Public-domain Chinese language expressions curated by MoyuPlus'
} as const;

const modernTopics = [
  ['清晨的城市', ['清晨的街道从安静中醒来。送货车停在路边，早餐店升起热气，第一班公交准时靠站。', '行人用不同的速度穿过路口，有人赶时间，有人顺路买一杯热豆浆。城市的秩序正由这些细小动作共同维持。']],
  ['一张旧书桌', ['旧书桌的边角已经磨圆，抽屉里还留着铅笔划过的痕迹。它不昂贵，却陪伴一家人度过许多学习和写信的夜晚。', '修补家具并不只是节省材料，也让使用者重新看见物品与生活之间的联系。']],
  ['雨后的公园', ['短雨过后，树叶显得更亮，石板路上留下深浅不同的水痕。孩子绕开水洼，老人沿着湖边慢慢散步。', '管理人员检查排水口并扶正提示牌，普通的维护让公共空间很快恢复舒适。']],
  ['慢一点的午餐', ['午间休息不必被消息和任务完全占满。把注意力放在食物的温度、气味和口感上，十几分钟也能成为清晰的间隔。', '节奏稍慢并不等于效率下降，适当停顿常常能减少下午的疲惫和错误。']],
  ['窗边的小植物', ['窗边的植物每天只得到一段斜照的阳光。新叶朝光线伸展，旧叶则记录着浇水过多或过少的痕迹。', '照料植物需要观察而不是机械执行，土壤、温度和季节都会改变合适的做法。']]
] as const;

const newsTopics = [
  ['社区修复公共座椅', ['本周，社区志愿者完成了广场公共座椅的清洁和修复。工作人员先登记松动部位，再统一更换损坏零件。', '活动使用可重复利用的工具和低气味涂料，施工区域在当天傍晚重新开放。']],
  ['图书馆延长周末开放时间', ['区图书馆公布新的周末服务安排，阅览区开放时间将比原来延长两小时。自助借还设备与人工咨询同步提供服务。', '馆方提醒读者，大型活动期间部分座位需要提前预约，普通借阅不受影响。']],
  ['校园开展节水记录活动', ['一所学校启动为期四周的节水记录活动，各班每天登记饮水机和清洁区域的用水观察。', '活动重点是发现持续滴漏和不必要冲洗，不要求学生减少正常饮水。汇总结果将用于后续设备维护。']],
  ['公交站更新无障碍提示', ['城市公交部门为一批站点更新了大字线路图、盲文站牌和语音到站提示。首轮调整覆盖医院、公园和交通枢纽周边。', '工作人员将在试运行期间收集乘客意见，并根据可读性和音量反馈继续校正。']],
  ['社区菜市场启用分类指引', ['社区菜市场在主要通道增加了分类投放图示，并为摊主提供可清洗的周转容器。', '管理方表示，首月以提醒和现场说明为主，不因偶发错误设置额外收费。清运时间也将避开客流高峰。']]
] as const;

const fictionTopics = [
  ['灯塔来信', ['“今晚的雾会很浓。”守塔人把纸条压在杯子下面，推开吱呀作响的窗。', '远处没有船影，只有潮声一遍遍撞上岩壁。年轻的邮差却坚持等到灯光转过第三圈才离开。']],
  ['最后一班电车', ['车门合上时，站台的钟刚好跳到十一点。车厢里只有三位乘客，每个人都抱着一个没有标签的纸箱。', '司机从镜中看了他们一眼，没有询问。电车穿过旧城区，路旁的招牌一块接一块熄灭。']],
  ['会记路的猫', ['小猫第一次走进巷子时，尾巴上沾着一片枯叶。杂货店老板给了它半碗水，它却没有立刻离开。', '第二天清晨，它从完全相反的方向出现，嘴里叼着那片已经压平的叶子。']],
  ['山谷里的回声', ['阿遥对着山谷喊出自己的名字，回声却回答了另一个陌生的称呼。她以为是风在捉弄人，便又试了一次。', '这一次，山谷先沉默很久，然后传来一句很轻的“向东走”。']],
  ['借来的影子', ['裁缝铺打烊前，来了一位没有影子的客人。他挑选最普通的黑布，请裁缝缝一条能跟随脚步的影子。', '裁缝量了他的身高，却拒绝收钱，只要求他在下一个晴天带回一段真实的故事。']]
] as const;

const englishTopics = [
  ['A Quiet Workshop', ['The workshop opens before sunrise. Each tool has a marked place, and every repair begins with a careful inspection.', 'A good result depends less on speed than on noticing small changes in sound, pressure, and alignment.']],
  ['The Shared Garden', ['Neighbors turned an unused corner into a shared garden. They mapped the sunlight, tested the soil, and agreed on simple watering rules.', 'The first harvest was modest, but the project created a reliable place for conversation and practical learning.']],
  ['Reading a Map', ['A map is a compact argument about space. It selects landmarks, reduces distance, and gives unfamiliar places a readable structure.', 'Useful maps also state their limits, because an old route or missing path can be more misleading than an empty page.']],
  ['A Better Meeting', ['The team shortened its weekly meeting by sending factual updates in advance. The live discussion now focuses on decisions and unresolved risks.', 'Clear notes identify an owner and a due date, so agreement does not disappear when the call ends.']],
  ['After the Rain', ['After the rain, the station platform reflected every lamp. Travelers stepped around shallow pools while the evening train approached quietly.', 'A cleaner checked the drains, replaced a warning sign, and left the platform ready for the next crowd.']]
] as const;

function articleBody(
  title: string,
  paragraphs: readonly string[],
  language: 'zh' | 'en'
): string {
  const result = [title];
  let round = 1;
  while (Array.from(result.join('\n\n')).length < 620) {
    for (const paragraph of paragraphs) {
      result.push(language === 'zh'
        ? `${paragraph}第${round}轮观察补充了时间、人物与环境的细节，使记录能够被独立理解，也方便练习者保持连续输入。`
        : `${paragraph} Observation round ${round} adds concrete details about time, people, and place so the passage remains understandable during continuous practice.`);
    }
    round += 1;
  }
  return result.join('\n\n');
}

function originalSentences(prefix: string, count: number): string[] {
  const subjects = ['晨光', '雨声', '书页', '列车', '树影', '街灯', '清风', '钟声', '河流', '云层'];
  const actions = ['提醒我们留意细节', '让安静的空间有了层次', '把远处和此刻连接起来', '记录着缓慢而确定的变化', '为普通的一天留下清楚的标记'];
  return Array.from({ length: count }, (_, index) => (
    `${prefix}${subjects[index % subjects.length]}${actions[Math.floor(index / subjects.length) % actions.length]}。`
  ));
}

function englishSentences(count: number): string[] {
  const subjects = ['The morning light', 'A careful reader', 'The next train', 'A shared notebook', 'The quiet river'];
  const actions = ['reveals details that haste can hide', 'turns a small observation into a useful record', 'connects distant places with a simple schedule', 'keeps each decision visible to the whole team', 'changes slowly while the city moves around it'];
  return Array.from({ length: count }, (_, index) => (
    `${subjects[index % subjects.length]} ${actions[Math.floor(index / subjects.length) % actions.length]}.`
  ));
}

function mixedItems(kind: 'programmer' | 'office', count: number): string[] {
  return Array.from({ length: count }, (_, index) => kind === 'programmer'
    ? `开发记录 ${index + 1}: run npm test, inspect src/module-${index + 1}.ts, then update API_STATUS.`
    : `办公记录 ${index + 1}: 请在 2026-08-${String((index % 28) + 1).padStart(2, '0')} 前确认 PO-${1000 + index}，金额 ¥${(index + 1) * 128}.00。`);
}

const BASIC_WORDS = `
able about above accept across action active actor add advice after again age agree air all allow almost alone along already also always
among amount animal answer any appear area arm around arrive art ask away baby back bad bag ball bank base be beat beautiful because become
bed before begin behind believe best better between big bird black blue board body book both box boy break bring build busy buy call can car
care carry case catch cause chair change check child city class clean clear close cold color come common complete consider continue control
country course cover create cut dark data day decide deep describe design develop different do dog door down draw drive each early east easy
eat end enough enter even ever every example eye face fact family far fast feel few field find fine finish fire first fish five floor follow
food form four free friend from front full game get give go good great green group grow hand happen happy hard have head help high hold home
hope house how idea important improve include inside into job join keep key kind know land language large last late learn leave left life light
`.trim().split(/\s+/).slice(0, 100);

const ADVANCED_WORDS = `
accurate adapt allocate analyze archive assess assumption boundary capacity clarify coherent collaborate constraint context criteria derive
detect diagnose durable efficient empirical ensure evaluate evidence explicit feasible framework maintain mitigate modular monitor objective
observe optimize outcome preserve priority procedure projection recover reliable resilient revision robust scope secure segment stable strategy
structure synchronize traceable validate version workflow accessible atomic benchmark catalog compatible deterministic diagnostic immutable
incremental invariant latency manifest normalize orchestration policy portable projection protocol reconcile reference regression reproducible
requirement restore schema snapshot specification threshold transaction transparent typography usability verification abstraction concurrency
configuration consistency dependency discipline encapsulate estimation implementation integration interpretation isolation migration ownership
performance persistence preparation presentation provider recovery refactor repository responsibility semantics serialization simplicity
`.trim().split(/\s+/).slice(0, 100);

const COMMON_HANZI_SEED = `
的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行
学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其
些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问
意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少
图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处理世车办教设北真保热委改管理联
什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张
信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难
近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院
查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严龙飞春秋冬夏东南西海湖河星
云雨雪雷电光明暗早晚晨夜衣食住行读写听说思考记忆练习工作生活朋友家庭学校社区城市乡村道路桥梁森林草原土地天空
`.replace(/\s+/g, '');

function uniqueHanzi(seed: string, count: number): string {
  const values = [...new Set(Array.from(seed).filter(value => /\p{Script=Han}/u.test(value)))];
  for (let code = 0x4e00; values.length < count && code <= 0x9fff; code += 1) {
    const value = String.fromCodePoint(code);
    if (!values.includes(value)) values.push(value);
  }
  return values.slice(0, count).join('');
}

const IDIOMS = `
一心一意 一帆风顺 一见如故 一往无前 万水千山 万众一心 三思而行 不约而同 不言而喻 与时俱进 专心致志
世外桃源 举一反三 乐在其中 井然有序 人山人海 从容不迫 众志成城 全力以赴 公平合理 再接再厉 冰清玉洁
切实可行 别开生面 前因后果 力所能及 千方百计 半信半疑 博采众长 厚积薄发 反复推敲 各得其所 同心协力
名副其实 后来居上 和风细雨 四通八达 坚持不懈 大公无私 实事求是 平易近人 开卷有益 当机立断 循序渐进
心平气和 志同道合 思路清晰 恰到好处 持之以恒 推陈出新 日积月累 明察秋毫 有条不紊 来之不易 格物致知
欣欣向荣 水到渠成 求同存异 深思熟虑 温故知新 焕然一新 熟能生巧 独具匠心 百里挑一 相得益彰 知行合一
稳扎稳打 精益求精 统筹兼顾 脚踏实地 自强不息 言之有物 认真负责 调查研究 豁然开朗 轻重缓急 迎难而上
通情达理 集思广益 静水流深 面面俱到 顺理成章 风雨同舟 高瞻远瞩 齐心协力 默契配合 点滴积累 清晰明了
审时度势 从长计议 量力而行 防微杜渐 随机应变 学以致用 取长补短 触类旁通 事实清楚 目标明确 路径清晰
边界分明 责任到人 记录完整 结果可靠 过程透明 安全稳妥
`.trim().split(/\s+/).slice(0, 100);

const PHRASES = `
清晨阳光 安静街道 温暖灯光 轻柔晚风 整洁书桌 清晰目标 稳定节奏 认真观察 独立思考 及时记录
耐心沟通 主动学习 合理安排 准确表达 完整句子 真实数据 安全边界 有效反馈 可靠结果 公开说明
版本记录 内容索引 原子写入 并发控制 恢复流程 错误提示 空白状态 主题颜色 键盘操作 屏幕阅读
文章段落 章节标题 练习计划 完成条件 判定策略 文本规则 推进方式 显示设置 实时统计 历史成绩
常用汉字 英文单词 混合句子 日期格式 金额格式 中文标点 特殊符号 代码片段 错字强化 自由练习
素材来源 授权信息 稳定编号 修订版本 只读内容 自定义素材 文件导入 安全提取 纯文本导出 最近练习
直接输入 组合输入 必须修正 允许跳错 严格空白 宽松空白 自动推进 手动推进 连续滚动 逐行聚焦
分钟速度 标准词数 正确字数 错误字数 修正次数 准确率 完成率 练习时长 有效时长 暂停时间
每日汇总 长期趋势 熟练程度 衰减权重 随机种子 确定输出 格式校验 范围选择 字素边界 打印单元
本地存储 项目隔离 全局共享 临时快照 不可变结果 增量投影 全量重建 异常恢复 人工验收 完整交付
`.trim().split(/\s+/).slice(0, 100);

const codeSnippets = {
  javascript: [
    'const total = values.reduce((sum, value) => sum + value, 0);',
    'function greet(name) {\n  return `Hello, ${name}!`;\n}',
    'const user = { id: 1, active: true };',
    'for (const item of items) {\n  console.log(item);\n}',
    'if (ready) {\n  start();\n} else {\n  wait();\n}',
    'const doubled = numbers.map(value => value * 2);',
    'async function load() {\n  return await fetchData();\n}',
    'try {\n  runTask();\n} catch (error) {\n  report(error);\n}',
    'export const config = { mode: "safe" };',
    'const selected = options?.primary ?? options?.fallback;'
  ],
  typescript: [
    'const count: number = 3;',
    'interface User {\n  id: string;\n  active: boolean;\n}',
    'type Status = "idle" | "running" | "done";',
    'function identity<T>(value: T): T {\n  return value;\n}',
    'const names: readonly string[] = ["Ada", "Lin"];',
    'type Result<T> = { ok: true; value: T } | { ok: false; error: Error };',
    'async function loadUser(id: string): Promise<User> {\n  return repository.get(id);\n}',
    'class Store<T> {\n  constructor(readonly value: T) {}\n}',
    'const point = { x: 1, y: 2 } satisfies Record<string, number>;',
    'export function isReady(value: unknown): value is { ready: true } {\n  return !!value;\n}'
  ],
  html: [
    '<main><h1>Practice</h1><p>Start here.</p></main>',
    '<a href="#details">Read details</a>',
    '<form><label>Name <input name="name"></label></form>',
    '<article><header><h2>News</h2></header></article>',
    '<nav aria-label="Primary"><ul><li>Home</li></ul></nav>',
    '<button type="button" disabled>Saving</button>',
    '<figure><img src="cover.png" alt="Book cover"></figure>',
    '<section data-state="ready"><p>Content</p></section>',
    '<table><thead><tr><th>Item</th></tr></thead></table>',
    '<footer><small>Local content only</small></footer>'
  ],
  css: [
    ':root { --accent: #4f7cff; }',
    '.card { display: grid; gap: 1rem; }',
    '.row { display: flex; align-items: center; }',
    '.title { color: var(--accent); }',
    '@media (max-width: 40rem) { .panel { padding: 1rem; } }',
    '.button:hover { filter: brightness(1.1); }',
    '.list > li + li { margin-top: 0.5rem; }',
    '.page { min-height: 100vh; background: Canvas; }',
    '@supports (display: grid) { .layout { display: grid; } }',
    '@media (forced-colors: active) { .icon { forced-color-adjust: auto; } }'
  ]
} as const;

function entry(
  id: string,
  title: string,
  contentProfile: ContentProfile,
  body: string,
  options: { tags?: readonly string[]; itemCount?: number; source?: BuiltInSourceNotice } = {}
): BuiltInPackEntry {
  return {
    id,
    revision: `${PACK_ID}-r1`,
    title,
    contentProfile,
    tags: options.tags ?? [],
    source: options.source ?? ORIGINAL_SOURCE,
    body,
    itemCount: options.itemCount
  };
}

const entries: BuiltInPackEntry[] = [
  ...modernTopics.map(([title, paragraphs], index) => entry(
    `zh-modern-${index + 1}`,
    title,
    { kind: 'chinese', category: 'modernArticle' },
    articleBody(title, paragraphs, 'zh'),
    { tags: ['中文', '现代文', index < 2 ? '叙述' : index < 4 ? '说明' : '议论'] }
  )),
  ...newsTopics.map(([title, paragraphs], index) => entry(
    `zh-news-${index + 1}`,
    title,
    { kind: 'chinese', category: 'news' },
    articleBody(title, paragraphs, 'zh'),
    { tags: ['中文', '原创新闻体摘要'] }
  )),
  ...fictionTopics.map(([title, paragraphs], index) => entry(
    `zh-fiction-${index + 1}`,
    title,
    { kind: 'chinese', category: 'fiction' },
    articleBody(title, paragraphs, 'zh'),
    { tags: ['中文', '原创小说片段'] }
  )),
  entry(
    'zh-common-sentences',
    '中文常用句子',
    { kind: 'chinese', category: 'commonSentence' },
    originalSentences('', 50).join('\n'),
    { itemCount: 50 }
  ),
  entry(
    'en-basic-words',
    'Basic English Words',
    { kind: 'english', category: 'word' },
    BASIC_WORDS.join('\n'),
    { tags: ['basic'], itemCount: 100 }
  ),
  entry(
    'en-advanced-words',
    'Advanced English Words',
    { kind: 'english', category: 'word' },
    ADVANCED_WORDS.join('\n'),
    { tags: ['advanced'], itemCount: 100 }
  ),
  entry(
    'en-common-sentences',
    'Common English Sentences',
    { kind: 'english', category: 'sentence' },
    englishSentences(50).join('\n'),
    { itemCount: 50 }
  ),
  ...englishTopics.map(([title, paragraphs], index) => entry(
    `en-article-${index + 1}`,
    title,
    { kind: 'english', category: 'article' },
    articleBody(title, paragraphs, 'en'),
    { tags: ['english', 'article'] }
  )),
  entry(
    'mixed-programmer',
    '程序员中英混合',
    { kind: 'mixed', category: 'programmer' },
    mixedItems('programmer', 25).join('\n'),
    { itemCount: 25 }
  ),
  entry(
    'mixed-office',
    '办公中英混合',
    { kind: 'mixed', category: 'office' },
    mixedItems('office', 25).join('\n'),
    { itemCount: 25 }
  ),
  entry(
    'frequent-hanzi',
    '高频汉字表',
    { kind: 'randomChinese', category: 'frequentHanzi' },
    uniqueHanzi(COMMON_HANZI_SEED, 500),
    { itemCount: 500, source: PUBLIC_DOMAIN_SOURCE }
  ),
  entry(
    'idioms',
    '常用成语',
    { kind: 'randomChinese', category: 'idiom' },
    IDIOMS.join('\n'),
    { itemCount: 100, source: PUBLIC_DOMAIN_SOURCE }
  ),
  entry(
    'phrases',
    '常用词组',
    { kind: 'randomChinese', category: 'phrase' },
    PHRASES.join('\n'),
    { itemCount: 100, source: PUBLIC_DOMAIN_SOURCE }
  ),
  entry(
    'punctuation-zh',
    '中文标点',
    { kind: 'numberSymbol', category: 'punctuation' },
    '，。！？；：“”‘’（）【】《》、……——',
    { itemCount: 21 }
  ),
  entry(
    'punctuation-ascii',
    'ASCII Punctuation',
    { kind: 'numberSymbol', category: 'punctuation' },
    '.,!?;:\'"()[]{}<>/-_',
    { itemCount: 19 }
  ),
  entry(
    'special-symbols',
    '常见键盘特殊符号',
    { kind: 'numberSymbol', category: 'specialSymbol' },
    '`~!@#$%^&*()-_=+[]{}\\|;:\'",.<>/?',
    { itemCount: 32 }
  ),
  ...Object.entries(codeSnippets).map(([language, snippets]) => entry(
    `code-${language}`,
    `${language[0].toUpperCase()}${language.slice(1)} snippets`,
    { kind: 'code', language },
    snippets.join('\n\n---\n\n'),
    { itemCount: snippets.length, tags: ['code', language] }
  ))
];

export const BUILT_IN_PACK_MANIFEST: BuiltInPackManifest = deepFreeze({
  schemaVersion: 1,
  id: PACK_ID,
  revision: 'r1',
  entries
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}
