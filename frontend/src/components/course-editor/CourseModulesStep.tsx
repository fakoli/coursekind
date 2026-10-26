import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Sparkles,
} from 'lucide-react';
import { Button } from '../common/Button';
import type { ModuleOutline } from '../../hooks/useModuleOutlines';

export interface CourseModulesStepProps {
  outlines: ModuleOutline[];
  aiEnabled: boolean;
  isEditing: boolean;
  isSuggestPending: boolean;
  onAddModule: () => void;
  onUpdateModule: (index: number, field: keyof ModuleOutline, value: string) => void;
  onRemoveModule: (index: number) => void;
  onMoveModule: (index: number, direction: 'up' | 'down') => void;
  onSuggestModules: () => void;
}

export function CourseModulesStep({
  outlines,
  aiEnabled,
  isEditing,
  isSuggestPending,
  onAddModule,
  onUpdateModule,
  onRemoveModule,
  onMoveModule,
  onSuggestModules,
}: CourseModulesStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900">Module Outline</h3>
          <p className="text-sm text-gray-500">
            Define the structure of your course. You can add content to each module after
            creating the course.
          </p>
        </div>
        <Button onClick={onAddModule}>
          <Plus className="w-4 h-4 mr-1" />
          Add Module
        </Button>
      </div>

      {outlines.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
          <p className="text-gray-500">No modules yet</p>
          <Button variant="secondary" className="mt-4" onClick={onAddModule}>
            Add First Module
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {outlines.map((module, index) => (
            <div
              key={module.id}
              className="flex items-start gap-3 p-4 border rounded-lg bg-white"
            >
              <div className="flex flex-col gap-1 text-gray-400">
                <button
                  onClick={() => onMoveModule(index, 'up')}
                  aria-label={`Move module ${index + 1} up`}
                  disabled={index === 0}
                  className="hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4 rotate-90" />
                </button>
                <GripVertical className="w-4 h-4" />
                <button
                  onClick={() => onMoveModule(index, 'down')}
                  aria-label={`Move module ${index + 1} down`}
                  disabled={index === outlines.length - 1}
                  className="hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4 rotate-90" />
                </button>
              </div>
              <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                {index + 1}
              </div>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={module.title}
                  onChange={(e) => onUpdateModule(index, 'title', e.target.value)}
                  placeholder="Module title"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  value={module.description}
                  onChange={(e) => onUpdateModule(index, 'description', e.target.value)}
                  placeholder="Brief description (optional)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={() => onRemoveModule(index)}
                aria-label={`Remove module ${index + 1}`}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {aiEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-amber-800">AI Module Suggestions</p>
              <p className="text-sm text-amber-700 mt-1">
                {isEditing
                  ? 'Generate a suggested module structure based on your course instructions.'
                  : "After creating the course, you'll be able to generate module suggestions based on your AI instructions."}
              </p>
              {isEditing && (
                <Button
                  variant="secondary"
                  className="mt-3"
                  onClick={onSuggestModules}
                  isLoading={isSuggestPending}
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  Generate Suggestions
                </Button>
              )}
              <p className="text-xs text-amber-600 mt-2">Cost: ~10 tokens</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
