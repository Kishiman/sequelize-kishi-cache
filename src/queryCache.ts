
import { Model, Op, Association, FindOptions, IncludeOptions, ModelStatic } from "sequelize";
import { cloneDeep } from "lodash";

import { CacheLib, CachePayLoad } from "./utils/cache";
import { PromiseSub } from "./utils/promise";
import * as ObjectLib from "./utils/object";

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
	static CacheModel(_model: typeof Model, lifespan: number = 60) {
		async function findAll(this: SeqModel, options?: FindOptions | undefined): Promise<Model[] | Model | null> {
			options = options || {}
			let cacheObject: any = ObjectLib.SymbolsToKeys(options, Op as any)
			if (options.transaction) {
				return await (this as any).__findAll(options) as Model[] | Model | null
			}
			const cacheKey = this.name + ":" + JSON.stringify(cacheObject)
			const cache = await CacheLib.GetOrPromise(cacheKey, { timeout: lifespan })
			if ("data" in (cache as CachePayLoad)) {
				return cloneDeep((cache as CachePayLoad).data) as Model[] | Model | null
			}
			const sub = cache as PromiseSub<[Model[] | Model | null, string[]]>
			try {
				const dependencies = FindOptionsToDependencies(this, options)
				const result = await (this as any).__findAll(options) as Model[] | Model | null
				sub.resolve([result, dependencies])
				return result
			} catch (error) {
				sub.reject(error)
				throw error
			}
		}
		const model: SeqModel = _model as SeqModel;
		//Implement Cache
		(model as any).__findAll = (model as any).findAll.bind(model);
		(model as any).findAll = findAll.bind(model);
		model.afterCreate((row, options) => {
			if (options.transaction)
				if (options.transaction)
					options.transaction?.afterCommit(() => CacheLib.ClearCacheByTag(model.name))
				else
					CacheLib.ClearCacheByTag(model.name)
		})
		model.afterUpdate((row, options) => {
			if (options.transaction)
				options.transaction?.afterCommit(() => CacheLib.ClearCacheByTag(model.name))
			else
				CacheLib.ClearCacheByTag(model.name)
		})
		model.afterDestroy((row, options) => {
			if (options.transaction)
				options.transaction?.afterCommit(() => CacheLib.ClearCacheByTag(model.name))
			else
				CacheLib.ClearCacheByTag(model.name)
		})
		model.afterBulkCreate((rows, options) => {
			if (options.transaction)
				options.transaction?.afterCommit(() => CacheLib.ClearCacheByTag(model.name))
			else
				CacheLib.ClearCacheByTag(model.name)
		})
		model.afterBulkUpdate((options) => {
			if (options.transaction)
				options.transaction?.afterCommit(() => CacheLib.ClearCacheByTag(model.name))
			else
				CacheLib.ClearCacheByTag(model.name)
		})
		model.afterBulkDestroy((options) => {
			if (options.transaction)
				options.transaction?.afterCommit(() => CacheLib.ClearCacheByTag(model.name))
			else
				CacheLib.ClearCacheByTag(model.name)
		})
	}
}

