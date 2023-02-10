export type PromiseSub<T = any> = { promise: Promise<T>, resolve: ((value?: T) => void), reject: ((error?: any) => void) }
export class PromiseLib {
	static Create<T = any>(): PromiseSub<T> {
		const sub: Partial<PromiseSub> = {}
		sub.promise = new Promise((resolve, reject) => { sub.resolve = resolve; sub.reject = reject })
		return sub as PromiseSub
	}
}
