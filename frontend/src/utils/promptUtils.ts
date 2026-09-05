/**
 * Pure utility functions for prompt string manipulation with assets
 * (LoRA trigger words / TagSet tags).
 *
 * These functions operate on plain strings and have no side effects.
 */

/**
 * Remove asset tags (and optional LoRA string) from a comma-separated prompt.
 */
export function removeAssetFromPrompt(
  prompt: string,
  tags: string[],
  loraPromptString?: string,
): string {
  let chips = prompt.split(',').map((c) => c.trim()).filter(Boolean);
  const tagsToRemove = new Set(tags.map((t) => t.toLowerCase()));

  if (loraPromptString) {
    tagsToRemove.add(loraPromptString.toLowerCase());
    const match = loraPromptString.match(/<lora:([^:]+):/i);
    if (match) {
      const baseLoraPrefix = `<lora:${match[1]}:`.toLowerCase();
      chips = chips.filter((chip) => {
        const lowerChip = chip.toLowerCase();
        return !(lowerChip.startsWith(baseLoraPrefix) && lowerChip.endsWith('>'));
      });
    }
  }

  chips = chips.filter((chip) => !tagsToRemove.has(chip.toLowerCase()));
  return chips.join(', ');
}

/**
 * Append asset tags (and optional LoRA string) to an existing prompt string.
 */
export function addAssetToPrompt(
  prompt: string,
  tags: string[],
  loraPromptString?: string,
): string {
  const currentVal = prompt || '';
  const tagsToAdd = [...tags];
  if (loraPromptString) {
    tagsToAdd.push(loraPromptString);
  }
  const toAddStr = tagsToAdd.join(', ');
  if (!currentVal) return toAddStr;
  return `${currentVal}, ${toAddStr}`;
}

/**
 * Trims leading/trailing commas and whitespace from a prompt snippet.
 */
function cleanPromptSnippet(str: string): string {
  if (!str) return ''
  return str.trim().replace(/^[\s,]+|[\s,]+$/g, '').trim()
}

/**
 * Prepends a prefix string to an existing prompt with proper comma delimiter.
 */
export function prependToPrompt(prompt: string, prefix: string): string {
  const cleanPrefix = cleanPromptSnippet(prefix)
  const cleanExisting = cleanPromptSnippet(prompt)
  if (!cleanPrefix) return cleanExisting
  if (!cleanExisting) return cleanPrefix
  return `${cleanPrefix}, ${cleanExisting}`
}

/**
 * Appends a suffix string to an existing prompt with proper comma delimiter.
 */
export function appendToPrompt(prompt: string, suffix: string): string {
  const cleanSuffix = cleanPromptSnippet(suffix)
  const cleanExisting = cleanPromptSnippet(prompt)
  if (!cleanSuffix) return cleanExisting
  if (!cleanExisting) return cleanSuffix
  return `${cleanExisting}, ${cleanSuffix}`
}

