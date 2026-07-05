export function slugify(input: string): string {
	return input
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

export async function generateUniqueSlug(
	base: string,
	isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
	const root = slugify(base) || 'tenant';
	let candidate = root;
	let suffix = 1;
	while (await isTaken(candidate)) {
		suffix += 1;
		candidate = `${root}-${suffix}`;
	}
	return candidate;
}
