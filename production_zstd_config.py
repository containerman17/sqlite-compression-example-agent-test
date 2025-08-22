#!/usr/bin/env python3
"""
Production configuration for sqlite_zstd_vfs
Optimized for databases larger than available RAM
"""

import sqlite3
import os

ZSTD_VFS_EXTENSION = "/workspace/sqlite_zstd_vfs/build/zstd_vfs.so"

class CompressedDatabase:
    """
    A wrapper class for working with compressed SQLite databases using zstd_vfs.
    Optimized for production use with databases larger than RAM.
    """
    
    def __init__(self, db_path, 
                 compression_level=9,      # Higher compression for production
                 page_size=16384,          # 16KB pages for better compression
                 outer_page_size=8192,     # 8KB outer pages
                 cache_size_mb=256,        # 256MB cache (adjust based on available RAM)
                 threads=8):               # Background threads for compression/decompression
        self.db_path = db_path
        self.compression_level = compression_level
        self.page_size = page_size
        self.outer_page_size = outer_page_size
        self.cache_size_mb = cache_size_mb
        self.threads = threads
        self._conn = None
    
    def create_from_existing(self, source_db_path):
        """
        Create a compressed database from an existing uncompressed database.
        This is the recommended way to convert existing databases.
        """
        print(f"Converting {source_db_path} to compressed format...")
        
        # Connect to source database
        source_conn = sqlite3.connect(source_db_path)
        source_conn.enable_load_extension(True)
        source_conn.load_extension(ZSTD_VFS_EXTENSION)
        
        # Set optimal page size for compression
        source_conn.execute(f"PRAGMA page_size={self.page_size}")
        
        # VACUUM INTO compressed database with production settings
        vacuum_uri = (
            f"file:{self.db_path}?"
            f"vfs=zstd&"
            f"level={self.compression_level}&"
            f"outer_page_size={self.outer_page_size}&"
            f"threads={self.threads}&"
            f"outer_unsafe=false"  # Keep transaction safety in production
        )
        
        source_conn.execute(f"VACUUM INTO '{vacuum_uri}'")
        source_conn.close()
        
        print(f"Compression complete. Created: {self.db_path}")
    
    def connect(self, readonly=False):
        """Connect to the compressed database with optimal settings"""
        if self._conn:
            self._conn.close()
        
        # First create a connection to load the extension
        temp_conn = sqlite3.connect(":memory:")
        temp_conn.enable_load_extension(True)
        temp_conn.load_extension(ZSTD_VFS_EXTENSION)
        temp_conn.close()
        
        # Now connect to the actual database
        mode = "ro" if readonly else "rw"
        uri = (
            f"file:{self.db_path}?"
            f"vfs=zstd&"
            f"mode={mode}&"
            f"threads={self.threads}"
        )
        
        self._conn = sqlite3.connect(uri, uri=True)
        
        # Set optimal pragmas for production
        cache_pages = (self.cache_size_mb * 1024 * 1024) // self.page_size
        self._conn.execute(f"PRAGMA cache_size=-{self.cache_size_mb * 1024}")  # Negative = KB
        self._conn.execute("PRAGMA journal_mode=MEMORY")  # Reduce I/O
        self._conn.execute("PRAGMA synchronous=NORMAL")   # Balance safety/performance
        self._conn.execute("PRAGMA temp_store=MEMORY")    # Keep temp tables in memory
        self._conn.execute("PRAGMA mmap_size=268435456")  # 256MB memory-mapped I/O
        
        return self._conn
    
    def execute(self, query, params=()):
        """Execute a query on the compressed database"""
        if not self._conn:
            raise RuntimeError("Not connected. Call connect() first.")
        return self._conn.execute(query, params)
    
    def executemany(self, query, params_list):
        """Execute a query multiple times with different parameters"""
        if not self._conn:
            raise RuntimeError("Not connected. Call connect() first.")
        return self._conn.executemany(query, params_list)
    
    def commit(self):
        """Commit the current transaction"""
        if self._conn:
            self._conn.commit()
    
    def close(self):
        """Close the database connection"""
        if self._conn:
            self._conn.close()
            self._conn = None
    
    def get_compression_stats(self):
        """Get compression statistics for the database"""
        original_size = os.path.getsize(self.db_path)
        
        # Get uncompressed size estimate (rough calculation)
        conn = self.connect(readonly=True)
        cursor = conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
        table_count = cursor.fetchone()[0]
        
        total_uncompressed = 0
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'"):
            table_name = row[0]
            # Skip internal tables
            if table_name.startswith('sqlite_'):
                continue
            
            try:
                cursor = conn.execute(f"SELECT COUNT(*) FROM {table_name}")
                row_count = cursor.fetchone()[0]
                
                # Estimate average row size
                cursor = conn.execute(f"SELECT * FROM {table_name} LIMIT 100")
                sample_size = sum(len(str(value)) for row in cursor for value in row) / 100
                estimated_size = row_count * sample_size
                total_uncompressed += estimated_size
            except:
                pass
        
        compression_ratio = (1 - original_size / total_uncompressed) * 100 if total_uncompressed > 0 else 0
        
        return {
            'compressed_size_mb': original_size / 1024 / 1024,
            'estimated_uncompressed_mb': total_uncompressed / 1024 / 1024,
            'compression_ratio': compression_ratio,
            'tables': table_count
        }


# Production usage example
def production_example():
    """Example of using CompressedDatabase in production"""
    
    print("Production SQLite Zstandard VFS Configuration")
    print("=" * 50)
    
    # Configuration for large production database
    compressed_db = CompressedDatabase(
        db_path="/workspace/production_compressed.zstd.db",
        compression_level=12,     # Higher compression for storage savings
        page_size=32768,          # 32KB pages for better compression ratio
        outer_page_size=16384,    # 16KB outer pages
        cache_size_mb=512,        # 512MB cache (adjust based on available RAM)
        threads=16                # More threads for better performance
    )
    
    # Example: Convert existing database
    if os.path.exists("/workspace/example_regular.db"):
        compressed_db.create_from_existing("/workspace/example_regular.db")
        
        # Get compression statistics
        stats = compressed_db.get_compression_stats()
        print(f"\nCompression Statistics:")
        print(f"  Compressed size: {stats['compressed_size_mb']:.2f} MB")
        print(f"  Compression ratio: ~{stats['compression_ratio']:.1f}%")
    
    # Example: Query the compressed database
    print("\n--- Query Examples ---")
    
    # Connect for reading
    conn = compressed_db.connect(readonly=True)
    
    # Example 1: Count query
    cursor = conn.execute("SELECT COUNT(*) FROM events")
    count = cursor.fetchone()[0]
    print(f"Total events: {count}")
    
    # Example 2: Streaming large results
    print("\nStreaming query (processing rows one by one):")
    cursor = conn.execute(
        "SELECT id, timestamp, event_type FROM events WHERE value > 500 LIMIT 5"
    )
    
    for row in cursor:
        print(f"  ID: {row[0]}, Type: {row[2]}")
    
    compressed_db.close()
    
    # Example 3: Batch inserts (for write operations)
    print("\n--- Write Example ---")
    conn = compressed_db.connect(readonly=False)
    
    # Create a new table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY,
            timestamp TEXT,
            metric_name TEXT,
            value REAL
        )
    """)
    
    # Batch insert
    metrics_data = [
        (f"2024-01-01T{i:02d}:00:00", f"metric_{i%5}", i * 1.5)
        for i in range(24)
    ]
    
    compressed_db.executemany(
        "INSERT INTO metrics (timestamp, metric_name, value) VALUES (?, ?, ?)",
        metrics_data
    )
    compressed_db.commit()
    
    print("Inserted 24 metrics records")
    
    compressed_db.close()
    
    print("\n=== Production Recommendations ===")
    print("1. Use VACUUM INTO to convert existing databases")
    print("2. Set compression level based on CPU vs storage tradeoff")
    print("3. Use larger page sizes (16-64KB) for better compression")
    print("4. Allocate sufficient cache based on available RAM")
    print("5. Use multiple threads for background compression")
    print("6. Consider read-only connections for query workloads")
    print("7. Monitor compression ratio and query performance")
    print("\nThis configuration handles databases larger than RAM efficiently!")


if __name__ == "__main__":
    production_example()