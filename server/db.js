const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'frametry';

let client;
let db;

async function connect() {
  if (db) return db;
  client = new MongoClient(MONGO_URL, { useUnifiedTopology: true });
  await client.connect();
  db = client.db(DB_NAME);
  // Ensure basic indexes
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('channels').createIndex({ groupId: 1, name: 1 }, { unique: true });
  await db.collection('messages').createIndex({ channelId: 1, timestamp: -1 });
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not connected. Call connect() first.');
  return db;
}

async function close() {
  if (client) await client.close();
  client = null;
  db = null;
}

module.exports = {
  connect,
  getDb,
  close,
};
