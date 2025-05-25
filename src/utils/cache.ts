import fs from "fs"
import { Redis } from "ioredis";

import { clearOrCreateFolder, sanitizePath } from "./fs";
import { PromiseLib, PromiseSub } from "./promise"

type PersistenceType = 'mem' | 'fs' | 'redis';

export enum CachePayLoadStatus {
	NONE = 0,
	DATA = 1,
	PROMISE = 2,
}
/**
 * CachePayload can contain the data or a promise for that data or doesn't exist
 */
export type CachedRecord = { data: any, timeoutDate: number, persistanceType: PersistenceType }

export type CachePayLoad = { status: CachePayLoadStatus, data?: any, promise?: Promise<[any, string[]]> }
export interface CacheConstructorOptions {
	cachePath: string,
	redis?: Redis // Pass a Redis instance here
}
export interface CacheOptions {
	timeout?: number,
	tags?: string[]
	persistanceType?: PersistenceType
}

export class Cache {
	protected caches: Record<number | string, CachedRecord> = {}
	protected promises: Record<number, CachePayLoad["promise"]> = {}
	//cache key to cache id map
	protected keyIdMap: Record<string, number> = {}
	//reverse id map from tag to caches key
	protected tagKeysGroup: Record<string, (number | string)[]> = {}
	protected keyIdCounter = 0;
	protected cachePath = ""
	protected redis?: Redis;
	protected static paths = [];
	constructor(options: CacheConstructorOptions) {
		const cachePath = sanitizePath(options.cachePath)
		this.redis = options.redis;
		if (Cache.paths.includes(cachePath))
			throw `Cache path must be unique:${cachePath}`
		Cache.paths.push(cachePath)
		this.cachePath = `cache/${cachePath}`
		clearOrCreateFolder(this.cachePath)
	}

	protected ClearById(id: number | string) {
		switch (this.caches[id]?.persistanceType) {
			case 'redis':
				const redisKey = `${this.cachePath}:${id}`;
				this.redis?.del(redisKey).catch(() => { });
				break;
			case 'fs':
				fs.unlink(`${this.cachePath}/${id}`, () => { })
				break
			default:
				break;
		}
		delete this.caches[id]
	}

	protected keyToId(key: string): number {
		let id = this.keyIdMap[key]
		if (id)
			return id
		id = ++this.keyIdCounter
		this.keyIdMap[key] = id
		this.keyIdCounter = (this.keyIdCounter + 1) % Number.MAX_SAFE_INTEGER;
		return id
	}

	protected async GetCacheById(id: number | string): Promise<CachePayLoad> {
		const now = Date.now()
		if (this.caches[id] && (now < this.caches[id].timeoutDate)) {
			let data: any
			switch (this.caches[id].persistanceType) {
				case 'fs':
					data = JSON.parse(fs.readFileSync(`${this.cachePath}/${id}`, 'utf8'))
					break;
				case 'redis':
					const redisKey = `${this.cachePath}:${id}`;
					const str = await this.redis?.get(redisKey)
					if (str) {
						data = JSON.parse(str)
					} else {
						return { status: CachePayLoadStatus.NONE }
					} break;
				default:
					data = this.caches[id].data
					break;
			}

			return { status: CachePayLoadStatus.DATA, data }
		}
		if (id in this.promises) {
			return { status: CachePayLoadStatus.PROMISE, promise: this.promises[id] }
		}
		return { status: CachePayLoadStatus.NONE }
	}
	protected async SetCacheById(id: number | string, data: any, options: CacheOptions) {
		const { timeout, tags } = options
		const timeoutSec = timeout ?? 0;
		const timeoutDate = Date.now() + timeout * 1000;
		setTimeout(() => {
			this.ClearById(id)
		}, (timeoutSec + 1) * 1000);
		for (const tag of tags || []) {
			this.tagKeysGroup[tag] = this.tagKeysGroup[tag] || []
			this.tagKeysGroup[tag].push(id)
		}
		switch (options.persistanceType) {
			case 'fs':
				fs.writeFileSync(`${this.cachePath}/${id}`, JSON.stringify(data))
				this.caches[id] = { data: undefined, timeoutDate, persistanceType: 'fs' }
				break;
			case 'redis':
				const redisKey = `${this.cachePath}:${id}`;
				this.caches[id] = { data: undefined, timeoutDate, persistanceType: 'redis' }
				await this.redis?.setex(redisKey, timeoutSec, JSON.stringify(data))
				break;
			default:
				this.caches[id] = { data, timeoutDate, persistanceType: 'mem' }
				break;
		}
	}
	protected PromiseCacheById(id: number | string, promise: CachePayLoad["promise"], options?: CacheOptions) {
		const { timeout = 0, persistanceType = 'mem' } = options || {}
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
	protected CreatePromiseById(id: number | string, options?: CacheOptions) {
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

	async GetCache(key: string): Promise<CachePayLoad> {
		const id = this.keyToId(key)
		return await this.GetCacheById(id)
	}
	async SetCache(key: string, data, options: CacheOptions) {
		const id = this.keyToId(key)
		await this.SetCacheById(id, data, options)
	}
	async GetCacheOrPromise(key: string, options?: CacheOptions): Promise<CachePayLoad | PromiseSub<[any, string[]]>> {
		const id = this.keyToId(key)
		var cache = await this.GetCacheById(id)
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
