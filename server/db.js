const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Optional in-memory MongoDB for dev environments
let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = require('mongodb-memory-server'));
} catch (e) {
  // Dependency might not be installed; we'll handle gracefully
}

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'frametry';
const USE_TINY_DB = (process.env.USE_TINY_DB || '').toLowerCase() === 'true';
const ENABLE_INMEMORY_FLAG = (process.env.USE_INMEMORY_DB || '').toLowerCase() === 'true' || MONGO_URL === 'memory';
const ALLOW_AUTO_FALLBACK = (process.env.ALLOW_INMEMORY_FALLBACK || 'true').toLowerCase() !== 'false';

let client;
let db;
let memServer; // MongoMemoryServer instance
let tinyDb;    // Tiny in-process DB instance

// Tiny in-process DB implementation for quick local dev (no external binaries)
function createTinyDb() {
  const collections = {
    users: [],
    channels: [],
    messages: [],
    groups: [],
  };

  function match(doc, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;
    for (const key of Object.keys(filter)) {
      const cond = filter[key];
      if (key === '_id' && typeof cond === 'object' && cond != null) {
        // simple eq
        if (doc._id !== cond) return false;
        continue;
      }
      if (typeof cond === 'object' && cond !== null) {
        if ('$in' in cond) {
          if (!cond.$in.includes(doc[key])) return false;
          continue;
        }
        // fallback: deep equals
        if (JSON.stringify(doc[key]) !== JSON.stringify(cond)) return false;
        continue;
      }
      if (doc[key] !== cond) return false;
    }
    return true;
  }

  function applyProjection(doc, projection) {
    if (!projection) return { ...doc };
    const out = {};
    const includeKeys = Object.entries(projection).filter(([, v]) => v).map(([k]) => k);
    const excludeKeys = Object.entries(projection).filter(([, v]) => !v).map(([k]) => k);
    if (includeKeys.length) {
      includeKeys.forEach(k => { if (k in doc) out[k] = doc[k]; });
      return out;
    }
    // default include all except excluded
    Object.keys(doc).forEach(k => { if (!excludeKeys.includes(k)) out[k] = doc[k]; });
    return out;
  }

  function makeCursor(items) {
    let arr = items.slice();
    return {
      sort(spec) {
        if (spec) {
          const [field, dir] = Object.entries(spec)[0] || [];
          if (field) arr.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * (dir === -1 ? -1 : 1));
        }
        return this;
      },
      skip(n) { arr = arr.slice(Number(n) || 0); return this; },
      limit(n) { if (n != null) arr = arr.slice(0, Number(n)); return this; },
      toArray() { return Promise.resolve(arr.slice()); },
    };
  }

  function collection(name) {
    if (!collections[name]) collections[name] = [];
    const store = collections[name];
    return {
      async createIndex() { return; },
      find(filter = {}, options = {}) {
        let result = store.filter(d => match(d, filter));
        if (options.projection) result = result.map(d => applyProjection(d, options.projection));
        return makeCursor(result);
      },
      async estimatedDocumentCount() {
        return store.length;
      },
      async findOne(filter = {}, options = {}) {
        const doc = store.find(d => match(d, filter));
        if (!doc) return null;
        return options.projection ? applyProjection(doc, options.projection) : { ...doc };
      },
      async insertOne(doc) {
        const copy = { ...doc };
        if (!copy._id) copy._id = `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        // Uniqueness guards for known indexes
        if (name === 'users') {
          if (store.some(u => u.username === copy.username)) throw new Error('E11000 duplicate key error collection: users index: username dup key');
        }
        if (name === 'channels') {
          if (store.some(c => c.groupId === copy.groupId && c.name === copy.name)) throw new Error('E11000 duplicate key error collection: channels index: groupId_name dup key');
        }
        store.push(copy);
        return { insertedId: copy._id };
      },
      async updateOne(filter, update) {
        const idx = store.findIndex(d => match(d, filter));
        if (idx === -1) return { matchedCount: 0, modifiedCount: 0 };
        const doc = { ...store[idx] };
        if (update.$set) {
          Object.assign(doc, update.$set);
        }
        if (update.$push) {
          for (const [k, v] of Object.entries(update.$push)) {
            if (!Array.isArray(doc[k])) doc[k] = [];
            doc[k].push(v);
          }
        }
        store[idx] = doc;
        return { matchedCount: 1, modifiedCount: 1 };
      },
      async deleteOne(filter) {
        const idx = store.findIndex(d => match(d, filter));
        if (idx === -1) return { deletedCount: 0 };
        store.splice(idx, 1);
        return { deletedCount: 1 };
      },
      async deleteMany(filter) {
        const before = store.length;
        for (let i = store.length - 1; i >= 0; i--) {
          if (match(store[i], filter)) store.splice(i, 1);
        }
        return { deletedCount: before - store.length };
      },
    };
  }

  return {
    collection,
    _collections: collections,
  };
}

async function connectRealMongo(url) {
  // Fail fast if server is not available
  const options = { serverSelectionTimeoutMS: 2000 };
  // keep useUnifiedTopology compatibility across driver versions
  options.useUnifiedTopology = true;
  const c = new MongoClient(url, options);
  await c.connect();
  return c;
}

async function connectInMemory() {
  if (!MongoMemoryServer) {
    throw new Error('mongodb-memory-server not installed. Run `npm i mongodb-memory-server` in /server or set USE_INMEMORY_DB=false.');
  }
  memServer = await MongoMemoryServer.create();
  const uri = memServer.getUri();
  console.warn('[db] Using in-memory MongoDB at', uri);
  const c = new MongoClient(uri, { useUnifiedTopology: true });
  await c.connect();
  return c;
}

async function connect() {
  if (db) return db;

  try {
    if (USE_TINY_DB) {
      // Force tiny in-process DB (tests/dev only)
      tinyDb = createTinyDb();
    } else if (ENABLE_INMEMORY_FLAG) {
      client = await connectInMemory();
    } else {
      console.log('Connecting to MongoDB at', MONGO_URL, 'db:', DB_NAME);
      client = await connectRealMongo(MONGO_URL);
      console.log('MongoDB connected');
    }
  } catch (err) {
    if (ALLOW_AUTO_FALLBACK) {
      console.warn('[db] Real MongoDB connection failed:', err && err.message ? err.message : err);
      // Try memory server first
      try {
        console.warn('[db] Attempting mongodb-memory-server fallback...');
        client = await connectInMemory();
      } catch (memErr) {
        console.warn('[db] mongodb-memory-server unavailable (or download blocked):', memErr && memErr.message ? memErr.message : memErr);
        console.warn('[db] Falling back to Tiny in-process DB for development. Data will not persist across restarts.');
        tinyDb = createTinyDb();
      }
    } else {
      throw err;
    }
  }

  if (tinyDb) {
    // Seed Tiny DB with defaults if empty
    const tdb = tinyDb;
    const ucol = tdb.collection('users');
    const gcol = tdb.collection('groups');
    const ccol = tdb.collection('channels');
    const mcol = tdb.collection('messages');

    // Only seed once
    const existing = await ucol.find().limit(1).toArray();
    if (existing.length === 0) {
      const hash = await bcrypt.hash('123', 10);
      const users = [
        { username: 'super', email: 'super@chat.com', role: 'superAdmin', password: hash, avatar: null },
        { username: 'group', email: 'group@chat.com', role: 'groupAdmin', password: hash, avatar: null },
        { username: 'user',  email: 'user@chat.com',  role: 'user',       password: hash, avatar: null },
      ];
      for (const u of users) await ucol.insertOne(u);

      const group = { _id: 'g1', id: 'g1', name: 'General', ownerId: 'group', adminIds: ['group'], memberIds: ['super','group','user'], channelIds: ['c1','c2'] };
      await gcol.insertOne(group);

      const channels = [
        { _id: 'c1', id: 'c1', groupId: 'g1', name: 'General Chat', memberIds: ['super','group','user'] },
        { _id: 'c2', id: 'c2', groupId: 'g1', name: 'Random',       memberIds: ['super','group','user'] },
      ];
      for (const ch of channels) await ccol.insertOne(ch);

      const now = Date.now();
      const messages = [
        { channelId: 'c1', sender: 'group', text: 'hi', type: 'text', imagePath: null, timestamp: new Date(now - 10000) },
      ];
      for (const msg of messages) await mcol.insertOne(msg);
    }

    // Expose a Mongo-like facade
    db = {
      collection: (name) => tinyDb.collection(name),
    };
    return db;
  } else {
    db = client.db(DB_NAME);
    // Ensure basic indexes
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('channels').createIndex({ groupId: 1, name: 1 }, { unique: true });
    await db.collection('messages').createIndex({ channelId: 1, timestamp: -1 });
    return db;
  }
}

function getDb() {
  if (!db) throw new Error('Database not connected. Call connect() first.');
  return db;
}

async function close() {
  try {
    if (client) await client.close();
  } finally {
    client = null;
    db = null;
    tinyDb = null;
    if (memServer) {
      try { await memServer.stop(); } catch {}
      memServer = null;
    }
  }
}

module.exports = {
  connect,
  getDb,
  close,
};
