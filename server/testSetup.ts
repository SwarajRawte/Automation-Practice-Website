// Integration tests call reset() and intentionally mutate their database.
// Force an isolated database before any test module imports the DB singleton,
// regardless of the developer's shell or application .env configuration.
process.env.DB_PATH = ":memory:";
process.env.NODE_ENV = "test";
