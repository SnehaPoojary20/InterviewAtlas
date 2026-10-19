export function allocateSchedule(questions, daysAvailable) {
  // Sort by difficulty descending (harder material lands earlier, per Section 8)
  const sortedQuestions = [...questions].sort((a, b) => b.difficulty - a.difficulty);
  const days = [];
  const count = Math.max(daysAvailable, 1);
  const questionsPerDay = Math.ceil(sortedQuestions.length / count);

  for (let i = 0; i < count; i++) {
    const dayNum = i + 1;
    const chunk = sortedQuestions.slice(i * questionsPerDay, (i + 1) * questionsPerDay);

    days.push({
      day: dayNum,
      focus: dayNum === 1 ? "Core Technical & Must-Have Foundations" : `Advanced Practice & Integration - Day ${dayNum}`,
      question_ids: chunk.map(q => q.id),
      minutes: 60 // integer minutes per Appendix A
    });
  }

  return {
    days_available: count,
    days
  };
}