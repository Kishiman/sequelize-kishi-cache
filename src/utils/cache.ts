import { PromiseLib, PromiseSub } from "./promise"

type CachedRecord = { data: any, timeoutDate: Date, tags: string[] }

export type CachePayLoad = { status: "ok" | "promise" | null, data?: any, promise?: Promise<[any, string[]]> }
export class Cache {
	private caches: Record<any, CachedRecord> = {}
	private promises: Record<any, Promise<[any, string[]]>> = {}
	private tagKeyGroup: Record<string, string[]> = {}
	Clear(key: string) {
		delete this.caches[key]
	}
	ClearByTag(tag: string) {
		if (!this.tagKeyGroup[tag]) return
		for (const key of this.tagKeyGroup[tag]) {
			if (this.caches[key]) {
				delete this.caches[key]
			}
		}
		delete this.tagKeyGroup[tag]

	}
	GetCache(key: string): CachePayLoad {
		const now = new Date()
		if (this.caches[key] && (now < this.caches[key].timeoutDate)) {
			return { status: "ok", data: this.caches[key].data }
		}
		if (key in this.promises) {
			return { status: "promise", promise: this.promises[key] }
		}
		return { status: null }
	}
	SetCache(key: string, options: { data: any, timeout: number, tags: any[] }) {
		const { data, timeout, tags } = options
		const now = new Date()
		const timeoutDate = new Date(now.getTime() + timeout * 1000)
		setTimeout(() => {
			this.Clear(key)
		}, (timeout + 1) * 1000);
		for (const tag of tags) {
			this.tagKeyGroup[tag] = this.tagKeyGroup[tag] || []
			this.tagKeyGroup[tag].push(key)
		}
		this.caches[key] = { data, timeoutDate, tags }
	}
	PromiseCache(key: string, promise: Promise<[any, string[]]>, options?: { timeout?: number }) {
		const { timeout = 0 } = options || {}
		promise.then(([data, tags = []]) => {
			if (timeout > 0) {
				this.SetCache(key, { data, timeout, tags })
			}
			return [data, tags]
		}).then(() => {
			delete this.promises[key]
		}).catch(() => {
			delete this.promises[key]
		})
		this.promises[key] = promise
	}
	CreatePromise(key: string, options?: { timeout?: number }) {
		const { timeout = 0 } = options || {}
		let sub = PromiseLib.Create<[any, string[]]>()
		this.PromiseCache(key, sub.promise, { timeout })
		return sub
	}
	async GetOrPromise(key: string, options?: { timeout?: number }): Promise<CachePayLoad | PromiseSub<[any, string[]]>> {
		const { timeout = 0 } = options || {}
		var cache = this.GetCache(key)
		if (cache.data) {
			return cache
		}
		if (cache.promise) {
			const [data, tags] = await cache.promise
			cache.data = data
			return cache
		}
		return this.CreatePromise(key, { timeout })
	}
}
