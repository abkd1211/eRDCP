import { PrismaClient, ResponderType, ResponderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding incident service database...');

  // ─── Ambulances ────────────────────────────────────────────────────────────
  const ambulances = [
    { name: 'Ambulance Unit KBT-01', stationName: 'Korle Bu Teaching Hospital',    latitude: 5.5360,  longitude: -0.2278 },
    { name: 'Ambulance Unit 37MH-01', stationName: '37 Military Hospital',         latitude: 5.6037,  longitude: -0.1870 },
    { name: 'Ambulance Unit UGMC-01', stationName: 'UG Medical Centre',            latitude: 5.6502,  longitude: -0.1870 },
    { name: 'Ambulance Unit KATH-01', stationName: 'Komfo Anokye Teaching Hospital', latitude: 6.6966, longitude: -1.6162 },
    { name: 'Ambulance Unit CCTH-01', stationName: 'Cape Coast Teaching Hospital', latitude: 5.1315,  longitude: -1.2795 },
  ];

  for (const a of ambulances) {
    await prisma.responder.upsert({
      where:  { id: `amb-${a.name.toLowerCase().replace(/\s+/g, '-')}` },
      update: {},
      create: {
        id:          `amb-${a.name.toLowerCase().replace(/\s+/g, '-')}`,
        name:        a.name,
        type:        ResponderType.AMBULANCE,
        stationName: a.stationName,
        latitude:    a.latitude,
        longitude:   a.longitude,
        status:      ResponderStatus.AVAILABLE,
        capacity:    2,
      },
    });
  }

  // ─── Police Stations ───────────────────────────────────────────────────────
  const policeStations = [
    { name: 'Accra Central Police Unit',    stationName: 'Accra Central Police Station',    latitude: 5.5502,  longitude: -0.2174 },
    { name: 'Cantonments Police Unit',      stationName: 'Cantonments Police Station',      latitude: 5.5713,  longitude: -0.1769 },
    { name: 'Tema Police Unit',             stationName: 'Tema Police Station',             latitude: 5.6698,  longitude: -0.0166 },
    { name: 'Kumasi Central Police Unit',   stationName: 'Kumasi Central Police Station',   latitude: 6.6885,  longitude: -1.6244 },
    { name: 'Takoradi Police Unit',         stationName: 'Takoradi Police Station',         latitude: 4.8845,  longitude: -1.7554 },
  ];

  for (const p of policeStations) {
    await prisma.responder.upsert({
      where:  { id: `pol-${p.name.toLowerCase().replace(/\s+/g, '-')}` },
      update: {},
      create: {
        id:          `pol-${p.name.toLowerCase().replace(/\s+/g, '-')}`,
        name:        p.name,
        type:        ResponderType.POLICE,
        stationName: p.stationName,
        latitude:    p.latitude,
        longitude:   p.longitude,
        status:      ResponderStatus.AVAILABLE,
        capacity:    5,
      },
    });
  }

  // ─── Fire Stations ─────────────────────────────────────────────────────────
  const fireStations = [
    { name: 'Fire Truck Accra HQ-01',     stationName: 'Ghana National Fire Service HQ',  latitude: 5.5601,  longitude: -0.2069 },
    { name: 'Fire Truck Airport-01',      stationName: 'Airport Fire Station',            latitude: 5.6052,  longitude: -0.1667 },
    { name: 'Fire Truck Tema-01',         stationName: 'Tema Fire Station',               latitude: 5.6800,  longitude: -0.0050 },
    { name: 'Fire Truck Kumasi-01',       stationName: 'Kumasi Fire Station',             latitude: 6.7010,  longitude: -1.6300 },
    { name: 'Fire Truck Takoradi-01',     stationName: 'Takoradi Fire Station',           latitude: 4.8967,  longitude: -1.7634 },
  ];

  for (const f of fireStations) {
    await prisma.responder.upsert({
      where:  { id: `fir-${f.name.toLowerCase().replace(/\s+/g, '-')}` },
      update: {},
      create: {
        id:          `fir-${f.name.toLowerCase().replace(/\s+/g, '-')}`,
        name:        f.name,
        type:        ResponderType.FIRE_TRUCK,
        stationName: f.stationName,
        latitude:    f.latitude,
        longitude:   f.longitude,
        status:      ResponderStatus.AVAILABLE,
        capacity:    4,
      },
    });
  }

  const total = await prisma.responder.count();
  console.log(`✅ Seeded ${total} responders (ambulances, police, fire trucks)`);
  console.log('📍 Coverage: Accra, Kumasi, Tema, Cape Coast, Takoradi');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
