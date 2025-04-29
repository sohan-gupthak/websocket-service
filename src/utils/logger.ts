export function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
	const timestamp = new Date().toISOString();
	console[level](`[${timestamp}] [${level.toUpperCase()}]: ${message}`);
}
