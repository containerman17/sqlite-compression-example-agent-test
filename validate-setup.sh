#!/bin/bash

# Validation script for sqlite_zstd_vfs setup
# Runs all tests and verifies everything works

set -e  # Exit on error

echo "════════════════════════════════════════════════════════"
echo "  sqlite_zstd_vfs Setup Validation"
echo "════════════════════════════════════════════════════════"
echo ""

# 1. Check dependencies
echo "✓ Checking dependencies..."
command -v sqlite3 >/dev/null 2>&1 || { echo "✗ sqlite3 not found"; exit 1; }
command -v zstd >/dev/null 2>&1 || { echo "✗ zstd not found"; exit 1; }
echo "  - sqlite3: $(sqlite3 --version | cut -d' ' -f1)"
echo "  - zstd: $(zstd --version | cut -d' ' -f2)"
echo ""

# 2. Check extensions
echo "✓ Checking built extensions..."
if [ ! -f "./sqlite_zstd_vfs/build/zstd_vfs.so" ]; then
    echo "✗ zstd_vfs.so not found"
    exit 1
fi
echo "  - zstd_vfs.so: $(ls -lh ./sqlite_zstd_vfs/build/zstd_vfs.so | awk '{print $5}')"
echo "  - nested_vfs.so: $(ls -lh ./sqlite_zstd_vfs/build/nested_vfs.so | awk '{print $5}')"
echo ""

# 3. Test extension loading
echo "✓ Testing extension loading..."
sqlite3 :memory: -bail -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' '.quit' 2>&1 || { echo "✗ Extension failed to load"; exit 1; }
echo "  - Extension loads successfully"
echo ""

# 4. Check compressed database
echo "✓ Checking compressed database..."
if [ ! -f "users.zstd.sqlite" ]; then
    echo "  ! Compressed database not found, creating..."
    npm start > /dev/null 2>&1
fi
echo "  - Database size: $(ls -lh users.zstd.sqlite | awk '{print $5}')"
echo ""

# 5. Test queries
echo "✓ Testing database queries..."
COUNT=$(sqlite3 :memory: -bail \
    -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' \
    -cmd ".open 'file:users.zstd.sqlite?mode=ro&vfs=zstd'" \
    "SELECT COUNT(*) FROM users" 2>&1)

if [ "$COUNT" != "50000" ]; then
    echo "✗ Query test failed: expected 50000, got $COUNT"
    exit 1
fi
echo "  - Query test passed: $COUNT records"
echo ""

# 6. Test row-by-row access
echo "✓ Testing row-by-row access..."
USER=$(sqlite3 :memory: -bail \
    -cmd '.load ./sqlite_zstd_vfs/build/zstd_vfs.so' \
    -cmd ".open 'file:users.zstd.sqlite?mode=ro&vfs=zstd'" \
    "SELECT username FROM users LIMIT 1" 2>&1)

if [ -z "$USER" ]; then
    echo "✗ Row access test failed"
    exit 1
fi
echo "  - Row access works: found user '$USER'"
echo ""

# 7. Summary
echo "════════════════════════════════════════════════════════"
echo "  ✅ All Tests Passed!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Setup is complete and working. Try these commands:"
echo ""
echo "  npm run demo          - Demo read queries"
echo "  npm run demo:write    - Demo write operations"
echo "  npm run verify        - Verify compression efficiency"
echo ""
echo "Documentation:"
echo "  README.md                     - Quick start"
echo "  QUICK_REFERENCE.md            - Command reference"
echo "  IMPLEMENTATION_SUMMARY.md     - Full implementation details"
echo "  ZSTD_VFS_SETUP.md             - Setup & tuning guide"
echo ""