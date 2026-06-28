let counter = 0;
let isDeterministic = false;

export const setDeterministicMode = (enabled: boolean): void => {
  isDeterministic = enabled;
  counter = 0;
};

export const generateChipId = (prefix = 'chip'): string => {
  if (isDeterministic) {
    counter += 1;
    return `${prefix}-${counter}`;
  }
  counter += 1;
  const rand = Math.random().toString(36).substring(2, 6);
  return `${prefix}-${Date.now()}-${counter}-${rand}`;
};
