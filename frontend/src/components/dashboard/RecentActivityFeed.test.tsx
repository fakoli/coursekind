import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { RecentActivityFeed } from './RecentActivityFeed';

afterEach(cleanup);

it('renders flashcard reviews with a label and the lesson title', () => {
  render(<RecentActivityFeed activities={[{
    id: 'a1', user_id: 'u1', activity_type: 'flashcard_reviewed',
    module_id: 'm1', module_title: 'Variables', course_id: 'c1', course_title: 'Python',
    details: { cards_reviewed: 1 }, created_at: new Date().toISOString(),
  }]} />);
  expect(screen.getByText('Reviewed flashcards')).toBeInTheDocument();
  expect(screen.getByText('Variables')).toBeInTheDocument();
  expect(screen.queryByText('Ready to get started?')).not.toBeInTheDocument();
});
