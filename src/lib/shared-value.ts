/**
 * Спільне значення поля в кількох об'єктах — або його немає.
 *
 * Іменований союз, а не `T | null`: `null` цілком може БУТИ спільним значенням,
 * і тоді «усі однакові» та «значення різняться» злилися б в одне.
 */
export type SharedValue<T> = { shared: true; value: T } | { shared: false };

export function sharedValue<T>(values: readonly T[]): SharedValue<T> {
  const [first, ...rest] = values;
  if (values.length === 0 || first === undefined) return { shared: false };
  return rest.every((value) => value === first) ? { shared: true, value: first } : { shared: false };
}
