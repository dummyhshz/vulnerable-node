const config = require("../config");
const dummy = require("../dummy");
const pgp = require("pg-promise")();
const bcrypt = require("bcrypt");
const crypto = require("crypto");

/*
    SECURE DATABASE INITIALIZATION
*/

// 🔑 Encryption setup (store this key securely in ENV in real apps)
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update("your-secret-key")
  .digest(); // 32 bytes

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

async function init_db() {
  const db = pgp(config.db.connectionString);

  try {
    // ================= USERS TABLE =================
    await db.none(`
      CREATE TABLE IF NOT EXISTS users(
        name VARCHAR(100) PRIMARY KEY,
        password VARCHAR(255) NOT NULL
      );
    `);

    const users = dummy.users;

    for (let u of users) {
      // 🔐 Hash password using bcrypt
      const hashedPassword = await bcrypt.hash(u.password, 10);

      await db.none(
        `INSERT INTO users(name, password)
         VALUES($1, $2)
         ON CONFLICT (name) DO NOTHING`,
        [u.username, hashedPassword]
      );
    }

    console.log("✅ Users table ready");

    // ================= PRODUCTS TABLE =================
    await db.none(`
      CREATE TABLE IF NOT EXISTS products(
        id INTEGER PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        price INTEGER,
        image VARCHAR(500)
      );
    `);

    const products = dummy.products;

    for (let i = 0; i < products.length; i++) {
      const p = products[i];

      await db.none(
        `INSERT INTO products(id, name, description, price, image)
         VALUES($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [i, p.name, p.description, p.price, p.image]
      );
    }

    console.log("✅ Products table ready");

    // ================= PURCHASES TABLE =================
    await db.none(`
      CREATE TABLE IF NOT EXISTS purchases(
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        product_name VARCHAR(100) NOT NULL,
        user_name VARCHAR(100),
        mail VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        phone VARCHAR(40) NOT NULL,
        ship_date VARCHAR(100) NOT NULL,
        price INTEGER NOT NULL
      );
    `);

    console.log("✅ Purchases table ready");

    // ================= INSERT DUMMY PURCHASES (ENCRYPTED) =================
    if (dummy.purchases) {
      for (let p of dummy.purchases) {
        await db.none(
          `INSERT INTO purchases(
            product_id, product_name, user_name,
            mail, address, phone, ship_date, price
          )
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            p.product_id,
            p.product_name,
            p.user_name,

            // 🔐 Encrypt sensitive fields
            encrypt(p.mail),
            encrypt(p.address),
            encrypt(p.phone),

            p.ship_date,
            p.price
          ]
        );
      }
    }

    console.log("✅ Dummy purchases inserted securely");
  } catch (err) {
    console.error("❌ DB Init Error:", err);
  }
}

module.exports = init_db;