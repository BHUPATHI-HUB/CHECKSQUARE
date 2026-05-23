export const generateReportData = (inspection) => {
  return {
    cover: {
      preparedFor: inspection.metadata.preparedFor,
      propertyAddress: inspection.metadata.propertyAddress,
      inspectionDate: inspection.metadata.inspectionDate,
      inspectorName: inspection.inspectorName
    },
    disclaimer: `This inspection report is provided for informational purposes only. The inspector has made every effort to provide an accurate assessment of the property's condition at the time of inspection. However, this report does not constitute a warranty or guarantee of the property's condition, nor does it predict future performance or identify all defects. The inspection is limited to visible and accessible areas only. Hidden or concealed defects may exist that were not identified during the inspection. This report should not be considered a substitute for professional advice from qualified specialists in specific areas of concern.`,
    defectDefinitions: [
      { severity: 'Critical', definition: 'Immediate safety hazard or structural issue requiring urgent attention', color: 'hsl(0, 84%, 60%)' },
      { severity: 'Major', definition: 'Significant defect that may affect property value or require substantial repair', color: 'hsl(38, 92%, 50%)' },
      { severity: 'Minor', definition: 'Cosmetic or maintenance issue with minimal impact on property function', color: 'hsl(195, 85%, 35%)' }
    ],
    areaCalculations: inspection.areaCalculations || [],
    waterQuality: inspection.waterQuality || null,
    roomInspections: inspection.roomInspections || [],
    thankYou: `Thank you for choosing ${inspection?.brandName || 'CheckSquare'} for your home inspection needs. This report was prepared by ${inspection.inspectorName} on ${inspection.metadata.inspectionDate}. If you have any questions or require clarification on any items in this report, please contact us.`
  };
};

export const downloadReport = (inspection, format = 'pdf') => {
  const reportData = generateReportData(inspection);
  
  console.log('Report generation requested:', { format, reportData });
  
  const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `inspection-report-${inspection.id}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  return {
    success: true,
    message: `Report data prepared. For actual ${format.toUpperCase()} generation, integrate with a backend service or third-party API.`
  };
};