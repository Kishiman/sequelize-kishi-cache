import { clearOrCreateFolder } from "./fs";
import { PromiseLib, PromiseSub } from "./promise"
import fs from "fs"

enum CachePayLoadStatus {
	NONE = 0,
	DATA = 1,
	PROMISE = 2,
}
/**
 * CachePayload can contain the data or a promise for that data or doesn't exist
 */
type CachedRecord = { data: any, timeoutDate: number, persistanceType: "mem" | "fs" }

export type CachePayLoad = { status: CachePayLoadStatus, data?: any, promise?: Promise<[any, string[]]> }
interface CacheConstructorOptions {
	cachePath: string,
}
interface CacheOptions {
	timeout?: number,
	tags?: string[]
	persistanceType?: "mem" | "fs"
}

export class Cache {
	private caches: Record<number, CachedRecord> = {}
	private promises: Record<number, CachePayLoad["promise"]> = {}
	//cache key to cache id map
	private keyIdMap: Record<string, number> = {}
	//reverse id map from tag to caches key
	private tagKeysGroup: Record<string, number[]> = {}
	private keyIdCounter = 0;
	private cachePath = ""
	private static paths = [];
	constructor(options: CacheConstructorOptions) {
		const cachePath = options.cachePath
		if (Cache.paths.includes(cachePath))
			throw `Cache path must be unique:${cachePath}`
		Cache.paths.push(cachePath)
		this.cachePath = `cache/${cachePath}`
		clearOrCreateFolder(this.cachePath)
	}

	private ClearById(id: number) {
		if (this.caches[id]?.persistanceType == "fs") {
			fs.unlink(`${this.cachePath}/${id}`, () => { })
		}
		delete this.caches[id]
	}

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
			let data: any
			if (this.caches[id].persistanceType == "fs") {
				data = JSON.parse(fs.readFileSync(`${this.cachePath}/${id}`, 'utf8'))
			} else {
				data = this.caches[id].data
			}
			return { status: CachePayLoadStatus.DATA, data }
		}
		if (id in this.promises) {
			return { status: CachePayLoadStatus.PROMISE, promise: this.promises[id] }
		}
		return { status: CachePayLoadStatus.NONE }
	}
	private SetCacheById(id: number, data: any, options: CacheOptions) {
		const { timeout, tags } = options
		const timeoutDate = Date.now() + timeout * 1000
		setTimeout(() => {
			this.ClearById(id)
		}, (timeout + 1) * 1000);
		for (const tag of tags || []) {
			this.tagKeysGroup[tag] = this.tagKeysGroup[tag] || []
			this.tagKeysGroup[tag].push(id)
		}
		if (options.persistanceType == "fs") {
			fs.writeFileSync(`${this.cachePath}/${id}`, JSON.stringify(data))
			this.caches[id] = { data: undefined, timeoutDate, persistanceType: "fs" }
		} else {
			this.caches[id] = { data, timeoutDate, persistanceType: "mem" }
		}
	}
	private PromiseCacheById(id: number, promise: CachePayLoad["promise"], options?: CacheOptions) {
		const { timeout = 0, persistanceType = "mem" } = options || {}
		promise.then(([data, tags = []]) => {
			if (timeout > 0) {
				this.SetCacheById(id, data, { timeout, tags, persistanceType })
			}
			return [data, tags]
		}).then(() => {
			delete this.promises[id]
		}).catch(() => {
			delete this.promises[id]
		})
		this.promises[id] = promise
	}
	private CreatePromiseById(id: number, options?: CacheOptions) {
		let sub = PromiseLib.Create<[any, string[]]>()
		this.PromiseCacheById(id, sub.promise, options)
		return sub
	}

	Clear(key: string) {
		const id = this.keyToId(key)
		this.ClearById(id)
	}
	ClearByTag(tag: string) {
		if (!this.tagKeysGroup[tag]) return
		for (const id of this.tagKeysGroup[tag]) {
			this.ClearById(id)
		}
		this.tagKeysGroup[tag] = []
	}

	GetCache(key: string): CachePayLoad {
		const id = this.keyToId(key)
		return this.GetCacheById(id)
	}
	SetCache(key: string, data, options: CacheOptions) {
		const id = this.keyToId(key)
		this.SetCacheById(id, data, options)
	}
	async GetCacheOrPromise(key: string, options?: CacheOptions): Promise<CachePayLoad | PromiseSub<[any, string[]]>> {
		const id = this.keyToId(key)
		var cache = this.GetCacheById(id)
		if (cache.status == CachePayLoadStatus.DATA) {
			return cache
		}
		if (cache.status == CachePayLoadStatus.PROMISE && cache.promise) {
			const [data, tags] = await cache.promise
			cache.data = data
			return cache
		}
		return this.CreatePromiseById(id, options)
	}
}
