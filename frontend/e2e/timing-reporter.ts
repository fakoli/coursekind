import { mkdirSync, writeFileSync } from 'node:fs';
import type { Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

// Initialize all rows, including tests never reached after an infrastructure error.
export default class JourneyTimingReporter implements Reporter {
  private rows = new Map<string, Record<string, unknown>>();
  onBegin(_config: unknown, suite: Suite) {
    for (const test of suite.allTests()) this.rows.set(test.id, {
      journey: test.title.match(/^[A-Z]+-\d+/)?.[0], scenario: test.title,
      result: 'Not run', elapsed_seconds: null,
    });
  }
  onTestEnd(test: TestCase, result: TestResult) {
    this.rows.set(test.id, { ...this.rows.get(test.id), result: result.status,
      elapsed_seconds: result.duration / 1000, retry: result.retry,
      file: test.location.file.split('/e2e/').pop() });
  }
  onEnd() {
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/journey-timings.json', JSON.stringify({
      measured_at: new Date().toISOString(),
      environment: 'Playwright Chromium; isolated synthetic storage; mocked provider HTTP and delivery transports',
      interpretation: 'Automated wall time, includes setup/assertions; not human usability time.',
      journeys: [...this.rows.values()],
    }, null, 2));
  }
}
