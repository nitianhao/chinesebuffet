#!/usr/bin/env python3
"""
Extract specific fields from allcities.json to create a simplified JSON file.
"""

import json
import sys

def extract_fields(input_file, output_file, fields):
    """Extract specified fields from JSON file."""
    print(f"Reading: {input_file}")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"⚠️  JSON parsing error: {e.msg} at line {e.lineno}, column {e.colno}")
        print("Attempting to load with error recovery...")
        
        # Try to load what we can
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Handle "Extra data" error
        if "Extra data" in str(e) and hasattr(e, 'pos') and e.pos:
            print(f"  Truncating at position {e.pos}...")
            content = content[:e.pos]
            # Close JSON properly
            content = content.rstrip().rstrip(',')
            open_braces = content.count('{') - content.count('}')
            open_brackets = content.count('[') - content.count(']')
            content += '\n' + ('}' * max(0, open_braces)) + (']' * max(0, open_brackets))
            data = json.loads(content)
            print(f"  ✓ Loaded {len(data)} entries (truncated)")
        else:
            raise Exception(f"Could not parse JSON: {e}")
    
    print(f"Total entries: {len(data)}")
    print(f"Extracting fields: {', '.join(fields)}")
    
    # Extract fields
    extracted = []
    for i, entry in enumerate(data, 1):
        extracted_entry = {}
        for field in fields:
            extracted_entry[field] = entry.get(field)
        extracted.append(extracted_entry)
        
        if i % 1000 == 0:
            print(f"  Processed {i}/{len(data)} entries...")
    
    print(f"\nSaving to: {output_file}")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(extracted, f, ensure_ascii=False, indent=2)
    
    print(f"✓ Successfully created {output_file}")
    print(f"  Total entries: {len(extracted)}")
    
    # Show sample
    if extracted:
        print(f"\nSample entry:")
        print(json.dumps(extracted[0], indent=2, ensure_ascii=False))

if __name__ == "__main__":
    input_file = "Example JSON/allcities.json"
    output_file = "Example JSON/allcities_extracted.json"
    
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    
    fields = ['placeId', 'address', 'street', 'postalCode', 'state']
    
    extract_fields(input_file, output_file, fields)





















