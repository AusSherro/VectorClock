#!/usr/bin/env python3
"""
CSV to SQLite Converter for Aircraft Database
Optimized for Raspberry Pi Zero 2 W (low memory)

Converts aircraft-database-complete-2025-08.csv to aircraft.db
Uses chunked reading to avoid memory issues.
"""

import sqlite3
import csv
import os
from itertools import islice

# Configuration
CSV_FILE = 'aircraft-database-complete-2025-08.csv'
DB_FILE = 'aircraft.db'
CHUNK_SIZE = 10000  # Rows per batch - safe for Pi Zero 2 W

def create_database():
    """Create the SQLite database and aircraft table."""
    # Remove existing database
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)
        print(f"Removed existing {DB_FILE}")
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Create aircraft table
    cursor.execute('''
        CREATE TABLE aircraft (
            icao24 TEXT PRIMARY KEY,
            manufacturerName TEXT,
            model TEXT,
            operator TEXT,
            registration TEXT,
            typecode TEXT
        )
    ''')
    
    conn.commit()
    print("Created aircraft table")
    return conn

def import_csv_chunked(conn):
    """Import CSV data in chunks to manage memory."""
    cursor = conn.cursor()
    
    with open(CSV_FILE, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.reader(f)
        
        # Skip header row
        header = next(reader)
        print(f"CSV Headers: {header[:6]}")  # Show first 6 columns
        
        total_rows = 0
        chunk_count = 0
        
        while True:
            # Read a chunk of rows
            chunk = list(islice(reader, CHUNK_SIZE))
            if not chunk:
                break
            
            chunk_count += 1
            rows_to_insert = []
            
            for row in chunk:
                # CSV columns: icao24, manufacturerName, model, operator, registration, typecode, ...
                if len(row) >= 6:
                    # Clean the icao24 - remove quotes if present
                    icao24 = row[0].strip().strip("'").upper()
                    
                    # Skip empty or invalid icao24
                    if not icao24 or icao24 == 'ICAO24':
                        continue
                    
                    # Clean other fields
                    manufacturer = row[1].strip().strip("'") if row[1] else ''
                    model = row[2].strip().strip("'") if row[2] else ''
                    operator = row[3].strip().strip("'") if row[3] else ''
                    registration = row[4].strip().strip("'") if row[4] else ''
                    typecode = row[5].strip().strip("'") if row[5] else ''
                    
                    rows_to_insert.append((
                        icao24, manufacturer, model, operator, registration, typecode
                    ))
            
            # Bulk insert with REPLACE to handle duplicates
            cursor.executemany('''
                INSERT OR REPLACE INTO aircraft 
                (icao24, manufacturerName, model, operator, registration, typecode)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', rows_to_insert)
            
            conn.commit()
            total_rows += len(rows_to_insert)
            print(f"  Chunk {chunk_count}: Inserted {len(rows_to_insert)} rows (Total: {total_rows})")
    
    return total_rows

def create_index(conn):
    """Create unique index on icao24 for fast lookups."""
    cursor = conn.cursor()
    
    # Since icao24 is PRIMARY KEY, it already has an index
    # But let's verify and create additional index if needed
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_icao24_lookup ON aircraft(icao24)
    ''')
    
    conn.commit()
    print("Created index on icao24")

def verify_database(conn):
    """Verify the database was created correctly."""
    cursor = conn.cursor()
    
    # Count records
    cursor.execute('SELECT COUNT(*) FROM aircraft')
    count = cursor.fetchone()[0]
    print(f"\nTotal records: {count:,}")
    
    # Sample a few records
    cursor.execute('SELECT * FROM aircraft WHERE model != "" LIMIT 5')
    samples = cursor.fetchall()
    print("\nSample records:")
    for row in samples:
        print(f"  {row[0]}: {row[1]} {row[2]} ({row[3]})")
    
    # Check index
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
    indexes = cursor.fetchall()
    print(f"\nIndexes: {[i[0] for i in indexes]}")
    
    return count

def main():
    print("=" * 50)
    print("Aircraft CSV to SQLite Converter")
    print("=" * 50)
    
    # Check if CSV exists
    if not os.path.exists(CSV_FILE):
        print(f"ERROR: {CSV_FILE} not found!")
        print("Please ensure the CSV file is in the same directory.")
        return
    
    print(f"\nSource: {CSV_FILE}")
    print(f"Output: {DB_FILE}")
    print(f"Chunk size: {CHUNK_SIZE:,} rows")
    print()
    
    # Create database
    conn = create_database()
    
    # Import data
    print("\nImporting CSV data...")
    total = import_csv_chunked(conn)
    
    # Create index
    print("\nCreating index...")
    create_index(conn)
    
    # Verify
    print("\nVerification:")
    verify_database(conn)
    
    # Close connection
    conn.close()
    
    # Show file size
    db_size = os.path.getsize(DB_FILE) / (1024 * 1024)  # MB
    print(f"\nDatabase size: {db_size:.1f} MB")
    print("\n✓ Conversion complete!")
    print(f"  The '{DB_FILE}' file is ready for use.")

if __name__ == '__main__':
    main()
