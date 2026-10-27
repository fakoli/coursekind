import { Sparkles, Trash2 } from 'lucide-react';
import { Input } from '../common/Input';
import { Textarea } from '../common/Textarea';
import { Button } from '../common/Button';
import type { CourseDifficulty } from '../../types';

export interface CourseInfoStepProps {
  title: string;
  description: string;
  difficulty: CourseDifficulty;
  tags: string[];
  tagInput: string;
  aiEnabled: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDifficultyChange: (value: CourseDifficulty) => void;
  onTagInputChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onAiEnabledChange: (value: boolean) => void;
}

export function CourseInfoStep({
  title,
  description,
  difficulty,
  tags,
  tagInput,
  aiEnabled,
  onTitleChange,
  onDescriptionChange,
  onDifficultyChange,
  onTagInputChange,
  onAddTag,
  onRemoveTag,
  onAiEnabledChange,
}: CourseInfoStepProps) {
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onAddTag();
    }
  };

  return (
    <div className="space-y-6">
      <Input
        id="title"
        label="Course Title"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="e.g., Python for Data Engineers"
        required
      />

      <Textarea
        id="description"
        label="Description"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="What will learners achieve with this course?"
        rows={3}
        showCharCount
        maxLength={500}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Difficulty
          </label>
          <select aria-label="Difficulty"
            value={difficulty}
            onChange={(e) => onDifficultyChange(e.target.value as CourseDifficulty)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tags
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => onTagInputChange(e.target.value)}
              onKeyDown={handleTagKeyDown}
              aria-label="Tags"
              placeholder="Add tag..."
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Button type="button" variant="secondary" onClick={onAddTag}>
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"
                >
                  {tag}
                  <button
                    onClick={() => onRemoveTag(tag)}
                    className="hover:text-red-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Course Type Selection */}
      <div className="border border-gray-200 rounded-xl p-4 space-y-4">
        <p className="font-medium text-gray-900">Course Type</p>
        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="radio"
              name="courseType"
              checked={!aiEnabled}
              onChange={() => onAiEnabledChange(false)}
              className="mt-1"
            />
            <div>
              <p className="font-medium">Manual Course</p>
              <p className="text-sm text-gray-500">
                Write all content yourself. Full control over every module.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="radio"
              name="courseType"
              checked={aiEnabled}
              onChange={() => onAiEnabledChange(true)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">AI-Assisted Course</p>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                  <Sparkles className="w-3 h-3" />
                  AI
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Generate modules, flashcards, and quizzes with AI. You can still edit
                everything.
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
