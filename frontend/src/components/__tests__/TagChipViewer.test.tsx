import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagChipViewer } from '../TagChipViewer';
describe('TagChipViewer', () => {
  const sampleTags = ['masterpiece', '1girl', 'solo', 'cat ears'];

  it('renders chips mode by default', () => {
    render(<TagChipViewer tags={sampleTags} />);
    
    sampleTags.forEach(tag => {
      expect(screen.getByText(tag)).toBeInTheDocument();
    });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /delete|remove|close/i })).toBeNull();
  });

  it('toggles between chips mode and text mode when toggle button is clicked', () => {
    render(<TagChipViewer tags={sampleTags} />);
    
    const toggleBtn = screen.getByRole('button', { name: /switch to text view|switch to chips view|toggle mode/i });
    expect(toggleBtn).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByText(sampleTags.join(', '))).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    sampleTags.forEach(tag => {
      expect(screen.getByText(tag)).toBeInTheDocument();
    });
  });


  it('honors defaultMode="text"', () => {
    render(<TagChipViewer tags={sampleTags} defaultMode="text" />);
    expect(screen.getByText(sampleTags.join(', '))).toBeInTheDocument();
  });


  it('applies purple accent styling correctly', () => {
    const { container } = render(<TagChipViewer tags={['tag1']} accentColor="purple" />);
    const chip = container.querySelector('span[data-tag=\"tag1\"]');
    expect(chip).toBeInTheDocument();
    expect(chip?.className).toContain('text-[#a99ef7]');
  });

  it('applies green accent styling correctly', () => {
    const { container } = render(<TagChipViewer tags={['tag1']} accentColor="green" />);
    const chip = container.querySelector('span[data-tag=\"tag1\"]');
    expect(chip).toBeInTheDocument();
    expect(chip?.className).toContain('text-accent-green');
  });

  it('renders placeholder when tags array is empty', () => {
    render(<TagChipViewer tags={[]} emptyPlaceholder="タグがありません" />);
    expect(screen.getByText('タグがありません')).toBeInTheDocument();
  });

  it('renders default placeholder when tags array is empty and no custom placeholder is given', () => {
    render(<TagChipViewer tags={[]} />);
    expect(screen.getByText('No tags')).toBeInTheDocument();
  });
});