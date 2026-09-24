import type { ComponentType } from 'react';

export type IdeaMeta = {
  /** URL id: the GitHub issue number as a string (e.g. "27"), or "starter". */
  id: string;
  /** GitHub issue number of the idea, if any. */
  issue?: number;
  /** Short, plain-language title a clinician understands. No jargon. */
  title: string;
  /** One line: who it helps and when. */
  tagline: string;
};

export type IdeaModule = { meta: IdeaMeta; default: ComponentType };

// Every folder `./<name>/index.tsx` that exports `meta` and a default component is an idea page.
// Discovered at build time, so ideas never edit a shared list and merge without conflicts.
const modules = import.meta.glob<IdeaModule>('./*/index.tsx', { eager: true });

export const ideas: IdeaModule[] = Object.values(modules)
  .filter((m) => m.meta && m.default)
  .sort((a, b) => (a.meta.id === 'starter' ? 1 : b.meta.id === 'starter' ? -1 : (b.meta.issue ?? 0) - (a.meta.issue ?? 0)));

export const findIdea = (id: string) => ideas.find((m) => m.meta.id === id);
