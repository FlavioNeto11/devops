export function asRecord(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  return {};
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function toText(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).trim();
  }

  return '';
}

export function toNullableText(value) {
  const text = toText(value);
  return text || null;
}

export function titleFromArtifact(artifact, fallback) {
  const title = toNullableText(artifact?.title);
  if (title) {
    return title;
  }

  return fallback;
}

export function formatProgress(progress) {
  const payload = asRecord(progress);
  const total = Number(payload.total || 0);
  const completed = Number(payload.completed || 0);
  const failed = Number(payload.failed || 0);
  const pending = Number(payload.pending || Math.max(total - completed - failed, 0));

  if (total <= 0) {
    return {
      total: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      ratio: 0
    };
  }

  return {
    total,
    completed,
    failed,
    pending,
    ratio: Math.min(Math.round((completed / total) * 100), 100)
  };
}
