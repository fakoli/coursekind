import { BookOpen, FileText, HelpCircle, Code } from 'lucide-react';
import type { EditorTab } from '../../hooks/useModuleEditorForm';

export interface ModuleEditorTabsProps {
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  flashcardCount: number;
  quizQuestionCount: number;
  hasSandbox?: boolean;
}

export function ModuleEditorTabs({
  activeTab,
  onTabChange,
  flashcardCount,
  quizQuestionCount,
  hasSandbox = false,
}: ModuleEditorTabsProps) {
  const tabs: { key: EditorTab; label: string; icon: React.ReactNode; count?: number; indicator?: string }[] = [
    { key: 'content', label: 'Content', icon: <BookOpen className="w-4 h-4" /> },
    {
      key: 'flashcards',
      label: 'Flashcards',
      icon: <FileText className="w-4 h-4" />,
      count: flashcardCount,
    },
    {
      key: 'quiz',
      label: 'Quiz',
      icon: <HelpCircle className="w-4 h-4" />,
      count: quizQuestionCount,
    },
    {
      key: 'sandbox',
      label: 'Sandbox',
      icon: <Code className="w-4 h-4" />,
      indicator: hasSandbox ? undefined : '+',
    },
  ];

  return (
    <div className="border-b border-gray-200">
      <nav aria-label="Module editor activities" className="-mb-px flex flex-wrap gap-x-4 sm:gap-x-8">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={activeTab === tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === tab.key
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && ` (${tab.count})`}
            {tab.indicator && (
              <span className="text-gray-400 text-xs">{tab.indicator}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
