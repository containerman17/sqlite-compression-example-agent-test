# SQLite Zstandard VFS Integration Guide

## Overview

sqlite_zstd_vfs provides transparent compression for SQLite databases at the page level. This allows you to:
- Compress database rows while maintaining row-by-row queryability
- Handle databases larger than RAM without full decompression
- Achieve 30-70% compression ratios depending on data

## Quick Start

### 1. Build the Extension

```bash
# Prerequisites
sudo apt-get install -y sqlite3 libsqlite3-dev libzstd-dev libcurl4-openssl-dev cmake build-essential

# Build
git clone https://github.com/mlin/sqlite_zstd_vfs.git
cd sqlite_zstd_vfs
cmake -DCMAKE_BUILD_TYPE=Release -B build
cmake --build build -j $(nproc)
```

### 2. Convert Existing Database

```python
import sqlite3

# Load extension and convert database
conn = sqlite3.connect("original.db")
conn.enable_load_extension(True)
conn.load_extension("./build/zstd_vfs.so")

# Convert with optimal settings for large databases
conn.execute("VACUUM INTO 'file:compressed.zstd.db?vfs=zstd&level=9&outer_page_size=4096&threads=8'")
conn.close()
```

### 3. Query Compressed Database

```python
# Connect to compressed database
conn = sqlite3.connect(":memory:")
conn.enable_load_extension(True)
conn.load_extension("./build/zstd_vfs.so")

# Open with zstd VFS
compressed_conn = sqlite3.connect("file:compressed.zstd.db?vfs=zstd&threads=4", uri=True)

# Set large cache for databases bigger than RAM
compressed_conn.execute("PRAGMA cache_size=-512000")  # 512MB cache

# Query normally - decompression happens transparently
cursor = compressed_conn.execute("SELECT * FROM my_table WHERE id = ?", (12345,))
row = cursor.fetchone()
```

## Production Configuration

### Optimal URI Parameters

For databases larger than RAM:
```
file:mydb.zstd.db?vfs=zstd&level=9&outer_page_size=8192&threads=16
```

- `level=9`: Higher compression (1-22, default 3)
- `outer_page_size=8192`: Larger outer pages reduce overhead
- `threads=16`: More threads for parallel compression/decompression

### PRAGMA Settings

```sql
-- Large page size for better compression
PRAGMA page_size=32768;  -- 32KB (set before creating database)

-- Large cache to minimize decompression overhead
PRAGMA cache_size=-1048576;  -- 1GB in KB

-- Optimize for read-heavy workloads
PRAGMA journal_mode=MEMORY;
PRAGMA synchronous=NORMAL;
PRAGMA temp_store=MEMORY;
PRAGMA mmap_size=268435456;  -- 256MB
```

## Performance Tuning

### For Maximum Compression
- Use `level=15` or higher (slower writes)
- Set `page_size=65536` (64KB pages)
- Enable `auto_vacuum=FULL` for dynamic sizing

### For Faster Queries
- Increase `cache_size` based on available RAM
- Use more `threads` for parallel decompression
- Consider `noprefetch=true` if CPU-bound

### For Write-Heavy Workloads
- Lower compression `level=3-6`
- Enable `outer_unsafe=true` for bulk loads (disable for production)
- Use larger transactions

## Integration Examples

### Python with SQLAlchemy

```python
from sqlalchemy import create_engine, event

def setup_compressed_engine(db_path, zstd_extension_path):
    engine = create_engine("sqlite:///", creator=lambda: None)
    
    @event.listens_for(engine, "connect")
    def connect(dbapi_conn, connection_record):
        # Load extension
        dbapi_conn.enable_load_extension(True)
        dbapi_conn.load_extension(zstd_extension_path)
        
        # Connect to compressed database
        uri = f"file:{db_path}?vfs=zstd&threads=8"
        new_conn = sqlite3.connect(uri, uri=True)
        
        # Configure for production
        new_conn.execute("PRAGMA cache_size=-512000")
        new_conn.execute("PRAGMA journal_mode=MEMORY")
        
        return new_conn
    
    return engine
```

### C/C++ Integration

```c
#include <sqlite3.h>

sqlite3 *open_compressed_db(const char *db_path) {
    sqlite3 *db;
    
    // Load extension
    sqlite3_enable_load_extension(db, 1);
    sqlite3_load_extension(db, "./zstd_vfs.so", 0, 0);
    
    // Open with zstd VFS
    char uri[256];
    snprintf(uri, sizeof(uri), "file:%s?vfs=zstd&threads=8", db_path);
    sqlite3_open_v2(uri, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_URI, NULL);
    
    // Configure
    sqlite3_exec(db, "PRAGMA cache_size=-512000", 0, 0, 0);
    
    return db;
}
```

## Monitoring & Maintenance

### Check Compression Ratio
```sql
-- Get database file size
SELECT page_count * page_size / 1024.0 / 1024.0 as size_mb FROM pragma_page_count(), pragma_page_size();
```

### Defragment Database
```python
# Periodically vacuum to maintain compression
conn.execute("VACUUM INTO 'file:fresh_copy.zstd.db?vfs=zstd&level=9'")
```

### Monitor Performance
```python
# Enable query timing
conn.set_trace_callback(lambda sql: print(f"Query: {sql[:50]}..."))
```

## Limitations & Considerations

1. **Platform**: Currently optimized for Unix x86-64
2. **Locking**: EXCLUSIVE mode only (no concurrent writers)
3. **WAL**: Not supported (use journal_mode=MEMORY instead)
4. **Memory**: Larger cache requirements than uncompressed SQLite
5. **CPU**: Higher CPU usage for compression/decompression

## Troubleshooting

### High Query Latency
- Increase `cache_size` to reduce decompression
- Add more `threads` for parallel operations
- Consider lower compression `level`

### Out of Memory
- Reduce `cache_size`
- Use `PRAGMA temp_store=FILE`
- Stream results instead of fetchall()

### Slow Writes
- Lower compression `level`
- Use larger transactions
- Enable `outer_unsafe=true` for bulk loads only

## Best Practices

1. **Always test** compression ratios and performance with your data
2. **Start conservative** with compression level 6-9
3. **Monitor** cache hit rates and adjust cache_size accordingly
4. **Use VACUUM INTO** for safe conversion of existing databases
5. **Keep backups** - this is a storage layer modification
6. **Profile queries** to identify decompression bottlenecks

## Example: Production Wrapper Class

See `production_zstd_config.py` for a complete production-ready wrapper class that handles all configuration automatically.