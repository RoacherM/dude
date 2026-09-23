/**
 * Host half of the deepbuddy plugin. It is empty: everything DeepBuddy adds
 * lives in the browser half. The row still loads it because the bundle patch
 * inserts one plugin row for both halves.
 */

export const name = 'deepbuddy'

export function apply() {}
