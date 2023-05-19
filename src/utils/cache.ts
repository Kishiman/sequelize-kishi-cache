import { PromiseLib, PromiseSub } from "./promise"

enum CachePayLoadStatus {
	NONE = 0,
	DATA = 1,
	PROMISE = 2,
}
/**
 * CachePayload can contain the data or a promise for that data or doesn't exist
 */
type CachedRecord = { data: any, timeoutDate: number }

export type CachePayLoad = { status: CachePayLoadStatus, data?: any, promise?: Promise<[any, string[]]> }
export class Cache {
	private caches: Record<number, CachedRecord> = {}
	private promises: Record<number, CachePayLoad["promise"]> = {}
	//cache key to cache id map
	private keyIdMap: Record<string, number> = {}
	//reverse id map from tag to caches key
	private tagKeysGroup: Record<string, number[]> = {}
	private keyIdCounter = 0;

	private keyToId(key: string): number {
		let id = this.keyIdMap[key]
		if (id)
			return id
		id = ++this.keyIdCounter
		this.keyIdMap[key] = id
		this.keyIdCounter = (this.keyIdCounter + 1) % Number.MAX_SAFE_INTEGER;
		return id
	}

	private GetCacheById(id: number): CachePayLoad {
		const now = Date.now()
		if (this.caches[id] && (now < this.caches[id].timeoutDate)) {
			return { status: CachePayLoadStatus.DATA, data: this.caches[id].data }
		}
		if (id in this.promises) {
			return { status: CachePayLoadStatus.PROMISE, promise: this.promises[id] }
		}
		return { status: CachePayLoadStatus.NONE }
	}
	private SetCacheById(id: number, options: { data: any, timeout: number, tags: string[] }) {
		const { data, timeout, tags } = options
		const timeoutDate = Date.now() + timeout * 1000
		setTimeout(() => {
			delete this.caches[id]
		}, (timeout + 1) * 1000);
		for (const tag of tags) {
			this.tagKeysGroup[tag] = this.tagKeysGroup[tag] || []
			this.tagKeysGroup[tag].push(id)
		}
		this.caches[id] = { data, timeoutDate }
	}
	private PromiseCacheById(id: number, promise: CachePayLoad["promise"], options?: { timeout?: number }) {
		const { timeout = 0 } = options || {}
		promise.then(([data, tags = []]) => {
			if (timeout > 0) {
				this.SetCacheById(id, { data, timeout, tags })
			}
			return [data, tags]
		}).then(() => {
			delete this.promises[id]
		}).catch(() => {
			delete this.promises[id]
		})
		this.promises[id] = promise
	}
	private CreatePromiseById(id: number, options?: { timeout?: number }) {
		const { timeout = 0 } = options || {}
		let sub = PromiseLib.Create<[any, string[]]>()
		this.PromiseCacheById(id, sub.promise, { timeout })
		return sub
	}

	Clear(key: string) {
		const id = this.keyToId(key)
		delete this.caches[id]
	}
	ClearByTag(tag: string) {
		if (!this.tagKeysGroup[tag]) return
		for (const key of this.tagKeysGroup[tag]) {
			delete this.caches[key]
		}
		this.tagKeysGroup[tag] = []
	}

	GetCache(key: string): CachePayLoad {
		const id = this.keyToId(key)
		return this.GetCacheById(id)
	}
	SetCache(key: string, options: { data: any, timeout: number, tags: any[] }) {
		const id = this.keyToId(key)
		this.SetCacheById(id, options)
	}
	async GetCacheOrPromise(key: string, options?: { timeout?: number }): Promise<CachePayLoad | PromiseSub<[any, string[]]>> {
		const id = this.keyToId(key)
		const { timeout = 0 } = options || {}
		var cache = this.GetCacheById(id)
		if (cache.status == CachePayLoadStatus.DATA) {
			return cache
		}
		if (cache.status == CachePayLoadStatus.PROMISE && cache.promise) {
			const [data, tags] = await cache.promise
			cache.data = data
			return cache
		}
		return this.CreatePromiseById(id, { timeout })
	}
}
