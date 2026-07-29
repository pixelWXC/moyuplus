import { createHash } from 'node:crypto';
import type {
  ContentDescriptor,
  ContentProfile,
  ContentProvider,
  ContentRecipe,
  GeneratorKind,
  PreparedContent,
  SourceRange
} from '../../domain/content';
import { preparePracticeContent } from '../../domain/content';
import {
  generateDeterministicContent,
  type DeterministicGeneratorKind,
  type GeneratorPools
} from '../../domain/generators';

export class GeneratedContentProvider implements ContentProvider {
  constructor(
    private readonly pools: GeneratorPools = DEFAULT_GENERATOR_POOLS
  ) {}

  canResolve(recipe: ContentRecipe): boolean {
    return recipe.kind === 'generated' && recipe.generator !== 'mastery';
  }

  async inspect(recipe: ContentRecipe): Promise<ContentDescriptor> {
    const prepared = this.prepareRecipe(recipe, { kind: 'whole' });
    return {
      title: recipe.kind === 'generated'
        ? generatedTitle(recipe.generator)
        : 'Generated practice content',
      sourceRevision: prepared.sourceRevision,
      contentProfile: structuredClone(prepared.contentProfile),
      counts: structuredClone(prepared.counts),
      ranges: [{ kind: 'whole' }]
    };
  }

  async prepare(recipe: ContentRecipe, range: SourceRange): Promise<PreparedContent> {
    return this.prepareRecipe(recipe, range);
  }

  private prepareRecipe(recipe: ContentRecipe, range: SourceRange): PreparedContent {
    if (recipe.kind !== 'generated') {
      throw new Error(`GeneratedContentProvider cannot resolve recipe: ${recipe.kind}`);
    }
    if (recipe.generator === 'mastery') {
      throw new Error('Mastery recipes must be resolved by MasteryContentProvider.');
    }
    const generated = generateDeterministicContent({
      kind: recipe.generator,
      seed: recipe.seed,
      targetUnits: recipe.length ?? 100
    }, this.pools);
    const digest = createHash('sha256')
      .update(generated.text, 'utf8')
      .digest('hex')
      .slice(0, 16);
    return preparePracticeContent(generated.text, {
      sourceRevision: `${recipe.generator}-${generated.algorithmVersion}-${digest}`,
      contentProfile: profileFor(recipe.generator),
      generatorSeed: generated.seed,
      range
    });
  }
}

const DEFAULT_GENERATOR_POOLS: GeneratorPools = {
  commonSentences: [
    '清晨的街道从安静中醒来。',
    '认真记录可以让变化更容易被发现。',
    '稳定的节奏比短暂的速度更重要。',
    '明确的目标能够减少重复沟通。',
    '每次练习都从一个准确的按键开始。'
  ],
  englishWords: [
    'about', 'active', 'build', 'clear', 'design', 'focus', 'learn', 'practice',
    'reliable', 'result', 'stable', 'system', 'typing', 'useful', 'version'
  ],
  englishSentences: [
    'A careful reader notices small changes.',
    'Clear notes keep every decision visible.',
    'Practice turns a difficult action into a habit.',
    'Reliable systems make recovery predictable.',
    'The next step should always be easy to find.'
  ],
  mixedProgrammer: [
    '运行 npm test 后检查 result。',
    '更新 API_STATUS 并记录 revision。',
    '打开 src/main.ts 查看错误位置。',
    '确认 build 成功，再提交 change。',
    '检查 keyboard event 与输入法状态。'
  ],
  mixedOffice: [
    '请在 09:30 前确认 Meeting 议程。',
    '订单 PO-1001 的金额为 ¥128.00。',
    '将 Report v2 发送给项目成员。',
    '本周 Progress 已更新 80%。',
    '请确认 2026-08-01 的交付安排。'
  ],
  frequentHanzi: Array.from(
    '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说'
  ),
  idiom: [
    '一心一意', '循序渐进', '持之以恒', '有条不紊', '实事求是',
    '精益求精', '脚踏实地', '集思广益', '学以致用', '迎难而上'
  ],
  phrase: [
    '清晰目标', '稳定节奏', '认真观察', '准确表达', '有效反馈',
    '可靠结果', '版本记录', '键盘操作', '练习计划', '异常恢复'
  ],
  punctuation: Array.from('，。！？；：“”‘’、（）《》【】…—'),
  specialSymbol: Array.from('~`@#$%^&*_-+=|\\/<>{}[]'),
  code: [
    'const total = values.reduce((sum, value) => sum + value, 0);',
    'function greet(name) {\n  return `Hello, ${name}!`;\n}',
    'type Status = "idle" | "running" | "done";',
    '<main><h1>Practice</h1></main>',
    '.card { display: grid; gap: 1rem; }'
  ]
};

function profileFor(generator: DeterministicGeneratorKind): ContentProfile {
  switch (generator) {
    case 'commonSentences':
      return { kind: 'chinese', category: 'commonSentence' };
    case 'englishWords':
      return { kind: 'english', category: 'word' };
    case 'englishSentences':
      return { kind: 'english', category: 'sentence' };
    case 'mixedProgrammer':
      return { kind: 'mixed', category: 'programmer' };
    case 'mixedOffice':
      return { kind: 'mixed', category: 'office' };
    case 'frequentHanzi':
      return { kind: 'randomChinese', category: 'frequentHanzi' };
    case 'idiom':
      return { kind: 'randomChinese', category: 'idiom' };
    case 'phrase':
      return { kind: 'randomChinese', category: 'phrase' };
    case 'phone':
      return { kind: 'numberSymbol', category: 'phone' };
    case 'date':
      return { kind: 'numberSymbol', category: 'date' };
    case 'amount':
      return { kind: 'numberSymbol', category: 'amount' };
    case 'punctuation':
      return { kind: 'numberSymbol', category: 'punctuation' };
    case 'specialSymbol':
      return { kind: 'numberSymbol', category: 'specialSymbol' };
    case 'code':
      return { kind: 'code', language: 'mixed' };
  }
}

function generatedTitle(generator: GeneratorKind): string {
  return `Generated ${generator} practice`;
}
