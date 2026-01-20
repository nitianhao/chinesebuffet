#!/usr/bin/env python3
"""
Advanced JSON repair script - finds the last complete entry and properly closes the JSON.
"""

import json
import sys
import re

def find_last_complete_entry(content):
    """Find the position of the last complete JSON entry."""
    # Count brackets to find where we are in the structure
    # We're looking for a complete entry that ends with }, or }
    
    # Try to find the last complete object by looking for closing patterns
    # Look backwards from the end for patterns like: }\n  },\n  {
    # This indicates the end of an entry
    
    # Find all positions where we have "},\n  {" which typically separates entries
    pattern = r'"\s*}\s*,\s*\n\s*{'
    matches = list(re.finditer(pattern, content))
    
    if matches:
        # Get the last match - this is likely the last complete entry separator
        last_match = matches[-1]
        # Position after the closing brace and comma
        pos = last_match.end() - 1  # Back up to the comma
        return pos
    
    # Alternative: look for the last complete closing brace of an object
    # Count braces backwards
    brace_count = 0
    in_string = False
    escape_next = False
    
    for i in range(len(content) - 1, -1, -1):
        char = content[i]
        
        if escape_next:
            escape_next = False
            continue
        
        if char == '\\':
            escape_next = True
            continue
        
        if char == '"' and not escape_next:
            in_string = not in_string
            continue
        
        if in_string:
            continue
        
        if char == '}':
            brace_count += 1
        elif char == '{':
            brace_count -= 1
            if brace_count == 0:
                # Found a complete object, but we need to check if it's followed by a comma
                # Look ahead to see if there's a comma and another opening brace
                remaining = content[i:]
                if re.match(r'\s*}\s*,?\s*\n\s*\{', remaining):
                    # This looks like an entry boundary
                    # Find the comma position
                    comma_pos = remaining.find(',')
                    if comma_pos != -1:
                        return i + comma_pos + 1
                    return i + 1
    
    return None

def repair_json_advanced(input_file, output_file):
    """Repair truncated JSON file."""
    print(f"Reading file: {input_file}")
    
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"File size: {len(content)} characters ({len(content) / 1024 / 1024:.2f} MB)")
    
    # First, try to parse as-is
    try:
        data = json.loads(content)
        print("✓ JSON is already valid! No repair needed.")
        return True
    except json.JSONDecodeError as e:
        print(f"✗ JSON error: {e.msg} at line {e.lineno}, column {e.colno}")
        print(f"  Position: {e.pos} (end of file: {len(content)})")
    
    # The file is truncated. We need to find the last complete entry
    print("\nSearching for last complete entry...")
    
    # Strategy: Work backwards from the error position, trying to find valid JSON
    error_pos = len(content)
    
    # Try to find where we can cut and still have valid JSON
    # Start from a safe position before the end
    start_pos = max(0, error_pos - 10000)  # Check last 10KB
    
    best_pos = None
    best_data = None
    
    # Try different cut points
    for offset in range(0, min(10000, error_pos), 100):
        cut_pos = error_pos - offset
        test_content = content[:cut_pos].rstrip()
        
        # Remove trailing comma if present
        test_content = re.sub(r',\s*$', '', test_content)
        
        # Try to close the JSON properly
        # Count open brackets/braces
        open_braces = test_content.count('{') - test_content.count('}')
        open_brackets = test_content.count('[') - test_content.count(']')
        
        # Close them
        if test_content.rstrip().endswith(','):
            test_content = test_content.rstrip().rstrip(',')
        
        # Close objects and arrays
        test_content += '\n' + ('}' * open_braces) + (']' * open_brackets)
        
        try:
            data = json.loads(test_content)
            if isinstance(data, list) and len(data) > 0:
                best_pos = cut_pos
                best_data = data
                print(f"  ✓ Found valid JSON ending at position {cut_pos} ({len(data)} entries)")
                break
        except:
            continue
    
    if best_data is None:
        print("✗ Could not find a valid cut point. Trying alternative method...")
        
        # Alternative: Use ijson or manual parsing to extract valid entries
        # For now, let's try a simpler approach - just close everything
        test_content = content.rstrip()
        
        # Remove incomplete last line
        lines = test_content.split('\n')
        # Remove the last line if it looks incomplete
        if lines and not lines[-1].strip().endswith(('}', ']', ',')):
            # Find the last complete line
            for i in range(len(lines) - 1, -1, -1):
                if lines[i].strip().endswith(('}', ']', ',')):
                    lines = lines[:i+1]
                    break
        
        test_content = '\n'.join(lines)
        
        # Remove trailing comma
        test_content = re.sub(r',\s*$', '', test_content)
        
        # Count and close brackets
        open_braces = test_content.count('{') - test_content.count('}')
        open_brackets = test_content.count('[') - test_content.count(']')
        
        test_content += '\n' + ('}' * max(0, open_braces)) + (']' * max(0, open_brackets))
        
        try:
            data = json.loads(test_content)
            best_data = data
            print(f"  ✓ Repaired JSON with {len(data)} entries")
        except json.JSONDecodeError as e2:
            print(f"✗ Repair failed: {e2.msg} at line {e2.lineno}")
            return False
    
    if best_data:
        print(f"\nSaving repaired JSON to: {output_file}")
        print(f"  Total entries: {len(best_data)}")
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(best_data, f, ensure_ascii=False, indent=2)
        
        print("✓ Repair complete!")
        
        # Verify the repaired file
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                verify_data = json.load(f)
            print(f"✓ Verified: Repaired file is valid JSON with {len(verify_data)} entries")
            return True
        except Exception as e:
            print(f"✗ Warning: Repaired file verification failed: {e}")
            return False
    
    return False

if __name__ == "__main__":
    input_file = sys.argv[1] if len(sys.argv) > 1 else "Example JSON/allcities.json"
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file.replace('.json', '_repaired.json')
    
    success = repair_json_advanced(input_file, output_file)
    sys.exit(0 if success else 1)





















