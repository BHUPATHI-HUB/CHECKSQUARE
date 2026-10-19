export const hasStoredReport = (record) => Boolean(record?.storageKey || record?.storage_key);

export function rowToReportDownload(row) {
  return {
    ...row,
    inspection: row.inspection_id,
    fileSize: row.file_size,
    created: row.created_at,
    storageKey: row.storage_key,
  };
}

export async function deleteStoredReport(client, id) {
  const { data: record, error: lookupError } = await client.from('report_downloads')
    .select('storage_key').eq('id', id).single();
  if (lookupError) throw lookupError;
  if (record.storage_key) {
    const { error: removeError } = await client.storage.from('reports').remove([record.storage_key]);
    if (removeError) throw removeError;
  }
  const { data: deleted, error: deleteError } = await client.from('report_downloads')
    .delete().eq('id', id).select('id').single();
  if (deleteError) throw deleteError;
  return deleted;
}
