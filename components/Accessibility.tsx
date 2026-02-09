import ChipGridWithExpand, { ChipItem } from '@/components/ui/ChipGridWithExpand';

interface AccessibilityProps {
  data: Record<string, unknown> | unknown[];
}

const accessibilityLabels: Record<string, string> = {
  wheelchairAccessible: 'Wheelchair Accessible',
  wheelchair: 'Wheelchair Accessible',
  wheelchairAccessibleEntrance: 'Wheelchair accessible entrance',
  wheelchairAccessibleParking: 'Wheelchair accessible parking lot',
  wheelchairAccessibleRestroom: 'Wheelchair accessible restroom',
  wheelchairAccessibleSeating: 'Wheelchair accessible seating',
  accessibleEntrance: 'Accessible Entrance',
  accessibleParking: 'Accessible Parking',
  accessibleRestroom: 'Accessible Restroom',
  accessibleSeating: 'Accessible Seating',
  assistiveHearingLoop: 'Assistive Hearing Loop',
  hearingLoop: 'Hearing Loop',
  brailleMenu: 'Braille Menu',
  elevator: 'Elevator Access',
  serviceAnimalsAllowed: 'Service Animals Allowed',
};

function formatKey(key: string): string {
  if (accessibilityLabels[key]) return accessibilityLabels[key];
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()).trim();
}

export default function Accessibility({ data }: AccessibilityProps) {
  if (!data) return null;

  const items: ChipItem[] = [];

  if (Array.isArray(data)) {
    data.forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        items.push({ label: item.trim(), available: true });
      } else if (typeof item === 'object' && item !== null) {
        Object.entries(item as Record<string, unknown>).forEach(([key, value]) => {
          if (value === true || value === 'yes' || value === 'true') {
            items.push({ label: formatKey(key), available: true });
          }
        });
      }
    });
  } else if (typeof data === 'object') {
    Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
      if (['id', 'createdAt', 'updatedAt', 'type', 'group'].includes(key)) return;
      if (value === true || value === 'yes' || value === 'true') {
        items.push({ label: formatKey(key), available: true });
      } else if (typeof value === 'string' && !['no', 'false'].includes((value as string).toLowerCase())) {
        items.push({ label: (value as string).trim(), available: true });
      }
    });
  }

  if (items.length === 0) return null;

  return (
    <ChipGridWithExpand
      items={items}
      initialCount={6}
      className="mt-1"
    />
  );
}
