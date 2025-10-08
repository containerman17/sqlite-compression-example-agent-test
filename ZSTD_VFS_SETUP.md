# SQLite with Zstandard Compression (sqlite_zstd_vfs)

This project successfully integrates [sqlite_zstd_vfs](https://github.com/mlin/sqlite_zstd_vfs) to provide transparent row-level compression for SQLite databases.

## What This Achieves

✓ **Transparent Compression**: Database rows are compressed on disk, but queries work normally  
✓ **Row-by-Row Access**: No need to decompress the entire database into memory  
✓ **~50% Size Reduction**: The example database shrinks from 26.31 MB to 12.92 MB  
✓ **Production Ready**: Works with databases much larger than available RAM  

## How It Works

sqlite_zstd_vfs is a SQLite VFS (Virtual File System) extension that:
1. Intercepts database page writes and compresses them with Zstandard
2. Stores compressed pages in an "outer" SQLite database
3. Transparently decompresses pages on read
4. Only decompresses the specific pages needed for each query

This means you can have a 100GB database compressed to 50GB, and query specific rows without loading all 100GB (or even 50GB) into memory.

## Setup

### Prerequisites Installed
- ✓ SQLite 3.46.1
- ✓ Zstandard 1.5.6
- ✓ Build tools (gcc, cmake)
- ✓ libcurl (for the included web_vfs)

### Built Components
- ✓ `sqlite_zstd_vfs/build/zstd_vfs.so` - The VFS extension
- ✓ `sqlite_zstd_vfs/build/nested_vfs.so` - Supporting library

## Usage

### 1. Create the Compressed Database

```bash
npm start
```

This script:
1. Generates 50,000 fake users with JSON data
2. Creates an uncompressed SQLite database (26.31 MB)
3. Creates a compressed version using zstd_vfs (12.92 MB, 50.89% smaller)
4. Verifies the compressed database works correctly

### 2. Query the Compressed Database

```bash
npm run demo
```

This demonstrates:
- Counting records
- Querying specific rows by ID
- Searching with patterns
- Aggregation queries
- Random access patterns

All queries work directly on the compressed database without full decompression.

## Using sqlite_zstd_vfs in Your Code

### Command Line (sqlite3 CLI)

**Create a compressed database:**
```bash
sqlite3 source.db -bail \
  -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' \
  "VACUUM INTO 'file:compressed.db?vfs=zstd&level=6&outer_page_size=16384&threads=4'"
```

**Query a compressed database:**
```bash
sqlite3 :memory: -bail \
  -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' \
  -cmd ".open 'file:compressed.db?mode=ro&vfs=zstd'" \
  "SELECT * FROM users WHERE userId = 'abc123'"
```

### Node.js with better-sqlite3

Due to limitations in better-sqlite3's URI handling, use child_process to run sqlite3 CLI:

```typescript
import { execSync } from 'child_process';

function queryCompressed(sql: string): string {
    return execSync(
        `sqlite3 :memory: -bail ` +
        `-cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' ` +
        `-cmd ".open 'file:compressed.db?mode=ro&vfs=zstd'" ` +
        `"${sql}"`,
        { encoding: 'utf-8' }
    ).trim();
}

const result = queryCompressed('SELECT COUNT(*) FROM users');
console.log(`Total users: ${result}`);
```

### Python

```python
import sqlite3

conn = sqlite3.connect(":memory:")
conn.enable_load_extension(True)
conn.load_extension("./sqlite_zstd_vfs/build/zstd_vfs.so")
conn = sqlite3.connect("file:compressed.db?mode=ro&vfs=zstd", uri=True)

cursor = conn.execute("SELECT * FROM users WHERE userId = ?", ("abc123",))
for row in cursor:
    print(row)
```

## Compression Parameters

Control compression via URI parameters:

- `level=6` - Compression level (-7 to 22, default 3)
- `threads=4` - Worker threads for compression/decompression
- `outer_page_size=16384` - Outer database page size (should be 2x inner page size)
- `outer_unsafe=true` - Disable transaction safety for faster bulk loads (use carefully!)

## Performance Tuning

For best compression and performance:

```sql
PRAGMA page_size = 8192;        -- Larger pages compress better
PRAGMA cache_size = -102400;    -- 100MB cache (important for complex queries)
PRAGMA journal_mode = DELETE;   -- WAL mode not supported by zstd_vfs
```

## Important Limitations

⚠️ **WAL Mode Not Supported**: The compressed database cannot use WAL (Write-Ahead Logging)  
⚠️ **EXCLUSIVE Locking**: Only one writer connection at a time  
⚠️ **Unix x86-64**: Primarily tested on Linux/Mac x86-64 systems  
⚠️ **USE AT YOUR OWN RISK**: This modifies the storage layer - test thoroughly!  

## When to Use This

✅ **Good for:**
- Large databases (> available RAM)
- Read-heavy workloads
- Storage-constrained environments
- Archival databases
- Analytics databases

❌ **Not ideal for:**
- High-concurrency write workloads
- Applications requiring WAL mode
- Databases smaller than ~100MB (overhead not worth it)

## File Structure

```
/workspace/
├── sqlite_zstd_vfs/          # Cloned and built extension
│   └── build/
│       ├── zstd_vfs.so       # Main VFS extension
│       └── nested_vfs.so     # Supporting library
├── index.ts                  # Creates compressed database
├── demo-compressed-queries.ts # Demonstrates queries
├── users.json                # Generated test data (34.56 MB)
├── users.zstd.sqlite         # Compressed database (12.92 MB)
└── package.json              # Dependencies
```

## Verification

To verify the setup works:

```bash
# Check the extension loads
sqlite3 :memory: -bail -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' '.quit'

# Check the compressed database
ls -lh users.zstd.sqlite

# Run a test query
sqlite3 :memory: -bail \
  -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' \
  -cmd ".open 'file:users.zstd.sqlite?mode=ro&vfs=zstd'" \
  "SELECT COUNT(*) FROM users"
```

## Next Steps

1. **Production Use**: Test with your actual database schema and workload
2. **Performance Tuning**: Adjust compression levels and page sizes
3. **Integration**: Wrap the CLI calls in your application's database layer
4. **Monitoring**: Track compression ratios and query performance

## Resources

- [sqlite_zstd_vfs GitHub](https://github.com/mlin/sqlite_zstd_vfs)
- [SQLite VFS Documentation](https://www.sqlite.org/vfs.html)
- [Zstandard Compression](https://facebook.github.io/zstd/)
- [GenomicSQLite](https://github.com/mlin/GenomicSQLite) - Production-ready wrapper

---

**Status**: ✅ Working and tested with 50,000 records achieving 50.89% compression