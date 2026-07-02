const STUDIO_META_MARKER = '[BEIGE_STUDIO_META]';

function getStudioPricingSnapshot(description) {
  const text = String(description || '');
  const markerIndex = text.indexOf(STUDIO_META_MARKER);
  if (markerIndex < 0) return { items: [], total: 0 };

  const afterMarker = text.slice(markerIndex + STUDIO_META_MARKER.length).trim();
  const match = afterMarker.match(/^(\[[\s\S]*?\])(?:\s|$)/);
  if (!match) return { items: [], total: 0 };

  try {
    const parsed = JSON.parse(match[1]);
    const items = (Array.isArray(parsed) ? parsed : [])
      .map((studio) => ({
        studio_id: String(studio?.studioId || ''),
        name: String(studio?.name || 'BEIGE Studio'),
        pricing_mode: studio?.pricingMode === 'weekend' ? 'weekend' : 'hourly',
        quantity: Number(studio?.quantity) || 1,
        unit_price: Number(studio?.unitPrice) || 0,
        total: Number(studio?.totalPrice) || 0,
      }))
      .filter((studio) => studio.total > 0);

    return {
      items,
      total: parseFloat(items.reduce((sum, studio) => sum + studio.total, 0).toFixed(2)),
    };
  } catch {
    return { items: [], total: 0 };
  }
}

function isStudioLineItem(item = {}) {
  const name = String(item.item_name || item.name || '').toLowerCase();
  const notes = String(item.notes || '').toLowerCase();
  return notes.startsWith('[studio:') || name.includes('studio') ||
    name.includes('resort') || name.includes('location platform');
}

module.exports = { getStudioPricingSnapshot, isStudioLineItem };
