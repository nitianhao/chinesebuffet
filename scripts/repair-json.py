#!/usr/bin/env python3
"""
Simple JSON repair script - attempts to fix common JSON corruption issues.
"""

import json
import sys
import re

def repair_json(content):
    """Attempt to repair common JSON issues."""
    # Remove trailing commas before closing brackets/braces
    content = re.sub(r',(\s*[}\]])', r'\1', content)
    
    # Fix unclosed strings (basic attempt)
    # This is a simplified repair - for production use a proper JSON repair library
    
    return content

def main():
    input_file = sys.argv[1] if len(sys.argv) > 1 else "Example JSON/allcities.json"
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file + ".repaired"
    
    print(f"Reading file: {input_file}")
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"File size: {len(content)} characters")
    print("Attempting to parse JSON...")
    
    try:
        data = json.loads(content)
        print(f"✓ JSON is valid! No repair needed.")
        print(f"  Total entries: {len(data)}")
        return
    except json.JSONDecodeError as e:
        print(f"✗ JSON error: {e.msg} at line {e.lineno}, column {e.colno}")
        print("Attempting to repair...")
    
    # Try repair
    repaired = repair_json(content)
    
    try:
        data = json.loads(repaired)
        print(f"✓ Repair successful!")
        print(f"  Total entries: {len(data)}")
        print(f"Saving to: {output_file}")
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("✓ Saved repaired JSON")
    except json.JSONDecodeError as e:
        print(f"✗ Repair failed. Error: {e.msg} at line {e.lineno}")
        print("The file may need manual repair or a backup.")
        sys.exit(1)

if __name__ == "__main__":
    main()





















