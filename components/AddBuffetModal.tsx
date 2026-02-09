'use client';

import React, { useEffect, useState } from 'react';

export interface AddBuffetFormData {
  name: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  website: string;
  email: string;
  price: string;
  description: string;
  neighborhood: string;
}

const INITIAL_FORM: AddBuffetFormData = {
  name: '',
  street: '',
  city: '',
  state: '',
  postalCode: '',
  phone: '',
  website: '',
  email: '',
  price: '',
  description: '',
  neighborhood: '',
};

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS',
  'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC',
];

interface AddBuffetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function buildFullAddress(data: AddBuffetFormData): string {
  const parts = [
    data.street,
    data.city,
    data.state ? (data.postalCode ? `${data.state} ${data.postalCode}` : data.state) : data.postalCode,
  ].filter(Boolean);
  return parts.join(', ');
}

export default function AddBuffetModal({ isOpen, onClose }: AddBuffetModalProps) {
  const [form, setForm] = useState<AddBuffetFormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const update = (field: keyof AddBuffetFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'Please enter the buffet name.' });
      return;
    }
    if (!form.city.trim() || !form.state.trim()) {
      setMessage({ type: 'error', text: 'Please enter city and state.' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const address = buildFullAddress(form);
      const res = await fetch('/api/add-buffet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          street: form.street.trim() || undefined,
          city: form.city.trim(),
          state: form.state.trim(),
          postalCode: form.postalCode.trim() || undefined,
          address: address || undefined,
          phone: form.phone.trim() || undefined,
          website: form.website.trim() || undefined,
          email: form.email.trim() || undefined,
          price: form.price.trim() || undefined,
          description: form.description.trim() || undefined,
          neighborhood: form.neighborhood.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Something went wrong.' });
        return;
      }
      setMessage({ type: 'success', text: data.message || 'Thank you! Your submission has been received.' });
      setForm(INITIAL_FORM);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-buffet-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0B0B0C] p-6 shadow-xl max-h-[calc(100vh-4rem)] overflow-y-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h2 id="add-buffet-title" className="text-xl font-semibold text-white">
            Add a buffet
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="add-buffet-name" className="mb-1 block text-sm font-medium text-white/80">
              Buffet name <span className="text-[#C1121F]">*</span>
            </label>
            <input
              id="add-buffet-name"
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Golden Dragon Buffet"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#C1121F] focus:outline-none focus:ring-1 focus:ring-[#C1121F]"
              required
            />
          </div>

          <div>
            <label htmlFor="add-buffet-street" className="mb-1 block text-sm font-medium text-white/80">
              Street address
            </label>
            <input
              id="add-buffet-street"
              type="text"
              value={form.street}
              onChange={(e) => update('street', e.target.value)}
              placeholder="123 Main St"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#C1121F] focus:outline-none focus:ring-1 focus:ring-[#C1121F]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-buffet-city" className="mb-1 block text-sm font-medium text-white/80">
                City <span className="text-[#C1121F]">*</span>
              </label>
              <input
                id="add-buffet-city"
                type="text"
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                placeholder="Los Angeles"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#C1121F] focus:outline-none focus:ring-1 focus:ring-[#C1121F]"
                required
              />
            </div>
            <div>
              <label htmlFor="add-buffet-state" className="mb-1 block text-sm font-medium text-white/80">
                State <span className="text-[#C1121F]">*</span>
              </label>
              <select
                id="add-buffet-state"
                value={form.state}
                onChange={(e) => update('state', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#C1121F] focus:outline-none focus:ring-1 focus:ring-[#C1121F]"
                required
              >
                <option value="">Select</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="add-buffet-postal" className="mb-1 block text-sm font-medium text-white/80">
              ZIP / Postal code
            </label>
            <input
              id="add-buffet-postal"
              type="text"
              value={form.postalCode}
              onChange={(e) => update('postalCode', e.target.value)}
              placeholder="90001"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#C1121F] focus:outline-none focus:ring-1 focus:ring-[#C1121F]"
            />
          </div>

          <div>
            <label htmlFor="add-buffet-neighborhood" className="mb-1 block text-sm font-medium text-white/80">
              Neighborhood
            </label>
            <input
              id="add-buffet-neighborhood"
              type="text"
              value={form.neighborhood}
              onChange={(e) => update('neighborhood', e.target.value)}
              placeholder="e.g. Downtown"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#C1121F] focus:outline-none focus:ring-1 focus:ring-[#C1121F]"
            />
          </div>

          <div>
            <label htmlFor="add-buffet-phone" className="mb-1 block text-sm font-medium text-white/80">
              Phone
            </label>
            <input
              id="add-buffet-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#C1121F] focus:outline-none focus:ring-1 focus:ring-[#C1121F]"
            />
          </div>

          <div>
            <label htmlFor="add-buffet-website" className="mb-1 block text-sm font-medium text-white/80">
              Website
            </label>
            <input
              id="add-buffet-website"
              type="url"
              value={form.website}
              onChange={(e) => update('website', e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#C1121F] focus:outline-none focus:ring-1 focus:ring-[#C1121F]"
            />
          </div>

          <div>
            <label htmlFor="add-buffet-email" className="mb-1 block text-sm font-medium text-white/80">
              Email
            </label>
            <input
              id="add-buffet-email"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="info@example.com"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#C1121F] focus:outline-none focus:ring-1 focus:ring-[#C1121F]"
            />
          </div>

          <div>
            <label htmlFor="add-buffet-price" className="mb-1 block text-sm font-medium text-white/80">
              Price range
            </label>
            <select
              id="add-buffet-price"
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#C1121F] focus:outline-none focus:ring-1 focus:ring-[#C1121F]"
            >
              <option value="">Select (optional)</option>
              <option value="$">$</option>
              <option value="$$">$$</option>
              <option value="$$$">$$$</option>
              <option value="$$$$">$$$$</option>
            </select>
          </div>

          <div>
            <label htmlFor="add-buffet-description" className="mb-1 block text-sm font-medium text-white/80">
              Short description
            </label>
            <textarea
              id="add-buffet-description"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="A brief description of the buffet..."
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#C1121F] focus:outline-none focus:ring-1 focus:ring-[#C1121F] resize-none"
            />
          </div>

          {message && (
            <p
              className={`text-sm ${
                message.type === 'success' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {message.text}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-full bg-gradient-to-r from-[#C1121F] to-[#7F0A12] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
