
function detectCycle(obj: { [key in string]: string[] }, key: string, visited: Set<string>, path: string[]): void {
	visited.add(key);
	path.push(key);

	const dependencies = obj[key] || [];

	for (const dep of dependencies) {
		if (!visited.has(dep)) {
			detectCycle(obj, dep, visited, path);
		} else if (path.includes(dep)) {
			throw new Error(`Cycle detected: ${path.join(' -> ')} -> ${dep}`);
		}
	}

	path.pop();
}

export function ensureNoCycle(obj: { [key in string]: string[] }): void {
	const visited = new Set<string>();
	const keys = Object.keys(obj);

	for (const key of keys) {
		if (!visited.has(key)) {
			detectCycle(obj, key, visited, []);
		}
	}
}
export function pathHead(path: string): [string, string, string[]] {
	const parts = path.split(".")
	const head = parts[0]
	const restPath = parts.slice(1).join(".")
	return [head, restPath, parts]
}
export function pathTail(path: string): [string, string, string[]] {
	const parts = path.split(".")
	const tail = parts.pop() as string
	const restPath = parts.join(".")
	return [restPath, tail, parts]
}
export function pathConcat(left: string, right: string) {
	if (left && right)
		return `${left}.${right}`
	return left ? left : right
}
export function capitalizeFirstLetter(string: string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}
export function lowerCaseFirstLetter(string: string) {
	return string.charAt(0).toLowerCase() + string.slice(1);
}
