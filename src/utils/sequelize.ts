import { Association, FindOptions, IncludeOptions, Model, ModelStatic, Transaction } from "sequelize"

export type SeqModel = typeof Model & ModelStatic<Model>

export function afterRootCommit(cb: () => void, options: { transaction?: Transaction | null }) {
  if (options.transaction) {
    options.transaction.afterCommit(() => {
      this.afterRootCommit(cb, { transaction: (options.transaction as any).parent as Transaction })
    })
  } else {
    cb()
  }
}

export function FindOptionsToDependencies(Model: SeqModel, options: FindOptions) {
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