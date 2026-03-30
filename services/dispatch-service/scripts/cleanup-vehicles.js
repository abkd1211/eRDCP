const { MongoClient } = require('mongodb');

async function run() {
  const uri = 'mongodb+srv://admin:*******@cluster0.abcde.mongodb.net/erdcp_dispatch';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('erdcp_dispatch');
    const res = await db.collection('vehicles').updateMany(
      {},
      { $set: { status: 'AVAILABLE', currentIncidentId: null } }
    );
    console.log(`CLEANUP SUCCESS: ${res.modifiedCount} vehicles reset to AVAILABLE`);
  } catch (err) {
    console.error('Cleanup failed:', err);
  } finally {
    await client.close();
  }
}

run();
