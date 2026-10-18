const BUCKET = 'chat-attachments';
const MAX_FILES = 5;
const MAX_BYTES = 20 * 1024 * 1024;

export const chatAttachmentBucket = BUCKET;

export async function persistChatMessage(client, row, files = []) {
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new Error('Choose up to five attachments.');
  if (files.some((file) => !(file instanceof Blob) || file.size > MAX_BYTES)) {
    throw new Error('Each attachment must be 20 MB or smaller.');
  }

  const storage = client.storage.from(BUCKET);
  const uploaded = [];
  const attachments = [];
  try {
    for (const file of files) {
      const originalName = String(file.name || 'attachment');
      const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'attachment';
      const path = `${row.chat_id}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await storage.upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (error) throw error;
      uploaded.push(path);
      attachments.push({ name: originalName, path, type: file.type, size: file.size });
    }

    const { data, error } = await client.from('messages')
      .insert({ ...row, attachments }).select().single();
    if (error) throw error;
    return data;
  } catch (error) {
    if (uploaded.length) {
      try { await storage.remove(uploaded); } catch { /* Retain the original error. */ }
    }
    throw error;
  }
}
