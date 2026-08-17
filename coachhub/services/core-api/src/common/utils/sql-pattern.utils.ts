/**
 * Escapes the wildcards in a user-supplied `LIKE` term.
 *
 * Without this, a search for "50%" matches everything and one for "a_c" matches
 * "abc". Parameter binding stops injection; it does nothing about a pattern
 * meaning something the person typing it did not intend.
 */
export function escapePostgresLikePattern(value: string) {
	return value.replace(/[\\%_]/g, '\\$&');
}
