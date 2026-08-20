const { Client } = require('pg');

const connectionString = "postgresql://postgres:Admininland040@db.flrbzgzqlqptnjcxgarg.supabase.co:6543/postgres?pgbouncer=true&sslmode=require";

const client = new Client({ connectionString });

client.connect()
  .then(() => {
    console.log('✅ Koneksi BERHASIL!');
    return client.query('SELECT NOW()');
  })
  .then(res => {
    console.log('Waktu database:', res.rows[0].now);
    client.end();
  })
  .catch(err => {
    console.error('❌ Koneksi GAGAL:', err.message);
    client.end();
  });