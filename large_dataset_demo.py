#!/usr/bin/env python3
"""
Demonstration of sqlite_zstd_vfs handling large datasets that exceed RAM
"""

import sqlite3
import os
import psutil
import time

ZSTD_VFS_EXTENSION = "/workspace/sqlite_zstd_vfs/build/zstd_vfs.so"

def get_memory_usage():
    """Get current memory usage in MB"""
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024

def simulate_large_dataset_query():
    """Simulate querying a large compressed database"""
    print("Large Dataset Handling with sqlite_zstd_vfs")
    print("=" * 60)
    
    # Use the compressed database we created
    compressed_db = "/workspace/production_compressed.zstd.db"
    
    if not os.path.exists(compressed_db):
        print("Error: Please run compressed_db_example.py first to create test database")
        return
    
    print(f"\nDatabase size: {os.path.getsize(compressed_db) / 1024 / 1024:.2f} MB")
    print(f"Initial memory usage: {get_memory_usage():.2f} MB")
    
    # Connect to compressed database
    conn = sqlite3.connect(":memory:")
    conn.enable_load_extension(True)
    conn.load_extension(ZSTD_VFS_EXTENSION)
    
    compressed_conn = sqlite3.connect(
        f"file:{compressed_db}?vfs=zstd&threads=8",
        uri=True
    )
    
    # Configure for minimal memory usage
    compressed_conn.execute("PRAGMA cache_size=1000")  # Small 1MB cache
    compressed_conn.execute("PRAGMA temp_store=FILE")  # Use disk for temp tables
    
    print(f"After connection: {get_memory_usage():.2f} MB")
    
    # Simulate processing large result set that would exceed memory
    print("\n--- Processing Large Result Set ---")
    print("Streaming 50,000 rows without loading all into memory...")
    
    cursor = compressed_conn.execute("""
        SELECT id, timestamp, user_id, event_type, 
               metadata, value
        FROM events
        ORDER BY id
    """)
    
    # Process in chunks to demonstrate streaming
    chunk_size = 1000
    total_processed = 0
    start_time = time.time()
    max_memory = get_memory_usage()
    
    while True:
        chunk = cursor.fetchmany(chunk_size)
        if not chunk:
            break
        
        # Simulate processing
        for row in chunk:
            # In real scenario, you'd process each row here
            # For demo, just count
            pass
        
        total_processed += len(chunk)
        current_memory = get_memory_usage()
        max_memory = max(max_memory, current_memory)
        
        if total_processed % 10000 == 0:
            elapsed = time.time() - start_time
            rows_per_sec = total_processed / elapsed
            print(f"  Processed {total_processed:,} rows... "
                  f"Memory: {current_memory:.2f} MB, "
                  f"Speed: {rows_per_sec:,.0f} rows/sec")
    
    cursor.close()
    
    print(f"\nProcessing complete!")
    print(f"Total rows: {total_processed:,}")
    print(f"Time taken: {time.time() - start_time:.2f} seconds")
    print(f"Peak memory usage: {max_memory:.2f} MB")
    print(f"Final memory usage: {get_memory_usage():.2f} MB")
    
    # Demonstrate aggregation query
    print("\n--- Aggregation Query ---")
    start_time = time.time()
    cursor = compressed_conn.execute("""
        SELECT 
            event_type,
            COUNT(*) as count,
            AVG(value) as avg_value,
            MIN(value) as min_value,
            MAX(value) as max_value
        FROM events
        GROUP BY event_type
    """)
    
    print("Event Type Statistics:")
    for row in cursor:
        print(f"  {row[0]}: count={row[1]:,}, avg={row[2]:.2f}, "
              f"min={row[3]:.2f}, max={row[4]:.2f}")
    
    print(f"Aggregation time: {time.time() - start_time:.2f} seconds")
    print(f"Memory usage: {get_memory_usage():.2f} MB")
    
    compressed_conn.close()
    conn.close()
    
    print("\n=== Key Benefits for Large Datasets ===")
    print("✓ Compressed storage reduces disk I/O")
    print("✓ Page-level compression allows partial decompression")
    print("✓ Streaming queries don't require full dataset in memory")
    print("✓ Background threads handle decompression efficiently")
    print("✓ Configurable cache size controls memory usage")
    print("\nPerfect for production databases larger than available RAM!")


if __name__ == "__main__":
    simulate_large_dataset_query()