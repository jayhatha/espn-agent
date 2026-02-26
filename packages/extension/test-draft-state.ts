// Quick type check for draft-state.ts
import { useDraftStore } from './lib/draft-state';

// Test that store exports correctly
const store = useDraftStore.getState();
const { addPick, updateRoster, initializeDraft } = useDraftStore.getState();

console.log('Types check OK');
