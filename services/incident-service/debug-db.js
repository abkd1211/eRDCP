const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  try {
    const counts = await prisma.incident.groupBy({
      by: ['status', 'incidentType'],
      _count: true
    });
    console.log('--- INCIDENT COUNTS BY STATUS AND TYPE ---');
    console.log(JSON.stringify(counts, null, 2));
    
    const all = await prisma.incident.findMany({
      take: 5,
      select: { id: true, status: true, incidentType: true }
    });
    console.log('--- SAMPLE INCIDENTS ---');
    console.log(JSON.stringify(all, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
check();
