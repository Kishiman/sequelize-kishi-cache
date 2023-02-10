import { PromiseLib, PromiseSub } from "./promise"

type CachedRecord = { data: any, timeoutDate: Date, tags: string[] }
var caches: Record<any, CachedRecord> = {}
var promises: Record<any, Promise<[any, string[]]>> = {}
var tagKeyGroup: Record<string, string[]> = {}

export type CachePayLoad = { status: "ok" | "promise" | null, data?: any, promise?: Promise<[any, string[]]> }
export class CacheLib {
	static ClearCache(key: string) {
		delete caches[key]
	}
	static ClearCacheByTag(tag: string) {
		if (!tagKeyGroup[tag]) return
		for (const key of tagKeyGroup[tag]) {
			if (caches[key]) {
				delete caches[key]
			}
		}
		delete tagKeyGroup[tag]

	}
	static GetCache(key: string): CachePayLoad {
		const now = new Date()
		if (caches[key] && (now < caches[key].timeoutDate)) {
			return { status: "ok", data: caches[key].data }
		}
		if (key in promises) {
			return { status: "promise", promise: promises[key] }
		}
		return { status: null }
	}
	static SetCache(key: string, options: { data: any, timeout: number, tags: any[] }) {
		const { data, timeout, tags } = options
		const now = new Date()
		const timeoutDate = new Date(now.getTime() + timeout * 1000)
		setTimeout(() => {
			this.ClearCache(key)
		}, (timeout + 1) * 1000);
		for (const tag of tags) {
			tagKeyGroup[tag] = tagKeyGroup[tag] || []
			tagKeyGroup[tag].push(key)
		}
		caches[key] = { data, timeoutDate, tags }
	}
	static PromiseCache(key: string, promise: Promise<[any, string[]]>, options?: { timeout?: number }) {
		const { timeout = 0 } = options || {}
		promise.then(([data, tags = []]) => {
			if (timeout > 0) {
				CacheLib.SetCache(key, { data, timeout, tags })
			}
			return [data, tags]
		}).then(() => {
			delete promises[key]
		}).catch(() => {
			delete promises[key]
		})
		promises[key] = promise
	}
	static CreatePromise(key: string, options?: { timeout?: number }) {
		const { timeout = 0 } = options || {}
		let sub = PromiseLib.Create<[any, string[]]>()
		this.PromiseCache(key, sub.promise, { timeout })
		return sub
	}
	static async GetOrPromise(key: string, options?: { timeout?: number }): Promise<CachePayLoad | PromiseSub<[any, string[]]>> {
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
