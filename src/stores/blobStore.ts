import { create } from 'zustand';
import type { BlobStoreState } from '../types';

/**
 * Separate blob storage without undo/redo tracking
 * Memory efficient: blobs not duplicated in history
 */
export const useBlobStore = create<BlobStoreState>((set, get) => ({
  blobs: new Map(),

  addBlob: (id, blob) => set((state) => {
    const newBlobs = new Map(state.blobs);
    newBlobs.set(id, blob);
    return { blobs: newBlobs };
  }),

  getBlob: (id) => get().blobs.get(id),

  removeBlob: (id) => set((state) => {
    const newBlobs = new Map(state.blobs);
    const blob = state.blobs.get(id);

    // Revoke object URL to free memory
    if (blob) {
      const url = URL.createObjectURL(blob);
      URL.revokeObjectURL(url);
    }

    newBlobs.delete(id);
    return { blobs: newBlobs };
  }),

  clear: () => set((state) => {
    // Revoke all object URLs
    state.blobs.forEach(blob => {
      const url = URL.createObjectURL(blob);
      URL.revokeObjectURL(url);
    });

    return { blobs: new Map() };
  }),
}));
