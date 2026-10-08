export type PromptTokenCategory = 'meta' | 'physical' | 'outfit' | 'trigger' | 'general';

export interface PromptToken {
  raw: string;
  text: string;
  weight: number;
  bracketDepth: number;
  enabled: boolean;
  category?: PromptTokenCategory;
}

export interface DecoupleOptions {
  position?: 'prepend' | 'append';
}
