import React from 'react';

interface TagInputProps {
  value: string;
  onChange: (val: string) => void;
  onAddTags: (tags: string[]) => void;
  onRemoveLast: () => void;
  placeholder?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  value,
  onChange,
  onAddTags,
  onRemoveLast,
  placeholder = 'Add tag...',
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
    // カンマ区切りの文字列をパースしてトリミング、空文字を除外
    const tags = text
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    
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
