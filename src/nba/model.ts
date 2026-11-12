/* NBA 预测模型（纯函数，与界面无关，可单独测试）
 *
 * 公式（2026-11-12 定版，见 NBA 情报空间）：
 *   预期得分 = 0.6 × 本队场均得分 + 0.4 × 对手场均失分 + 主场 1.5
 *   伤停扣分：核心 3 / 轮换 1.5 / 替补 0.5；背靠背 −1.5；Day-To-Day 不扣分。
 * 盘口是市场（ESPN pickcenter / DraftKings），预测是本模型；两者对照才有意义。
 * 注意：模型是工具，不是真理。关键因素（缺的是不是核心、替补能不能顶、
 * 球队最近实际打得怎么样、Day-To-Day 的变数）要另外看，见 src/nba/data.ts 的 notes。
 */

/** 伤停档位：决定扣分。核心 3 / 轮换 1.5 / 替补 0.5 */
export type Tier = "core" | "rotation" | "bench";
export type InjuryStatus = "out" | "day-to-day";

export interface Injury {
  name: string;
  tier: Tier;
  status: InjuryStatus;
  /** 该球员实际扣分。省略时按档位取值；快照数据里写的是 2026-11-12 核实过的数值。 */
  deduction?: number;
}

export interface TeamGameInput {
  abbr: string;
  nameCn: string;
  /** 战绩，如 "9-3" */
  record: string;
  /** 场均得分 */
  avgFor: number;
  /** 场均失分 */
  avgAgainst: number;
  /** 是否背靠背第二场 */
  b2b: boolean;
  injuries: Injury[];
}

export interface GameInput {
  id: string;
  /** 比赛日期（北京时间），如 "2026-11-13" */
  date: string;
  /** 北京时间开球，如 "08:00" */
  tipoffBeijing: string;
  away: TeamGameInput;
  home: TeamGameInput;
  /** 主队让分：负数表示主队让分，如 -9.5 表示主队让 9.5 分 */
  spread: number;
  /** 大小分盘口 */
  totalLine: number;
}

export interface Prediction {
  homePts: number;
  awayPts: number;
  /** 预测分差（主队 − 客队） */
  margin: number;
  /** 预测总分 */
  total: number;
  /** 让分差距 = 预测分差 − 盘口要求分差；>0 表示模型认为主队穿盘，<0 表示不穿盘 */
  spreadEdge: number;
  /** 总分差距 = 预测总分 − 盘口；<0 倾向小分，>0 倾向大分 */
  totalEdge: number;
  /** 模型对让分的倾向：主队穿盘 / 客队受让 / 无倾向（差距为 0） */
  coverPick: "home" | "away" | "none";
  /** 模型对大小分的倾向：大 / 小 / 无倾向（差距为 0） */
  totalPick: "over" | "under" | "none";
}

export const DEDUCTION: Record<Tier, number> = { core: 3, rotation: 1.5, bench: 0.5 };
export const B2B_DEDUCTION = 1.5;
export const HOME_ADVANTAGE = 1.5;

/** 一支球队本场总扣分：缺阵（Day-To-Day 不扣）+ 背靠背 */
export function teamDeduction(team: TeamGameInput): number {
  let d = team.b2b ? B2B_DEDUCTION : 0;
  for (const inj of team.injuries) {
    if (inj.status !== "out") continue;
    d += inj.deduction ?? DEDUCTION[inj.tier];
  }
  return d;
}

export function predictGame(game: GameInput): Prediction {
  const rawHome =
    0.6 * game.home.avgFor + 0.4 * game.away.avgAgainst + HOME_ADVANTAGE - teamDeduction(game.home);
  const rawAway = 0.6 * game.away.avgFor + 0.4 * game.home.avgAgainst - teamDeduction(game.away);
  const homePts = Math.round(rawHome);
  const awayPts = Math.round(rawAway);
  const margin = homePts - awayPts;
  const total = homePts + awayPts;
  const spreadEdge = margin + game.spread;
  const totalEdge = total - game.totalLine;
  return {
    homePts,
    awayPts,
    margin,
    total,
    spreadEdge,
    totalEdge,
    coverPick: spreadEdge > 0 ? "home" : spreadEdge < 0 ? "away" : "none",
    totalPick: totalEdge > 0 ? "over" : totalEdge < 0 ? "under" : "none",
  };
}

/* ── 验证：预测 vs 终场 ─────────────────────────────────── */

export interface GameResult {
  homePts: number;
  awayPts: number;
  /** 终场比分只认 ESPN status=STATUS_FINAL；非终场不要往这里填 */
  status: "final";
}

export interface GameCheck {
  /** 胜负：true 对 / false 错 / null 无法判定（预测分差为 0 或走盘） */
  winner: boolean | null;
  /** 让分：true 对 / false 错 / null 走盘或模型无倾向 */
  spread: boolean | null;
  /** 大小分：true 对 / false 错 / null 走盘或模型无倾向 */
  total: boolean | null;
  /** 每队得分绝对误差 */
  homeErr: number;
  awayErr: number;
  /** 预测分差与实际分差之差（绝对值） */
  marginErr: number;
  /** 预测总分与实际总分之差（绝对值） */
  totalErr: number;
}

export function checkGame(game: GameInput, pred: Prediction, result: GameResult): GameCheck {
  const actualMargin = result.homePts - result.awayPts;
  const actualTotal = result.homePts + result.awayPts;
  const winner =
    pred.margin === 0 || actualMargin === 0
      ? null
      : (pred.margin > 0) === (actualMargin > 0);
  const actualCover: "home" | "away" | "push" =
    actualMargin + game.spread > 0 ? "home" : actualMargin + game.spread < 0 ? "away" : "push";
  const spread =
    pred.coverPick === "none" || actualCover === "push" ? null : pred.coverPick === actualCover;
  const actualTotalSide: "over" | "under" | "push" =
    actualTotal > game.totalLine ? "over" : actualTotal < game.totalLine ? "under" : "push";
  const total =
    pred.totalPick === "none" || actualTotalSide === "push" ? null : pred.totalPick === actualTotalSide;
  return {
    winner,
    spread,
    total,
    homeErr: Math.abs(pred.homePts - result.homePts),
    awayErr: Math.abs(pred.awayPts - result.awayPts),
    marginErr: Math.abs(pred.margin - actualMargin),
    totalErr: Math.abs(pred.total - actualTotal),
  };
}

export interface AccuracySummary {
  /** 已验证的场数 */
  gamesChecked: number;
  winnerHits: number;
  winnerTotal: number;
  spreadHits: number;
  spreadTotal: number;
  totalHits: number;
  totalTotal: number;
  overallHits: number;
  overallTotal: number;
  /** 每队得分平均绝对误差（分）；样本为 0 时为 null */
  avgAbsErr: number | null;
  /** 分差平均绝对误差（分） */
  avgMarginErr: number | null;
}

export function summarizeChecks(checks: GameCheck[]): AccuracySummary {
  let winnerHits = 0, winnerTotal = 0;
  let spreadHits = 0, spreadTotal = 0;
  let totalHits = 0, totalTotal = 0;
  let errSum = 0, marginErrSum = 0;
  for (const c of checks) {
    if (c.winner !== null) { winnerTotal++; if (c.winner) winnerHits++; }
    if (c.spread !== null) { spreadTotal++; if (c.spread) spreadHits++; }
    if (c.total !== null) { totalTotal++; if (c.total) totalHits++; }
    errSum += c.homeErr + c.awayErr;
    marginErrSum += c.marginErr;
  }
  const n = checks.length;
  return {
    gamesChecked: n,
    winnerHits,
    winnerTotal,
    spreadHits,
    spreadTotal,
    totalHits,
    totalTotal,
    overallHits: winnerHits + spreadHits + totalHits,
    overallTotal: winnerTotal + spreadTotal + totalTotal,
    avgAbsErr: n > 0 ? errSum / (n * 2) : null,
    avgMarginErr: n > 0 ? marginErrSum / n : null,
  };
}

/** 准确率显示：样本为 0 时显示 "—"；其余显示百分比（四舍五入） */
export function pct(hits: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((hits / total) * 100)}%`;
}
