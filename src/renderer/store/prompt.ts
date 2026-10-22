// In-app replacement for confirm()/message boxes: one question at a time,
// answered with the id of the chosen button.
import { create } from 'zustand';

export type PromptIcon = 'warning' | 'question' | 'danger' | 'info';

export interface PromptButton {
  id: string;
  label: string;
  kind?: 'primary' | 'danger';
}

export interface PromptSpec {
  title: string;
  message?: string;
  icon?: PromptIcon;
  buttons: PromptButton[];
  /** Answer for Esc, the close button and a click outside. */
  cancelId: string;
}

interface PromptState {
  current: (PromptSpec & { resolve: (id: string) => void }) | null;
}

export const usePrompt = create<PromptState>(() => ({ current: null }));

export function ask(spec: PromptSpec): Promise<string> {
  return new Promise((resolve) => {
    const prev = usePrompt.getState().current;
    if (prev) prev.resolve(prev.cancelId);
    usePrompt.setState({ current: { ...spec, resolve } });
  });
}

export function answer(id: string): void {
  const cur = usePrompt.getState().current;
  if (!cur) return;
  usePrompt.setState({ current: null });
  cur.resolve(id);
}

/** Yes/no confirmation; resolves true when confirmed. */
export async function confirmAction(opts: { title: string; message?: string; confirm: string; cancel: string; danger?: boolean }): Promise<boolean> {
  const id = await ask({
    title: opts.title,
    message: opts.message,
    icon: opts.danger ? 'danger' : 'question',
    buttons: [
      { id: 'cancel', label: opts.cancel },
      { id: 'ok', label: opts.confirm, kind: opts.danger ? 'danger' : 'primary' },
    ],
    cancelId: 'cancel',
  });
  return id === 'ok';
}
