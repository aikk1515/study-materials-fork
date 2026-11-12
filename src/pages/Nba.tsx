import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  checkGame, pct, predictGame, summarizeChecks, teamDeduction,
  type GameInput, type GameResult,
} from "../nba/model";
import { HISTORY, MODEL_FORMULA, ODDS_SOURCE, SEED_NOTE, type ParlayLegKind, type PredictionDay } from "../nba/data";
import { ICheck, IClose, IRefresh, ITrophy } from "../icons";

/* ── ESPN 直播比分（浏览器直连；Tauri 内 CSP 会挡住，失败就回落到快照） ── */

interface LiveGame {
  awayAbbr: string;
  homeAbbr: string;
  awayScore: number | null;
  homeScore: number | null;
  state: "pre" | "in" | "post";
  completed: boolean;
}

async function fetchEspn(date: string): Promise<LiveGame[] | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date.replaceAll("-", "")}`,
      { signal: ctrl.signal },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as unknown;
    const events = (j as { events?: unknown })?.events;
    if (!Array.isArray(events)) return null;
    const out: LiveGame[] = [];
    for (const ev of events) {
      const e = ev as {
        competitions?: Array<{
          competitors?: Array<{ homeAway?: string; team?: { abbreviation?: string }; score?: string }>;
        }>;
        status?: { type?: { state?: string; completed?: boolean } };
      };
      const comps = e.competitions?.[0]?.competitors;
      if (!comps) continue;
      const away = comps.find((c) => c.homeAway === "away");
      const home = comps.find((c) => c.homeAway === "home");
      if (!away?.team?.abbreviation || !home?.team?.abbreviation) continue;
      const state = e.status?.type?.state === "post" ? "post" : e.status?.type?.state === "in" ? "in" : "pre";
      out.push({
        awayAbbr: away.team.abbreviation,
        homeAbbr: home.team.abbreviation,
        awayScore: away.score === undefined ? null : Number(away.score),
        homeScore: home.score === undefined ? null : Number(home.score),
        state,
        completed: e.status?.type?.completed === true || state === "post",
      });
    }
    return out;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

const liveKey = (game: GameInput) => `${game.away.abbr}@${game.home.abbr}`;

/** 一天的终场比分：人工记录的优先，其次用直播拉到的终场补 */
function dayResults(day: PredictionDay, liveByKey: Record<string, LiveGame>): Record<string, GameResult> {
  const out = { ...day.results };
  for (const g of day.games) {
    const lg = liveByKey[liveKey(g)];
    if (lg?.completed && lg.homeScore !== null && lg.awayScore !== null) {
      out[g.id] = { homePts: lg.homeScore, awayPts: lg.awayScore, status: "final" };
    }
  }
  return out;
}

function legHit(game: GameInput, kind: ParlayLegKind, result: GameResult | undefined): boolean | null {
  if (!result) return null;
  const margin = result.homePts - result.awayPts;
  const total = result.homePts + result.awayPts;
  if (kind === "spread-home") {
    const v = margin + game.spread;
    return v > 0 ? true : v < 0 ? false : null;
  }
  if (kind === "total-under") return total < game.totalLine ? true : total > game.totalLine ? false : null;
  return total > game.totalLine ? true : total < game.totalLine ? false : null;
}

/* ── 小组件 ── */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="text-[10.5px] font-semibold text-dim tracking-wide px-1 mt-4 mb-1.5">{title}</div>
      {children}
    </>
  );
}

function Mark({ v }: { v: boolean | null }) {
  if (v === null) return <span className="text-dim">—</span>;
  return v
    ? <span className="text-[var(--p-primary)]"><ICheck size={15} strokeWidth={2.4} /></span>
    : <span className="text-[#e5484d]"><IClose size={15} strokeWidth={2.4} /></span>;
}

function Chip({ strong, children }: { strong?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] leading-5 ${strong ? "bg-pc text-on-pc font-semibold" : "bg-s3 text-dim"}`}>
      {children}
    </span>
  );
}

const fmtEdge = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));
const fmtSpread = (spread: number) => (spread < 0 ? `主让 ${(-spread).toFixed(1)}` : spread > 0 ? `客让 ${spread.toFixed(1)}` : "平手");

function InjuryLine({ team }: { team: GameInput["home"] }) {
  const out = team.injuries.filter((i) => i.status === "out");
  const dtd = team.injuries.filter((i) => i.status === "day-to-day");
  if (out.length === 0 && dtd.length === 0) return null;
  return (
    <div className="text-[12px] leading-5 text-dim">
      <span className="text-on font-medium">{team.nameCn}</span>
      {team.b2b ? <span className="ml-1.5 text-[10.5px] px-1.5 py-px rounded-full bg-s3">背靠背</span> : null}
      {out.length > 0 ? (
        <div>缺阵：{out.map((i) => i.name).join("、")}（扣 {teamDeduction(team).toFixed(1).replace(/\.0$/, "")} 分）</div>
      ) : null}
      {dtd.length > 0 ? <div>待定：{dtd.map((i) => i.name).join("、")}</div> : null}
    </div>
  );
}

/* ── 比赛卡片 ── */

function GameCard({ game, live }: { game: GameInput; live?: LiveGame }) {
  const pred = predictGame(game);
  const spreadStrong = Math.abs(pred.spreadEdge) >= 5;
  const totalStrong = Math.abs(pred.totalEdge) >= 5;
  const homeWin = pred.margin > 0;
  return (
    <div className="rounded-(--r-md) bg-s2 px-3 py-3 mb-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[14px] font-semibold text-on">
          {game.away.nameCn} <span className="text-dim font-normal text-[12px]">{game.away.record}</span>
          {" @ "}
          {game.home.nameCn} <span className="text-dim font-normal text-[12px]">{game.home.record}</span>
        </div>
        <div className="text-[12px] text-dim shrink-0">{game.tipoffBeijing} 开球</div>
      </div>

      <div className="mt-1.5 text-[19px] leading-7 text-on">
        预测{" "}
        <span className={homeWin ? "text-dim" : "font-bold"}>{game.away.nameCn} {pred.awayPts}</span>
        {" : "}
        <span className={homeWin ? "font-bold" : "text-dim"}>{pred.homePts} {game.home.nameCn}</span>
        {live && live.awayScore !== null && live.homeScore !== null ? (
          <span className="ml-2 text-[12px] text-dim font-normal">
            {live.completed ? "终场" : live.state === "in" ? "进行中" : "未开始"} {live.awayScore}:{live.homeScore}
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 space-y-1 text-[12.5px] leading-5 text-dim">
        <div>
          让分：盘口 {fmtSpread(game.spread)} · 模型{homeWin ? "主队" : "客队"}赢 {Math.abs(pred.margin)} 分 · 差距 {fmtEdge(pred.spreadEdge)}
        </div>
        <div>
          大小分：盘口 {game.totalLine.toFixed(1)} · 模型总分 {pred.total} · 差距 {fmtEdge(pred.totalEdge)}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip strong={spreadStrong}>
          {pred.coverPick === "home" ? "模型：主队穿盘" : pred.coverPick === "away" ? "模型：主队不穿盘" : "模型：分差与盘口持平"}
          {spreadStrong ? " · 差距大" : ""}
        </Chip>
        <Chip strong={totalStrong}>
          {pred.totalPick === "under" ? "模型：倾向小分" : pred.totalPick === "over" ? "模型：倾向大分" : "模型：总分与盘口持平"}
          {totalStrong ? " · 差距大" : ""}
        </Chip>
      </div>

      <div className="mt-2 space-y-1">
        <InjuryLine team={game.away} />
        <InjuryLine team={game.home} />
      </div>
    </div>
  );
}

/* ── 模型验证：某一天的回归 ── */

function DayCheck({ day, liveByKey }: { day: PredictionDay; liveByKey: Record<string, LiveGame> }) {
  const results = dayResults(day, liveByKey);
  const checks = day.games.map((g) => {
    const r = results[g.id];
    return { game: g, pred: predictGame(g), result: r, check: r ? checkGame(g, predictGame(g), r) : null };
  });
  const done = checks.filter((c) => c.check !== null).map((c) => c.check!);
  const sum = summarizeChecks(done);
  const parlay = day.parlay;
  const legStates = parlay?.legs.map((leg) => {
    const game = day.games.find((g) => g.id === leg.gameId);
    return { ...leg, hit: game ? legHit(game, leg.kind, results[leg.gameId]) : null };
  });
  const parlayState =
    !parlay ? null
    : legStates!.some((l) => l.hit === null) ? "pending"
    : legStates!.every((l) => l.hit === true) ? "hit" : "miss";

  return (
    <div className="rounded-(--r-md) bg-s2 px-3 py-3 mb-2">
      <div className="flex items-baseline justify-between">
        <div className="text-[14px] font-semibold text-on">{day.date}</div>
        <div className="text-[12px] text-dim">已验证 {sum.gamesChecked}/{day.games.length} 场</div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] leading-5 text-dim">
        <span>胜负 {sum.winnerHits}/{sum.winnerTotal} · {pct(sum.winnerHits, sum.winnerTotal)}</span>
        <span>让分 {sum.spreadHits}/{sum.spreadTotal} · {pct(sum.spreadHits, sum.spreadTotal)}</span>
        <span>大小分 {sum.totalHits}/{sum.totalTotal} · {pct(sum.totalHits, sum.totalTotal)}</span>
        <span className="text-on font-medium">总计 {sum.overallHits}/{sum.overallTotal} · {pct(sum.overallHits, sum.overallTotal)}</span>
        <span>平均误差 {sum.avgAbsErr === null ? "—" : `${sum.avgAbsErr.toFixed(1)} 分/队`}</span>
      </div>

      <div className="mt-2 divide-y divide-s3">
        {checks.map(({ game, pred, result, check }) => (
          <div key={game.id} className="py-2 first:pt-1 last:pb-0">
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-on font-medium">{game.away.nameCn} @ {game.home.nameCn}</span>
              <span className="text-dim shrink-0">
                预测 {pred.awayPts}:{pred.homePts}
                {result ? ` · 实际 ${result.awayPts}:${result.homePts}` : " · 待终场"}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-4 text-[12px] text-dim">
              <span className="flex items-center gap-1">胜负 <Mark v={check?.winner ?? null} /></span>
              <span className="flex items-center gap-1">让分 <Mark v={check?.spread ?? null} /></span>
              <span className="flex items-center gap-1">大小分 <Mark v={check?.total ?? null} /></span>
              {check ? (
                <span>分差误差 {check.marginErr} 分 · 总分误差 {check.totalErr} 分</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {parlay ? (
        <div className="mt-2 pt-2 border-t border-s3">
          <div className="text-[12.5px] text-dim">
            串关：{parlay.label} —{" "}
            <span className="text-on font-medium">
              {parlayState === "hit" ? "中了" : parlayState === "miss" ? "没中" : "待定"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-dim">
            {legStates!.map((l) => (
              <span key={l.label} className="flex items-center gap-1">{l.label} <Mark v={l.hit} /></span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── 主页面 ── */

export default function NbaPage() {
  const [liveByKey, setLiveByKey] = useState<Record<string, LiveGame>>({});
  const [liveOk, setLiveOk] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const latest = HISTORY[HISTORY.length - 1];
    const list = latest ? await fetchEspn(latest.date) : null;
    if (!mounted.current) return;
    if (list) {
      const map: Record<string, LiveGame> = {};
      for (const g of list) map[`${g.awayAbbr}@${g.homeAbbr}`] = g;
      setLiveByKey(map);
      setLiveOk(true);
    } else {
      setLiveOk(false);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  const latestDay = HISTORY[HISTORY.length - 1];
  const allChecks = HISTORY.flatMap((day) => {
    const results = dayResults(day, liveByKey);
    return day.games
      .filter((g) => results[g.id])
      .map((g) => checkGame(g, predictGame(g), results[g.id]!));
  });
  const total = summarizeChecks(allChecks);

  return (
    <div className="absolute inset-0 bg-bg flex flex-col">
      <div className="shrink-0 relative overflow-hidden bg-s1" style={{ paddingTop: "var(--sat, 0px)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(90% 120% at 100% 0%, var(--p-pc) 0%, transparent 60%)", opacity: 0.32 }} />
        <div className="relative px-3 pt-2 pb-4">
          <div className="px-2 mt-1 flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-(--r-sm) bg-pc text-on-pc flex items-center justify-center"><ITrophy size={20} strokeWidth={1.7} /></span>
                <span className="text-[24px] font-bold tracking-wide text-on">NBA 预测</span>
              </div>
              <div className="text-[12px] text-dim mt-1 px-0.5">
                {liveOk ? "实时比分 · ESPN" : SEED_NOTE} · {ODDS_SOURCE}
              </div>
            </div>
            <button
              onClick={() => void refresh()}
              aria-label="刷新比分"
              className="w-10 h-10 rounded-full flex items-center justify-center text-on hover:bg-s3 pressable shrink-0"
            >
              <IRefresh size={20} />
            </button>
          </div>
          {refreshing ? <div className="text-[12px] text-dim px-2 mt-1">正在拉取 ESPN 比分…</div> : null}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-6">
        <Section title={`明日预告 · ${latestDay.date}`}>
          {latestDay.games.map((g) => (
            <GameCard key={g.id} game={g} live={liveByKey[liveKey(g)]} />
          ))}
        </Section>

        <Section title="模型验证 · 预测回归">
          <div className="rounded-(--r-md) bg-s2 px-3 py-3 mb-2">
            <div className="text-[13px] text-on">
              累计：胜负 {total.winnerHits}/{total.winnerTotal}（{pct(total.winnerHits, total.winnerTotal)}）·
              让分 {total.spreadHits}/{total.spreadTotal}（{pct(total.spreadHits, total.spreadTotal)}）·
              大小分 {total.totalHits}/{total.totalTotal}（{pct(total.totalHits, total.totalTotal)}）
            </div>
            <div className="text-[13px] text-on mt-1">
              总准确率 {total.overallHits}/{total.overallTotal}（{pct(total.overallHits, total.overallTotal)}）·
              平均误差 {total.avgAbsErr === null ? "—" : `${total.avgAbsErr.toFixed(1)} 分/队`} ·
              分差平均误差 {total.avgMarginErr === null ? "—" : `${total.avgMarginErr.toFixed(1)} 分`}
            </div>
            {total.gamesChecked < 10 ? (
              <div className="text-[12px] text-dim mt-1.5">
                样本还太小：只验了 {total.gamesChecked} 场，准确率先看看就好，别急着改模型。走盘（正好压线）不计入统计。
              </div>
            ) : null}
          </div>
          {[...HISTORY].reverse().map((day) => (
            <DayCheck key={day.date} day={day} liveByKey={liveByKey} />
          ))}
        </Section>

        <Section title="模型说明">
          <div className="rounded-(--r-md) bg-s2 px-3 py-3">
            {MODEL_FORMULA.map((line) => (
              <div key={line} className="text-[12.5px] leading-5 text-dim">· {line}</div>
            ))}
            <div className="text-[12.5px] leading-5 text-on font-medium mt-2">关键判断（模型之外的重点）：</div>
            {(latestDay.notes ?? []).map((n) => (
              <div key={n} className="text-[12.5px] leading-5 text-dim mt-1">· {n}</div>
            ))}
            <div className="text-[12px] leading-5 text-dim mt-2">
              推测仅供参考。终场比分只认 ESPN 终场状态；预测与实际的差距，才是模型真正的含金量。
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
