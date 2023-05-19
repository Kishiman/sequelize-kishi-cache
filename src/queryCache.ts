
import { Model, Op, Association, FindOptions, IncludeOptions, ModelStatic, CountOptions, GroupedCountResultItem, Transactionable, CreateOptions, Sequelize } from "sequelize";
import { cloneDeep } from "lodash";

import { Cache, CachePayLoad } from "./utils/cache";
import { PromiseSub } from "./utils/promise";
import * as ObjectLib from "./utils/object";
import { ensureNoCycle } from "./utils/string";

type SeqModel = typeof Model & ModelStatic<Model>

function FindOptionsToDependencies(Model: SeqModel, options: FindOptions) {
	const dependencies = [Model.name]
	let include = options.include as IncludeOptions[]
	include = (Array.isArray(include) ? include : (include ? [include] : [])) as IncludeOptions[]
	for (const item of include) {
		let model: SeqModel
		model = (item.model || (item.association as Association)?.target) as SeqModel
		try {
			dependencies.push(...FindOptionsToDependencies(model, item))
		} catch (error) {
			throw error
		}
		const { as } = item
		const association = as ? Model.associations[as] : null

		if ((association as any)?.through)
			dependencies.push((association as any)?.through.name)
	}
	return [...new Set(dependencies)]
}

export class QueryCacheService {
	private lifespan: number = 60
	private deleteCascadeMap: { [key in string]: string[] }
	private deleteSetNullMap: { [key in string]: string[] }
	private sequelize: Sequelize
	private cache: Cache
	constructor(sequelize: Sequelize, lifespan: number = 60) {
		this.sequelize = sequelize
		this.lifespan = lifespan
		for (const modelName in sequelize.models || {}) {
			this.hookModel(sequelize.models[modelName])
			this.handleCascade(sequelize.models[modelName])
		}
		ensureNoCycle(this.deleteCascadeMap)
		this.cache = new Cache()
	}
	invalidateData(model: SeqModel, transaction?: CreateOptions<any>["transaction"]) {
		if (transaction)
			transaction?.afterCommit(() => this.cache.ClearByTag(model.name))
		else
			this.cache.ClearByTag(model.name)
	}
	OnDelete(model: SeqModel, transaction?: CreateOptions<any>["transaction"]) {
		this.invalidateData(model, transaction)
		for (const modelName of this.deleteSetNullMap?.[model.name] || []) {
			this.invalidateData(this.sequelize.models[modelName], transaction)
		}
		for (const modelName of this.deleteCascadeMap?.[model.name] || []) {
			this.OnDelete(this.sequelize.models[modelName], transaction)
		}

	}
	static getSurogateFindAll(cache: Cache, lifespan: number) {
		async function findAll(this: SeqModel, options?: FindOptions | undefined): Promise<Model[] | Model | null> {
			options = options || {}
			let cacheObject: any = ObjectLib.SymbolsToKeys(options, Op as any)
			if (options.transaction) {
				return await (this as any).cache_findAll(options) as Model[] | Model | null
			}
			const cacheKey = this.name + ".findAll:" + JSON.stringify(cacheObject)
			const cachePaylaod = await cache.GetCacheOrPromise(cacheKey, { timeout: lifespan })
			if ("data" in (cachePaylaod as CachePayLoad)) {
				return cloneDeep((cachePaylaod as CachePayLoad).data) as Model[] | Model | null
			}
			const sub = cachePaylaod as PromiseSub<[Model[] | Model | null, string[]]>
			try {
				const dependencies = FindOptionsToDependencies(this, options)
				const result = await (this as any).cache_findAll(options) as Model[] | Model | null
				sub.resolve([result, dependencies])
				return result
			} catch (error) {
				sub.reject(error)
				throw error
			}
		}
		return findAll
	}
	static getSurogateCount(cache: Cache, lifespan: number) {
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

	handleCascade(model: SeqModel) {
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


	cacheModel(_model: typeof Model, lifespan?: number) {
		const model = _model as SeqModel;

		lifespan = lifespan || this.lifespan
		const findAll = QueryCacheService.getSurogateFindAll(this.cache, lifespan);
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

	hookModel(_model: typeof Model) {
		const model = _model as SeqModel;
		model.afterCreate((row, options) => { this.invalidateData(model, options.transaction) })
		model.afterBulkCreate((rows, options) => { this.invalidateData(model, options.transaction) })
		model.afterSave((row, options) => { this.invalidateData(model, options.transaction) })
		model.afterUpdate((row, options) => { this.invalidateData(model, options.transaction) })
		model.afterBulkUpdate((options) => { this.invalidateData(model, options.transaction) })
		model.afterDestroy((row, options) => { this.OnDelete(model, options.transaction) })
		model.afterBulkDestroy((options) => { this.OnDelete(model, options.transaction) })
	}
}

