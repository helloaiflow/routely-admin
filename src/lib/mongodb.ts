import { MongoClient, type MongoClientOptions } from "mongodb";

const uri = process.env.MONGODB_URI!;
if (!uri) throw new Error("MONGODB_URI is not defined");

const options: MongoClientOptions = {
  // Fail fast: Mongo is fallback/optional in portal routes — a dead Atlas
  // path must cost 5s, not the driver's 30s default.
  serverSelectionTimeoutMS: 5000,
};

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function connect(): Promise<MongoClient> {
  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect().catch((err) => {
      // Self-heal: don't poison the cached promise for the lambda's lifetime —
      // clear it so the next caller retries fresh once Atlas recovers.
      global._mongoClientPromise = undefined;
      throw err;
    });
    // Mark rejections handled at the source: importers that never await
    // (PG-served requests) must not crash the process (2026-07-02 exit-128s).
    global._mongoClientPromise.catch(() => {
      /* rejection is surfaced at each await site */
    });
  }
  return global._mongoClientPromise;
}

// Lazy thenable: preserves the `await clientPromise` contract of every importer
// while deferring the actual connection from module import to first use.
const clientPromise: Promise<MongoClient> = {
  // biome-ignore lint/suspicious/noThenProperty: intentional lazy thenable — defers connect() to first await
  then: (onOk, onErr) => connect().then(onOk, onErr),
  catch: (onErr) => connect().catch(onErr),
  finally: (fn) => connect().finally(fn),
  [Symbol.toStringTag]: "Promise",
} as Promise<MongoClient>;

export default clientPromise;
