/// <reference types="node" />
/**
 * Incident Service Seed
 * Run:  npx prisma db seed
 *
 * Seeds 15 responders at real vantage points across Greater Accra.
 * Distances from central Accra incidents: 2–8 km (simulation looks realistic).
 *
 * Good demo incident coordinates (paste these when creating incidents):
 *   Makola Market:        lat 5.5500, lng -0.2130
 *   Kwame Nkrumah Circle: lat 5.5620, lng -0.2150
 *   Osu Oxford Street:    lat 5.5580, lng -0.1760
 *   Accra Mall area:      lat 5.6350, lng -0.1720
 *   Achimota:             lat 5.6130, lng -0.2310
 */

import { PrismaClient, ResponderType, ResponderStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Placeholder IDs — replace with real user IDs from auth-service after login
const HOSPITAL_ADMIN_ID = 'seed-hospital-admin-001';
const POLICE_ADMIN_ID   = 'seed-police-admin-001';
const FIRE_ADMIN_ID     = 'seed-fire-admin-001';

async function main() {
  console.log('Seeding incident service database...');

  // ── AMBULANCES (5) ────────────────────────────────────────────────────────
  const ambulances = [
    { id: 'r-amb-kbt-1',   name: 'KBT Ambulance 1',        station: 'Korle Bu Teaching Hospital',   lat: 5.5360,  lng: -0.2278, beds: 22, totalBeds: 30, phone: '+233302674114' },
    { id: 'r-amb-kbt-2',   name: 'KBT Ambulance 2',        station: 'Korle Bu Teaching Hospital',   lat: 5.5368,  lng: -0.2271, beds: 18, totalBeds: 30, phone: '+233302674115' },
    { id: 'r-amb-37mh',    name: '37 MH Ambulance 1',      station: '37 Military Hospital',         lat: 5.6037,  lng: -0.1870, beds: 30, totalBeds: 40, phone: '+233302761343' },
    { id: 'r-amb-ridge',   name: 'Ridge Hospital Amb 1',   station: 'Ridge Hospital',               lat: 5.5697,  lng: -0.2014, beds: 15, totalBeds: 25, phone: '+233302665401' },
    { id: 'r-amb-tema',    name: 'Tema General Amb 1',     station: 'Tema General Hospital',        lat: 5.6698,  lng: -0.0166, beds: 12, totalBeds: 20, phone: '+233303202961' },
  ];

  for (const a of ambulances) {
    await prisma.responder.upsert({
      where:  { id: a.id },
      update: { status: ResponderStatus.AVAILABLE, availableBeds: a.beds, totalBeds: a.totalBeds },
      create: {
        id:            a.id,
        name:          a.name,
        type:          ResponderType.AMBULANCE,
        stationName:   a.station,
        latitude:      a.lat,
        longitude:     a.lng,
        phone:         a.phone,
        status:        ResponderStatus.AVAILABLE,
        capacity:      a.beds,
        managedBy:     HOSPITAL_ADMIN_ID,
        totalBeds:     a.totalBeds,
        availableBeds: a.beds,
        bedsUpdatedAt: new Date(),
      },
    });
    console.log(`  [AMB] ${a.name}`);
  }

  // ── POLICE UNITS (5) ──────────────────────────────────────────────────────
  const police = [
    { id: 'r-pol-central',     name: 'Accra Central Police 1',   station: 'Accra Central Police Station',   lat: 5.5500,  lng: -0.2050, phone: '+233302221540' },
    { id: 'r-pol-adabraka',    name: 'Adabraka Police 1',        station: 'Adabraka Police Station',        lat: 5.5650,  lng: -0.2120, phone: '+233302221541' },
    { id: 'r-pol-osu',         name: 'Osu Police 1',             station: 'Osu Police Station',             lat: 5.5580,  lng: -0.1780, phone: '+233302772233' },
    { id: 'r-pol-cantonments', name: 'Cantonments Police 1',     station: 'Cantonments Police Station',     lat: 5.5750,  lng: -0.1850, phone: '+233302772100' },
    { id: 'r-pol-tema',        name: 'Tema Police 1',            station: 'Tema Police Station',            lat: 5.6730,  lng: -0.0136, phone: '+233303204444' },
  ];

  for (const p of police) {
    await prisma.responder.upsert({
      where:  { id: p.id },
      update: { status: ResponderStatus.AVAILABLE },
      create: {
        id:          p.id,
        name:        p.name,
        type:        ResponderType.POLICE,
        stationName: p.station,
        latitude:    p.lat,
        longitude:   p.lng,
        phone:       p.phone,
        status:      ResponderStatus.AVAILABLE,
        capacity:    4,
        managedBy:   POLICE_ADMIN_ID,
      },
    });
    console.log(`  [POL] ${p.name}`);
  }

  // ── FIRE TRUCKS (5) ───────────────────────────────────────────────────────
  const fire = [
    { id: 'r-fire-central',  name: 'Accra Central Fire 1',  station: 'Accra Central Fire Station',  lat: 5.5480,  lng: -0.2090, phone: '+233302221304' },
    { id: 'r-fire-labone',   name: 'North Labone Fire 1',   station: 'North Labone Fire Station',   lat: 5.5720,  lng: -0.1700, phone: '+233302772990' },
    { id: 'r-fire-kaneshie', name: 'Kaneshie Fire 1',       station: 'Kaneshie Fire Station',       lat: 5.5670,  lng: -0.2370, phone: '+233302225566' },
    { id: 'r-fire-achimota', name: 'Achimota Fire 1',       station: 'Achimota Fire Station',       lat: 5.6170,  lng: -0.2310, phone: '+233302414100' },
    { id: 'r-fire-tema',     name: 'Tema Fire 1',           station: 'Tema Fire Station',           lat: 5.6670,  lng: -0.0180, phone: '+233303205500' },
  ];

  for (const f of fire) {
    await prisma.responder.upsert({
      where:  { id: f.id },
      update: { status: ResponderStatus.AVAILABLE },
      create: {
        id:          f.id,
        name:        f.name,
        type:        ResponderType.FIRE_TRUCK,
        stationName: f.station,
        latitude:    f.lat,
        longitude:   f.lng,
        phone:       f.phone,
        status:      ResponderStatus.AVAILABLE,
        capacity:    6,
        managedBy:   FIRE_ADMIN_ID,
      },
    });
    console.log(`  [FIRE] ${f.name}`);
  }

  console.log('\nSeeded 15 responders successfully.');
  console.log('\nTo test simulation, create an incident at:');
  console.log('  lat: 5.5500, lng: -0.2130  (Makola Market — ~2km from KBT + Accra Central)');
  console.log('  lat: 5.5620, lng: -0.2150  (Nkrumah Circle — ~1km from Adabraka Police)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
