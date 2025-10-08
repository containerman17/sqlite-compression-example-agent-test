# Quick Reference: sqlite_zstd_vfs

## Test Commands

```bash
npm start              # Create compressed database
npm run demo           # Demo queries
npm run demo:write     # Demo writes
npm run verify         # Verify compression works
```

## Create Compressed Database

```bash
sqlite3 source.db -bail \
  -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' \
  "VACUUM INTO 'file:compressed.db?vfs=zstd&level=6&outer_page_size=16384&threads=4'"
```

## Query Compressed Database

```bash
sqlite3 :memory: -bail \
  -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' \
  -cmd ".open 'file:compressed.db?mode=ro&vfs=zstd'" \
  "SELECT * FROM table WHERE id = 123"
```

## Node.js Helper Function

```typescript
import { execSync } from 'child_process';

function queryCompressed(dbPath: string, sql: string): string {
    return execSync(
        `sqlite3 :memory: -bail ` +
        `-cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' ` +
        `-cmd ".open 'file:${dbPath}?mode=ro&vfs=zstd'" ` +
        `"${sql}"`,
        { encoding: 'utf-8' }
    ).trim();
}

// Usage
const result = queryCompressed('compressed.db', 'SELECT COUNT(*) FROM users');
```

## Python Example

```python
import sqlite3

def connect_compressed(db_path):
    conn = sqlite3.connect(":memory:")
    conn.enable_load_extension(True)
    conn.load_extension("./sqlite_zstd_vfs/build/zstd_vfs.so")
    return sqlite3.connect(f"file:{db_path}?vfs=zstd", uri=True)

# Usage
conn = connect_compressed('compressed.db')
cursor = conn.execute("SELECT * FROM users LIMIT 10")
```

## URI Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `vfs=zstd` | - | Enable zstd compression (required) |
| `level=N` | 3 | Compression level (3-6 recommended, up to 22) |
| `threads=N` | 1 | Worker threads for de/compression |
| `outer_page_size=N` | 4096 | Outer DB page size (2x inner recommended) |
| `outer_unsafe=true` | false | Fast bulk loads (UNSAFE - disables safety) |
| `mode=ro` | - | Read-only mode |

## Key Facts

- ✅ **50% compression** on typical databases
- ✅ **Row-by-row access** without full decompression
- ✅ **~50ms** per random row lookup
- ⚠️ **EXCLUSIVE locking** (one writer only)
- ⚠️ **No WAL mode** supported

## Files

- `sqlite_zstd_vfs/build/zstd_vfs.so` - Main extension
- `users.zstd.sqlite` - Example compressed DB (12.92 MB)

## Performance Tuning

For best results, set before creating database:
```sql
PRAGMA page_size = 8192;        -- Larger pages compress better
PRAGMA cache_size = -102400;    -- 100MB cache for complex queries
PRAGMA journal_mode = DELETE;   -- WAL not supported
```

## Troubleshooting

**"no such table"** → Check VFS loaded: `.load ./sqlite_zstd_vfs/build/zstd_vfs.so`  
**"cannot open"** → Use URI format: `file:db.sqlite?vfs=zstd`  
**Slow queries** → Increase cache_size, use larger page_size  
**Large file** → Increase compression level (up to 22)  

## Documentation

- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Full details
- [ZSTD_VFS_SETUP.md](./ZSTD_VFS_SETUP.md) - Complete guide
- [sqlite_zstd_vfs GitHub](https://github.com/mlin/sqlite_zstd_vfs) - Upstream