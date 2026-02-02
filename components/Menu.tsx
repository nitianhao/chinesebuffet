'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const INITIAL_ITEMS_LIMIT = 10;

/** Food emoji icons for menu categories */
function getCategoryIcon(categoryName: string): React.ReactNode {
  const key = categoryName.toLowerCase().trim();
  
  // Direct matches
  const icons: Record<string, string> = {
    appetizer: '🥟',
    appetizers: '🥟',
    soup: '🍜',
    soups: '🍜',
    salad: '🥗',
    salads: '🥗',
    sushi: '🍣',
    hibachi: '🔥',
    seafood: '🦐',
    dessert: '🍰',
    desserts: '🍰',
    drink: '🥤',
    drinks: '🥤',
    beverages: '🍵',
    entree: '🍛',
    entrees: '🍛',
    'main dish': '🍲',
    'main dishes': '🍲',
    noodle: '🍜',
    noodles: '🍜',
    rice: '🍚',
    'fried rice': '🍳',
    'hot food': '🔥',
    'cold food': '❄️',
    'hot bar': '🔥',
    'cold bar': '❄️',
    'salad bar': '🥗',
    vegetarian: '🥬',
    vegan: '🌱',
    chicken: '🍗',
    beef: '🥩',
    pork: '🥓',
    mongolian: '🍖',
    grill: '🍖',
    dimsum: '🥟',
    'dim sum': '🥟',
    dumplings: '🥟',
    fruit: '🍉',
    fruits: '🍉',
    crab: '🦀',
    lobster: '🦞',
    shrimp: '🦐',
    fish: '🐟',
    pizza: '🍕',
    pasta: '🍝',
    bread: '🍞',
    rolls: '🍞',
    egg: '🥚',
    eggs: '🥚',
    tofu: '🧈',
    vegetables: '🥦',
    curry: '🍛',
    wings: '🍗',
    'menu items': '🍽️',
    uncategorized: '🍽️',
  };

  if (icons[key]) {
    return <span className="text-lg">{icons[key]}</span>;
  }

  // Fuzzy match
  if (key.includes('soup')) return <span className="text-lg">🍜</span>;
  if (key.includes('salad')) return <span className="text-lg">🥗</span>;
  if (key.includes('sushi') || key.includes('maki') || key.includes('nigiri') || key.includes('sashimi')) return <span className="text-lg">🍣</span>;
  if (key.includes('hibachi') || key.includes('grill') || key.includes('mongolian') || key.includes('bbq')) return <span className="text-lg">🍖</span>;
  if (key.includes('dessert') || key.includes('sweet') || key.includes('cake') || key.includes('ice cream')) return <span className="text-lg">🍰</span>;
  if (key.includes('drink') || key.includes('beverage') || key.includes('tea') || key.includes('soda') || key.includes('juice')) return <span className="text-lg">🥤</span>;
  if (key.includes('appetizer') || key.includes('starter') || key.includes('dim sum') || key.includes('dumpling')) return <span className="text-lg">🥟</span>;
  if (key.includes('entree') || key.includes('main') || key.includes('special')) return <span className="text-lg">🍛</span>;
  if (key.includes('noodle') || key.includes('lo mein') || key.includes('chow mein') || key.includes('pho')) return <span className="text-lg">🍜</span>;
  if (key.includes('rice')) return <span className="text-lg">🍚</span>;
  if (key.includes('seafood') || key.includes('fish') || key.includes('shrimp') || key.includes('crab') || key.includes('lobster')) return <span className="text-lg">🦐</span>;
  if (key.includes('chicken') || key.includes('wing')) return <span className="text-lg">🍗</span>;
  if (key.includes('beef') || key.includes('steak')) return <span className="text-lg">🥩</span>;
  if (key.includes('pork') || key.includes('bacon')) return <span className="text-lg">🥓</span>;
  if (key.includes('vegetable') || key.includes('veggie')) return <span className="text-lg">🥦</span>;
  if (key.includes('fruit')) return <span className="text-lg">🍉</span>;
  if (key.includes('hot') && (key.includes('bar') || key.includes('food'))) return <span className="text-lg">🔥</span>;
  if (key.includes('cold') && (key.includes('bar') || key.includes('food'))) return <span className="text-lg">❄️</span>;
  if (key.includes('chinese')) return <span className="text-lg">🥡</span>;
  if (key.includes('japanese')) return <span className="text-lg">🍣</span>;
  if (key.includes('american')) return <span className="text-lg">🍔</span>;
  
  // Default food icon
  return <span className="text-lg">🍽️</span>;
}

/** Expand common menu abbreviations for human readability */
function formatMenuText(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\bPt\.\b/gi, 'Pint')
    .replace(/\bQt\.\b/gi, 'Quart')
    .replace(/\bw\.\s/g, 'with ')
    .replace(/\bS\s+\$/g, 'Small $')
    .replace(/\bL\s+\$/g, 'Large $')
    .replace(/\|\s*/g, ' · ')
    .trim();
}

interface MenuItemShape {
  name: string;
  description?: string | null;
  price?: string | null;
  priceNumber?: number | null;
}

interface MenuProps {
  menu: string | {
    [key: string]: any;
    categories?: Array<{
      name: string;
      items: Array<MenuItemShape>;
    }>;
    items?: Array<MenuItemShape>;
    sourceUrl?: string;
    contentType?: string;
    metadata?: {
      sourceUrl?: string;
      extractedAt?: string;
      parsingStatus?: string;
    };
  } | null;
}

function MenuItemRow({ item }: { item: MenuItemShape }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <h4 className="font-semibold text-gray-900">{formatMenuText(item.name)}</h4>
        {item.description && (
          <p className="text-sm text-gray-600 mt-1">{formatMenuText(item.description)}</p>
        )}
      </div>
      {item.price && (
        <div className="flex-shrink-0">
          <span className="font-semibold text-gray-900">{item.price}</span>
        </div>
      )}
    </div>
  );
}

function MenuModal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 sticky top-0 bg-white z-10 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default function Menu({ menu }: MenuProps) {
  const [showMenuModal, setShowMenuModal] = useState(false);

  if (!menu) {
    return null;
  }

  // If menu is a string (URL), display as a link
  if (typeof menu === 'string') {
    return (
      <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <svg className="w-8 h-8 text-[var(--accent1)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-[var(--text)] mb-1">View Menu</h3>
            <a
              href={menu}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent1)] hover:text-[var(--accent1)] inline-flex items-center gap-2 font-medium"
            >
              Open Menu
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <p className="text-sm text-[var(--accent1)] mt-1 break-all">{menu}</p>
          </div>
        </div>
      </div>
    );
  }

  // If menu is an object, check if it has structured data
  if (typeof menu !== 'object' || Object.keys(menu).length === 0) {
    return null;
  }

  // Check if menu has structured categories/items (new format)
  const hasStructuredData = menu.categories && Array.isArray(menu.categories) && menu.categories.length > 0;
  const hasItemsOnly = !hasStructuredData && menu.items && Array.isArray(menu.items) && menu.items.length > 0;

  // Render structured menu with categories
  if (hasStructuredData) {
    const totalItems = menu.categories!.reduce((sum, c) => sum + (c.items?.length ?? 0), 0);

    // Build flat list of { categoryName, item } for first 10
    const itemsWithCategory: Array<{ categoryName: string; item: MenuItemShape }> = [];
    for (const cat of menu.categories!) {
      if (!cat.items?.length) continue;
      for (const item of cat.items) {
        itemsWithCategory.push({ categoryName: cat.name, item });
      }
    }
    const visibleItems = itemsWithCategory.slice(0, INITIAL_ITEMS_LIMIT);
    const hasMore = totalItems > INITIAL_ITEMS_LIMIT;

    return (
      <div className="space-y-6">
        {menu.sourceUrl && (
          <div className="mb-4">
            <a
              href={menu.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--accent1)] hover:text-[var(--accent1)] inline-flex items-center gap-1"
            >
              View original menu
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        <div className="border border-gray-200 rounded-lg p-4 bg-white">
          {visibleItems.length > 0 ? (
            <>
              <div className="space-y-3">
                {visibleItems.map(({ categoryName, item }, idx) => (
                  <div key={idx}>
                    {idx === 0 || visibleItems[idx - 1].categoryName !== categoryName ? (
                      <h3 className="text-lg font-bold text-gray-900 mb-2 mt-4 first:mt-0 pb-2 border-b border-gray-200 flex items-center gap-2">
                        {getCategoryIcon(categoryName)}
                        {categoryName}
                      </h3>
                    ) : null}
                    <MenuItemRow item={item} />
                  </div>
                ))}
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setShowMenuModal(true)}
                  className="mt-4 w-full py-3 px-4 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Show more ({totalItems - INITIAL_ITEMS_LIMIT} more items)
                </button>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm">No items in this menu</p>
          )}
        </div>

        <MenuModal
          isOpen={showMenuModal}
          onClose={() => setShowMenuModal(false)}
          title="Full Menu"
        >
          <div className="space-y-6">
            {menu.categories!.map((category, categoryIndex) => (
              <div key={categoryIndex}>
                <h3 className="text-lg font-bold text-gray-900 mb-3 pb-2 border-b border-gray-200 flex items-center gap-2">
                  {getCategoryIcon(category.name)}
                  {category.name}
                </h3>
                <div className="space-y-1">
                  {category.items && category.items.length > 0 ? (
                    category.items.map((item, itemIndex) => (
                      <MenuItemRow key={itemIndex} item={item} />
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">No items in this category</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </MenuModal>
      </div>
    );
  }

  // Render items-only format (no categories)
  if (hasItemsOnly) {
    const items = menu.items!;
    const totalItems = items.length;
    const visibleItems = items.slice(0, INITIAL_ITEMS_LIMIT);
    const hasMore = totalItems > INITIAL_ITEMS_LIMIT;

    return (
      <div className="space-y-4">
        {menu.sourceUrl && (
          <div className="mb-4">
            <a
              href={menu.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--accent1)] hover:text-[var(--accent1)] inline-flex items-center gap-1"
            >
              View original menu
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        <div className="border border-gray-200 rounded-lg p-4 bg-white">
          <h3 className="text-lg font-bold text-gray-900 mb-3 pb-2 border-b border-gray-200 flex items-center gap-2">
            {getCategoryIcon('Menu Items')}
            Menu Items
          </h3>
          <div className="space-y-3">
            {visibleItems.map((item, itemIndex) => (
              <MenuItemRow key={itemIndex} item={item} />
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setShowMenuModal(true)}
              className="mt-4 w-full py-3 px-4 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Show more ({totalItems - INITIAL_ITEMS_LIMIT} more items)
            </button>
          )}
        </div>

        <MenuModal
          isOpen={showMenuModal}
          onClose={() => setShowMenuModal(false)}
          title="Full Menu"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-3 pb-2 border-b border-gray-200 flex items-center gap-2">
            {getCategoryIcon('Menu Items')}
            Menu Items
          </h3>
          <div className="space-y-3">
            {items.map((item, itemIndex) => (
              <MenuItemRow key={itemIndex} item={item} />
            ))}
          </div>
        </MenuModal>
      </div>
    );
  }

  // Fallback: render generic object structure (legacy format)
  const renderMenuItem = (key: string, value: any, level: number = 0): React.ReactNode => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string') {
      return (
        <div key={key} className={`${level > 0 ? 'ml-4' : ''} mb-2`}>
          <span className="font-medium text-gray-700">{key}:</span>
          <span className="text-gray-600 ml-2">{value}</span>
        </div>
      );
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return (
        <div key={key} className={`${level > 0 ? 'ml-4' : ''} mb-2`}>
          <span className="font-medium text-gray-700">{key}:</span>
          <span className="text-gray-600 ml-2">{String(value)}</span>
        </div>
      );
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return null;
      
      return (
        <div key={key} className={`${level > 0 ? 'ml-4' : ''} mb-4`}>
          <h4 className="font-semibold text-gray-900 mb-2 capitalize">{key}</h4>
          <div className="space-y-2">
            {value.map((item, index) => {
              if (typeof item === 'object' && item !== null) {
                return (
                  <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    {Object.entries(item).map(([subKey, subValue]) => 
                      renderMenuItem(subKey, subValue, level + 1)
                    )}
                  </div>
                );
              }
              return (
                <div key={index} className="text-gray-700 pl-2 border-l-2 border-gray-300">
                  {String(item)}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (typeof value === 'object') {
      return (
        <div key={key} className={`${level > 0 ? 'ml-4' : ''} mb-4`}>
          <h4 className="font-semibold text-gray-900 mb-2 capitalize">{key}</h4>
          <div className="space-y-2 pl-2 border-l-2 border-gray-200">
            {Object.entries(value).map(([subKey, subValue]) => 
              renderMenuItem(subKey, subValue, level + 1)
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-4">
      {Object.entries(menu).map(([key, value]) => (
        <div key={key}>
          {renderMenuItem(key, value)}
        </div>
      ))}
    </div>
  );
}


















