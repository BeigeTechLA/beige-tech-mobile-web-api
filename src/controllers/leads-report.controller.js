const { buildLeadsReportWorkbook } = require('../services/leads-report.service');

exports.generateLeadsReport = async (req, res) => {
  try {
    const { workbook } = await buildLeadsReportWorkbook(req.body || {});

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Sales_Leads_Report.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Generate Leads Report Error:', error);

    if (!res.headersSent) {
      if (
        error.message &&
        (
          error.message.includes('preset must be') ||
          error.message.includes('start_date') ||
          error.message.includes('end_date')
        )
      ) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to generate leads report',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.end();
  }
};
