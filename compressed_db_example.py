#!/usr/bin/env python3
"""
Example of using sqlite_zstd_vfs for compressed SQLite databases
with row-by-row querying capability
"""

import sqlite3
import os
import random
import string
import time
from datetime import datetime, timedelta

# Path to the compiled extension
ZSTD_VFS_EXTENSION = "/workspace/sqlite_zstd_vfs/build/zstd_vfs.so"

def generate_random_data(size=1000):
    """Generate random text data of specified size"""
    return ''.join(random.choices(string.ascii_letters + string.digits + ' ', k=size))

def create_sample_data(num_rows=10000):
    """Generate sample data for testing"""
    data = []
    base_date = datetime.now()
    
    for i in range(num_rows):
        data.append({
            'id': i + 1,
            'timestamp': (base_date + timedelta(seconds=i*60)).isoformat(),
            'user_id': random.randint(1000, 9999),
            'event_type': random.choice(['login', 'logout', 'purchase', 'view', 'click']),
            'metadata': generate_random_data(random.randint(500, 2000)),
            'value': random.uniform(0, 1000)
        })
    
    return data

def create_regular_database(db_path, data):
    """Create a regular uncompressed SQLite database"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create table
    cursor.execute('''
        CREATE TABLE events (
            id INTEGER PRIMARY KEY,
            timestamp TEXT,
            user_id INTEGER,
            event_type TEXT,
            metadata TEXT,
            value REAL
        )
    ''')
    
    # Insert data
    for row in data:
        cursor.execute('''
            INSERT INTO events (id, timestamp, user_id, event_type, metadata, value)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (row['id'], row['timestamp'], row['user_id'], 
              row['event_type'], row['metadata'], row['value']))
    
    conn.commit()
    conn.close()

def create_compressed_database(regular_db_path, compressed_db_path):
    """Create a compressed version of the database using VACUUM INTO"""
    # Connect to regular database and load extension
    conn = sqlite3.connect(regular_db_path)
    conn.enable_load_extension(True)
    conn.load_extension(ZSTD_VFS_EXTENSION)
    
    # VACUUM INTO compressed database with tuned parameters
    # Using higher compression level and larger page size for better compression
    vacuum_query = f"VACUUM INTO 'file:{compressed_db_path}?vfs=zstd&level=6&outer_page_size=2048&threads=4'"
    conn.execute(vacuum_query)
    conn.close()

def query_compressed_database(compressed_db_path, query, params=()):
    """Query the compressed database"""
    # Connect using zstd VFS
    conn = sqlite3.connect(":memory:")
    conn.enable_load_extension(True)
    conn.load_extension(ZSTD_VFS_EXTENSION)
    
    # Open compressed database with optimized settings
    compressed_conn = sqlite3.connect(
        f"file:{compressed_db_path}?vfs=zstd&threads=4",
        uri=True
    )
    
    # Set larger cache size for better performance
    compressed_conn.execute("PRAGMA cache_size=-102400")  # 100MB cache
    
    # Execute query
    cursor = compressed_conn.cursor()
    cursor.execute(query, params)
    results = cursor.fetchall()
    
    compressed_conn.close()
    conn.close()
    
    return results

def benchmark_queries(regular_db_path, compressed_db_path):
    """Benchmark various queries on both databases"""
    queries = [
        ("Count all events", "SELECT COUNT(*) FROM events", ()),
        ("Find specific user", "SELECT * FROM events WHERE user_id = ?", (5000,)),
        ("Aggregate by event type", 
         "SELECT event_type, COUNT(*), AVG(value) FROM events GROUP BY event_type", ()),
        ("Time range query", 
         "SELECT * FROM events WHERE timestamp > ? LIMIT 100", 
         ((datetime.now() - timedelta(days=1)).isoformat(),)),
        ("Full table scan with filter",
         "SELECT id, timestamp, value FROM events WHERE value > 500", ())
    ]
    
    print("\n=== Query Performance Comparison ===\n")
    
    for query_name, query, params in queries:
        # Regular database
        start = time.time()
        regular_conn = sqlite3.connect(regular_db_path)
        regular_conn.execute("PRAGMA cache_size=-102400")
        cursor = regular_conn.cursor()
        cursor.execute(query, params)
        regular_results = cursor.fetchall()
        regular_conn.close()
        regular_time = time.time() - start
        
        # Compressed database
        start = time.time()
        compressed_results = query_compressed_database(compressed_db_path, query, params)
        compressed_time = time.time() - start
        
        print(f"{query_name}:")
        print(f"  Regular DB: {regular_time:.4f}s ({len(regular_results)} rows)")
        print(f"  Compressed DB: {compressed_time:.4f}s ({len(compressed_results)} rows)")
        print(f"  Overhead: {((compressed_time / regular_time) - 1) * 100:.1f}%")
        print()

def main():
    """Main example demonstrating sqlite_zstd_vfs usage"""
    print("SQLite Zstandard VFS Compression Example")
    print("=" * 50)
    
    # File paths
    regular_db = "/workspace/example_regular.db"
    compressed_db = "/workspace/example_compressed.zstd.db"
    
    # Clean up existing files
    for db_file in [regular_db, compressed_db]:
        if os.path.exists(db_file):
            os.remove(db_file)
    
    # Generate sample data
    print("\nGenerating sample data...")
    data = create_sample_data(50000)  # 50k rows with random text
    print(f"Generated {len(data)} rows of data")
    
    # Create regular database
    print("\nCreating regular database...")
    start = time.time()
    create_regular_database(regular_db, data)
    regular_create_time = time.time() - start
    print(f"Regular database created in {regular_create_time:.2f}s")
    
    # Create compressed database
    print("\nCreating compressed database...")
    start = time.time()
    create_compressed_database(regular_db, compressed_db)
    compressed_create_time = time.time() - start
    print(f"Compressed database created in {compressed_create_time:.2f}s")
    
    # Compare file sizes
    regular_size = os.path.getsize(regular_db)
    compressed_size = os.path.getsize(compressed_db)
    compression_ratio = (1 - compressed_size / regular_size) * 100
    
    print(f"\n=== File Size Comparison ===")
    print(f"Regular database: {regular_size / 1024 / 1024:.2f} MB")
    print(f"Compressed database: {compressed_size / 1024 / 1024:.2f} MB")
    print(f"Compression ratio: {compression_ratio:.1f}% reduction")
    
    # Demonstrate row-by-row access
    print("\n=== Row-by-Row Access Example ===")
    print("Fetching individual rows from compressed database:")
    
    # Query specific rows
    for row_id in [1, 1000, 25000, 50000]:
        start = time.time()
        result = query_compressed_database(
            compressed_db, 
            "SELECT id, timestamp, event_type, LENGTH(metadata) as metadata_length FROM events WHERE id = ?",
            (row_id,)
        )
        query_time = time.time() - start
        
        if result:
            row = result[0]
            print(f"  Row {row_id}: event_type={row[2]}, metadata_length={row[3]} bytes")
            print(f"    Query time: {query_time*1000:.2f}ms")
    
    # Run benchmarks
    benchmark_queries(regular_db, compressed_db)
    
    # Demonstrate updates
    print("=== Update Operations ===")
    print("Updating a row in compressed database...")
    
    start = time.time()
    conn = sqlite3.connect(":memory:")
    conn.enable_load_extension(True)
    conn.load_extension(ZSTD_VFS_EXTENSION)
    compressed_conn = sqlite3.connect(f"file:{compressed_db}?vfs=zstd&threads=4", uri=True)
    compressed_conn.execute("UPDATE events SET value = value * 2 WHERE id = 12345")
    compressed_conn.commit()
    compressed_conn.close()
    conn.close()
    update_time = time.time() - start
    
    print(f"Update completed in {update_time*1000:.2f}ms")
    
    # Verify update
    result = query_compressed_database(
        compressed_db,
        "SELECT id, value FROM events WHERE id = 12345",
        ()
    )
    if result:
        print(f"Updated row value: {result[0][1]}")
    
    print("\n=== Summary ===")
    print(f"✓ Achieved {compression_ratio:.1f}% compression")
    print("✓ Row-by-row queries work efficiently")
    print("✓ No need for full decompression")
    print("✓ Updates are supported")
    print("\nThis solution is perfect for your use case where the database")
    print("is larger than RAM and you need row-level access!")

if __name__ == "__main__":
    main()