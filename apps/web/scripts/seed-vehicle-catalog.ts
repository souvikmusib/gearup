// apps/web/scripts/seed-vehicle-catalog.ts
// Run: npx tsx scripts/seed-vehicle-catalog.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const catalog: Record<string, string[]> = {
  Hero: [
    'Achiever', 'Destini 125', 'Duet', 'Glamour', 'Glamour FI',
    'HF Dawn', 'HF Deluxe', 'Hunk', 'Ignitor',
    'Karizma', 'Karizma XMR', 'Karizma ZMR',
    'Maestro', 'Maestro Edge',
    'Passion Pro', 'Passion XPro',
    'Pleasure', 'Pleasure Plus',
    'Splendor iSmart', 'Splendor Plus', 'Splendor Pro', 'Super Splendor',
    'Vida', 'Xoom', 'XPulse 200',
    'Xtreme', 'Xtreme 125', 'Xtreme 160R', 'Xtreme 200R', 'Xtreme 200S',
  ],
  Bajaj: [
    'Avenger', 'Boxer', 'Caliber', 'CT 100', 'Discover', 'Dominar',
    'Ninja 300', 'Platina',
    'Pulsar 125', 'Pulsar 150', 'Pulsar 180', 'Pulsar 220F', 'Pulsar 250F',
    'Pulsar AS150', 'Pulsar N160', 'Pulsar NS125', 'Pulsar NS150',
    'Pulsar NS160', 'Pulsar NS200', 'Pulsar P150', 'Pulsar RS200',
    'Vikrant', 'XCD',
  ],
  Honda: [
    'Activa', 'Aviator', 'CB 200X', 'CBR', 'CD 110', 'Cliq', 'Dio',
    'Dream Neo', 'Dream Yuga', 'Eterno', 'Grazia', 'Hornet', 'Livo',
    'Shine', 'SP 125', 'SP 160', 'Stunner', 'Trigger', 'Twister',
    'Unicorn', 'XBlade',
  ],
  TVS: [
    'Apache', 'Apache RR310', 'iQube', 'Jupiter', 'Max 100', 'NTorq',
    'Phoenix 125', 'Radeon', 'Raider 125', 'Ronin', 'Scooty Pep',
    'Star City', 'Streak', 'Victor', 'Wego', 'Zest',
  ],
  Yamaha: [
    'Crux', 'Enticer', 'Fascino', 'Fazer', 'FZ', 'Gladiator',
    'MT-15', 'R15', 'RX 100', 'Saluto',
  ],
  'Royal Enfield': [
    'Bullet', 'Classic 350', 'Continental GT 650', 'Electra', 'Himalayan',
    'Hunter 350', 'Interceptor 650', 'Meteor 350', 'Scram 411',
    'Shotgun 650', 'Thunderbird', 'Thunderbird 350X',
  ],
  KTM: ['Duke 125', 'Duke 200', 'Duke 250', 'Duke 390', 'RC 390'],
  Suzuki: ['Access', 'Gixxer', 'Hayate', 'Intruder', 'Slingshot'],
  Mahindra: ['Centuro', 'Mojo'],
  // Lubricant brands — no vehicle models
  Motul: [],
  Castrol: [],
};

async function main() {
  console.log('Seeding vehicle catalog...');
  let brandCount = 0;
  let modelCount = 0;

  for (const [brandName, models] of Object.entries(catalog)) {
    const brand = await prisma.vehicleBrand.upsert({
      where: { name: brandName },
      update: {},
      create: { name: brandName, sortOrder: brandCount },
    });
    brandCount++;

    for (let i = 0; i < models.length; i++) {
      await prisma.vehicleModel.upsert({
        where: { brandId_name: { brandId: brand.id, name: models[i] } },
        update: {},
        create: { brandId: brand.id, name: models[i], sortOrder: i },
      });
      modelCount++;
    }
  }

  console.log(`Done: ${brandCount} brands, ${modelCount} models`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
