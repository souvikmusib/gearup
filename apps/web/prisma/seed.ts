import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin123', 12);

  // Roles
  const roles = await Promise.all([
    prisma.role.upsert({ where: { key: 'SUPER_ADMIN' }, update: {}, create: { key: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full access' } }),
    prisma.role.upsert({ where: { key: 'MANAGER' }, update: {}, create: { key: 'MANAGER', name: 'Manager', description: 'Shop manager' } }),
    prisma.role.upsert({ where: { key: 'RECEPTIONIST' }, update: {}, create: { key: 'RECEPTIONIST', name: 'Receptionist', description: 'Front desk' } }),
  ]);

  // Admin Users
  const admins = await Promise.all([
    prisma.adminUser.upsert({ where: { adminUserId: 'admin' }, update: {}, create: { adminUserId: 'admin', fullName: 'Souvik Musib', email: 'souvik@gearup.local', phone: '9830012345', passwordHash: hash } }),
    prisma.adminUser.upsert({ where: { adminUserId: 'arnab' }, update: {}, create: { adminUserId: 'arnab', fullName: 'Arnab Sen', email: 'arnab@gearup.local', phone: '9830054321', passwordHash: hash } }),
    prisma.adminUser.upsert({ where: { adminUserId: 'priya' }, update: {}, create: { adminUserId: 'priya', fullName: 'Priya Chatterjee', email: 'priya@gearup.local', phone: '9830067890', passwordHash: hash } }),
  ]);

  // Assign roles
  for (const admin of admins) {
    await prisma.adminUserRole.upsert({ where: { adminUserId_roleId: { adminUserId: admin.id, roleId: roles[0].id } }, update: {}, create: { adminUserId: admin.id, roleId: roles[0].id } });
  }

  // Permissions
  const perms = ['CUSTOMERS_VIEW','CUSTOMERS_EDIT','VEHICLES_VIEW','VEHICLES_EDIT','WORKERS_MANAGE','APPOINTMENTS_VIEW','APPOINTMENTS_MANAGE','JOB_CARDS_VIEW_OWN','JOB_CARDS_CREATE','JOB_CARDS_UPDATE_STATUS','INVENTORY_VIEW','INVENTORY_EDIT','INVOICES_VIEW','INVOICES_CREATE','PAYMENTS_RECORD','EXPENSES_VIEW','EXPENSES_MANAGE','REPORTS_VIEW','SETTINGS_MANAGE','NOTIFICATIONS_MANAGE'];
  for (const key of perms) {
    const p = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, module: key.split('_')[0], name: key.replace(/_/g, ' ') } });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: roles[0].id, permissionId: p.id } }, update: {}, create: { roleId: roles[0].id, permissionId: p.id } }).catch(() => {});
  }

  console.log('✅ Roles, admins, permissions seeded');

  // Customers
  const custData = [
    { fullName: 'Rahim Sheikh', phoneNumber: '9831012345', email: 'rahim@gmail.com', city: 'Kolkata', state: 'West Bengal', postalCode: '700001', addressLine1: '12 Park Street' },
    { fullName: 'Ananya Banerjee', phoneNumber: '9831023456', email: 'ananya.b@gmail.com', city: 'Howrah', state: 'West Bengal', postalCode: '711101', addressLine1: '45 GT Road' },
    { fullName: 'Subhash Mondal', phoneNumber: '9831034567', city: 'Barasat', state: 'West Bengal', postalCode: '700124', addressLine1: '78 Jessore Road' },
    { fullName: 'Dipika Das', phoneNumber: '9831045678', email: 'dipika.das@yahoo.com', city: 'Salt Lake', state: 'West Bengal', postalCode: '700091', addressLine1: 'AE Block, Sector 1' },
    { fullName: 'Rajesh Ghosh', phoneNumber: '9831056789', city: 'Dum Dum', state: 'West Bengal', postalCode: '700028', addressLine1: '23 Nagerbazar' },
    { fullName: 'Moumita Roy', phoneNumber: '9831067890', email: 'moumita.r@gmail.com', city: 'Jadavpur', state: 'West Bengal', postalCode: '700032', addressLine1: '56 Raja SC Mullick Road' },
    { fullName: 'Kamal Sarkar', phoneNumber: '9831078901', city: 'Behala', state: 'West Bengal', postalCode: '700034', addressLine1: '89 Diamond Harbour Road' },
    { fullName: 'Taniya Biswas', phoneNumber: '9831089012', email: 'taniya.b@outlook.com', city: 'New Town', state: 'West Bengal', postalCode: '700156', addressLine1: 'Action Area 1' },
    { fullName: 'Amit Halder', phoneNumber: '9831090123', city: 'Barrackpore', state: 'West Bengal', postalCode: '700120', addressLine1: '34 SN Banerjee Road' },
    { fullName: 'Suchitra Pal', phoneNumber: '9831001234', email: 'suchitra.p@gmail.com', city: 'Garia', state: 'West Bengal', postalCode: '700084', addressLine1: '67 Narendrapur Road' },
  ];
  const customers = [];
  for (const c of custData) {
    customers.push(await prisma.customer.create({ data: { ...c, source: 'SEED' } }));
  }
  console.log('✅ 10 customers seeded');

  // Vehicles
  const vehData = [
    { idx: 0, vehicleType: 'BIKE' as const, registrationNumber: 'WB-01-AB-1234', brand: 'Royal Enfield', model: 'Classic 350', fuelType: 'Petrol', color: 'Black' },
    { idx: 1, vehicleType: 'BIKE' as const, registrationNumber: 'WB-02-CD-5678', brand: 'Honda', model: 'Activa 6G', fuelType: 'Petrol', color: 'White' },
    { idx: 2, vehicleType: 'BIKE' as const, registrationNumber: 'WB-26-EF-9012', brand: 'Bajaj', model: 'Pulsar 150', fuelType: 'Petrol', color: 'Blue' },
    { idx: 3, vehicleType: 'BIKE' as const, registrationNumber: 'WB-01-GH-3456', brand: 'TVS', model: 'Jupiter', fuelType: 'Petrol', color: 'Grey' },
    { idx: 4, vehicleType: 'BIKE' as const, registrationNumber: 'WB-02-IJ-7890', brand: 'Hero', model: 'Splendor Plus', fuelType: 'Petrol', color: 'Red' },
    { idx: 5, vehicleType: 'BIKE' as const, registrationNumber: 'WB-26-KL-2345', brand: 'Yamaha', model: 'FZ-S V3', fuelType: 'Petrol', color: 'Yellow' },
    { idx: 6, vehicleType: 'BIKE' as const, registrationNumber: 'WB-01-MN-6789', brand: 'Suzuki', model: 'Access 125', fuelType: 'Petrol', color: 'Silver' },
    { idx: 7, vehicleType: 'BIKE' as const, registrationNumber: 'WB-02-OP-0123', brand: 'KTM', model: 'Duke 200', fuelType: 'Petrol', color: 'Orange' },
    { idx: 8, vehicleType: 'BIKE' as const, registrationNumber: 'WB-26-QR-4567', brand: 'Honda', model: 'CB Shine', fuelType: 'Petrol', color: 'Black' },
    { idx: 9, vehicleType: 'BIKE' as const, registrationNumber: 'WB-01-ST-8901', brand: 'Royal Enfield', model: 'Meteor 350', fuelType: 'Petrol', color: 'Green' },
  ];
  const vehicles = [];
  for (const v of vehData) {
    const { idx, ...rest } = v;
    vehicles.push(await prisma.vehicle.create({ data: { ...rest, customerId: customers[idx].id, odometerReading: 5000 + Math.floor(Math.random() * 30000) } }));
  }
  console.log('✅ 10 vehicles seeded');

  // Workers
  const workerData = [
    { fullName: 'Raju Mistri', designation: 'Senior Mechanic', specialization: 'Engine', phoneNumber: '9832011111', shiftStart: '09:00', shiftEnd: '18:00' },
    { fullName: 'Bablu Das', designation: 'Mechanic', specialization: 'Electrical', phoneNumber: '9832022222', shiftStart: '09:00', shiftEnd: '18:00' },
    { fullName: 'Tapan Karmakar', designation: 'Mechanic', specialization: 'Brake & Clutch', phoneNumber: '9832033333', shiftStart: '09:00', shiftEnd: '18:00' },
    { fullName: 'Sanjay Mitra', designation: 'Junior Mechanic', specialization: 'General Service', phoneNumber: '9832044444', shiftStart: '10:00', shiftEnd: '19:00' },
    { fullName: 'Pintu Shaw', designation: 'Helper', specialization: 'Body & Paint', phoneNumber: '9832055555', shiftStart: '09:00', shiftEnd: '18:00' },
    { fullName: 'Manoj Thakur', designation: 'Senior Mechanic', specialization: 'Chain & Sprocket', phoneNumber: '9832066666', shiftStart: '09:00', shiftEnd: '18:00' },
    { fullName: 'Bikash Dey', designation: 'Mechanic', specialization: 'Tyre & Wheel', phoneNumber: '9832077777', shiftStart: '10:00', shiftEnd: '19:00' },
    { fullName: 'Gopal Mandal', designation: 'Mechanic', specialization: 'Engine', phoneNumber: '9832088888', shiftStart: '09:00', shiftEnd: '18:00' },
    { fullName: 'Arun Pramanik', designation: 'Junior Mechanic', specialization: 'Diagnostics', phoneNumber: '9832099999', shiftStart: '09:00', shiftEnd: '18:00' },
    { fullName: 'Dilip Naskar', designation: 'Helper', specialization: 'General Service', phoneNumber: '9832000000', shiftStart: '10:00', shiftEnd: '19:00' },
  ];
  const workers = [];
  let wCode = 1;
  for (const w of workerData) {
    const code = `WRK-${String(wCode++).padStart(3, '0')}`;
    const existing = await prisma.worker.findUnique({ where: { workerCode: code } });
    if (existing) { workers.push(existing); continue; }
    workers.push(await prisma.worker.create({ data: { ...w, workerCode: code, dailyCapacity: 5 } }));
  }
  console.log('✅ 10 workers seeded');

  // Inventory Categories
  const cats = await Promise.all([
    prisma.inventoryCategory.upsert({ where: { categoryName: 'Engine Parts' }, update: {}, create: { categoryName: 'Engine Parts', description: 'Pistons, rings, gaskets' } }),
    prisma.inventoryCategory.upsert({ where: { categoryName: 'Oils & Lubricants' }, update: {}, create: { categoryName: 'Oils & Lubricants', description: 'Engine oil, chain lube, grease' } }),
    prisma.inventoryCategory.upsert({ where: { categoryName: 'Brake Parts' }, update: {}, create: { categoryName: 'Brake Parts', description: 'Pads, shoes, discs, cables' } }),
    prisma.inventoryCategory.upsert({ where: { categoryName: 'Electrical' }, update: {}, create: { categoryName: 'Electrical', description: 'Bulbs, wiring, CDI, regulators' } }),
    prisma.inventoryCategory.upsert({ where: { categoryName: 'Chain & Sprocket' }, update: {}, create: { categoryName: 'Chain & Sprocket', description: 'Chains, sprockets, chain sets' } }),
    prisma.inventoryCategory.upsert({ where: { categoryName: 'Tyres & Tubes' }, update: {}, create: { categoryName: 'Tyres & Tubes', description: 'Tyres, tubes, rim tapes' } }),
    prisma.inventoryCategory.upsert({ where: { categoryName: 'Filters' }, update: {}, create: { categoryName: 'Filters', description: 'Air, oil, fuel filters' } }),
    prisma.inventoryCategory.upsert({ where: { categoryName: 'Body Parts' }, update: {}, create: { categoryName: 'Body Parts', description: 'Fairings, mirrors, levers' } }),
    prisma.inventoryCategory.upsert({ where: { categoryName: 'Bearings' }, update: {}, create: { categoryName: 'Bearings', description: 'Wheel, steering, crank bearings' } }),
    prisma.inventoryCategory.upsert({ where: { categoryName: 'Consumables' }, update: {}, create: { categoryName: 'Consumables', description: 'Spark plugs, fuses, clips' } }),
  ]);
  console.log('✅ 10 inventory categories seeded');

  // Suppliers
  const suppliers = await Promise.all([
    prisma.supplier.create({ data: { supplierName: 'Bengal Auto Parts', phone: '9830111111', contactPerson: 'Ashok Kumar', address: 'Burrabazar, Kolkata' } }),
    prisma.supplier.create({ data: { supplierName: 'Howrah Bike Spares', phone: '9830222222', contactPerson: 'Ramesh Agarwal', address: 'Howrah Station Road' } }),
    prisma.supplier.create({ data: { supplierName: 'Eastern Lubricants', phone: '9830333333', contactPerson: 'Sunil Jain', address: 'Mullick Bazaar, Kolkata' } }),
    prisma.supplier.create({ data: { supplierName: 'Kolkata Tyre House', phone: '9830444444', contactPerson: 'Manoj Gupta', address: 'Sealdah, Kolkata' } }),
    prisma.supplier.create({ data: { supplierName: 'Royal Parts Distributor', phone: '9830555555', contactPerson: 'Vikram Singh', address: 'Esplanade, Kolkata' } }),
  ]);
  console.log('✅ 5 suppliers seeded');

  // Inventory Items
  const itemData = [
    { sku: 'ENG-001', itemName: 'Engine Oil 10W-30 (1L)', catIdx: 1, supIdx: 2, unit: 'litre', costPrice: 280, sellingPrice: 350, qty: 50, reorder: 10 },
    { sku: 'ENG-002', itemName: 'Piston Ring Set', catIdx: 0, supIdx: 0, unit: 'set', costPrice: 450, sellingPrice: 650, qty: 20, reorder: 5 },
    { sku: 'BRK-001', itemName: 'Front Brake Pad Set', catIdx: 2, supIdx: 0, unit: 'set', costPrice: 180, sellingPrice: 280, qty: 30, reorder: 8 },
    { sku: 'BRK-002', itemName: 'Clutch Cable', catIdx: 2, supIdx: 1, unit: 'pcs', costPrice: 120, sellingPrice: 200, qty: 25, reorder: 5 },
    { sku: 'ELC-001', itemName: 'Headlight Bulb H4', catIdx: 3, supIdx: 1, unit: 'pcs', costPrice: 80, sellingPrice: 150, qty: 40, reorder: 10 },
    { sku: 'CHN-001', itemName: 'Chain Sprocket Kit', catIdx: 4, supIdx: 4, unit: 'set', costPrice: 800, sellingPrice: 1200, qty: 15, reorder: 3 },
    { sku: 'TYR-001', itemName: 'Front Tyre 80/100-17', catIdx: 5, supIdx: 3, unit: 'pcs', costPrice: 1200, sellingPrice: 1600, qty: 10, reorder: 3 },
    { sku: 'FLT-001', itemName: 'Air Filter Element', catIdx: 6, supIdx: 0, unit: 'pcs', costPrice: 150, sellingPrice: 250, qty: 35, reorder: 8 },
    { sku: 'BRG-001', itemName: 'Wheel Bearing 6301', catIdx: 8, supIdx: 1, unit: 'pcs', costPrice: 90, sellingPrice: 160, qty: 20, reorder: 5 },
    { sku: 'CON-001', itemName: 'Spark Plug (NGK)', catIdx: 9, supIdx: 4, unit: 'pcs', costPrice: 60, sellingPrice: 120, qty: 60, reorder: 15 },
  ];
  const items = [];
  for (const it of itemData) {
    const existing = await prisma.inventoryItem.findUnique({ where: { sku: it.sku } });
    if (existing) { items.push(existing); continue; }
    items.push(await prisma.inventoryItem.create({ data: { sku: it.sku, itemName: it.itemName, categoryId: cats[it.catIdx].id, supplierId: suppliers[it.supIdx].id, unit: it.unit, costPrice: it.costPrice, sellingPrice: it.sellingPrice, quantityInStock: it.qty, reorderLevel: it.reorder } }));
  }
  console.log('✅ 10 inventory items seeded');

  // Appointment Slot Rules (Mon-Sat)
  for (let day = 1; day <= 6; day++) {
    await prisma.appointmentSlotRule.create({ data: { dayOfWeek: day, openTime: '09:00', closeTime: '18:00', slotDurationMinutes: 30, maxCapacity: 3 } });
  }
  console.log('✅ Slot rules seeded (Mon-Sat)');

  // Holidays
  const holidays = [
    { holidayName: 'Republic Day', holidayDate: new Date('2026-01-26'), holidayType: 'PUBLIC_HOLIDAY' as const },
    { holidayName: 'Holi', holidayDate: new Date('2026-03-17'), holidayType: 'PUBLIC_HOLIDAY' as const },
    { holidayName: 'Independence Day', holidayDate: new Date('2026-08-15'), holidayType: 'PUBLIC_HOLIDAY' as const },
    { holidayName: 'Durga Puja Saptami', holidayDate: new Date('2026-10-14'), holidayType: 'PUBLIC_HOLIDAY' as const },
    { holidayName: 'Durga Puja Ashtami', holidayDate: new Date('2026-10-15'), holidayType: 'PUBLIC_HOLIDAY' as const },
    { holidayName: 'Durga Puja Navami', holidayDate: new Date('2026-10-16'), holidayType: 'PUBLIC_HOLIDAY' as const },
    { holidayName: 'Durga Puja Dashami', holidayDate: new Date('2026-10-17'), holidayType: 'PUBLIC_HOLIDAY' as const },
    { holidayName: 'Kali Puja', holidayDate: new Date('2026-11-04'), holidayType: 'PUBLIC_HOLIDAY' as const },
    { holidayName: 'Christmas', holidayDate: new Date('2026-12-25'), holidayType: 'PUBLIC_HOLIDAY' as const },
    { holidayName: 'Annual Maintenance', holidayDate: new Date('2026-06-15'), holidayType: 'MAINTENANCE_SHUTDOWN' as const, notes: 'Shop deep cleaning & equipment maintenance' },
  ];
  for (const h of holidays) {
    await prisma.holiday.create({ data: { ...h, isFullDay: true } });
  }
  console.log('✅ 10 holidays seeded');

  // Expense Categories
  const expCats = await Promise.all([
    prisma.expenseCategory.upsert({ where: { categoryName: 'Rent' }, update: {}, create: { categoryName: 'Rent', description: 'Shop rent' } }),
    prisma.expenseCategory.upsert({ where: { categoryName: 'Electricity' }, update: {}, create: { categoryName: 'Electricity', description: 'Power bills' } }),
    prisma.expenseCategory.upsert({ where: { categoryName: 'Tools & Equipment' }, update: {}, create: { categoryName: 'Tools & Equipment', description: 'Workshop tools' } }),
    prisma.expenseCategory.upsert({ where: { categoryName: 'Miscellaneous' }, update: {}, create: { categoryName: 'Miscellaneous', description: 'Other expenses' } }),
    prisma.expenseCategory.upsert({ where: { categoryName: 'Salary' }, update: {}, create: { categoryName: 'Salary', description: 'Worker salaries' } }),
  ]);

  // Expenses
  const expData = [
    { title: 'April Shop Rent', amount: 25000, catIdx: 0, date: '2026-04-01', vendor: 'Landlord - Ashok Dutta', mode: 'BANK_TRANSFER' },
    { title: 'Electricity Bill March', amount: 4500, catIdx: 1, date: '2026-04-05', vendor: 'CESC', mode: 'UPI' },
    { title: 'New Torque Wrench', amount: 3200, catIdx: 2, date: '2026-04-08', vendor: 'Kolkata Tools Mart', mode: 'CASH' },
    { title: 'Drinking Water Cans', amount: 600, catIdx: 3, date: '2026-04-10', vendor: 'Bisleri Dealer', mode: 'CASH' },
    { title: 'Raju Salary April', amount: 18000, catIdx: 4, date: '2026-04-30', vendor: 'Raju Mistri', mode: 'BANK_TRANSFER' },
    { title: 'Bablu Salary April', amount: 15000, catIdx: 4, date: '2026-04-30', vendor: 'Bablu Das', mode: 'BANK_TRANSFER' },
    { title: 'Chain Cleaning Spray', amount: 450, catIdx: 3, date: '2026-04-12', vendor: 'Amazon', mode: 'UPI' },
    { title: 'New Air Compressor', amount: 8500, catIdx: 2, date: '2026-04-15', vendor: 'Howrah Industrial', mode: 'CARD' },
    { title: 'Internet Bill', amount: 1200, catIdx: 3, date: '2026-04-18', vendor: 'Airtel', mode: 'UPI' },
    { title: 'Tapan Salary April', amount: 15000, catIdx: 4, date: '2026-04-30', vendor: 'Tapan Karmakar', mode: 'BANK_TRANSFER' },
  ];
  for (const ex of expData) {
    await prisma.expense.create({ data: { title: ex.title, amount: ex.amount, categoryId: expCats[ex.catIdx].id, expenseDate: new Date(ex.date), vendorName: ex.vendor, paymentMode: ex.mode as any, createdByAdminId: admins[0].id } });
  }
  console.log('✅ 10 expenses seeded');

  // Notification Templates
  const templates = [
    { channel: 'WHATSAPP' as const, eventType: 'appointment.confirmed', templateKey: 'appt_confirmed_wa', messageBody: 'Hi {{customerName}}, your appointment on {{date}} at {{time}} is confirmed. Ref: {{referenceId}}' },
    { channel: 'EMAIL' as const, eventType: 'appointment.confirmed', templateKey: 'appt_confirmed_email', subject: 'Appointment Confirmed', messageBody: 'Dear {{customerName}}, your appointment is confirmed for {{date}}.' },
    { channel: 'WHATSAPP' as const, eventType: 'jobcard.ready', templateKey: 'jc_ready_wa', messageBody: 'Hi {{customerName}}, your {{vehicleReg}} is ready for pickup! Job Card: {{jobCardNumber}}' },
    { channel: 'EMAIL' as const, eventType: 'invoice.created', templateKey: 'invoice_email', subject: 'Invoice {{invoiceNumber}}', messageBody: 'Dear {{customerName}}, your invoice {{invoiceNumber}} for ₹{{amount}} is ready.' },
  ];
  for (const t of templates) {
    await prisma.notificationTemplate.create({ data: t });
  }
  console.log('✅ Notification templates seeded');

  // Settings
  const settings = [
    { key: 'business.name', value: 'GearUp Bike Servicing' },
    { key: 'business.phone', value: '9830099900' },
    { key: 'business.address', value: '42 Gariahat Road, Kolkata 700029' },
    { key: 'business.gst', value: '19AABCU9603R1ZM' },
    { key: 'invoice.prefix', value: 'INV' },
    { key: 'invoice.terms', value: 'Payment due within 7 days. No warranty on used parts.' },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({ where: { key: s.key }, update: { value: s.value }, create: { key: s.key, value: s.value } });
  }
  console.log('✅ Settings seeded');

  // ═══ TRANSACTIONAL DATA (connected flow) ═══

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);
  const daysLater = (d: number) => new Date(now.getTime() + d * 86400000);

  // Service Requests
  const srData = [
    { custIdx: 0, vehIdx: 0, category: 'Engine Repair', issue: 'Engine making knocking sound at high RPM', status: 'CONVERTED_TO_JOB', days: 10 },
    { custIdx: 1, vehIdx: 1, category: 'General Service', issue: 'Regular 5000km service due, oil change needed', status: 'CONVERTED_TO_JOB', days: 8 },
    { custIdx: 2, vehIdx: 2, category: 'Brake & Clutch', issue: 'Front brake not gripping properly, squeaking noise', status: 'CONVERTED_TO_JOB', days: 6 },
    { custIdx: 3, vehIdx: 3, category: 'Electrical & Wiring', issue: 'Headlight flickering, battery draining overnight', status: 'CONVERTED_TO_JOB', days: 5 },
    { custIdx: 4, vehIdx: 4, category: 'Chain & Sprocket', issue: 'Chain loose and making noise, sprocket teeth worn', status: 'CONVERTED_TO_JOB', days: 4 },
    { custIdx: 5, vehIdx: 5, category: 'General Service', issue: 'Bike vibrating at 60kmph, needs full checkup', status: 'APPOINTMENT_PENDING', days: 3 },
    { custIdx: 6, vehIdx: 6, category: 'Tyre & Wheel Alignment', issue: 'Front tyre worn out, needs replacement', status: 'APPOINTMENT_CONFIRMED', days: 2 },
    { custIdx: 7, vehIdx: 7, category: 'Engine Repair', issue: 'Clutch slipping on inclines, hard to shift gears', status: 'SUBMITTED', days: 1 },
    { custIdx: 8, vehIdx: 8, category: 'Body & Paint', issue: 'Scratches on tank and side panel from minor fall', status: 'SUBMITTED', days: 0 },
    { custIdx: 9, vehIdx: 9, category: 'Diagnostics', issue: 'Check engine light on, bike stalling randomly', status: 'UNDER_REVIEW', days: 0 },
  ];
  const srs = [];
  let srNum = 1;
  for (const sr of srData) {
    srs.push(await prisma.serviceRequest.create({ data: { referenceId: `SR-2026-${String(srNum++).padStart(4, '0')}`, customerId: customers[sr.custIdx].id, vehicleId: vehicles[sr.vehIdx].id, serviceCategory: sr.category, issueDescription: sr.issue, status: sr.status as any, source: 'SEED', createdAt: daysAgo(sr.days) } }));
  }
  console.log('✅ 10 service requests seeded');

  // Appointments (for first 7 SRs)
  const appts = [];
  const apptStatuses = ['COMPLETED', 'COMPLETED', 'CHECKED_IN', 'CONFIRMED', 'CONFIRMED', 'REQUESTED', 'CONFIRMED'];
  for (let i = 0; i < 7; i++) {
    const date = daysAgo(srData[i].days - 1);
    const slotStart = new Date(date); slotStart.setHours(9 + i, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60000);
    appts.push(await prisma.appointment.create({ data: { referenceId: `APT-2026-${String(i + 1).padStart(4, '0')}`, serviceRequestId: srs[i].id, customerId: customers[i].id, vehicleId: vehicles[i].id, appointmentDate: date, slotStart, slotEnd, status: apptStatuses[i] as any, bookingSource: 'SEED' } }));
  }
  console.log('✅ 7 appointments seeded');

  // Job Cards (for first 5 — completed flow)
  const jcStatuses = ['DELIVERED', 'CLOSED', 'WORK_IN_PROGRESS', 'ESTIMATE_PREPARED', 'CREATED'];
  const jcs = [];
  for (let i = 0; i < 5; i++) {
    const odo = 5000 + Math.floor(Math.random() * 30000);
    jcs.push(await prisma.jobCard.create({ data: {
      jobCardNumber: `JC-2026-${String(i + 1).padStart(4, '0')}`, appointmentId: appts[i].id, serviceRequestId: srs[i].id,
      customerId: customers[i].id, vehicleId: vehicles[i].id, intakeDate: daysAgo(srData[i].days - 1),
      odometerAtIntake: odo, issueSummary: srData[i].issue, status: jcStatuses[i] as any,
      estimatedPartsCost: 500 + i * 200, estimatedLaborCost: 300 + i * 100, estimatedTotal: 800 + i * 300,
      finalPartsCost: i < 2 ? 500 + i * 200 : 0, finalLaborCost: i < 2 ? 300 + i * 100 : 0, finalTotal: i < 2 ? 800 + i * 300 : 0,
      actualDeliveryAt: i === 0 ? daysAgo(srData[i].days - 3) : undefined,
      priority: i === 0 ? 'HIGH' : undefined,
    } }));
    await prisma.vehicle.update({ where: { id: vehicles[i].id }, data: { odometerReading: odo } });
  }
  console.log('✅ 5 job cards seeded');

  // Worker Assignments
  for (let i = 0; i < 5; i++) {
    await prisma.workerAssignment.create({ data: { jobCardId: jcs[i].id, workerId: workers[i].id, assignmentRole: workers[i].designation } });
    if (i < 3) await prisma.workerAssignment.create({ data: { jobCardId: jcs[i].id, workerId: workers[i + 5].id, assignmentRole: 'Helper' } });
  }
  console.log('✅ Worker assignments seeded');

  // Job Card Tasks
  const taskNames = ['Initial Inspection', 'Diagnose Issue', 'Replace Parts', 'Test Ride', 'Final QC'];
  for (let i = 0; i < 5; i++) {
    for (let t = 0; t < taskNames.length; t++) {
      const status = i < 2 ? 'DONE' : (i === 2 && t < 3) ? 'DONE' : (i === 2 && t === 3) ? 'IN_PROGRESS' : 'PENDING';
      await prisma.jobCardTask.create({ data: { jobCardId: jcs[i].id, taskName: taskNames[t], status, sortOrder: t, estimatedMinutes: 15 + t * 10 } });
    }
  }
  console.log('✅ Job card tasks seeded');

  // Job Card Parts (use inventory items)
  for (let i = 0; i < 5; i++) {
    const partIdx1 = i % items.length;
    const partIdx2 = (i + 3) % items.length;
    await prisma.jobCardPart.create({ data: { jobCardId: jcs[i].id, inventoryItemId: items[partIdx1].id, requiredQty: 1, unitPrice: Number(items[partIdx1].sellingPrice) } });
    await prisma.jobCardPart.create({ data: { jobCardId: jcs[i].id, inventoryItemId: items[partIdx2].id, requiredQty: 2, unitPrice: Number(items[partIdx2].sellingPrice) } });
  }
  console.log('✅ Job card parts seeded');

  // Invoices (for first 2 completed job cards)
  const invoices = [];
  for (let i = 0; i < 2; i++) {
    const parts = await prisma.jobCardPart.findMany({ where: { jobCardId: jcs[i].id }, include: { inventoryItem: true } });
    const lineItems = parts.map((p: any, idx: number) => ({
      lineType: 'PART' as const, description: p.inventoryItem.itemName,
      quantity: Number(p.requiredQty), unitPrice: Number(p.unitPrice), taxRate: 18, taxAmount: Number(p.requiredQty) * Number(p.unitPrice) * 0.18,
      lineTotal: Number(p.requiredQty) * Number(p.unitPrice) * 1.18, sortOrder: idx,
    }));
    lineItems.push({ lineType: 'LABOR', description: `Labor — ${workers[i].fullName}`, quantity: 1, unitPrice: Number(jcs[i].finalLaborCost), taxRate: 18, taxAmount: Number(jcs[i].finalLaborCost) * 0.18, lineTotal: Number(jcs[i].finalLaborCost) * 1.18, sortOrder: lineItems.length } as any);
    const subtotal = lineItems.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const taxTotal = lineItems.reduce((s, l) => s + l.taxAmount, 0);
    const grandTotal = subtotal + taxTotal;
    invoices.push(await prisma.invoice.create({ data: {
      invoiceNumber: `INV-2026-${String(i + 1).padStart(4, '0')}`, customerId: customers[i].id, vehicleId: vehicles[i].id, jobCardId: jcs[i].id,
      invoiceDate: daysAgo(srData[i].days - 2), subtotal, taxTotal, grandTotal,
      amountPaid: i === 0 ? grandTotal : grandTotal / 2, amountDue: i === 0 ? 0 : grandTotal / 2,
      paymentStatus: i === 0 ? 'PAID' : 'PARTIALLY_PAID', invoiceStatus: 'FINALIZED', finalizedAt: daysAgo(srData[i].days - 2),
      createdByAdminId: admins[0].id, lineItems: { create: lineItems },
    } }));
  }
  console.log('✅ 2 invoices with line items seeded');

  // Payments
  await prisma.payment.create({ data: { invoiceId: invoices[0].id, amount: Number(invoices[0].grandTotal), paymentMode: 'UPI', paymentDate: daysAgo(7), referenceNumber: 'UPI-REF-98765', receivedByAdminId: admins[0].id } });
  await prisma.payment.create({ data: { invoiceId: invoices[1].id, amount: Number(invoices[1].grandTotal) / 2, paymentMode: 'CASH', paymentDate: daysAgo(5), receivedByAdminId: admins[0].id } });
  console.log('✅ 2 payments seeded');

  // Worker Leaves
  await prisma.workerLeave.create({ data: { workerId: workers[3].id, leaveType: 'CASUAL', startDate: daysLater(2), endDate: daysLater(3), status: 'APPROVED', reason: 'Family function', approvedByAdminId: admins[0].id } });
  await prisma.workerLeave.create({ data: { workerId: workers[7].id, leaveType: 'SICK', startDate: daysLater(5), endDate: daysLater(5), status: 'PENDING', reason: 'Not feeling well' } });
  console.log('✅ 2 worker leaves seeded');

  // Stock Movements (for parts used in job cards)
  for (let i = 0; i < 3; i++) {
    const item = items[i];
    await prisma.stockMovement.create({ data: { inventoryItemId: item.id, movementType: 'STOCK_IN', quantity: 10, previousQuantity: Number(item.quantityInStock) - 10, newQuantity: Number(item.quantityInStock), reason: 'Initial stock from supplier', performedByAdminId: admins[0].id, createdAt: daysAgo(15) } });
    await prisma.stockMovement.create({ data: { inventoryItemId: item.id, movementType: 'RESERVED', quantity: 2, previousQuantity: Number(item.quantityInStock), newQuantity: Number(item.quantityInStock) - 2, relatedEntityType: 'JobCard', relatedEntityId: jcs[0].id, createdAt: daysAgo(8) } });
  }
  console.log('✅ Stock movements seeded');

  console.log('\n🎉 All seed data created! Login: admin / admin123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
