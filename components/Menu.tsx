'use client';

interface MenuProps {
  menu: string | {
    [key: string]: any;
  } | null;
}

export default function Menu({ menu }: MenuProps) {
  if (!menu) {
    return null;
  }

  // If menu is a string (URL), display as a link
  if (typeof menu === 'string') {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-1">View Menu</h3>
            <a
              href={menu}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-2 font-medium"
            >
              Open Menu
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <p className="text-sm text-blue-700 mt-1 break-all">{menu}</p>
          </div>
        </div>
      </div>
    );
  }

  // If menu is an object, display structured data
  if (typeof menu !== 'object' || Object.keys(menu).length === 0) {
    return null;
  }

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
