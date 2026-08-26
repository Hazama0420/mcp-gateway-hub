// test-db.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Menghubungkan ke database...');
    // Cek koneksi sederhana dengan mengambil data mcpEndpoint
    const count = await prisma.mcpEndpoint.count();
    console.log('SUKSES! Berhasil terhubung ke database. Total endpoint:', count);
  } catch (error) {
    console.error('GAGAL TERHUBUNG KE DATABASE:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();