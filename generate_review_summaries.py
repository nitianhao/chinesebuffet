#!/usr/bin/env python3
"""
Script to generate SEO-friendly review summary paragraphs for each restaurant record.
"""

import json
import re
from collections import Counter

def is_english_text(text):
    """Check if text is primarily English (ASCII characters)."""
    if not text:
        return False
    ascii_chars = sum(1 for c in text if ord(c) < 128)
    return ascii_chars / len(text) > 0.8

def has_negative_sentiment(text):
    """Check if text contains negative sentiment indicators."""
    negative_words = [
        'awful', 'terrible', 'horrible', 'worst', 'bad', 'disgusting',
        'rude', 'dirty', 'cold', 'stale', 'overpriced', 'disappointed',
        'disappointing', 'never again', 'avoid', 'waste', 'not worth',
        'refund', 'sick', 'food poisoning', 'hair in', 'bug', 'roach',
        'not good', 'mediocre', 'bland', 'tasteless', 'overcooked',
        'undercooked', 'raw', 'frozen', 'microwaved', 'not fresh',
        'rip off', 'scam', 'don\'t go', 'do not go', 'stay away',
        'not recommend', 'wouldn\'t recommend', 'not impressed'
    ]
    text_lower = text.lower()
    return any(word in text_lower for word in negative_words)

def extract_review_insights(reviews):
    """Extract key insights from reviews for a restaurant."""
    insights = {
        'dishes': [],
        'positive_comments': [],
        'atmosphere_comments': [],
        'service_comments': [],
        'price_range': [],
        'meal_types': [],
        'quotes': [],
        'ratings': [],
        'noise_levels': [],
        'wait_times': [],
        'group_info': [],
    }
    
    for review in reviews:
        text = review.get('text', '') or ''
        translated = review.get('textTranslated', '') or ''
        full_text = text + ' ' + translated
        rating = review.get('rating') or review.get('stars') or 0
        
        if full_text.strip():
            # Only collect quotes from positive reviews (4+ stars), English text, no negative sentiment
            if (len(text) > 20 and len(text) < 200 and 
                rating >= 4 and 
                is_english_text(text) and 
                not has_negative_sentiment(text)):
                insights['quotes'].append(text)
            
            # Only add to positive comments if rating is good
            if rating >= 4:
                insights['positive_comments'].append(full_text)
        
        # Get rating
        if rating:
            insights['ratings'].append(rating)
        
        # Get context info
        context = review.get('reviewContext', {})
        if context:
            if 'Price per person' in context:
                insights['price_range'].append(context['Price per person'])
            if 'Meal type' in context:
                insights['meal_types'].append(context['Meal type'])
            if 'Noise level' in context:
                insights['noise_levels'].append(context['Noise level'])
            if 'Wait time' in context:
                insights['wait_times'].append(context['Wait time'])
            if 'Group size' in context:
                insights['group_info'].append(context['Group size'])
    
    return insights

def find_mentioned_dishes(reviews):
    """Find dishes mentioned in reviews."""
    common_dishes = [
        'chicken', 'duck', 'beef', 'pork', 'shrimp', 'lobster', 'fish', 'crab',
        'rice', 'noodles', 'soup', 'dumplings', 'egg roll', 'spring roll',
        'fried rice', 'chow mein', 'lo mein', 'chow fun', 'wonton',
        'tofu', 'vegetables', 'broccoli', 'mushroom', 'seafood',
        'general tso', 'kung pao', 'orange chicken', 'sesame', 'sweet and sour',
        'hot pot', 'hotpot', 'coconut chicken', 'peking duck', 'crispy',
        'dim sum', 'bao', 'scallion pancake', 'congee', 'bbq', 'roast',
        'sushi', 'sashimi', 'buffet', 'crab legs', 'crab rangoon',
        'egg foo young', 'moo shu', 'mongolian', 'szechuan', 'hunan',
        'wings', 'ribs', 'steak', 'oyster', 'clam', 'mussel', 'scallop'
    ]
    
    dish_mentions = []
    for review in reviews:
        text = (review.get('text', '') or '').lower()
        translated = (review.get('textTranslated', '') or '').lower()
        full_text = text + ' ' + translated
        
        for dish in common_dishes:
            if dish in full_text and dish not in dish_mentions:
                dish_mentions.append(dish)
    
    return dish_mentions

def get_most_common(items, n=1):
    """Get the most common items from a list."""
    if not items:
        return None
    counter = Counter(items)
    most_common = counter.most_common(n)
    return most_common[0][0] if most_common else None

def generate_paragraphs(record):
    """Generate two SEO-friendly paragraphs for a restaurant."""
    title = record.get('Title', 'This restaurant')
    city = record.get('City', '')
    reviews = record.get('reviews', [])
    
    if not reviews:
        return None, None
    
    insights = extract_review_insights(reviews)
    dishes = find_mentioned_dishes(reviews)
    
    # Calculate average rating
    avg_rating = sum(insights['ratings']) / len(insights['ratings']) if insights['ratings'] else 0
    
    # Get price range
    price = get_most_common(insights['price_range'])
    
    # Get noise level
    noise = get_most_common(insights['noise_levels'])
    
    # Get wait time
    wait = get_most_common(insights['wait_times'])
    
    # Get meal types
    meal_types = list(set(insights['meal_types']))
    
    # Find good quotes - already filtered in extract_review_insights, but double-check
    good_quotes = [
        q for q in insights['quotes'] 
        if len(q) > 30 and len(q) < 150 
        and is_english_text(q) 
        and not has_negative_sentiment(q)
    ]
    
    # Extract positive adjectives and sentiments from reviews
    positive_texts = [t for t in insights['positive_comments'] if t.strip()]
    
    # Build paragraph 1 - Main overview
    para1_parts = []
    
    # Opening
    if city:
        para1_parts.append(f"{title} in {city} has earned a reputation among diners")
    else:
        para1_parts.append(f"{title} has earned a reputation among diners")
    
    # Add rating context
    if avg_rating >= 4.5:
        para1_parts[0] += " as a standout destination for authentic Asian cuisine."
    elif avg_rating >= 4.0:
        para1_parts[0] += " for serving quality Asian dishes that keep guests coming back."
    elif avg_rating >= 3.5:
        para1_parts[0] += " for its diverse menu and dining experience."
    else:
        para1_parts[0] += " with a menu that offers variety for all tastes."
    
    # Add dish highlights
    if dishes:
        dish_list = dishes[:5]  # Top 5 dishes
        if len(dish_list) > 2:
            dish_str = ", ".join(dish_list[:-1]) + ", and " + dish_list[-1]
        elif len(dish_list) == 2:
            dish_str = " and ".join(dish_list)
        else:
            dish_str = dish_list[0]
        para1_parts.append(f"Guests frequently praise dishes featuring {dish_str}.")
    
    # Add quote if available
    if good_quotes:
        quote = good_quotes[0]
        # Clean up the quote
        quote = quote.strip().rstrip('.')
        para1_parts.append(f'One satisfied diner noted: "{quote}."')
    
    # Add price and atmosphere
    if price:
        para1_parts.append(f"With meals typically priced at {price} per person, the restaurant offers solid value for the quality.")
    
    # Atmosphere
    if noise:
        if 'quiet' in noise.lower():
            para1_parts.append("The atmosphere is notably quiet, making it ideal for intimate conversations and relaxed dining.")
        elif 'moderate' in noise.lower():
            para1_parts.append("The atmosphere strikes a comfortable balance — lively enough to feel welcoming yet relaxed enough for conversation.")
    
    paragraph1 = " ".join(para1_parts)
    
    # Build paragraph 2 - Additional details
    para2_parts = []
    
    # More dishes
    if len(dishes) > 5:
        extra_dishes = dishes[5:10]
        if extra_dishes:
            dish_str = ", ".join(extra_dishes)
            para2_parts.append(f"Beyond the popular favorites, guests also recommend trying the {dish_str}.")
    
    # Meal types
    if meal_types:
        if 'Lunch' in meal_types and 'Dinner' in meal_types:
            para2_parts.append("The restaurant serves both lunch and dinner crowds, with each meal period offering its own appeal.")
        elif 'Lunch' in meal_types:
            para2_parts.append("Particularly popular during lunch hours, it's a go-to spot for midday meals.")
        elif 'Dinner' in meal_types:
            para2_parts.append("The dinner service draws guests looking for a satisfying evening meal.")
    
    # Wait time
    if wait:
        if 'no wait' in wait.lower():
            para2_parts.append("Most visitors report no wait time, making it convenient for both planned visits and spontaneous stops.")
        elif 'up to' in wait.lower():
            para2_parts.append(f"Wait times are typically manageable ({wait}), especially for those arriving outside peak hours.")
    
    # Add another quote if available
    if len(good_quotes) > 1:
        quote2 = good_quotes[1]
        quote2 = quote2.strip().rstrip('.')
        para2_parts.append(f'Another guest shared: "{quote2}."')
    
    # Group info
    group_mentions = insights['group_info']
    if group_mentions:
        para2_parts.append("The space accommodates various party sizes, from solo diners to larger groups.")
    
    # Closing
    if avg_rating >= 4.0:
        para2_parts.append("With consistently positive feedback from diners, this spot continues to be a reliable choice for those seeking quality Asian cuisine.")
    else:
        para2_parts.append("For those exploring the local dining scene, it offers an experience worth considering.")
    
    paragraph2 = " ".join(para2_parts) if para2_parts else None
    
    return paragraph1, paragraph2

def process_batch(records, start_idx, batch_size=20):
    """Process a batch of records and return results."""
    end_idx = min(start_idx + batch_size, len(records))
    results = []
    
    for i in range(start_idx, end_idx):
        record = records[i]
        para1, para2 = generate_paragraphs(record)
        
        # Add to record
        record['reviewSummaryParagraph1'] = para1
        record['reviewSummaryParagraph2'] = para2
        
        results.append({
            'index': i,
            'title': record.get('Title', 'Unknown'),
            'city': record.get('City', 'Unknown'),
            'paragraph1': para1,
            'paragraph2': para2
        })
    
    return results

def main():
    import sys
    
    # Get file path from command line (default to cities file)
    file_path = sys.argv[1] if len(sys.argv) > 1 else 'Example JSON/apify-reviews-cities.json'
    batch_num = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    
    # Load JSON
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"Loaded {len(data)} records from {file_path}")
    
    batch_size = 20
    start_idx = batch_num * batch_size
    
    if start_idx >= len(data):
        print("All records processed!")
        return
    
    # Process batch
    results = process_batch(data, start_idx, batch_size)
    
    # Save updated JSON
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    # Print results for review
    print(f"\n{'='*80}")
    print(f"BATCH {batch_num + 1}: Records {start_idx + 1} to {min(start_idx + batch_size, len(data))}")
    print(f"{'='*80}\n")
    
    for result in results:
        print(f"\n--- {result['index'] + 1}. {result['title']} ({result['city']}) ---\n")
        print("PARAGRAPH 1:")
        print(result['paragraph1'] or "(No reviews available)")
        print("\nPARAGRAPH 2:")
        print(result['paragraph2'] or "(No additional details)")
        print()
    
    remaining = len(data) - (start_idx + batch_size)
    if remaining > 0:
        print(f"\n{'='*80}")
        print(f"Remaining records: {remaining}")
        print(f"To continue, run: python generate_review_summaries.py '{file_path}' {batch_num + 1}")
        print(f"{'='*80}")

if __name__ == '__main__':
    main()

