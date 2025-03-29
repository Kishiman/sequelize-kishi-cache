# Sequelize kishi Cache

Sequelize Query kishi is an npm package that provides a caching mechanism for Sequelize queries. It allows you to cache the results of `findAll` and `count` queries for a specified duration to improve the performance of your application.

## Installation

You can install the package using npm:

```
npm install sequelize-kishi-cache
```

## Usage

To use Sequelize kishi Cache, you need to create an instance of the `QueryCacheService` class by providing the Sequelize instance and an optional lifespan for the cached queries. The lifespan is the duration (in seconds) for which the cached queries will be valid. If no lifespan is specified, the default value of 60 seconds will be used.

```javascript
const { QueryCacheService } = require('sequelize-kishi-cache');
const Sequelize = require('sequelize');

// Create a Sequelize instance
const sequelize = new Sequelize('database', 'username', 'password', {
  // Sequelize configuration options
});

// Create an instance of QueryCacheService
const queryCacheService = new QueryCacheService(sequelize, 60);
```

### Persistence Support

Starting from version 0.0.6, Sequelize Query Cache introduces support for persistence using both in-memory (mem) and file system (fs) storage options.

To enable persistence, use the `cacheModel` method with an optional `persistanceType` parameter. By default, the persistence type is set to "mem" if not specified.

```javascript
cacheModel(_model: typeof Model, lifespan?: number, persistanceType?: "mem" | "fs")
```

* **File System (fs) Persistence**
  - The cached data will be persisted to the file system.
  - The data will be stored in separate files on disk.
  - Slower performance, lower memory usage.

* **Memory (mem) Persistence**
  - The cache data will be stored in memory.
  - Faster performance, higher memory usage.

### Debugging Support

Starting from version 0.0.7, a `debug` option is available to compare cached results with database results and throw an error if they do not match in JSON format. This helps detect inconsistencies and ensure cache integrity.

```javascript
const queryCacheService = new QueryCacheService(sequelize, timeout, true)
 // Enable debug mode
```

If enabled, the system will fetch the data from the database and compare it with the cache, throwing an error if there is a mismatch.

### Caching Model Queries

To enable caching for a Sequelize model, you can use the `cacheModel` method provided by the `QueryCacheService`. This method adds caching functionality to the `findAll` and `count` methods of the model.

```javascript
const MyModel = sequelize.define('MyModel', {
  // Model attributes
});

// Cache queries for MyModel with the default lifespan
queryCacheService.cacheModel(MyModel);

// You can also specify a custom lifespan for the cached queries
queryCacheService.cacheModel(MyModel, 120);
```

Once the model queries are cached, you can use the `findAll` and `count` methods as usual. The cached versions of these methods will be used automatically, and the results will be stored in the cache for the specified lifespan.

```javascript
// Use the cached findAll method
MyModel.findAll({
  // Sequelize query options
});

// Use the cached count method
MyModel.count({
  // Sequelize query options
});
```

### Clearing the Cache

If you need to clear the cache manually, you can use the `clearCache` method provided by the `QueryCacheService`.

```javascript
// Clear the cache for all models
queryCacheService.clear();

// Clear the cache for a specific model
queryCacheService.clearModel(MyModel);
```

## Cache Invalidation

Sequelize kishi Cache listens to Sequelize model hooks to automatically invalidate cached queries when relevant changes occur in the underlying data. This ensures that the cached results stay up-to-date and reflect the latest changes made to the models.

When you create an instance of `QueryCacheService` and call the `cacheModel` method for a Sequelize model, the cache service hooks into the model's lifecycle events to monitor changes. Specifically, it hooks into the `afterCreate`, `afterUpdate`, and `afterDestroy` hooks.

Whenever a new record is created, updated, or deleted using the Sequelize model's `create`, `update`, or `destroy` methods, respectively, the cache service invalidates the corresponding cached queries for that model. This guarantees that subsequent queries will retrieve the latest data from the database.

```javascript
const MyModel = sequelize.define('MyModel', {
  // Model attributes
});

// Cache queries for MyModel with the default lifespan
queryCacheService.cacheModel(MyModel);
```

With the cache enabled, any subsequent calls to `create`, `update`, or `destroy` on `MyModel` will trigger the cache service to invalidate the relevant cached queries. This ensures that the cache remains synchronized with the underlying data.

```javascript
// Create a new record and invalidate the cached queries
MyModel.create({
  // Record data
});

// Update a record and invalidate the cached queries
MyModel.update(
  {
    // Updated data
  },
  {
    // Sequelize query options
  }
);

// Destroy a record and invalidate the cached queries
MyModel.destroy({
  // Sequelize query options
});
```
Sequelize kishi Cache manages the cache invalidation process behind the scenes, so you don't have to worry about manually clearing the cache when changes occur in your models.
## Support for onDelete Cascade and Set Null Associations

Sequelize kishi Cache also provides support for associations with `onDelete` actions such as "cascade" and "set null" that may not be detected by the Sequelize model hooks. These actions define the behavior when a record in the associated table is deleted.

Sequelize kishi Cache utilizes mappings to properly invalidate cached queries when `onDelete cascade` or `set null` actions occur, ensuring that the cache remains synchronized with the changes made to the associated data.

If you encounter any issues or inconsistencies with cascade or set null associations, Sequelize kishi Cache outputs an error message with relevant details to assist with troubleshooting.

## Conclusion

Sequelize kishi Cache provides an easy-to-use caching mechanism for Sequelize queries, enhancing the performance of your application. By leveraging the cache and automatic cache invalidation through Sequelize model hooks, you can improve response times and reduce the load on your database.

If you encounter any issues or need support, feel free to reach out to the maintainers or open an issue on the GitHub repository.

## Contributing

Contributions to Sequelize kishi Cache are welcome! If you find a bug or want to suggest a new feature, please create an issue on the [GitHub repository](https://github.com/Kishiman/sequelize-kishi-cache). You can also submit pull requests with improvements and fixes.

## License

Sequelize Query kishi is [MIT licensed](https://github.com/Kishiman/sequelize-kishi-cache/blob/master/LICENSE).

## Acknowledgments

Sequelize Query kishi is built on top of the [Sequelize](https://sequelize.org/) ORM library.

Special thanks to the contributors who have helped make this project better.

