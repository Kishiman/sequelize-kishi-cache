import { Association, DataTypes, FindOptions, IncludeOptions, Model, ModelStatic, Transaction } from "sequelize"

export type SeqModel = typeof Model & ModelStatic<Model>

export function afterRootCommit(cb: () => void, options: { transaction?: Transaction | null }) {
  if (options.transaction) {
    options.transaction.afterCommit(() => {
      afterRootCommit(cb, { transaction: (options.transaction as any).parent as Transaction })
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
export function sanitizeDataValues<T extends Record<string, any>>(Model: SeqModel, data: T): T {
  const attributes = Model.rawAttributes; // Get model's attribute definitions

  for (const key of Object.keys(data)) {
    if (
      attributes[key] &&
      (attributes[key].type instanceof DataTypes.DATE)
    ) {
      if (typeof data[key] === "string") {
        (data as any)[key] = new Date(data[key]); // Convert string to Date
      }
    }
  }

  return data;
}
export function getRawDataValues<T extends Model>(instance: T): Record<string, any> {
  if (!instance) return null;

  // Extract raw values without custom getters
  const rawValues = { ...instance.dataValues };

  // Process included associations
  if ((instance as any)._options && (instance as any)._options.include) {
    for (const include of (instance as any)._options.include) {
      const associationName = include.as || include.model.name;
      const associatedData = instance.dataValues[associationName];

      if (Array.isArray(associatedData)) {
        rawValues[associationName] = associatedData.map(getRawDataValues);
      } else if (associatedData instanceof Model) {
        rawValues[associationName] = getRawDataValues(associatedData);
      }
    }
  }

  return rawValues;
}