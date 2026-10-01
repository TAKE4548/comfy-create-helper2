import { splitTags } from './useChipParser';

interface TagInputProps {
  value: string;
  onChange: (val: string) => void;
  onAddTags: (tags: string[]) => void;
  onRemoveLast: () => void;
  placeholder?: string;
  isAnimaMode?: boolean;
}

export const TagInput: React.FC<TagInputProps> = ({
  value,
  onChange,
  onAddTags,
  onRemoveLast,
  placeholder = 'Add tag...',
  isAnimaMode = false,
}) => {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // カンマで終わる場合はチップとして確定
    if (val.endsWith(',')) {
      const textBeforeComma = val.slice(0, -1).trim();
      if (textBeforeComma.length > 0) {
        onAddTags([textBeforeComma]);
      }
      onChange('');
    } else if (isAnimaMode && val.endsWith('.')) {
      // 括弧深度チェック: ネスト内ならピリオド確定しない
      let openCount = 0;
      let closeCount = 0;
      for (const ch of val) {
        if (ch === '(' || ch === '[' || ch === '{') openCount++;
        else if (ch === ')' || ch === ']' || ch === '}') closeCount++;
      }

      if (openCount <= closeCount) {
        const substantive = val.trim().replace(/[.,\s]/g, '');
        if (substantive.length > 0) {
          onAddTags([val.trim()]);
        }
        onChange('');
      } else {
        onChange(val);
      }
    } else {
      onChange(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        onAddTags([trimmed]);
        onChange('');
      }
    } else if (e.key === 'Backspace' && value === '') {
      onRemoveLast();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    const tags = splitTags(text, isAnimaMode);

    if (tags.length > 0) {
      onAddTags(tags);
      onChange('');
    }
  };

  return (
    <input
      type="text"
      value={value}
      onChange={handleInputChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={placeholder}
      className="bg-transparent border-none text-[#E4E4E7] text-sm focus:outline-none placeholder-zinc-500 py-1 flex-grow min-w-[120px]"
    />
  );
};
