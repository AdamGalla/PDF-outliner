
import { createSelectors } from '@/lib/auto-selector';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OptionsState {
  dimDoc: boolean;
  setDimDoc: (val: boolean) => void;
}

export const useOptionsStore = create<OptionsState>()(
  persist(
    (set) => ({
      dimDoc: false,
      setDimDoc: (val: boolean) => set({ dimDoc: val }),
    }),
    {
      name: 'options-store-outliner',
      partialize: (state) => ({ dimDoc: state.dimDoc }),
    }
  )
);

const options = createSelectors(useOptionsStore)

export default options;
