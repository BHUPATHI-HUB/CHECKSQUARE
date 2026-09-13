/** Shared defect rules used by the inspector UI and report consumers. */
export const normalizePhoto = (photo, issue = {}) => ({
  ...photo,
  caption: photo?.caption || photo?.comment || '',
  title: photo?.title || '',
  classify: photo?.classify || '',
  severity: photo?.severity || '',
  description: photo?.description || photo?.comment || '',
});

export const normalizeDefect = (defect = {}) => ({
  ...defect,
  title: defect.title || defect.classify || 'Untitled issue',
  classify: defect.classify || 'Unclassified',
  severity: defect.severity || 'Unrated',
  description: defect.description || defect.comment || '',
  photos: (Array.isArray(defect.photos) ? defect.photos : [defect.beforePhoto, defect.afterPhoto].filter(Boolean))
    .map((photo) => normalizePhoto(photo, defect)),
});

export const photoCompletion = (photo) => {
  if (!photo) return 'empty';
  const hasDetail = Boolean(photo.title || photo.description || photo.caption || photo.classify || photo.severity);
  // Title is optional. A photo is complete once it has the same required
  // triage fields the inspector needs to produce a grouped report.
  const complete = Boolean(photo.classify && photo.severity && (photo.description || photo.caption));
  return complete ? 'complete' : hasDetail ? 'partial' : 'empty';
};

export const groupDefects = (defects = [], severityLevels = [], organization = {}) => {
  const configuredSeverityOrder = Array.isArray(organization.severityOrder) && organization.severityOrder.length
    ? organization.severityOrder
    : severityLevels.map((level) => level.name);
  const order = new Map(configuredSeverityOrder.map((name, index) => [name, index]));
  const mode = organization.mode || 'severity-first';
  const classificationOrder = new Map((organization.classificationOrder || []).map((value, index) => [value, index]));
  return [...defects].map(normalizeDefect).sort((a, b) => {
    const severity = (order.get(a.severity) ?? 999) - (order.get(b.severity) ?? 999);
    const classification = (classificationOrder.get(a.classify) ?? 999) - (classificationOrder.get(b.classify) ?? 999) || a.classify.localeCompare(b.classify);
    return (mode === 'classification-first' || (mode === 'custom' && organization.primary === 'classification'))
      ? classification || severity || a.title.localeCompare(b.title)
      : severity || classification || a.title.localeCompare(b.title);
  });
};
