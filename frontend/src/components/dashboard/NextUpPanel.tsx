import { ArrowRight, BookOpen, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '../common/Card';
import type { NextUpItem } from '../../types';

interface NextUpPanelProps {
  items: NextUpItem[];
}

export function NextUpPanel({ items }: NextUpPanelProps) {
  if (items.length === 0) {
    return (
      <Card className="border-2 border-indigo-100 bg-indigo-50/30">
        <CardHeader className="border-b-0 pb-0">
          <h3 className="font-semibold text-gray-900">Continue Learning</h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            No unfinished courses right now. Browse available courses whenever
            you're ready to learn something new.
          </p>
          <Link
            to="/courses"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Browse Courses
            <ArrowRight className="w-4 h-4" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-indigo-100 bg-indigo-50/30">
      <CardHeader className="border-b-0 pb-2">
        <h3 className="font-semibold text-gray-900">Continue Learning</h3>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {items.map((item, index) => (
          <Link
            key={`${item.course_id}-${item.module_id || index}`}
            to={
              item.item_type === 'module' && item.module_id
                ? `/courses/${item.course_id}/modules/${item.module_id}`
                : `/courses/${item.course_id}`
            }
            className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="p-2 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors">
              {item.item_type === 'module' ? (
                <BookOpen className="w-5 h-5 text-indigo-600" />
              ) : (
                <GraduationCap className="w-5 h-5 text-indigo-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {item.module_title || item.course_title}
              </p>
              {item.module_title && (
                <p className="text-xs text-gray-500 truncate">{item.course_title}</p>
              )}
              <p className="text-xs text-indigo-600 mt-0.5">{item.reason}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
