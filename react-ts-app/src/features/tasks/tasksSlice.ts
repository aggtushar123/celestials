import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface Task {
  id: string;
  title: string;
  org: string;
  type: 'org' | 'account';
  priority: 'High' | 'Normal' | 'Low';
  status: 'Planned' | 'Open' | 'Completed';
  date: string;
}

interface TasksState {
  tasks: Task[];
}

const initialState: TasksState = {
  tasks: [
    { id: 'TASK-210', title: 'Next-Term Success Plan', org: 'Apple Inc', type: 'org', priority: 'Normal', status: 'Planned', date: 'Feb 2, 2026' },
    { id: 'TASK-226', title: 'Commercial Discussion', org: 'Apple EMEA', type: 'account', priority: 'High', status: 'Planned', date: 'Feb 2, 2026' },
    { id: 'TASK-196', title: 'Platform Configuration', org: 'Apple Inc', type: 'org', priority: 'High', status: 'Planned', date: 'Feb 9, 2026' },
    { id: 'TASK-230', title: 'Gap Closure Actions', org: 'Apple EMEA', type: 'account', priority: 'Normal', status: 'Planned', date: 'Feb 9, 2026' },
    { id: 'TASK-236', title: 'Advanced workflow optimization', org: 'Apple EMEA', type: 'account', priority: 'Normal', status: 'Open', date: 'Feb 14, 2026' },
    { id: 'TASK-237', title: 'Advanced workflow optimization', org: 'Apple Inc', type: 'org', priority: 'Normal', status: 'Open', date: 'Feb 20, 2026' },
  ],
};

export const tasksSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    addTask: (state, action: PayloadAction<Omit<Task, 'id'>>) => {
      // Generate a quick random ID starting with TASK-
      const newId = `TASK-${Math.floor(Math.random() * 900) + 100}`;
      state.tasks.push({ ...action.payload, id: newId });
    },
  },
});

export const { addTask } = tasksSlice.actions;
export default tasksSlice.reducer;
