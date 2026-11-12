/* 种子数据：2026-11-13 四场比赛（2026-11-12 20:32 ESPN 快照核实）
 *
 * 场均得分/失分是该快照的数值。模型按 src/nba/model.ts 的公式从这些输入算出
 * 预测比分，与 2026-11-12 晚上记录的预测完全一致（76人 110:104、活塞 110:101、
 * 森林狼 110:109、太阳 112:99）。伤停扣分是快照核实值；个别球员的 deduction
 * 写明在字段里（如独行侠莱夫利 2.5 分），其余按档位取值（核心 3 / 轮换 1.5 / 替补 0.5）。
 */
import type { GameInput, GameResult } from "./model";

export const SEED_DATE = "2026-11-13";
export const SEED_NOTE = "离线数据 · 2026-11-12 20:32 快照";
export const ODDS_SOURCE = "盘口：ESPN pickcenter / DraftKings";

export const GAMES_2026_11_13: GameInput[] = [
  {
    id: "20261113-phi-tor",
    date: "2026-11-13",
    tipoffBeijing: "08:00",
    away: {
      abbr: "TOR", nameCn: "猛龙", record: "5-6",
      avgFor: 113.6, avgAgainst: 112.8, b2b: true,
      injuries: [
        { name: "科怀·伦纳德", tier: "core", status: "out" },
        { name: "斯科蒂·巴恩斯", tier: "core", status: "out" },
        { name: "内特·比托", tier: "bench", status: "out" },
        { name: "特雷斯·杰克逊-戴维斯", tier: "rotation", status: "day-to-day" },
      ],
    },
    home: {
      abbr: "PHI", nameCn: "76人", record: "9-3",
      avgFor: 109.8, avgAgainst: 109.6, b2b: false,
      injuries: [
        { name: "阿德姆·博纳", tier: "rotation", status: "out" },
        { name: "阿里尔·胡克波蒂", tier: "bench", status: "out" },
        { name: "多米尼克·巴洛", tier: "bench", status: "out" },
        { name: "乔尔·恩比德", tier: "core", status: "day-to-day" },
        { name: "勒布朗·詹姆斯", tier: "core", status: "day-to-day" },
      ],
    },
    spread: -9.5,
    totalLine: 221.5,
  },
  {
    id: "20261113-wsh-det",
    date: "2026-11-13",
    tipoffBeijing: "08:00",
    away: {
      abbr: "DET", nameCn: "活塞", record: "7-3",
      avgFor: 112.7, avgAgainst: 104.6, b2b: false,
      injuries: [
        { name: "杰伦·杜伦", tier: "rotation", status: "out" },
        { name: "以赛亚·乔", tier: "rotation", status: "out" },
      ],
    },
    home: {
      abbr: "WSH", nameCn: "奇才", record: "4-8",
      avgFor: 107.5, avgAgainst: 113.4, b2b: true,
      injuries: [
        { name: "贾米尔·沃特金斯", tier: "rotation", status: "out" },
        { name: "贾斯廷·尚帕尼", tier: "rotation", status: "out" },
        { name: "特里斯坦·武克切维奇", tier: "rotation", status: "out" },
        { name: "里斯·比克曼", tier: "bench", status: "out" },
      ],
    },
    spread: 10.5,
    totalLine: 220.5,
  },
  {
    id: "20261113-min-dal",
    date: "2026-11-13",
    tipoffBeijing: "09:00",
    away: {
      abbr: "DAL", nameCn: "独行侠", record: "7-4",
      avgFor: 113.5, avgAgainst: 111.5, b2b: false,
      injuries: [
        { name: "德里克·莱夫利二世", tier: "rotation", status: "out", deduction: 2.5 },
      ],
    },
    home: {
      abbr: "MIN", nameCn: "森林狼", record: "8-3",
      avgFor: 116.5, avgAgainst: 108.5, b2b: false,
      injuries: [
        { name: "安东尼·爱德华兹", tier: "core", status: "out" },
        { name: "丹特·迪文琴佐", tier: "core", status: "out" },
      ],
    },
    spread: -5.5,
    totalLine: 227.5,
  },
  {
    id: "20261113-phx-cha",
    date: "2026-11-13",
    tipoffBeijing: "10:00",
    away: {
      abbr: "CHA", nameCn: "黄蜂", record: "4-7",
      avgFor: 98.8, avgAgainst: 112.0, b2b: false,
      injuries: [
        { name: "布兰登·米勒", tier: "core", status: "out" },
        { name: "丹尼斯·施罗德", tier: "core", status: "out" },
        { name: "格兰特·威廉姆斯", tier: "rotation", status: "out" },
        { name: "康·克努佩尔", tier: "bench", status: "out" },
      ],
    },
    home: {
      abbr: "PHX", nameCn: "太阳", record: "4-6",
      avgFor: 112.0, avgAgainst: 118.1, b2b: false,
      injuries: [
        { name: "马克·威廉姆斯", tier: "rotation", status: "out" },
      ],
    },
    spread: -6.5,
    totalLine: 213.5,
  },
];

/* ── 预测历史：每一天的预测 + 终场比分（只填 ESPN STATUS_FINAL 的终场） ── */

export type ParlayLegKind = "spread-home" | "total-under" | "total-over";

export interface PredictionDay {
  date: string;
  games: GameInput[];
  /** 终场比分，按 game id 索引；没打完的场次不要填 */
  results: Record<string, GameResult>;
  /** 当天的串关跟踪（可选） */
  parlay?: {
    label: string;
    legs: { label: string; gameId: string; kind: ParlayLegKind }[];
  };
  /** 当天模型之外的关键判断（与模型分歧的地方） */
  notes?: string[];
}

export const HISTORY: PredictionDay[] = [
  {
    date: "2026-11-13",
    games: GAMES_2026_11_13,
    results: {},
    parlay: {
      label: "2串1 · 太阳 -6.5 × 76人/猛龙 小 221.5",
      legs: [
        { label: "太阳 -6.5", gameId: "20261113-phx-cha", kind: "spread-home" },
        { label: "76人/猛龙 小 221.5", gameId: "20261113-phi-tor", kind: "total-under" },
      ],
    },
    notes: [
      "模型把森林狼扣多了：爱德华兹+迪文琴佐扣 6 分，但森林狼没爱德华兹已 4 连胜，体系顶得住；模型算森林狼只赢 1 分，独立判断认为赢 5.5 分以上的概率比模型显示的大。",
      "猛龙进攻塌了：伦纳德和巴恩斯是全队前二得分点，两个都没了，还背靠背，上一场只得 93 分。",
      "恩比德（脚）和詹姆斯（背）都是 Day-To-Day，公式不扣待定球员的分，但他俩上不上，76人那场完全是两个样子；下注前必须看首发名单。",
      "太阳那腿：黄蜂进攻本来就最差（场均 98.8），三个能持球的都没了；风险是太阳自己的防守场均丢 118.1 分。",
      "模型四场的总分全比盘口低，是伤停扣分这一个机制推出来的，不是一场场独立看出来的信号，别闭着眼睛全下小分。",
    ],
  },
];

/* ── 模型说明 ── */

export const MODEL_FORMULA = [
  "预期得分 = 0.6 × 本队场均得分 + 0.4 × 对手场均失分，主队 +1.5",
  "伤停扣分：核心 3 / 轮换 1.5 / 替补 0.5；背靠背 −1.5；Day-To-Day 不扣分",
  "让分差距 = 预测分差 − 盘口要求分差（>0 主队穿盘，<0 不穿盘）；总分差距 = 预测总分 − 盘口（<0 倾向小分）",
  "只下差距大的：模型和盘口差 5 分以上再考虑；单场比串关稳；等首发名单；固定注额，别输了翻倍追",
];
