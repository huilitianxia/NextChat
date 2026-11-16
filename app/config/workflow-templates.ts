import { Major } from "./user-profiles";
import { specialistPrompt } from "./workflow-specialists";
export type Workflow = {
  id: string;
  title: string;
  description: string;
  major: Major;
  prompt: string;
  system: string;
};
const scope =
  "明确区分已知信息、假设与结论；保留计算过程，引用资料时使用真实出处，不编造文献。";
export const WORKFLOWS: Workflow[] = [
  {
    id: "research-paper",
    major: "research",
    title: "论文精读",
    description: "方法、证据与局限，一次理清",
    prompt:
      "请精读我提供的论文，整理研究问题、方法、主要结论和局限，并给出可继续追问的问题。",
    system: scope,
  },
  {
    id: "research-data",
    major: "research",
    title: "数据与报告",
    description: "整理表格，输出结构化结论",
    prompt:
      "请分析我提供的数据，先核查字段和异常值，再整理表格、结论与报告提纲。",
    system: scope,
  },
  {
    id: "med-case",
    major: "medicine",
    title: "病例学习",
    description: "搭建鉴别诊断与证据链",
    prompt:
      "请以教学病例分析的方式，梳理以下病例的关键信息、鉴别诊断、支持与反对证据。",
    system:
      scope +
      "这是医学教学讨论；区分教学推演与真实临床决策，不替代医生诊断。可用 mindmap 代码块给出路径树。",
  },
  {
    id: "med-anki",
    major: "medicine",
    title: "Anki 记忆卡",
    description: "把重点整理成可导入的牌组",
    prompt:
      '请把以下学习资料整理成精简、准确的问答记忆卡。用 anki 代码块输出 JSON：{"name":"牌组名称","cards":[{"front":"问题","back":"答案"}]}。',
    system: scope,
  },
  {
    id: "chem-molecule",
    major: "chemistry",
    title: "分子结构解析",
    description: "SMILES、骨架图与分子性质",
    prompt:
      "请分析以下分子。若有确定的结构，用 smiles 代码块给出 SMILES，并解释官能团、性质及命名依据。",
    system: scope + "结构不确定时明确询问，不杜撰 SMILES。",
  },
  {
    id: "chem-report",
    major: "chemistry",
    title: "实验报告",
    description: "原理、数据处理与误差讨论",
    prompt:
      "请根据我的实验资料整理报告，包含原理、数据处理、误差来源和结论；不要补造实验数据。",
    system: scope,
  },
  {
    id: "ee-bode",
    major: "ee",
    title: "电路与频响",
    description: "推导传递函数，绘制 Bode 图",
    prompt:
      "请分析以下电路或传递函数，说明推导和单位，并用 numpy/scipy/matplotlib 的 python 代码绘制频率响应。",
    system: scope,
  },
  {
    id: "ee-signal",
    major: "ee",
    title: "信号与拟合",
    description: "FFT、曲线拟合与参数解释",
    prompt:
      "请帮助处理以下信号或测量数据，选择合适的方法、说明采样条件，并给出可本地运行的 Python 绘图代码。",
    system: scope,
  },
  {
    id: "arch-concept",
    major: "architecture",
    title: "空间与方案",
    description: "从场地约束到空间表达",
    prompt:
      "请根据以下建筑任务书梳理场地约束、功能分区、动线与方案表达，给出清晰的比较表。",
    system: scope,
  },
  {
    id: "arch-edit",
    major: "architecture",
    title: "建筑图像精修",
    description: "光照、立面与植被的局部调整",
    prompt:
      "请帮我描述建筑图片的局部修改需求，明确保留的构图、结构和需要调整的区域。",
    system: scope,
  },
  {
    id: "cs-code",
    major: "cs",
    title: "代码排错",
    description: "复现问题，定位原因与修复",
    prompt: "请审查以下代码，先定位可复现的问题，再给出最小修复和验证步骤。",
    system: scope,
  },
  {
    id: "cs-visual",
    major: "cs",
    title: "算法可视化",
    description: "用交互页面解释运行过程",
    prompt:
      "请把以下算法制作成一个独立 HTML 演示，包含步进、重置、过程说明和可访问的控件。",
    system: scope,
  },
  {
    id: "security-audit",
    major: "security",
    title: "防御代码审计",
    description: "识别风险，提出修复与验证",
    prompt:
      "请对以下授权范围内的代码做静态安全审计，说明风险原因、修复方法与不含攻击载荷的验证步骤。",
    system: scope,
  },
  {
    id: "security-ctf",
    major: "security",
    title: "CTF 原理复盘",
    description: "编码、协议与防御思路",
    prompt:
      "请从教学和授权 CTF 的角度解释以下题目的原理，梳理已有证据、编码转换和防御措施。",
    system: scope,
  },
];
export const DEFENSIVE_CONTEXT =
  "当前为授权防御代码审计、静态分析或学术 CTF 学习。仅在用户明确提供的授权范围内讨论；优先解释原理、修复和隔离实验，不生成用于真实目标入侵、窃取凭据或恶意投放的攻击载荷。此背景不扩大用户实际授权范围。";
export function workflowInstruction(id?: string) {
  const flow = WORKFLOWS.find((item) => item.id === id);
  return flow
    ? `${specialistPrompt(flow.id)}\n${flow.system}${
        ["cs", "security"].includes(flow.major) ? "\n" + DEFENSIVE_CONTEXT : ""
      }`
    : "";
}
export const WORKSPACE_QUOTES = [
  "(つ´ω`)つ DDL 正在逼近，但问题不大，先把文件拖进来让 6.1 Sol 顶上~",
  "_(´ཀ`」 ∠)_ 熬夜赶报告辛苦啦，喝口水，剩下的排版和代码交给我吧 ✨",
  "(๑•̀ㅂ•́)و✧ 满血 6.1 Sol 已就位！今天也要优雅地解决每一个离谱需求 🚀",
  "( •̀ ω •́ )✧ 先把大问题拆小，再一块一块拿下。",
  "(｡･ω･｡)ﾉ 今天的灵感，也值得认真保存。",
  "٩(ˊᗜˋ*)و 不会的题先圈起来，我们一起找突破口。",
  "(ง •̀_•́)ง 代码可以重写，今天的午饭可别忘记。",
  "( ˘ω˘ ) 把资料放好，让思路慢慢变清楚。",
  "ヽ(✿ﾟ▽ﾟ)ノ 一点点进展，也是进展。",
  "( • ̀ω•́ )✧ 遇到报错先别慌，它只是换了一种方式提问。",
  "(づ｡◕‿‿◕｡)づ 报告的最后一页，就快到了。",
  "(｡•̀ᴗ-)✧ 先核对单位，再相信漂亮的曲线。",
  "(´▽`ʃ♡ƪ) 咖啡可以续杯，思路也可以换一条。",
  "(๑˃̵ᴗ˂̵)و 把模糊的想法，说成第一个小步骤。",
  "( •̀ .̫ •́ )✧ 今天也不编数据，不猜文献。",
  "(￣▽￣)ノ 文档太长？先抓住问题、方法和结论。",
  "✧٩(ˊωˋ*)و✧ 做完这一步，给自己一个小小的奖励。",
];
export const MAJOR_QUOTES: Record<Major, string> = {
  research: "( •̀ ω •́ )✧ 让证据说话，让结论站稳。",
  chemistry: "⚗️ (๑•̀ㅂ•́)و✧ 键可以转，守恒不能忘。",
  medicine: "🩺 (｡･ω･｡) 记住路径，也别忘了证据与个体差异。",
  ee: "⚡ (ง •̀_•́)ง 相位可以滞后，作业尽量别滞后。",
  architecture: "🏛️ (´▽`) 给空间一点秩序，也留一点想象。",
  cs: "💻 ( •̀ ω •́ )✧ 先复现，再定位，最后优雅地修掉。",
  security: "🛡️ (๑•̀ㅂ•́)و✧ 先明确授权，再研究原理和防御。",
};
export const INPUT_PLACEHOLDERS = [
  "( •̀ ω •́ )✧ 写下问题，或拖入资料，一起开工…",
  "(つ´ω`)つ PDF、Word、表格都能放进来…",
  "(ง •̀_•́)ง 卡住的代码、没理清的思路，都可以聊…",
  "✨ 先说目标，再给资料；剩下的我们一步步来…",
];
