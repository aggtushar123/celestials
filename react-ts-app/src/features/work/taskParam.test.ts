import { describe, expect, it } from 'vitest';
import { taskParam, withTask, withoutTask } from './taskParam';

describe('taskParam', () => {
  it('reads a task id, and nothing else', () => {
    expect(taskParam('?task=41')).toBe(41);
    expect(taskParam(new URLSearchParams('scope=team&task=7'))).toBe(7);
    expect(taskParam('?task=abc')).toBeNull();
    expect(taskParam('?task=')).toBeNull();
    expect(taskParam('')).toBeNull();
  });

  it('adds and removes it, keeping every other parameter', () => {
    expect(withTask('?scope=me', 41)).toBe('?scope=me&task=41');
    expect(withTask('?task=3', 41)).toBe('?task=41');
    expect(withTask('', 5)).toBe('?task=5');
    expect(withoutTask('?group=tasks&task=41&source=task').toString()).toBe('group=tasks&source=task');
  });
});
