/**
 * Simple fuzzy match scoring.
 * Returns 0 for no match, higher score for better matches.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q.length === 0) return 1;

  let score = 0;
  let qi = 0;
  let consecutive = 0;
  let prevMatch = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10;
      // Bonus for consecutive matches
      if (ti === prevMatch + 1) {
        consecutive++;
        score += consecutive * 2;
      } else {
        consecutive = 0;
      }
      // Bonus for matching at word boundaries
      if (ti === 0 || t[ti - 1] === " " || t[ti - 1] === "-" || t[ti - 1] === "_") {
        score += 5;
      }
      // Bonus for matching uppercase
      if (t[ti] === q[qi] && t[ti] === t[ti].toUpperCase()) {
        score += 3;
      }
      prevMatch = ti;
      qi++;
    }
  }

  // Penalty for unmatched characters in query
  if (qi < q.length) return 0;

  // Penalty for long targets
  score -= Math.floor(t.length / 20);

  return Math.max(score, 0);
}

/** Filter and sort commands by fuzzy match against query */
export function filterCommands(
  commands: import("./types").Command[],
  query: string
): import("./types").Command[] {
  if (!query.trim()) return commands;

  const scored = commands
    .map((cmd) => ({
      command: cmd,
      score: Math.max(
        fuzzyScore(query, cmd.label),
        fuzzyScore(query, cmd.category || ""),
        fuzzyScore(query, cmd.id)
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map(({ command }) => command);
}
