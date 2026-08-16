/**
 * Shared classes for card lists that scroll after roughly six rows, with a
 * thin themed scrollbar. Pair with a max-height utility on the same element:
 *
 *   <ul className={cn(SCROLL_LIST_CLASS, 'max-h-80')}>…
 */
export const SCROLL_LIST_CLASS =
  'overflow-y-auto pr-1 [scrollbar-width:thin] ' +
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full ' +
  '[&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent';
