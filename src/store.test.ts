import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './store';

describe('GranthaStore', () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it('should initialize with default values', () => {
    const state = useStore.getState();
    expect(state.appView).toBe('search');
    expect(state.query).toBe('');
    expect(state.nodes).toEqual([]);
  });

  it('should update appView', () => {
    const { setAppView } = useStore.getState();
    setAppView('settings');
    expect(useStore.getState().appView).toBe('settings');
  });
});
