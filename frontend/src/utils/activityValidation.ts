import type { FlashcardData, QuizQuestionData } from '../types';

export function validateActivities(cards: FlashcardData[], questions: QuizQuestionData[]) {
  cards.forEach((card, index) => {
    if (!card.front.trim() || !card.back.trim()) throw new Error(`Flashcard ${index + 1}: enter both a front and a back, or remove the card.`);
  });
  questions.forEach((question, index) => {
    if (!question.question.trim() || question.options.length < 2 || question.options.length > 6 || question.options.some(option => !option.trim())) {
      throw new Error(`Question ${index + 1}: enter a question and 2–6 nonempty options, or remove the question.`);
    }
    if (!Number.isInteger(question.correct_index) || question.correct_index < 0 || question.correct_index >= question.options.length) {
      throw new Error(`Question ${index + 1}: select a correct answer.`);
    }
  });
}
