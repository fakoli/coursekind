import { Input } from '../common/Input';
import { Textarea } from '../common/Textarea';
import type { WorkspaceBrief } from '../../types/workspace';

export function BriefForm({
  brief,
  onChange,
  disabled = false,
}: {
  brief: WorkspaceBrief;
  onChange: (brief: WorkspaceBrief) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof WorkspaceBrief>(key: K, value: WorkspaceBrief[K]) =>
    onChange({ ...brief, [key]: value });
  return (
    <fieldset disabled={disabled} className="space-y-4 min-w-0">
      <legend className="sr-only">Learning brief</legend>
      <Textarea
        label="Learning goal"
        required
        maxLength={4000}
        value={brief.goal}
        onChange={(e) => set('goal', e.target.value)}
        rows={3}
      />
      <label className="block text-sm font-medium text-gray-700">
        Scope
        <select
          className="block w-full mt-1 border border-gray-300 rounded-lg p-2"
          value={brief.scope}
          onChange={(e) => set('scope', e.target.value as WorkspaceBrief['scope'])}
        >
          <option value="course">One course</option>
          <option value="path">Learning path</option>
        </select>
      </label>
      <Textarea
        label="Prior knowledge"
        maxLength={4000}
        value={brief.prior_knowledge}
        onChange={(e) => set('prior_knowledge', e.target.value)}
        rows={2}
      />
      <Input
        label="Audience"
        maxLength={1000}
        value={brief.audience}
        onChange={(e) => set('audience', e.target.value)}
      />
      <Input
        label="Weekly hours (optional)"
        type="number"
        min={0}
        max={168}
        step="any"
        value={brief.weekly_hours ?? ''}
        onChange={(e) => set('weekly_hours', e.target.value === '' ? null : Number(e.target.value))}
      />
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={brief.generate_flashcards}
              onChange={(e) => set('generate_flashcards', e.target.checked)}
            />
            Include flashcards
          </label>
          <Input
            label="Flashcard count"
            type="number"
            min={1}
            max={20}
            disabled={!brief.generate_flashcards}
            value={brief.flashcard_count}
            onChange={(e) => set('flashcard_count', Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={brief.generate_quiz}
              onChange={(e) => set('generate_quiz', e.target.checked)}
            />
            Include quiz
          </label>
          <Input
            label="Quiz question count"
            type="number"
            min={1}
            max={10}
            disabled={!brief.generate_quiz}
            value={brief.quiz_question_count}
            onChange={(e) => set('quiz_question_count', Number(e.target.value))}
          />
        </div>
      </div>
    </fieldset>
  );
}
