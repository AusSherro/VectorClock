#!/usr/bin/env node
/**
 * Manufacturer Name Standardization Script
 * 
 * Normalizes manufacturer names in the aircraft database to clean, consistent versions.
 * For example: "The Boeing Company", "Boeing Commercial Airplane" → "Boeing"
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_FILE = 'aircraft.db';
const BACKUP_FILE = 'aircraft.db.backup';

// Manufacturer standardization mappings
// Pattern (lowercase) → Standardized name
const MANUFACTURER_MAPPINGS = [
    // Major commercial aircraft manufacturers
    { pattern: 'boeing', standard: 'Boeing', exclude: ['bell boeing'] },
    { pattern: 'airbus', standard: 'Airbus' },
    { pattern: 'embraer', standard: 'Embraer' },
    { pattern: 'bombardier', standard: 'Bombardier' },
    { pattern: 'atr', standard: 'ATR', exact: true },  // Exact match to avoid false positives

    // General aviation manufacturers
    { pattern: 'cessna', standard: 'Cessna' },
    { pattern: 'piper', standard: 'Piper', exclude: ['bagpiper', 'sandpiper'] },
    { pattern: 'beech', standard: 'Beechcraft' },
    { pattern: 'cirrus', standard: 'Cirrus' },
    { pattern: 'mooney', standard: 'Mooney' },
    { pattern: 'diamond aircraft', standard: 'Diamond' },

    // Helicopter manufacturers
    { pattern: 'robinson helicopter', standard: 'Robinson' },
    { pattern: 'bell helicopter', standard: 'Bell Helicopter' },
    { pattern: 'bell boeing', standard: 'Bell Boeing' },  // V-22 Osprey

    // Business jet manufacturers
    { pattern: 'gulfstream', standard: 'Gulfstream' },
    { pattern: 'learjet', standard: 'Learjet' },
    { pattern: 'dassault', standard: 'Dassault' },
    { pattern: 'hawker', standard: 'Hawker' },

    // Legacy manufacturers
    { pattern: 'mcdonnell', standard: 'McDonnell Douglas' },
    { pattern: 'lockheed', standard: 'Lockheed' },
    { pattern: 'grumman', standard: 'Grumman' },
    { pattern: 'douglas', standard: 'Douglas', exclude: ['mcdonnell'] },
    { pattern: 'de havilland', standard: 'de Havilland' },
    { pattern: 'fokker', standard: 'Fokker' },

    // Corporate groups
    { pattern: 'textron', standard: 'Textron' },
    { pattern: 'raytheon', standard: 'Raytheon' },

    // International manufacturers
    { pattern: 'antonov', standard: 'Antonov' },
    { pattern: 'tupolev', standard: 'Tupolev' },
    { pattern: 'sukhoi', standard: 'Sukhoi' },
    { pattern: 'ilyushin', standard: 'Ilyushin' },
    { pattern: 'yakovlev', standard: 'Yakovlev' },
    { pattern: 'pilatus', standard: 'Pilatus' },
    { pattern: 'saab', standard: 'Saab', exact: true },
];

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     Manufacturer Name Standardization Script               ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Create backup
console.log('📦 Creating database backup...');
if (fs.existsSync(DB_FILE)) {
    fs.copyFileSync(DB_FILE, BACKUP_FILE);
    console.log(`   ✓ Backup created: ${BACKUP_FILE}\n`);
} else {
    console.error(`   ✗ Error: ${DB_FILE} not found!`);
    process.exit(1);
}

// Open database
const db = new Database(DB_FILE);

console.log('🔍 Analyzing and standardizing manufacturer names...\n');

let totalUpdated = 0;

for (const mapping of MANUFACTURER_MAPPINGS) {
    const { pattern, standard, exclude = [], exact = false } = mapping;

    // Build the query
    let whereClause;
    if (exact) {
        whereClause = `LOWER(manufacturerName) = '${pattern}'`;
    } else {
        whereClause = `LOWER(manufacturerName) LIKE '%${pattern}%'`;
    }

    // Add exclusions
    for (const excl of exclude) {
        whereClause += ` AND LOWER(manufacturerName) NOT LIKE '%${excl}%'`;
    }

    // Don't update if already standardized
    whereClause += ` AND manufacturerName != '${standard}'`;

    // Count affected rows first
    const countQuery = `SELECT COUNT(*) as count FROM aircraft WHERE ${whereClause}`;
    const count = db.prepare(countQuery).get().count;

    if (count > 0) {
        // Show what variants exist
        const variantsQuery = `SELECT DISTINCT manufacturerName FROM aircraft WHERE ${whereClause} LIMIT 5`;
        const variants = db.prepare(variantsQuery).all().map(r => r.manufacturerName);

        // Perform the update
        const updateQuery = `UPDATE aircraft SET manufacturerName = ? WHERE ${whereClause}`;
        const result = db.prepare(updateQuery).run(standard);

        console.log(`   ${standard}`);
        console.log(`   └─ Updated ${result.changes.toLocaleString()} records`);
        console.log(`      Variants: ${variants.slice(0, 3).map(v => `"${v}"`).join(', ')}${variants.length > 3 ? '...' : ''}\n`);

        totalUpdated += result.changes;
    }
}

db.close();

console.log('═'.repeat(60));
console.log(`\n✅ Standardization complete!`);
console.log(`   Total records updated: ${totalUpdated.toLocaleString()}`);
console.log(`   Backup available at: ${BACKUP_FILE}`);
console.log(`\n   To restore backup: copy ${BACKUP_FILE} to ${DB_FILE}`);
