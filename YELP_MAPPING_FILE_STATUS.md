# Yelp Restaurant Mapping File Status

## File Location
`Example JSON/yelp-restaurant-mapping.json`

## Current Status
- **File Size**: 7MB (208,284 lines)
- **JSON Validity**: ✅ Valid (verified with Python and Node.js parsers)
- **Non-ASCII Characters**: 245 instances (special quotes, em dashes, etc.)

## Scripts That Modify This File

### 1. `scripts/get-yelp-business-details.py`
- **What it does**: Fetches detailed Yelp business information via API
- **Write frequency**: Every 50 entries (batch saves)
- **Status**: Appears to have completed (see `yelp-details-progress.log`)
- **Issue**: While running, it periodically writes to the file, which can cause:
  - File locking errors in editors
  - JSON parsing errors if the file is partially written
  - Editor crashes or hangs when trying to open the file

### 2. `scripts/map-yelp-to-database.js`
- **What it does**: Maps Yelp entries to database records
- **Write frequency**: Once at the end
- **Command**: `npm run map-yelp-to-db`

## Why You're Getting Errors

If you're seeing errors when opening/editing the file, it's likely because:

1. **A script is currently running** and writing to the file
2. **The file was partially written** when a script was interrupted
3. **File size** (7MB) is causing performance issues in your editor
4. **Non-ASCII characters** may cause issues with some JSON validators

## How to Check if a Process is Running

```bash
# Check for Python processes
ps aux | grep "get-yelp-business-details"

# Check for Node processes
ps aux | grep "map-yelp-to-database"

# Check file access
lsof "Example JSON/yelp-restaurant-mapping.json"
```

## Solutions

### If a Script is Running:
1. **Wait for it to complete** - Check `yelp-details-progress.log` for progress
2. **Stop the script** if needed:
   ```bash
   # Find and kill the process
   pkill -f "get-yelp-business-details"
   pkill -f "map-yelp-to-database"
   ```

### If the File is Corrupted:
1. **Validate the JSON**:
   ```bash
   python3 -m json.tool "Example JSON/yelp-restaurant-mapping.json" > /dev/null
   ```

2. **Check the file**:
   ```bash
   tail -20 "Example JSON/yelp-restaurant-mapping.json"
   ```

### If Editor Performance is the Issue:
1. **Use a different editor** for large JSON files (VS Code, Sublime Text handle large files better)
2. **View specific sections** instead of opening the entire file
3. **Use command-line tools** to search/edit:
   ```bash
   # Search for specific content
   grep "restaurant-name" "Example JSON/yelp-restaurant-mapping.json"
   ```

## Best Practices

1. **Don't edit the file while scripts are running**
2. **Close the file in your editor** before running scripts
3. **Make backups** before running scripts that modify the file
4. **Monitor progress** using the log files:
   - `yelp-details-progress.log`
   - `matching-progress.log`

## File Structure

The file contains a JSON object where:
- **Keys**: Buffet IDs (Google Place IDs or UUIDs)
- **Values**: Objects with:
  - `buffetId`, `buffetName`, `city`, `state`, `phone`
  - `yelp`: Yelp business data (may include `details` with attributes)
  - `tripadvisor`: TripAdvisor data (if matched)
  - `placeID`: Database place ID






