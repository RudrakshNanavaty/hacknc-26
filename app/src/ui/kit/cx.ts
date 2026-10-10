/** Joins class names, skipping falsy parts. The kit's whole "class merging" story. */
export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
