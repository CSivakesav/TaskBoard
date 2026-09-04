import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import path from 'path';
import fs from 'fs';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);
const DATA_DIR = path.join(process.cwd(), 'data');
const WORKBOOK_PATH = path.join(DATA_DIR, 'task-management.xlsx');

async function seed() {
  if (!fs.existsSync(WORKBOOK_PATH)) {
    console.log('Workbook does not exist, creating new one...');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);

  let sheet = workbook.getWorksheet('Users');
  if (!sheet) {
    sheet = workbook.addWorksheet('Users');
    sheet.columns = [
      { header: 'UserID', key: 'UserID' },
      { header: 'Name', key: 'Name' },
      { header: 'Email', key: 'Email' },
      { header: 'PasswordHash', key: 'PasswordHash' },
      { header: 'Role', key: 'Role' },
      { header: 'Active', key: 'Active' },
      { header: 'CreatedAt', key: 'CreatedAt' },
    ];
  }

  const admins = [
    {
      name: 'HOD CSC',
      email: 'hod.csc@eec.srmrmp.edu.in',
      password: 'admin@hod',
    },
    {
      name: 'Admin ACS',
      email: 'adminacs@gmail.com',
      password: 'admin@hod',
    },
  ];

  // Read existing rows
  const existingUsers = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const email = String(row.getCell(3).value || '').toLowerCase();
    existingUsers.push({ rowNumber, email });
  });

  console.log('Existing users count:', existingUsers.length);

  for (const admin of admins) {
    const passwordHash = await bcrypt.hash(admin.password, 12);
    const existing = existingUsers.find((u) => u.email === admin.email.toLowerCase());

    if (existing) {
      console.log(`Updating existing admin: ${admin.email}`);
      const row = sheet.getRow(existing.rowNumber);
      row.getCell(2).value = admin.name;
      row.getCell(4).value = passwordHash;
      row.getCell(5).value = 'ADMIN';
      row.getCell(6).value = true;
      row.commit();
    } else {
      console.log(`Creating new admin: ${admin.email}`);
      const newRow = [
        `USER-${nanoid()}`,
        admin.name,
        admin.email.toLowerCase(),
        passwordHash,
        'ADMIN',
        true,
        new Date().toISOString(),
      ];
      sheet.addRow(newRow);
    }
  }

  await workbook.xlsx.writeFile(WORKBOOK_PATH);
  console.log('Admin accounts seeded successfully into data/task-management.xlsx!');
}

seed().catch((err) => {
  console.error('Error seeding admins:', err);
  process.exit(1);
});
