import { DataTypes, Sequelize } from "sequelize";
import { QueryCacheService } from "../queryCache";

QueryCacheService

// Create an instance of Sequelize with SQLite dialect
const sequelize = new Sequelize('database', 'username', 'password', {
  dialect: 'sqlite',
  storage: 'database.sqlite',
});

// Define a sample model
const User = sequelize.define('User', {
  name: DataTypes.STRING,
  age: DataTypes.INTEGER,
});

async function runTests() {
  try {
    // Connect to the database
    await sequelize.authenticate();
    console.log('Connected to the database.');

    // Initialize the query cache service
    const queryCacheService = new QueryCacheService(sequelize);

    // Cache the User model's findAll and count methods
    queryCacheService.cacheModel(User, 60, "fs");

    // Create some sample users
    await User.sync({ force: true });
    await User.create({ name: 'John', age: 25 });
    await User.create({ name: 'Jane', age: 30 });
    await User.create({ name: 'Bob', age: 35 });

    // Test cached findAll method
    const cachedUsers = await User.findAll(); // Retrieves from cache
    console.log('Cached Users:', cachedUsers.map(u => u.toJSON()));

    // Test uncached findAll method
    const uncachedUsers = await (User as any).cache_findAll(); // Bypasses cache
    console.log('Uncached Users:', uncachedUsers.map(u => u.toJSON()));

    // Test cached count method
    const cachedCount = await User.count(); // Retrieves from cache
    console.log('Cached Count:', cachedCount);

    // Test uncached count method
    const uncachedCount = await (User as any).cache_count(); // Bypasses cache
    console.log('Uncached Count:', uncachedCount);
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    // Close the database connection
    await sequelize.close();
    console.log('Disconnected from the database.');
  }
}

// Run the tests
runTests();
