export function checkCoverage(requirements, questions) {
  const mustReqs = requirements.filter(r => r.priority === 'must').map(r => r.id);
  const coveredIds = new Set();

  questions.forEach(q => {
    if (q.requirement_ids && Array.isArray(q.requirement_ids)) {
      q.requirement_ids.forEach(id => coveredIds.add(id));
    }
  });

  const uncovered_requirement_ids = mustReqs.filter(id => !coveredIds.has(id));

  return {
    isFullyCovered: uncovered_requirement_ids.length === 0,
    uncovered_requirement_ids
  };
}