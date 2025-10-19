// src/scoring/compute.js

/**
 * cell: {
 *   isCorrect: boolean | undefined,
 *   bonusPoints?: number | null,   // per-question bonus for this team (optional)
 *   partialCredit?: number | null  // override points for this question/team (optional)
 * }
 * grid: { [showTeamId]: { [showQuestionId]: cell } }
 * teams: [{ showTeamId, teamName, showBonus?: number }]
 * questions: [{ showQuestionId, order }]
 * scoring: { mode: "pub" | "pooled" | "pooled-adaptive", pubPoints: number, poolPerQuestion: number, poolContribution: number, teamCount: number }
 */

export function buildAnsweredAllMap(teams, questions, grid) {
  const out = {};
  for (const q of questions) {
    const sqid = q.showQuestionId;
    let allAnswered = true;
    for (const t of teams) {
      const cell = grid[t.showTeamId]?.[sqid];
      const answered = cell && typeof cell.isCorrect === "boolean";
      if (!answered) {
        allAnswered = false;
        break;
      }
    }
    out[sqid] = allAnswered;
  }
  return out;
}

export function buildCorrectCountMap(teams, questions, grid) {
  const out = {};
  for (const q of questions) {
    const sqid = q.showQuestionId;
    let c = 0;
    for (const t of teams) {
      const cell = grid[t.showTeamId]?.[sqid];
      if (cell?.isCorrect) c++;
    }
    out[sqid] = c;
  }
  return out;
}

export function buildSoloMap(teams, questions, grid, answeredAllMap) {
  const out = {};
  for (const q of questions) {
    const sqid = q.showQuestionId;
    if (!answeredAllMap[sqid]) {
      out[sqid] = null;
      continue;
    }
    let soloTeamId = null,
      count = 0;
    for (const t of teams) {
      const cell = grid[t.showTeamId]?.[sqid];
      if (cell?.isCorrect === true) {
        count++;
        soloTeamId = t.showTeamId;
        if (count > 1) break;
      }
    }
    out[sqid] = count === 1 ? soloTeamId : null;
  }
  return out;
}

export function computeAutoEarned(cell, scoring, correctCount) {
  if (!cell?.isCorrect) return 0;
  if (scoring.mode === "pub") {
    return Number(scoring.pubPoints) || 0;
  }

  const n = Math.max(1, Number(correctCount) || 0);

  // Pooled-adaptive: pool size = teamCount × poolContribution
  if (scoring.mode === "pooled-adaptive") {
    const teamCount = Number(scoring.teamCount) || 0;
    const contribution = Number(scoring.poolContribution) || 0;
    const pool = teamCount * contribution;
    return Math.round(pool / n);
  }

  // Pooled-static: fixed pool size
  return Math.round((Number(scoring.poolPerQuestion) || 0) / n);
}

export function computeCellPoints(cell, scoring, correctCount) {
  if (!cell) return 0;

  // Partial credit replaces default points and forces correct
  if (
    cell.partialCredit !== null &&
    cell.partialCredit !== undefined &&
    cell.partialCredit !== ""
  ) {
    const base = Number(cell.partialCredit) || 0;
    const bonus = Number(cell.bonusPoints || 0);
    return base + bonus;
  }

  // Otherwise: only if marked correct
  if (!cell.isCorrect) return 0;

  const auto = computeAutoEarned(cell, scoring, correctCount);
  const bonus = Number(cell.bonusPoints || 0);
  return auto + bonus;
}

export function buildTeamTotals(
  teams,
  questions,
  grid,
  scoring,
  correctCountMap
) {
  const totals = {};
  for (const t of teams) {
    let sum = Number(t.showBonus || 0);
    for (const q of questions) {
      const cell = grid[t.showTeamId]?.[q.showQuestionId];
      const correctCount = correctCountMap[q.showQuestionId] || 0;
      sum += computeCellPoints(cell, scoring, correctCount);
    }
    totals[t.showTeamId] = sum;
  }
  return totals;
}
