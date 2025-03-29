
import { Model, Op, FindOptions, CountOptions, GroupedCountResultItem, CreateOptions, Sequelize, Optional, CreationAttributes, BuildOptions } from "sequelize";
import { cloneDeep } from "lodash";

import { Cache, CachePayLoad } from "./utils/cache";
import { PromiseSub } from "./utils/promise";
import * as ObjectLib from "./utils/object";
import { ensureNoCycle } from "./utils/string";
import { afterRootCommit, FindOptionsToDependencies, sanitizeDataValues, SeqModel } from "./utils/sequelize";


export class QueryCacheService {
	private lifespan: number = 60
	private deleteCascadeMap: { [key in string]: string[] } = {}
	private deleteSetNullMap: { [key in string]: string[] } = {}
	private sequelize: Sequelize
	private cache: Cache
	private debug: Boolean = false;
	static cachePerSequelize: Record<string, {
		sequelize: Sequelize;
		cache: Cache;
	}> = {};
	constructor(sequelize: Sequelize, lifespan: number = 60, debug = false) {
		this.sequelize = sequelize
		this.lifespan = lifespan
		for (const modelName in sequelize.models || {}) {
			this.hookModel(sequelize.models[modelName])
			this.handleCascade(sequelize.models[modelName])

		}
		ensureNoCycle(this.deleteCascadeMap)
		// Extract unique ID based on connection details
		const { host, port, database } = sequelize.config as any;
		const id = `${host}:${port}/${database}`;

		if (id in QueryCacheService.cachePerSequelize) {
			this.cache = QueryCacheService.cachePerSequelize[id].cache
		} else {
			this.cache = new Cache({ cachePath: `QueryCacheService/${id}` })
			QueryCacheService.cachePerSequelize[id] = {
				sequelize,
				cache: this.cache,
			}
		}
	}
	private invalidateData(model: SeqModel, transaction?: CreateOptions<any>["transaction"]) {
		afterRootCommit(() => this.cache.ClearByTag(model.name), {
			transaction
		})
	}
	private OnDelete(model: SeqModel, transaction?: CreateOptions<any>["transaction"]) {
		this.invalidateData(model, transaction)
		for (const modelName of this.deleteSetNullMap?.[model.name] || []) {
			this.invalidateData(this.sequelize.models[modelName], transaction)
		}
		for (const modelName of this.deleteCascadeMap?.[model.name] || []) {
			this.OnDelete(this.sequelize.models[modelName], transaction)
		}

	}
	private static getSurogateBuild() {
		function build(this: SeqModel, record?: CreationAttributes<Model>, options?: BuildOptions): Model {
			if (!record)
				return (this as any).cache_build(record, options)
			if (record instanceof Model) {
				record.dataValues = sanitizeDataValues(record.dataValues)
				return (this as any).cache_build(record, options)
			}
			return (this as any).cache_build(sanitizeDataValues(record), options)
		}
		return build
	}

	private static getSurogateFindAll(cache: Cache, lifespan: number, persistanceType?: "mem" | "fs", debug: Boolean = false) {
		async function findAll(this: SeqModel, options?: FindOptions | undefined): Promise<Model[] | Model | null> {
			options = options || {}
			let cacheObject: any = ObjectLib.SymbolsToKeys(options, Op as any)
			if (options.transaction) {
				return await (this as any).cache_findAll(options) as Model[] | Model | null
			}
			const cacheKey = this.name + ".findAll:" + JSON.stringify(cacheObject)
			const cachePaylaod = await cache.GetCacheOrPromise(cacheKey, { timeout: lifespan, persistanceType })
			let dbResult: Model[] | Model | null
			let cacheResult: Model[] | Model | null
			if ("data" in (cachePaylaod as CachePayLoad)) {
				if (persistanceType == 'fs' && !options.raw) {
					const data = (cachePaylaod as CachePayLoad).data as Optional<any, string> | Optional<any, string>[] | null
					if (Array.isArray(data)) {
						cacheResult = this.bulkBuild(data, {
							raw: true,
							include: options.include  // Ensure associations are included
						}); // For a multiple instances
					} else if (data) {
						cacheResult = this.build(data, {
							raw: true,
							include: options.include  // Ensure associations are included
						});  // For a single instance
					} else {
						cacheResult = null
					}
				} else {
					cacheResult = cloneDeep((cachePaylaod as CachePayLoad).data) as Model[] | Model | null
				}
				if (debug) {
					dbResult = await (this as any).cache_findAll(options) as Model[] | Model | null

					// Convert both results to JSON for comparison
					const cacheJson = JSON.stringify(cacheResult);
					const dbJson = JSON.stringify(dbResult);

					if (cacheJson !== dbJson) {
						// Throw an error if they don't match
						throw new Error(`Cache result and DB result do not match. Cache: ${cacheJson}, DB: ${dbJson}`);
					}
				}
				return cacheResult
			}
			const sub = cachePaylaod as PromiseSub<[Model[] | Model | null, string[]]>
			try {
				const result = await (this as any).cache_findAll(options) as Model[] | Model | null
				const dependencies = FindOptionsToDependencies(this, options)
				if (persistanceType == 'fs' && !options.raw) {
					if (Array.isArray(result)) {
						sub.resolve([result.map(item => item.get({ plain: true })), dependencies])
					} else if (result) {
						sub.resolve([result.get({ plain: true }), dependencies])
					} else {
						sub.resolve([null, dependencies])
					}
				} else {
					sub.resolve([result, dependencies])
				}
				return result
			} catch (error) {
				sub.reject(error)
				throw error
			}
		}
		return findAll
	}
	private static getSurogateCount(cache: Cache, lifespan: number) {
		async function count(this: SeqModel, options?: CountOptions | undefined): Promise<number | GroupedCountResultItem[]> {
			options = options || {}
			let cacheObject: any = ObjectLib.SymbolsToKeys(options, Op as any)
			if (options.transaction) {
				return await (this as any).cache_count(options) as number | GroupedCountResultItem[]
			}
			const cacheKey = this.name + ".count:" + JSON.stringify(cacheObject)
			const cachePayLoad = await cache.GetCacheOrPromise(cacheKey, { timeout: lifespan })
			if ("data" in (cachePayLoad as CachePayLoad)) {
				return cloneDeep((cachePayLoad as CachePayLoad).data) as number | GroupedCountResultItem[]
			}
			const sub = cachePayLoad as PromiseSub<[number | GroupedCountResultItem[], string[]]>
			try {
				const dependencies = FindOptionsToDependencies(this, options)
				const result = await (this as any).cache_count(options) as number | GroupedCountResultItem[]
				sub.resolve([result, dependencies])
				return result
			} catch (error) {
				sub.reject(error)
				throw error
			}
		}
		return count
	}

	private handleCascade(model: SeqModel) {
		const OnDeleteForeignKeys = Object.keys(model.rawAttributes).filter(name =>
			model.rawAttributes[name].references && ["cascade", "no action", "set null"].includes(model.rawAttributes[name]?.onDelete?.toLowerCase() || "")
		)
		for (const sourceKey of OnDeleteForeignKeys) {
			const { references, onDelete = "", allowNull = true } = model.rawAttributes[sourceKey]
			const key = model.name + "." + sourceKey
			let Target: SeqModel;
			if (typeof references == "string") {
				Target = model.sequelize.models[references] as SeqModel
			} else if (typeof (references?.model) == "string") {
				Target = model.sequelize.models[references.model] as SeqModel
			} else if (references?.model?.name) {
				Target = model.sequelize.models[references.model.name] as SeqModel
			}
			else {
				console.error(key, { references, onDelete, allowNull });
				continue
			}
			if (onDelete == "cascade") {
				this.deleteCascadeMap[model.name] = this.deleteCascadeMap[model.name] || []
				this.deleteCascadeMap[model.name].push(Target.name)
				this.deleteCascadeMap[model.name] = [...new Set(this.deleteCascadeMap[model.name])]
			} else if (onDelete == "set null") {
				this.deleteSetNullMap[model.name] = this.deleteSetNullMap[model.name] || []
				this.deleteSetNullMap[model.name].push(Target.name)
				this.deleteSetNullMap[model.name] = [...new Set(this.deleteSetNullMap[model.name])]
			}
		}
	}

	private hookModel(_model: typeof Model) {
		const model = _model as SeqModel;
		model.afterCreate((row, options) => { this.invalidateData(model, options.transaction) })
		model.afterBulkCreate((rows, options) => { this.invalidateData(model, options.transaction) })
		model.afterSave((row, options) => { this.invalidateData(model, options.transaction) })
		model.afterUpdate((row, options) => { this.invalidateData(model, options.transaction) })
		model.afterBulkUpdate((options) => { this.invalidateData(model, options.transaction) })
		model.afterDestroy((row, options) => { this.OnDelete(model, options.transaction) })
		model.afterBulkDestroy((options) => { this.OnDelete(model, options.transaction) })

		const build = QueryCacheService.getSurogateBuild();
		//override Build
		(model as any).cache_build = model.build.bind(model);
		(model as any).build = build.bind(model);

	}


	cacheModel(_model: typeof Model, lifespan?: number, persistanceType?: "mem" | "fs") {
		const model = _model as SeqModel;

		lifespan = lifespan || this.lifespan
		const findAll = QueryCacheService.getSurogateFindAll(this.cache, lifespan, persistanceType, this.debug);
		const count = QueryCacheService.getSurogateCount(this.cache, lifespan);


		//Implement Cache
		(model as any).cache_findAll = model.findAll.bind(model);
		(model as any).findAll = findAll.bind(model);

		(model as any).cache_count = model.count.bind(model);
		(model as any).count = count.bind(model);

	}
	clearModel(_model: typeof Model) {
		this.cache.ClearByTag(_model.name)
	}
	clear() {
		for (const modelName in this.sequelize.models || {}) {
			this.clearModel(this.sequelize.models[modelName])
		}
	}

}

