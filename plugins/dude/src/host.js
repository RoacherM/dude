/**
 * Host half of the dude plugin. It is empty: everything Dude adds
 * lives in the browser half. The row still loads it because the bundle patch
 * inserts one plugin row for both halves.
 */

export const name = 'dude'

export function apply() {}
